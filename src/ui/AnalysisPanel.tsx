import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { useScene, getScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { useOverlay } from '../analysis/overlayStore';
import { analyzeScene, type Finding, type Report } from '../analysis/companion';
import { computeLos } from '../analysis/los';
import { dependencyGraph } from '../analysis/progression';
import { Section, ToggleRow } from './fields';
import { Icon } from './Icon';
import { floorsSorted } from '../core/scene';
import { getDef } from '../assets/props';
import type { EntityRef, ID } from '../core/types';

interface AState { report: Report | null; at: number; busy: boolean; run(): void }
export const useAnalysis = create<AState>((set) => ({
  report: null, at: 0, busy: false,
  run() {
    set({ busy: true });
    // adia um frame para a interface mostrar “analisando…”
    setTimeout(() => {
      const st = useScene.getState();
      const t0 = performance.now();
      const report = analyzeScene(st.project.scene, st.project.settings.character, st.project.dismissed);
      set({ report, at: Date.now(), busy: false });
      publishOverlays(report);
      void t0;
    }, 20);
  },
}));

function publishOverlays(report: Report) {
  const ui = useUI.getState();
  const g = report.progression.grid;
  const floorIdx = floorsSorted(getScene()).findIndex((f) => f.id === ui.floorId);
  const patch: Record<string, unknown> = {
    issues: report.findings.filter((f) => f.pos).map((f) => ({ pos: f.pos!, text: f.title, sev: f.sev, floorId: f.floorId })),
  };
  if (g && floorIdx >= 0) {
    const per = g.w * g.h;
    const layer = g.layers[floorIdx];
    const reach = report.progression.reach;
    patch.nav = ui.overlays.navGrid ? { floorId: layer.floorId, origin: g.origin, cell: g.cell, w: g.w, h: g.h, walk: layer.walk, reach: reach ? reach.visited.subarray(floorIdx * per, (floorIdx + 1) * per) : undefined } : undefined;
  }
  patch.routes = ui.overlays.routes && report.progression.routeToExit.length ? [{ pts: report.progression.routeToExit, kind: 'main' as const, label: `${report.progression.pathLength.toFixed(0)} m até a saída` }] : undefined;
  useOverlay.getState().set(patch);
}

const SEV = { error: 'Erro', warn: 'Atenção', info: 'Sugestão' } as const;

export function CompanionPanel() {
  const { report, busy, run } = useAnalysis();
  const ui = useUI();
  const dismissed = useScene((s) => s.project.dismissed);
  const revision = useScene((s) => s.revision);
  const patchMeta = useScene((s) => s.patchMeta);

  // reanalisa (com folga) quando a cena muda e a aba está aberta
  useEffect(() => {
    const id = setTimeout(() => run(), report ? 900 : 50);
    return () => clearTimeout(id);
  }, [revision, dismissed]);
  // republica overlays quando mudam os interruptores ou o pavimento
  useEffect(() => { if (report) publishOverlays(report); }, [ui.overlays.navGrid, ui.overlays.routes, ui.floorId, report]);
  // visibilidade (LOS)
  useEffect(() => {
    if (!ui.overlays.los || !ui.losOrigin) { useOverlay.getState().set({ los: undefined }); return; }
    const st = useScene.getState();
    const r = computeLos(st.project.scene, st.project.settings.character, ui.losOrigin.floorId, ui.losOrigin.x, ui.losOrigin.z);
    useOverlay.getState().set({ los: { origin: r.origin, poly: r.poly, targets: r.targets } });
  }, [ui.overlays.los, ui.losOrigin, revision]);

  const focus = (f: Finding) => {
    if (f.ref) ui.select([f.ref]);
    if (f.pos) ui.focusOn(f.pos[0], f.pos[1], f.floorId);
  };
  const counts = useMemo(() => ({ error: report?.findings.filter((f) => f.sev === 'error').length ?? 0, warn: report?.findings.filter((f) => f.sev === 'warn').length ?? 0, info: report?.findings.filter((f) => f.sev === 'info').length ?? 0 }), [report]);
  const setOv = (k: keyof typeof ui.overlays, v: boolean) => useUI.setState((s) => ({ overlays: { ...s.overlays, [k]: v } }));

  return (
    <>
      <Section title="Design Companion" right={<button className="btn sm" onClick={run} disabled={busy}><Icon name="pulse" size={12} />{busy ? 'Analisando…' : 'Analisar'}</button>}>
        <div className="chips">
          <span className="chip on" style={{ color: '#d98a76' }}>{counts.error} erros</span>
          <span className="chip on" style={{ color: 'var(--brass-2)' }}>{counts.warn} atenções</span>
          <span className="chip on">{counts.info} sugestões</span>
        </div>
        <div className="note" style={{ marginTop: 8 }}>Cada achado diz o que foi visto e por quê. Não há nota: é uma lista de decisões para você tomar. Clique para ir até o local.</div>
      </Section>
      <Section title="Sobrepor na planta">
        <ToggleRow label="Grade de navegação" value={ui.overlays.navGrid} onChange={(v) => setOv('navGrid', v)} hint="Verde: alcançável a partir do início. Cinza: caminhável mas isolado." />
        <ToggleRow label="Rota até a saída" value={ui.overlays.routes} onChange={(v) => setOv('routes', v)} />
        <ToggleRow label="Linha de visão" value={ui.overlays.los} onChange={(v) => setOv('los', v)} hint="Botão direito na planta → Calcular visibilidade a partir daqui" />
        {ui.overlays.los && !ui.losOrigin && <div className="note">Clique direito num ponto da planta e escolha “Calcular visibilidade a partir daqui”.</div>}
      </Section>
      <Section title="Achados" count={report?.findings.length ?? 0}>
        {!report && <div className="empty">Analisando…</div>}
        {report && report.findings.length === 0 && <div className="ok-box">Nenhum problema encontrado pelas verificações atuais. Isso não garante que o nível seja bom: jogue-o.</div>}
        {report?.findings.map((f) => (
          <div key={f.id} className={`issue ${f.sev}`} onClick={() => focus(f)} style={{ cursor: 'pointer' }}>
            <div className="t"><span className={`sev ${f.sev}`}>{SEV[f.sev]}</span> {f.title}</div>
            <div className="m">{f.detail}</div>
            <div className="acts">
              <button className="btn sm" onClick={(e) => { e.stopPropagation(); patchMeta({ dismissed: [...dismissed, f.id] }); }}>Ignorar</button>
            </div>
          </div>
        ))}
        {dismissed.length > 0 && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => patchMeta({ dismissed: [] })}>Restaurar {dismissed.length} ignorado(s)</button>}
      </Section>
      {report && (
        <Section title="Números">
          <div className="kv"><span>Ambientes</span><b>{report.metrics.rooms}</b></div>
          <div className="kv"><span>Área construída</span><b>{report.metrics.builtAreaM2.toFixed(0)} m²</b></div>
          <div className="kv"><span>Área caminhável</span><b>{report.metrics.walkableM2.toFixed(0)} m²</b></div>
          <div className="kv"><span>Ambientes alcançáveis</span><b>{report.metrics.reachableRooms} / {report.metrics.rooms}</b></div>
          <div className="kv"><span>Becos sem saída</span><b>{report.metrics.deadEnds}</b></div>
          <div className="kv"><span>Itens de gameplay</span><b>{report.metrics.gameplayItems}</b></div>
          {report.metrics.pathLengthM !== null && <div className="kv"><span>Rota mais curta até a saída</span><b>{report.metrics.pathLengthM.toFixed(0)} m · ~{Math.round(report.metrics.estSeconds!)} s</b></div>}
        </Section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ progressão
const KIND_LABEL: Record<string, string> = { collect: 'Pegar', activate: 'Ativar', unblock: 'Liberar', open: 'Abrir', exit: 'Concluir' };

export function ProgressPanel() {
  const { report, run } = useAnalysis();
  const scene = useScene((s) => s.project.scene);
  const revision = useScene((s) => s.revision);
  const ui = useUI();
  useEffect(() => { const id = setTimeout(() => run(), report ? 900 : 50); return () => clearTimeout(id); }, [revision]);
  const graph = useMemo(() => dependencyGraph(scene), [scene]);
  const p = report?.progression;
  const select = (id: ID, kind: EntityRef['kind']) => ui.select([{ kind, id }]);
  return (
    <>
      <Section title="Ordem de progressão">
        {!p && <div className="empty">Analisando…</div>}
        {p && !p.hasStart && <div className="warn-box">Sem ponto inicial: coloque um marcador “Início” para simular a progressão.</div>}
        {p?.hasStart && p.steps.length === 0 && <div className="note">Nada para pegar ou abrir a partir do início.</div>}
        {p?.steps.map((s) => (
          <div key={s.order} className="li" onClick={() => select(s.id, s.kind === 'open' ? 'opening' : 'prop')} style={{ cursor: 'pointer' }}>
            <span className="tag" style={{ minWidth: 22, textAlign: 'right' }}>{s.order}</span>
            <span className="grow">{s.label}</span>
            <span className="tag">{s.dist.toFixed(0)} m</span>
          </div>
        ))}
        {p && p.steps.length > 0 && <div className="note" style={{ marginTop: 6 }}>Ordem em que um jogador cuidadoso destrava o nível. Distância = rota mais curta desde o início no momento do passo. Cada rodada libera tudo o que já estava ao alcance.</div>}
      </Section>
      {p && p.stuck.length > 0 && (
        <Section title="Preso / inalcançável" count={p.stuck.length}>
          {p.stuck.map((o) => (
            <div key={o.id} className="issue warn" style={{ cursor: 'pointer' }} onClick={() => { select(o.id, o.kind === 'door' ? 'opening' : 'prop'); ui.focusOn(o.pos[0], o.pos[1], o.floorId); }}>
              <div className="t">{o.name}</div><div className="m">{o.reason}</div>
            </div>
          ))}
        </Section>
      )}
      <Section title="Grafo de dependências" count={`${graph.nodes.length} nós`}>
        {graph.nodes.length === 0 ? <div className="note">Sem portas condicionais nem objetos de gameplay ainda.</div> : <DepGraph graph={graph} onPick={(id, kind) => select(id, kind)} />}
      </Section>
    </>
  );
}

function DepGraph({ graph, onPick }: { graph: ReturnType<typeof dependencyGraph>; onPick: (id: ID, kind: EntityRef['kind']) => void }) {
  const scene = useScene((s) => s.project.scene);
  // camadas por profundidade (longest path); ciclos são cortados
  const depth = new Map<ID, number>();
  const incoming = new Map<ID, ID[]>();
  for (const e of graph.edges) { if (!incoming.has(e.to)) incoming.set(e.to, []); incoming.get(e.to)!.push(e.from); }
  const visiting = new Set<ID>();
  const d = (id: ID): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const v = Math.max(-1, ...(incoming.get(id) ?? []).map(d)) + 1;
    visiting.delete(id); depth.set(id, v); return v;
  };
  graph.nodes.forEach((n) => d(n.id));
  const cols = Math.max(0, ...depth.values()) + 1;
  const byCol: typeof graph.nodes[] = Array.from({ length: cols }, () => []);
  graph.nodes.forEach((n) => byCol[depth.get(n.id) ?? 0].push(n));
  const W = 300, colW = W / cols, rowH = 34, H = Math.max(...byCol.map((c) => c.length)) * rowH + 8;
  const pos = new Map<ID, [number, number]>();
  byCol.forEach((c, ci) => c.forEach((n, ri) => pos.set(n.id, [ci * colW + 6, ri * rowH + 6])));
  const boxW = Math.max(60, colW - 18);
  const color = (k: string) => (k === 'door' ? '#c9a14a' : ['key', 'card', 'fuse'].includes(k) ? '#7fa05a' : ['exit', 'elevator'].includes(k) ? '#c4553f' : '#6f8a92');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} role="img" aria-label="Grafo de dependências">
      <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="#766f5f" /></marker></defs>
      {graph.edges.map((e, i) => { const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return null; return <path key={i} d={`M${a[0] + boxW},${a[1] + 12} C${a[0] + boxW + 14},${a[1] + 12} ${b[0] - 14},${b[1] + 12} ${b[0]},${b[1] + 12}`} stroke="#766f5f" fill="none" strokeWidth="1.2" markerEnd="url(#arr)" />; })}
      {graph.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const isDoor = n.kind === 'door';
        return (
          <g key={n.id} transform={`translate(${p[0]},${p[1]})`} style={{ cursor: 'pointer' }} onClick={() => onPick(n.id, isDoor ? 'opening' : 'prop')}>
            <rect width={boxW} height={24} fill="#26231e" stroke={color(n.kind)} strokeWidth="1.4" />
            <text x={5} y={16} fontSize="10" fill="#d8d0bf" fontFamily="IBM Plex Mono, monospace">{n.label.length > boxW / 6 ? n.label.slice(0, Math.floor(boxW / 6) - 1) + '…' : n.label}</text>
          </g>
        );
      })}
      {void scene}{void getDef}
    </svg>
  );
}
