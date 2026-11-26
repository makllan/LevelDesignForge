import { useEffect, useRef, useState } from 'react';
import { SceneRenderer, type RenderUI } from '../render/Renderer3D';
import { useScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { selectionBounds, sceneBounds, firstFloorId, getEntity } from '../core/scene';
import { expandGroups, translateEntities, rotateEntities, scaleEntities, addProp, addShape, addMarker, addLight } from '../editor/actions';
import { getDef } from '../assets/props';
import { snap } from '../core/math';
import { Icon } from './Icon';
import { t } from '../i18n/t';
import { openContextMenu } from './ContextMenu';
import type { EntityRef } from '../core/types';

export const rendererRef: { r: SceneRenderer | null } = { r: null };

export function renderUIOf(lit = false): RenderUI {
  const u = useUI.getState();
  return { floorId: u.floorId, floorView: u.floorView, ghostFloors: u.ghostFloors, shading: u.shading, hideCeilings: u.hideCeilings, hidden: u.hidden, isolate: u.isolate, markers: u.overlays.markers, lit, editorHelpers: true };
}

export function View3D({ visible }: { visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const downRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const hoverRaf = useRef(0);
  const ui = useUI();

  useEffect(() => {
    const r = new SceneRenderer(host.current!);
    rendererRef.r = r;
    setReady(true);
    const sync = () => { if (useUI.getState().mode === 'playtest') return; r.sync(useScene.getState().project.scene, renderUIOf(useUI.getState().lit)); r.setSelection(useUI.getState().selection); };
    const un1 = useScene.subscribe((s, p) => { if (s.project.scene !== p.project.scene) sync(); });
    const un2 = useUI.subscribe((s, p) => {
      if (s.floorId !== p.floorId || s.floorView !== p.floorView || s.ghostFloors !== p.ghostFloors || s.shading !== p.shading || s.hideCeilings !== p.hideCeilings || s.hidden !== p.hidden || s.isolate !== p.isolate || s.overlays.markers !== p.overlays.markers || s.lit !== p.lit) sync();
      if (s.selection !== p.selection) r.setSelection(s.selection);
    });
    sync();
    r.onGizmo = {
      change: (d) => {
        const ui = useUI.getState();
        const refs = r.getGizmoRefs();
        const st = useScene.getState();
        const pivot = r.proxyPivot();
        st.preview((s) => {
          if (ui.gizmo === 'translate') translateEntities(s, refs, d.dx, d.dz, d.dy);
          else if (ui.gizmo === 'rotate') rotateEntities(s, refs, d.rotDeg, pivot);
          else scaleEntities(s, refs, d.scale);
        });
      },
      end: () => { useScene.getState().endPreview(useUI.getState().gizmo === 'translate' ? 'Mover' : useUI.getState().gizmo === 'rotate' ? 'Girar' : 'Escalar'); },
    };
    const ev = (e: Event) => {
      const d = (e as CustomEvent).detail as string;
      const s = useScene.getState().project.scene, u = useUI.getState();
      if (d === 'frame') { const b = selectionBounds(s, u.selection) ?? sceneBounds(s); r.frame(b, s.floors[u.floorId]?.elevation ?? 0); }
      if (d === 'frame-all') r.frame(sceneBounds(s), s.floors[u.floorId]?.elevation ?? 0);
    };
    window.addEventListener('forge:3d', ev);
    setTimeout(() => ev(new CustomEvent('x', { detail: 'frame-all' })), 80);
    return () => { window.removeEventListener('forge:3d', ev); un1(); un2(); r.dispose(); rendererRef.r = null; };
  }, []);

  // gizmo
  const selection = useUI((s) => s.selection);
  const gizmo = useUI((s) => s.gizmo);
  const scene = useScene((s) => s.project.scene);
  const snapV = useScene((s) => s.project.settings.snap);
  const mode = useUI((s) => s.mode);
  useEffect(() => {
    const r = rendererRef.r; if (!r || r.dragging) return;
    if (mode !== 'edit' || !visible) { r.detachGizmo(); return; }
    if (!selection.length) { r.detachGizmo(); return; }
    r.attachGizmo(selection, scene, gizmo, snapV);
  }, [selection, gizmo, scene, snapV, mode, visible, ready]);

  useEffect(() => { rendererRef.r?.setFreeCam(ui.freeCam); }, [ui.freeCam]);
  const viewPreset = useRef<'free' | 'top' | 'front' | 'side'>('free');

  const setPreset = (p: 'free' | 'top' | 'front' | 'side') => {
    viewPreset.current = p;
    const r = rendererRef.r; if (!r) return;
    useUI.setState({ ortho: p !== 'free', freeCam: false });
    r.setProjection(p !== 'free' ? 'ortho' : 'persp', p);
  };

  useEffect(() => { if (visible) setTimeout(() => rendererRef.r?.requestRender(), 30); }, [visible]);

  const pickAt = (cx: number, cy: number) => rendererRef.r?.pick(cx, cy) ?? null;

  const placeAt = (cx: number, cy: number): boolean => {
    const u = useUI.getState(), r = rendererRef.r; if (!r) return false;
    const st = useScene.getState(), s = st.project.scene;
    if (!['prop', 'shape', 'marker', 'start', 'light'].includes(u.tool)) return false;
    const fid = s.floors[u.floorId] ? u.floorId : firstFloorId(s);
    const g = r.groundPoint(cx, cy, s.floors[fid]?.elevation ?? 0); if (!g) return true;
    const sn = st.project.settings.snap;
    const x = snap(g.x, sn), z = snap(g.z, sn);
    if (u.tool === 'prop' && u.place.propId) { const id = st.commit('Posicionar objeto', (d) => addProp(d, u.place.propId!, fid, x, z)); u.pushRecent(u.place.propId); u.select([{ kind: 'prop', id }]); }
    else if (u.tool === 'shape') { const id = st.commit('Criar forma', (d) => addShape(d, u.place.shapeKind ?? 'cube', fid, x, z)); u.select([{ kind: 'shape', id }]); }
    else if (u.tool === 'marker' || u.tool === 'start') { const k = u.tool === 'start' ? 'start' : u.place.markerKind ?? 'poi'; const id = st.commit('Criar marcador', (d) => addMarker(d, k, fid, x, z)); u.select([{ kind: 'marker', id }]); }
    else if (u.tool === 'light') { const id = st.commit('Criar luz', (d) => addLight(d, u.place.lightKind ?? 'point', fid, x, z)); u.select([{ kind: 'light', id }]); }
    return true;
  };

  const onDown = (e: React.PointerEvent) => { downRef.current = { x: e.clientX, y: e.clientY, button: e.button }; };
  const onUp = (e: React.PointerEvent) => {
    const d = downRef.current; downRef.current = null;
    const r = rendererRef.r; if (!d || !r || r.dragging) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    if (r.freeCam && d.button === 0) return;
    if (d.button === 2) {
      const hit = pickAt(e.clientX, e.clientY);
      if (hit) { const u = useUI.getState(); if (!u.selection.some((q) => q.id === hit.ref.id)) u.select(expandGroups(useScene.getState().project.scene, [hit.ref])); }
      openContextMenu(e.clientX, e.clientY, hit?.ref ?? null, hit ? [hit.point.x, hit.point.z] : null);
      return;
    }
    if (d.button !== 0) return;
    if (placeAt(e.clientX, e.clientY)) return;
    const u = useUI.getState(), s = useScene.getState().project.scene;
    const hit = pickAt(e.clientX, e.clientY);
    if (!hit) { if (!e.shiftKey) u.select([]); return; }
    // clicar numa entidade de outro pavimento leva o pavimento ativo para lá
    const ent = getEntity(s, hit.ref) as { floorId?: string } | undefined;
    if (ent?.floorId && ent.floorId !== u.floorId) u.set({ floorId: ent.floorId });
    u.select(expandGroups(s, [hit.ref]), e.shiftKey);
  };
  const onMove = (e: React.PointerEvent) => {
    if (hoverRaf.current || e.buttons) return;
    const { clientX, clientY } = e;
    hoverRaf.current = requestAnimationFrame(() => {
      hoverRaf.current = 0;
      const r = rendererRef.r; if (!r || r.dragging) return;
      const hit = r.pick(clientX, clientY);
      r.setHover(hit?.ref ?? null);
      const u = useUI.getState();
      if (['prop', 'shape', 'marker', 'start', 'light'].includes(u.tool)) {
        const s = useScene.getState().project.scene;
        const g = r.groundPoint(clientX, clientY, s.floors[u.floorId]?.elevation ?? 0);
        if (g) useUI.setState({ cursor: { x: g.x, z: g.z } });
      }
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const r = rendererRef.r; if (!r) return;
    const defId = e.dataTransfer.getData('application/x-forge-prop');
    const shape = e.dataTransfer.getData('application/x-forge-shape');
    const st = useScene.getState(), u = useUI.getState(), s = st.project.scene;
    const fid = s.floors[u.floorId] ? u.floorId : firstFloorId(s);
    const g = r.groundPoint(e.clientX, e.clientY, s.floors[fid]?.elevation ?? 0); if (!g) return;
    const x = snap(g.x, st.project.settings.snap), z = snap(g.z, st.project.settings.snap);
    if (defId && getDef(defId)) { const id = st.commit('Posicionar objeto', (d) => addProp(d, defId, fid, x, z)); u.pushRecent(defId); u.select([{ kind: 'prop', id }]); }
    else if (shape) { const id = st.commit('Criar forma', (d) => addShape(d, shape as never, fid, x, z)); u.select([{ kind: 'shape', id }]); }
  };

  const sel = (refs: EntityRef[]) => refs.length;
  void sel;

  return (
    <div className="vp" style={{ display: visible ? 'block' : 'none' }}
      onDragOver={(e) => { if (e.dataTransfer.types.some((x) => x.startsWith('application/x-forge'))) e.preventDefault(); }} onDrop={onDrop}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} onPointerDown={onDown} onPointerUp={onUp} onPointerMove={onMove} onContextMenu={(e) => e.preventDefault()} />
      <div className="vp-label">{t('Visão 3D')} · {ui.ortho ? t('ortogonal') : t('perspectiva')}{ui.freeCam ? ` · ${t('câmera livre (WASD, botão direito)')}` : ''}</div>
      <div className="vp-tools">
        <button className={`btn icon sm ${!ui.ortho && !ui.freeCam ? 'on' : ''}`} title={t('Perspectiva orbital (botão direito gira, meio move)')} onClick={() => { useUI.setState({ freeCam: false }); setPreset('free'); }}><Icon name="cube" size={15} /></button>
        <button className={`btn sm ${ui.ortho && viewPreset.current === 'top' ? 'on' : ''}`} title={t('Vista superior (ortogonal)')} onClick={() => setPreset('top')}>{t('Sup')}</button>
        <button className={`btn sm ${ui.ortho && viewPreset.current === 'front' ? 'on' : ''}`} title={t('Vista frontal (ortogonal)')} onClick={() => setPreset('front')}>{t('Fre')}</button>
        <button className={`btn sm ${ui.ortho && viewPreset.current === 'side' ? 'on' : ''}`} title={t('Vista lateral (ortogonal)')} onClick={() => setPreset('side')}>{t('Lat')}</button>
        <button className={`btn sm ${ui.freeCam ? 'on' : ''}`} title={t('Câmera livre: WASD, Q/E, botão direito para olhar')} onClick={() => useUI.setState({ freeCam: !ui.freeCam })}>{t('Livre')}</button>
        <span className="sep" />
        <button className={`btn sm ${ui.shading === 'grey' ? 'on' : ''}`} title={t('Greybox')} onClick={() => useUI.setState({ shading: 'grey' })}>{t('Grey')}</button>
        <button className={`btn sm ${ui.shading === 'wire' ? 'on' : ''}`} title={t('Wireframe')} onClick={() => useUI.setState({ shading: 'wire' })}>{t('Wire')}</button>
        <button className={`btn sm ${ui.shading === 'sector' ? 'on' : ''}`} title={t('Cores por setor')} onClick={() => useUI.setState({ shading: 'sector' })}>{t('Setor')}</button>
        <span className="sep" />
        <button className={`btn sm ${ui.hideCeilings ? 'on' : ''}`} title={t('Sem teto')} onClick={() => useUI.setState({ hideCeilings: !ui.hideCeilings })}>{t('Sem teto')}</button>
        <button className={`btn sm ${ui.floorView !== 'all' ? 'on' : ''}`} title={t('Corte por pavimento: todos → até o ativo → somente o ativo')} onClick={() => useUI.setState({ floorView: ui.floorView === 'all' ? 'upto' : ui.floorView === 'upto' ? 'only' : 'all' })}><Icon name="layers" size={14} />{ui.floorView === 'all' ? t('Todos') : ui.floorView === 'upto' ? t('Até aqui') : t('Só este')}</button>
        <span className="sep" />
        <button className={`btn sm ${ui.gizmo === 'translate' ? 'on' : ''}`} title={t('Mover (W)')} onClick={() => useUI.setState({ gizmo: 'translate' })}><Icon name="move" size={14} /></button>
        <button className={`btn sm ${ui.gizmo === 'rotate' ? 'on' : ''}`} title={t('Girar (E)')} onClick={() => useUI.setState({ gizmo: 'rotate' })}><Icon name="rotate" size={14} /></button>
        <button className={`btn sm ${ui.gizmo === 'scale' ? 'on' : ''}`} title={t('Escalar (R)')} onClick={() => useUI.setState({ gizmo: 'scale' })}><Icon name="scale" size={14} /></button>
        <button className="btn icon sm" title={t('Focar seleção (F)')} onClick={() => window.dispatchEvent(new CustomEvent('forge:3d', { detail: 'frame' }))}><Icon name="target" size={15} /></button>
      </div>
    </div>
  );
}
