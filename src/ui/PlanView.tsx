import { useEffect, useMemo, useRef, useState } from 'react';
import { PlanController } from '../blueprint/PlanController';
import { drawPlan } from '../blueprint/draw';
import { useScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { useOverlay } from '../analysis/overlayStore';
import { floorsSorted, firstFloorId, selectionBounds, sceneBounds } from '../core/scene';
import { askNumber, askText } from './fields';
import { openContextMenu } from './ContextMenu';
import { addProp, addShape, addMarker } from '../editor/actions';
import { getDef } from '../assets/props';
import { snap } from '../core/math';
import { Icon } from './Icon';
import { t } from '../i18n/t';

export const planRef: { ctl: PlanController | null } = { ctl: null };

export function PlanView() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const [drag, setDrag] = useState(false);
  const ctl = useMemo(() => new PlanController({
    askText, askNumber,
    context: (x, y, ref, world) => openContextMenu(x, y, ref, world),
    requestRedraw: () => schedule(),
  }), []);
  planRef.ctl = ctl;

  const schedule = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => { raf.current = 0; draw(); });
  };

  const draw = () => {
    const cv = canvas.current; if (!cv) return;
    const g = cv.getContext('2d'); if (!g) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctl.resize(w, h);
    const sc = useScene.getState().project;
    const ui = useUI.getState();
    const fid = sc.scene.floors[ui.floorId] ? ui.floorId : firstFloorId(sc.scene);
    const dc = {
      g, view: ctl.view, scene: sc.scene, floorId: fid,
      selected: new Set(ui.selection.map((r) => `${r.kind}:${r.id}`)),
      hover: ctl.hover ? `${ctl.hover.kind}:${ctl.hover.id}` : null,
      opts: { dims: ui.overlays.dims, markers: ui.overlays.markers, character: ui.overlays.character && ui.tool !== 'select', showGrid: sc.settings.showGrid, warnings: ui.overlays.warnings, snap: sc.settings.snap, shading: ui.shading },
      extra: useOverlay.getState().extra, character: sc.settings.character, cursor: ctl.cursor, invalidate: schedule, time: performance.now(),
      isolate: ui.isolate ? new Set(ui.isolate.map((r) => `${r.kind}:${r.id}`)) : null, hidden: new Set(ui.hidden),
    };
    drawPlan(dc);
    ctl.drawOverlay(dc);
    // régua de escala
    const scaleM = [1, 2, 5, 10, 20, 50].find((m) => m * ctl.view.k >= 70) ?? 100;
    g.fillStyle = '#a39a86'; g.strokeStyle = '#a39a86'; g.lineWidth = 1.5; g.font = '500 10px "IBM Plex Mono"'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const x0 = w - 24 - scaleM * ctl.view.k, y0 = h - 16;
    g.beginPath(); g.moveTo(x0, y0 - 4); g.lineTo(x0, y0); g.lineTo(x0 + scaleM * ctl.view.k, y0); g.lineTo(x0 + scaleM * ctl.view.k, y0 - 4); g.stroke();
    g.fillText(`${scaleM} m`, x0, y0 - 8);
  };

  useEffect(() => {
    const cv = canvas.current!;
    const ro = new ResizeObserver(() => { ctl.resize(cv.clientWidth, cv.clientHeight); schedule(); });
    ro.observe(cv);
    const unsubs = [useScene.subscribe(schedule), useUI.subscribe(schedule), useOverlay.subscribe(schedule)];
    // enquadra na primeira exibição
    setTimeout(() => { ctl.resize(cv.clientWidth, cv.clientHeight); ctl.fit(); }, 30);
    const onKey = (e: KeyboardEvent) => { ctl.keyUp(e); };
    window.addEventListener('keyup', onKey);
    schedule();
    return () => { ro.disconnect(); unsubs.forEach((u) => u()); window.removeEventListener('keyup', onKey); };
  }, []);

  // foco em alvos (ex.: clicar num aviso)
  const focusNonce = useUI((s) => s.focusNonce);
  useEffect(() => {
    const ft = useUI.getState().focusTarget;
    if (!ft) return;
    const v = ctl.view;
    ctl.setView({ ...v, k: Math.max(v.k, 38), ox: v.w / 2 - ft.x * Math.max(v.k, 38), oy: v.h / 2 - ft.z * Math.max(v.k, 38) });
  }, [focusNonce]);

  const getPos = (e: { clientX: number; clientY: number }) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };

  useEffect(() => {
    // comandos de vista disparados de fora
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as string;
      const ui = useUI.getState(), s = useScene.getState().project.scene;
      if (d === 'fit') ctl.fit();
      if (d === 'fit-sel') ctl.fit(selectionBounds(s, ui.selection) ?? sceneBounds(s, ui.floorId));
    };
    window.addEventListener('forge:plan', h);
    return () => window.removeEventListener('forge:plan', h);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const [sx, sy] = getPos(e);
    const raw = [(sx - ctl.view.ox) / ctl.view.k, (sy - ctl.view.oy) / ctl.view.k] as [number, number];
    const defId = e.dataTransfer.getData('application/x-forge-prop');
    const shape = e.dataTransfer.getData('application/x-forge-shape');
    const ui = useUI.getState(); const st = useScene.getState();
    const fid = st.project.scene.floors[ui.floorId] ? ui.floorId : firstFloorId(st.project.scene);
    if (defId && getDef(defId)) {
      const pl = ctl.propPlacement(raw, defId);
      const id = st.commit('Posicionar objeto', (s) => addProp(s, defId, fid, pl.pos[0], pl.pos[1], { rot: pl.rot }));
      ui.pushRecent(defId); ui.select([{ kind: 'prop', id }]);
    } else if (shape) {
      const p: [number, number] = [snap(raw[0], st.project.settings.snap), snap(raw[1], st.project.settings.snap)];
      const id = st.commit('Criar forma', (s) => addShape(s, shape as never, fid, p[0], p[1]));
      ui.select([{ kind: 'shape', id }]);
    }
    void addMarker;
  };

  const ui = useUI();
  const scene = useScene((s) => s.project.scene);
  const floors = floorsSorted(scene).reverse();

  return (
    <div className={`vp ${drag ? 'dragging-over' : ''}`} ref={wrap}
      onDragOver={(e) => { if (e.dataTransfer.types.some((x) => x.startsWith('application/x-forge'))) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', touchAction: 'none', cursor: cursorFor(ui.tool, ctl) }}
        onPointerDown={(e) => { canvas.current!.setPointerCapture(e.pointerId); const [x, y] = getPos(e); ctl.down(x, y, e.button, { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, detail: e.detail }); if (e.detail === 2) ctl.doubleClick(); }}
        onPointerMove={(e) => { const [x, y] = getPos(e); ctl.move(x, y, { shift: e.shiftKey, alt: e.altKey }); }}
        onPointerUp={(e) => { const [x, y] = getPos(e); ctl.up(x, y, e.button, { shift: e.shiftKey, alt: e.altKey }); }}
        onPointerLeave={() => { ctl.cursor = null; useUI.setState({ cursor: null }); schedule(); }}
        onWheel={(e) => { const [x, y] = getPos(e); ctl.wheel(x, y, e.deltaY); }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="vp-label">{t('Planta')} · {scene.floors[ui.floorId]?.name ?? ''}</div>
      <div className="vp-tools">
        <button className="btn icon sm" title={t('Enquadrar tudo')} onClick={() => ctl.fit()}><Icon name="target" size={15} /></button>
        <button className="btn icon sm" title={t('Aproximar')} onClick={() => ctl.wheel(ctl.view.w / 2, ctl.view.h / 2, -1)}><Icon name="plus" size={15} /></button>
        <button className="btn icon sm" title={t('Afastar')} onClick={() => ctl.wheel(ctl.view.w / 2, ctl.view.h / 2, 1)}><Icon name="minus" size={15} /></button>
        <span className="sep" />
        <button className={`btn icon sm ${ui.overlays.dims ? 'on' : ''}`} title={t('Mostrar dimensões')} onClick={() => ui.set({ overlays: { ...ui.overlays, dims: !ui.overlays.dims } })}><Icon name="measure" size={15} /></button>
        <button className={`btn icon sm ${useScene.getState().project.settings.showGrid ? 'on' : ''}`} title={t('Grade')} onClick={() => useScene.getState().patchSettings({ showGrid: !useScene.getState().project.settings.showGrid })}><Icon name="grid" size={15} /></button>
        <button className={`btn icon sm ${ui.overlays.character ? 'on' : ''}`} title={t('Mostrar área ocupada pelo personagem')} onClick={() => ui.set({ overlays: { ...ui.overlays, character: !ui.overlays.character } })}><Icon name="pin" size={15} /></button>
      </div>
      <FloorBar floors={floors} />
      {ui.hint && <div className="vp-hint"><span>{ui.hint}</span></div>}
    </div>
  );
}

function FloorBar({ floors }: { floors: ReturnType<typeof floorsSorted> }) {
  const ui = useUI();
  return (
    <div className="floorbar">
      <div className="cap"><span>{t('Pavimentos')}</span></div>
      {floors.map((f) => (
        <button key={f.id} className={`floor-chip ${ui.floorId === f.id ? 'on' : ''}`} onClick={() => ui.set({ floorId: f.id })} title={`Elevação ${f.elevation} m · pé-direito ${f.height} m`}>
          <span>{f.name}</span><em>{f.elevation >= 0 ? '+' : ''}{f.elevation.toFixed(1)}</em>
        </button>
      ))}
    </div>
  );
}

function cursorFor(tool: string, ctl: PlanController) {
  if (ctl.space || ctl.st.k === 'pan') return 'grabbing';
  if (tool === 'select') return 'default';
  return 'crosshair';
}
