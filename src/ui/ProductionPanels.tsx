/** Ritmo (Pacing Director), Atmosfera, Ghost Replay, Reality Lab e Sketch to Space. */
import { useRef } from 'react';
import { useScene, getScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { useOverlay } from '../analysis/overlayStore';
import { Section, NumRow, TextRow, SelectRow, ColorRow, ToggleRow } from './fields';
import { Icon } from './Icon';
import { nid } from '../core/ids';
import { DEFAULT_ATMOSPHERE } from '../core/defaults';
import { builtAreaM2, floorsSorted } from '../core/scene';
import { adoptProject } from '../storage/session';
import type { Atmosphere, Emotion, PacingBeat, PlaytestRecord, Project, RefImage, Scene } from '../core/types';

// ------------------------------------------------------------------ ritmo
const EMOTIONS: { v: Emotion; l: string }[] = [
  { v: 'safety', l: 'Segurança' }, { v: 'curiosity', l: 'Curiosidade' }, { v: 'mystery', l: 'Mistério' }, { v: 'anticipation', l: 'Antecipação' },
  { v: 'disorientation', l: 'Desorientação' }, { v: 'fear', l: 'Medo' }, { v: 'combat', l: 'Combate' }, { v: 'discovery', l: 'Descoberta' }, { v: 'relief', l: 'Alívio' },
];

export function pacingWarnings(beats: PacingBeat[]): string[] {
  const w: string[] = [];
  let run = 0;
  beats.forEach((b, i) => {
    run = b.tension >= 7 ? run + 1 : 0;
    if (run === 3) w.push(`Três momentos seguidos de tensão alta terminando em “${b.name}”: sem respiro o jogador se acostuma.`);
    if (i >= 2 && beats.slice(i - 2, i + 1).every((x) => x.tension <= 2)) w.push(`Três momentos calmos seguidos em “${b.name}”: o ritmo pode arrastar.`);
  });
  if (beats.length >= 3 && Math.max(...beats.map((b) => b.tension)) <= 5) w.push('Nenhum pico de tensão acima de 5: a curva está plana.');
  if (beats.length >= 3 && !beats.some((b) => b.tension <= 2)) w.push('Nenhum momento de respiro (tensão ≤ 2).');
  return w;
}

function TensionCurve({ beats }: { beats: PacingBeat[] }) {
  if (beats.length < 2) return null;
  const W = 300, H = 90, pad = 8;
  const total = beats.reduce((n, b) => n + Math.max(0.5, b.minutes), 0);
  let acc = 0;
  const pts = beats.map((b) => { const x = pad + ((acc + Math.max(0.5, b.minutes) / 2) / total) * (W - 2 * pad); acc += Math.max(0.5, b.minutes); return [x, H - pad - (b.tension / 10) * (H - 2 * pad)] as const; });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Curva de tensão" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
      {[2, 5, 8].map((v) => <line key={v} x1={pad} x2={W - pad} y1={H - pad - (v / 10) * (H - 2 * pad)} y2={H - pad - (v / 10) * (H - 2 * pad)} stroke="#38342a" strokeDasharray="2 4" />)}
      <path d={d} stroke="#c9a14a" strokeWidth="1.6" fill="none" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={beats[i].tension >= 7 ? '#c4553f' : '#e0b24f'} />)}
    </svg>
  );
}

export function PacingPanel() {
  const beats = useScene((s) => s.project.scene.pacing);
  const rooms = useScene((s) => s.project.scene.rooms);
  const commit = useScene((s) => s.commit);
  const ui = useUI();
  const set = (id: string, patch: Partial<PacingBeat>) => commit('Momento de ritmo', (s) => { const b = s.pacing.find((x) => x.id === id); if (b) Object.assign(b, patch); });
  const move = (i: number, dir: -1 | 1) => commit('Reordenar ritmo', (s) => { const j = i + dir; if (j < 0 || j >= s.pacing.length) return; const [b] = s.pacing.splice(i, 1); s.pacing.splice(j, 0, b); });
  const add = () => commit('Novo momento', (s) => { s.pacing.push({ id: nid('beat'), name: `Momento ${s.pacing.length + 1}`, tension: 4, minutes: 3, gameplay: '', narrative: '', emotion: 'curiosity', encounter: '', lighting: '', audio: '' }); });
  const warns = pacingWarnings(beats);
  const mins = beats.reduce((n, b) => n + b.minutes, 0);
  return (
    <>
      <Section title="Curva de tensão" right={<button className="btn sm" onClick={add}><Icon name="plus" size={12} />Momento</button>}>
        {beats.length === 0 && <div className="empty">Planeje a sequência emocional do nível: cada momento tem tensão, duração, emoção e onde acontece.</div>}
        <TensionCurve beats={beats} />
        {beats.length > 0 && <div className="kv"><span>Duração estimada</span><b>{mins} min</b></div>}
        {warns.map((w, i) => <div key={i} className="warn-box">{w}</div>)}
      </Section>
      {beats.map((b, i) => (
        <Section key={b.id} title={`${i + 1}. ${b.name}`} right={
          <span style={{ display: 'flex', gap: 2 }}>
            <button className="btn icon sm" aria-label="Subir" onClick={() => move(i, -1)}>↑</button>
            <button className="btn icon sm" aria-label="Descer" onClick={() => move(i, 1)}>↓</button>
            <button className="btn icon sm danger" aria-label="Excluir" onClick={() => commit('Excluir momento', (s) => { s.pacing = s.pacing.filter((x) => x.id !== b.id); })}><Icon name="close" size={12} /></button>
          </span>}>
          <TextRow label="Nome" value={b.name} onCommit={(v) => set(b.id, { name: v })} />
          <NumRow label="Tensão (0–10)" value={b.tension} step={1} min={0} max={10} decimals={0} onCommit={(v) => set(b.id, { tension: v })} />
          <NumRow label="Duração" unit="min" value={b.minutes} step={0.5} min={0.5} max={60} onCommit={(v) => set(b.id, { minutes: v })} />
          <SelectRow label="Emoção" value={b.emotion} options={EMOTIONS} onChange={(v) => set(b.id, { emotion: v })} />
          <SelectRow label="Onde" value={b.roomId ?? ''} options={[{ v: '', l: '— sem local —' }, ...Object.values(rooms).map((r) => ({ v: r.id, l: r.name }))]} onChange={(v) => set(b.id, { roomId: v || undefined })} />
          {b.roomId && rooms[b.roomId] && <button className="btn sm" onClick={() => { const r = rooms[b.roomId!]; ui.select([{ kind: 'room', id: r.id }]); ui.focusOn(r.polygon[0][0], r.polygon[0][1], r.floorId); }}>Ver no mapa</button>}
          <TextRow label="Gameplay" value={b.gameplay} onCommit={(v) => set(b.id, { gameplay: v })} />
          <TextRow label="Narrativa" value={b.narrative} onCommit={(v) => set(b.id, { narrative: v })} />
          <TextRow label="Encontro" value={b.encounter} onCommit={(v) => set(b.id, { encounter: v })} />
          <TextRow label="Luz" value={b.lighting} onCommit={(v) => set(b.id, { lighting: v })} />
          <TextRow label="Áudio" value={b.audio} onCommit={(v) => set(b.id, { audio: v })} />
        </Section>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ atmosfera
export const ATMOSPHERE_PRESETS: Record<string, { label: string; v: Atmosphere }> = {
  greybox: { label: 'Greybox neutro', v: DEFAULT_ATMOSPHERE },
  bunker: { label: 'Bunker de emergência', v: { preset: 'bunker', fog: 0.02, fogColor: '#1d1a15', timeOfDay: 14, ambient: 0.22, ambientColor: '#9a8a68', sunIntensity: 0, sky: '#14120f', flashlight: true } },
  forest: { label: 'Floresta ao anoitecer', v: { preset: 'forest', fog: 0.035, fogColor: '#1b2420', timeOfDay: 20, ambient: 0.3, ambientColor: '#6f8a8c', sunIntensity: 0.2, sky: '#161e22', flashlight: true } },
  dawn: { label: 'Névoa da manhã', v: { preset: 'dawn', fog: 0.05, fogColor: '#8f8a7a', timeOfDay: 7, ambient: 0.6, ambientColor: '#d9ccb0', sunIntensity: 0.5, sky: '#9a9686', flashlight: false } },
  blackout: { label: 'Apagão', v: { preset: 'blackout', fog: 0.03, fogColor: '#0b0a09', timeOfDay: 0, ambient: 0.05, ambientColor: '#6a5a40', sunIntensity: 0, sky: '#050505', flashlight: true } },
  noon: { label: 'Meio-dia seco', v: { preset: 'noon', fog: 0, fogColor: '#cfc8b2', timeOfDay: 12, ambient: 0.8, ambientColor: '#f0e6cc', sunIntensity: 1.2, sky: '#9fb0b3', flashlight: false } },
};

export function AtmospherePanel() {
  const a = useScene((s) => s.project.scene.atmosphere);
  const lit = useUI((s) => s.lit);
  const commit = useScene((s) => s.commit);
  const set = (patch: Partial<Atmosphere>) => commit('Atmosfera', (s) => { Object.assign(s.atmosphere, patch, { preset: patch.preset ?? 'custom' }); });
  return (
    <>
      <Section title="Atmosfera">
        <div className="chips">
          {Object.entries(ATMOSPHERE_PRESETS).map(([k, p]) => <button key={k} className={`chip ${a.preset === k ? 'on' : ''}`} onClick={() => commit('Atmosfera', (s) => { s.atmosphere = { ...p.v }; })}>{p.label}</button>)}
        </div>
        <ToggleRow label="Pré-visualizar no 3D" value={lit} onChange={(v) => useUI.setState({ lit: v })} hint="Liga luzes, névoa e horário no editor 3D" />
      </Section>
      <Section title="Luz e céu">
        <NumRow label="Hora do dia" unit="h" value={a.timeOfDay} step={0.5} min={0} max={24} onCommit={(v) => set({ timeOfDay: v })} />
        <NumRow label="Luz ambiente" value={a.ambient} step={0.05} min={0} max={2} onCommit={(v) => set({ ambient: v })} />
        <ColorRow label="Cor ambiente" value={a.ambientColor} onChange={(v) => set({ ambientColor: v })} />
        <NumRow label="Sol" value={a.sunIntensity} step={0.1} min={0} max={3} onCommit={(v) => set({ sunIntensity: v })} />
        <ColorRow label="Céu" value={a.sky} onChange={(v) => set({ sky: v })} />
      </Section>
      <Section title="Névoa">
        <NumRow label="Densidade" value={a.fog} step={0.005} min={0} max={0.2} decimals={3} onCommit={(v) => set({ fog: v })} />
        <ColorRow label="Cor" value={a.fogColor} onChange={(v) => set({ fogColor: v })} />
      </Section>
      <Section title="Lanterna">
        <ToggleRow label="Lanterna no playtest" value={a.flashlight} onChange={(v) => set({ flashlight: v })} hint="Tecla F durante o playtest" />
        <div className="note">Luzes pontuais e spots ficam na biblioteca (aba Luzes). O playtest usa esta atmosfera quando a pré-visualização está ligada.</div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ replay
export function buildHeat(records: PlaytestRecord[], floorId: string, cell = 1) {
  const s = getScene();
  const fl = floorsSorted(s);
  const zs = fl.find((f) => f.id === floorId);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pts: [number, number][] = [];
  for (const r of records) for (const p of r.samples) {
    if (p.floorId && p.floorId !== floorId) continue;
    pts.push([p.x, p.z]); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.z); y1 = Math.max(y1, p.z);
  }
  if (!pts.length || !zs) return null;
  x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1;
  const w = Math.ceil((x1 - x0) / cell) + 2, h = Math.ceil((y1 - y0) / cell) + 2;
  const data = new Float32Array(w * h);
  let max = 0;
  for (const [x, z] of pts) { const i = Math.floor((x - x0) / cell), j = Math.floor((z - y0) / cell); const v = ++data[j * w + i]; if (v > max) max = v; }
  return { origin: [x0, y0] as [number, number], cell, w, h, data, max };
}

export function ReplayPanel() {
  const records = useScene((s) => s.project.playtests);
  const ui = useUI();
  const commit = useScene((s) => s.patchProject);
  const heatOn = ui.overlays.heat;
  const apply = (on: boolean) => {
    useUI.setState((s) => ({ overlays: { ...s.overlays, heat: on } }));
    useOverlay.getState().set({ heat: on ? buildHeat(records, ui.floorId) ?? undefined : undefined });
  };
  const showPath = (r: PlaytestRecord | null) => {
    useOverlay.getState().set({ ghostPath: r ? { pts: r.samples.filter((p) => !p.floorId || p.floorId === ui.floorId).map((p) => [p.x, p.z, p.floorId ?? ''] as [number, number, string]), upto: Infinity } : undefined });
    useUI.setState((s) => ({ overlays: { ...s.overlays, ghostPath: true } }));
  };
  const rooms = getScene().rooms;
  const visits = new Map<string, number>();
  for (const r of records) for (const id of r.roomsVisited) visits.set(id, (visits.get(id) ?? 0) + 1);
  const never = Object.values(rooms).filter((r) => !visits.has(r.id));
  return (
    <>
      <Section title="Ghost Replay" count={`${records.length} sessões`}>
        {records.length === 0 && <div className="empty">Jogue o nível (F5) por pelo menos 3 segundos. Cada sessão fica salva aqui com trajetória, eventos e salas visitadas.</div>}
        <ToggleRow label="Mapa de calor" value={heatOn} onChange={apply} hint="Onde os jogadores passaram mais tempo (amostras a cada 0,25 s)" />
        {records.map((r, i) => (
          <div key={r.id} className="li" style={{ cursor: 'pointer' }} onClick={() => showPath(r)}>
            <span className="tag">{records.length - i}</span>
            <span className="grow">{new Date(r.startedAt).toLocaleString('pt-BR')}</span>
            <span className="tag">{Math.round(r.durationSec)} s · {Math.round(r.distance)} m{r.completed ? ' ✓' : ''}</span>
            <button className="btn icon sm danger" aria-label="Excluir sessão" onClick={(e) => { e.stopPropagation(); commit((p) => { p.playtests = p.playtests.filter((x) => x.id !== r.id); }); }}><Icon name="close" size={12} /></button>
          </div>
        ))}
        {records.length > 0 && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => showPath(null)}>Esconder trajetória</button>}
      </Section>
      {records.length > 0 && (
        <Section title="Cobertura">
          <div className="kv"><span>Ambientes visitados</span><b>{Object.keys(rooms).length - never.length} / {Object.keys(rooms).length}</b></div>
          {never.length > 0 && <div className="note">Nunca visitados: {never.map((r) => r.name).join(', ')}.</div>}
          {records.some((r) => r.completed) && <div className="kv"><span>Menor tempo até concluir</span><b>{Math.round(Math.min(...records.filter((r) => r.completed).map((r) => r.durationSec)))} s</b></div>}
        </Section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ variantes
function metricsOf(s: Scene) {
  const doors = Object.values(s.openings).filter((o) => o.kind === 'door').length;
  return { builtAreaM2: builtAreaM2(s), rooms: Object.keys(s.rooms).length, doors, connections: Object.keys(s.openings).length };
}

export function VariantsPanel() {
  const variants = useScene((s) => s.project.variants);
  const scene = useScene((s) => s.project.scene);
  const patch = useScene((s) => s.patchProject);
  const m = metricsOf(scene);
  const save = () => patch((p) => { p.variants.push({ id: nid('var'), name: `Variante ${p.variants.length + 1}`, description: '', hypothesis: '', notes: '', createdAt: new Date().toISOString(), scene: structuredClone(p.scene), metrics: metricsOf(p.scene), playtestIds: [] }); });
  const upd = (id: string, o: Partial<{ name: string; description: string; hypothesis: string; notes: string }>) => patch((p) => { const v = p.variants.find((x) => x.id === id); if (v) Object.assign(v, o); });
  const restore = (id: string) => {
    const st = useScene.getState();
    const v = st.project.variants.find((x) => x.id === id); if (!v) return;
    st.commit(`Restaurar “${v.name}”`, (s) => { Object.assign(s, structuredClone(v.scene)); });
    useUI.getState().toast(`Cena substituída por “${v.name}”. Ctrl+Z desfaz.`, 'ok');
  };
  const diff = (a: number, b: number, d = 0) => { const x = b - a; return x === 0 ? '=' : `${x > 0 ? '+' : ''}${x.toFixed(d)}`; };
  return (
    <>
      <Section title="Reality Lab" right={<button className="btn sm" onClick={save}><Icon name="plus" size={12} />Guardar versão atual</button>}>
        <div className="note">Guarde versões do nível para comparar hipóteses (“e se o corredor fosse mais curto?”). Restaurar substitui a cena atual, com desfazer.</div>
      </Section>
      {variants.map((v) => (
        <Section key={v.id} title={v.name} right={
          <span style={{ display: 'flex', gap: 4 }}>
            <button className="btn sm" onClick={() => restore(v.id)}>Restaurar</button>
            <button className="btn icon sm danger" aria-label="Excluir variante" onClick={() => patch((p) => { p.variants = p.variants.filter((x) => x.id !== v.id); })}><Icon name="close" size={12} /></button>
          </span>}>
          <TextRow label="Nome" value={v.name} onCommit={(x) => upd(v.id, { name: x })} />
          <TextRow label="Hipótese" multiline value={v.hypothesis} onCommit={(x) => upd(v.id, { hypothesis: x })} />
          <TextRow label="Notas" multiline value={v.notes} onCommit={(x) => upd(v.id, { notes: x })} />
          <div className="kv"><span>Ambientes</span><b>{v.metrics.rooms} <small>({diff(v.metrics.rooms, m.rooms)} agora)</small></b></div>
          <div className="kv"><span>Portas</span><b>{v.metrics.doors} <small>({diff(v.metrics.doors, m.doors)} agora)</small></b></div>
          <div className="kv"><span>Área construída</span><b>{v.metrics.builtAreaM2.toFixed(0)} m² <small>({diff(v.metrics.builtAreaM2, m.builtAreaM2)} agora)</small></b></div>
        </Section>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ sketch to space
export function SketchSection() {
  const imgs = useScene((s) => s.project.scene.refImages);
  const commit = useScene((s) => s.commit);
  const ui = useUI();
  const file = useRef<HTMLInputElement>(null);
  const load = (f: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      const src = String(rd.result);
      const im = new Image();
      im.onload = () => {
        const id = nid('ref');
        commit('Importar croqui', (s) => {
          const r: RefImage = { id, name: f.name, floorId: ui.floorId || s.floorOrder[0], src, position: [0, 0], width: 20, rot: 0, opacity: 0.5, locked: false, aspect: im.naturalWidth / im.naturalHeight };
          s.refImages[id] = r;
        });
        ui.select([{ kind: 'refImage', id }]);
        ui.toast('Croqui importado. Ajuste a largura real em metros e trace as salas por cima.', 'ok');
      };
      im.src = src;
    };
    rd.readAsDataURL(f);
  };
  const list = Object.values(imgs);
  const upd = (id: string, patch: Partial<RefImage>) => commit('Croqui', (s) => { Object.assign(s.refImages[id], patch); });
  return (
    <Section title="Sketch to Space" right={<button className="btn sm" onClick={() => file.current?.click()}><Icon name="upload" size={12} />Imagem…</button>}>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) load(f); }} />
      {list.length === 0 && <div className="note">Importe uma planta ou croqui, calibre a largura real em metros e desenhe as salas por cima. A imagem fica só como referência (nenhum reconhecimento automático).</div>}
      {list.map((im) => (
        <div key={im.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 6 }}>
          <div className="kv"><span>{im.name}</span><b>{(im.width / im.aspect).toFixed(1)} m de altura</b></div>
          <NumRow label="Largura real" unit="m" value={im.width} step={0.5} min={1} max={500} onCommit={(v) => upd(im.id, { width: v })} />
          <NumRow label="Opacidade" value={im.opacity} step={0.05} min={0.05} max={1} onCommit={(v) => upd(im.id, { opacity: v })} />
          <NumRow label="Rotação" unit="°" value={im.rot} step={1} onCommit={(v) => upd(im.id, { rot: v })} />
          <ToggleRow label="Travada" value={im.locked} onChange={(v) => upd(im.id, { locked: v })} />
          <button className="btn sm danger" onClick={() => commit('Remover croqui', (s) => { delete s.refImages[im.id]; })}>Remover</button>
        </div>
      ))}
    </Section>
  );
}

void adoptProject; void ({} as Project);
