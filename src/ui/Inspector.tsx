import { useMemo } from 'react';
import { useScene, getScene } from '../editor/store';
import { useUI } from '../editor/ui';
import type { EntityRef, Opening, PropInst, Room, Scene, Shape, Stair, Marker, Light, ID } from '../core/types';
import { NumRow, TextRow, SelectRow, ToggleRow, ColorRow, Section, Row, confirmDialog } from './fields';
import { alignEntities, patchEntity, resizeRoomBounds, removeFloor, type AlignMode } from '../editor/actions';
import { newSector, roomInnerSize, setRoomThickness } from '../editor/rooms';
import { getDef, REQUIRABLE, HAS_REQUIRES, gameplayLabel, CATEGORY_LABEL } from '../assets/props';
import { MARKER_INFO, MARKER_ORDER } from '../core/markerKinds';
import { floorsSorted, roomArea, wallLength, getEntity } from '../core/scene';
import { polygonBounds, round } from '../core/math';
import { runCommand } from '../editor/commands';
import { Icon } from './Icon';

const commit = (label: string, fn: (s: Scene) => void) => useScene.getState().commit(label, fn);
const patch = (ref: EntityRef, label: string, p: Record<string, unknown>) => commit(label, (s) => patchEntity(s, ref, p));

/** Para campos numéricos arrastáveis: preview sem histórico + fim com um único registro. */
const scrub = (ref: EntityRef, label: string, key: string, base: number) => ({
  onScrub: (v: number) => useScene.getState().preview((s) => patchEntity(s, ref, { [key]: v })),
  onScrubEnd: () => useScene.getState().endPreview(label),
  value: base,
});

export function Inspector() {
  const sel = useUI((s) => s.selection);
  const scene = useScene((s) => s.project.scene);
  const refs = sel.filter((r) => getEntity(scene, r));
  if (!refs.length) return <ProjectOverview />;
  if (refs.length > 1) return <MultiPanel refs={refs} />;
  const ref = refs[0];
  const e = getEntity(scene, ref);
  switch (ref.kind) {
    case 'room': return <RoomPanel r={e} scene={scene} />;
    case 'opening': return <OpeningPanel o={e} scene={scene} />;
    case 'prop': return <PropPanel p={e} scene={scene} />;
    case 'shape': return <ShapePanel sh={e} />;
    case 'stair': return <StairPanel st={e} />;
    case 'marker': return <MarkerPanel m={e} />;
    case 'light': return <LightPanel l={e} />;
    case 'wall': return <WallPanel w={e} />;
    case 'annotation': return <AnnotationPanel a={e} />;
    default: return <Head kind={ref.kind} name={e.name ?? ref.kind} onName={() => {}} />;
  }
}

function Head({ kind, name, onName }: { kind: string; name: string; onName: (v: string) => void }) {
  return (
    <div className="entity-head">
      <div className="kind">{kind}</div>
      <input className="name" value={name} onChange={(e) => onName(e.target.value)} aria-label="Nome" spellCheck={false} />
    </div>
  );
}
const N = (label: string, v: number, onCommit: (n: number) => void, o: { unit?: string; step?: number; min?: number; max?: number } = {}) => <NumRow label={label} value={v} onCommit={onCommit} unit={o.unit ?? 'm'} step={o.step ?? 0.1} min={o.min} max={o.max} />;

// ---------------------------------------------------------------- Sala
function RoomPanel({ r, scene }: { r: Room; scene: Scene }) {
  const ref: EntityRef = { kind: 'room', id: r.id };
  const b = polygonBounds(r.polygon);
  const inner = roomInnerSize(r);
  const fl = scene.floors[r.floorId];
  const walls = Object.values(scene.walls).filter((w) => w.sources.some((x) => x.roomId === r.id));
  const doors = Object.values(scene.openings).filter((o) => walls.some((w) => w.id === o.wallId));
  const sectors = Object.values(scene.sectors);
  return (
    <>
      <NameHead ref0={ref} kind={r.kind === 'corridor' ? 'Corredor' : 'Sala'} name={r.name} />
      <Section title="Medidas">
        {r.polygon.length === 4 && Math.abs(b.w * b.h - roomArea(r)) < 0.01 ? (
          <>
            {N('Largura (eixos)', round(b.w, 3), (v) => commit('Redimensionar sala', (s) => { resizeRoomBounds(s, r.id, v, b.h); }), { min: 0.6 })}
            {N('Profundidade', round(b.h, 3), (v) => commit('Redimensionar sala', (s) => { resizeRoomBounds(s, r.id, b.w, v); }), { min: 0.6 })}
          </>
        ) : <div className="note">Sala irregular: arraste os vértices na planta para ajustar.</div>}
        <div className="kv"><span>Útil (interno)</span><b>{inner.w.toFixed(2)} × {inner.h.toFixed(2)} m</b></div>
        <div className="kv"><span>Área</span><b>{roomArea(r).toFixed(1)} m²</b></div>
        <div className="kv"><span>Aberturas</span><b>{doors.length}</b></div>
      </Section>
      <Section title="Estrutura">
        {N('Espessura da parede', r.wallThickness, (v) => commit('Espessura', (s) => setRoomThickness(s, r.id, v)), { min: 0.05, max: 1.5, step: 0.05 })}
        {N('Pé-direito', r.height ?? fl?.height ?? 3, (v) => patch(ref, 'Pé-direito', { height: v }), { min: 1.8, max: 20, step: 0.1 })}
        {r.height !== undefined && <button className="btn sm" onClick={() => commit('Pé-direito padrão', (s) => { delete s.rooms[r.id].height; })}>Usar o do pavimento ({fl?.height} m)</button>}
        <ToggleRow label="Piso" value={r.hasFloor} onChange={(v) => patch(ref, 'Piso', { hasFloor: v })} />
        <ToggleRow label="Teto" value={r.hasCeiling} onChange={(v) => patch(ref, 'Teto', { hasCeiling: v })} />
      </Section>
      <Section title="Setor" right={<button className="btn sm" title="Criar novo setor e aplicar" onClick={() => commit('Novo setor', (s) => { const id = newSector(s); s.rooms[r.id].sectorId = id; })}><Icon name="plus" size={12} />Novo</button>}>
        <SelectRow label="Setor" value={r.sectorId ?? ''} options={[{ v: '', l: '— nenhum —' }, ...sectors.map((x) => ({ v: x.id, l: x.name }))]} onChange={(v) => commit('Setor da sala', (s) => { s.rooms[r.id].sectorId = v || undefined; })} />
      </Section>
      <Section title="Notas"><TextRow label="Anotação" multiline value={r.notes ?? ''} onCommit={(v) => patch(ref, 'Nota da sala', { notes: v })} /></Section>
    </>
  );
}

function NameHead({ ref0, kind, name }: { ref0: EntityRef; kind: string; name: string }) {
  return <Head kind={kind} name={name} onName={(v) => useScene.getState().commit('Renomear', (s) => patchEntity(s, ref0, { name: v }))} />;
}

// ---------------------------------------------------------------- Parede
function WallPanel({ w }: { w: Scene['walls'][ID] }) {
  const ref: EntityRef = { kind: 'wall', id: w.id };
  return (
    <>
      <div className="entity-head"><div className="kind">Parede</div><div style={{ fontFamily: 'var(--f-cond)', fontSize: 20 }}>{wallLength(w).toFixed(2)} m</div></div>
      <Section title="Parede">
        {N('Espessura', w.thickness, (v) => patch(ref, 'Espessura da parede', { thickness: v }), { min: 0.05, max: 1.5, step: 0.05 })}
        {N('Altura', w.height ?? 0, (v) => patch(ref, 'Altura da parede', { height: v > 0 ? v : undefined }), { min: 0, max: 20 })}
        <div className="note">Altura 0 usa o pé-direito da sala. Paredes compartilhadas aparecem uma única vez ({w.sources.length} sala(s)).</div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Abertura (porta/janela)
function OpeningPanel({ o, scene }: { o: Opening; scene: Scene }) {
  const ref: EntityRef = { kind: 'opening', id: o.id };
  const wall = scene.walls[o.wallId];
  const L = wall ? wallLength(wall) : 0;
  const isDoor = o.kind === 'door';
  const requirable = useMemo(() => Object.values(scene.props).filter((p) => { const g = getDef(p.defId)?.gameplay; return g && REQUIRABLE.includes(g); }), [scene.props]);
  const setLogic = (label: string, f: (l: Opening['logic']) => void) => commit(label, (s) => { f(s.openings[o.id].logic); });
  return (
    <>
      <NameHead ref0={ref} kind={{ door: 'Porta', window: 'Janela', arch: 'Passagem' }[o.kind]} name={o.name} />
      <Section title="Geometria">
        {N('Largura', o.width, (v) => patch(ref, 'Largura', { width: v }), { min: 0.4, max: Math.max(0.4, L - 0.1), step: 0.05 })}
        {N('Altura', o.height, (v) => patch(ref, 'Altura', { height: v }), { min: 0.4, max: 6, step: 0.05 })}
        {!isDoor && N('Peitoril', o.sill, (v) => patch(ref, 'Peitoril', { sill: v }), { min: 0, max: 4, step: 0.05 })}
        {N('Posição na parede', o.offset, (v) => patch(ref, 'Posição', { offset: v }), { min: 0, max: L })}
        {isDoor && (
          <Row label="Abertura">
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn sm" onClick={() => patch(ref, 'Inverter lado', { swing: o.swing === 1 ? -1 : 1 })}>Inverter lado</button>
              <button className="btn sm" onClick={() => patch(ref, 'Trocar dobradiça', { hinge: o.hinge === 'a' ? 'b' : 'a' })}>Dobradiça</button>
            </div>
          </Row>
        )}
      </Section>
      {isDoor && (
        <Section title="Lógica">
          <SelectRow label="Estado" value={o.logic.mode} options={[{ v: 'free', l: 'Livre' }, { v: 'locked', l: 'Trancada (sem chave)' }, { v: 'requires', l: 'Exige objetos' }]} onChange={(v) => setLogic('Lógica da porta', (l) => { l.mode = v; })} />
          {o.logic.mode === 'requires' && (
            <div style={{ marginBottom: 8 }}>
              {requirable.length === 0 && <div className="warn-box">Nenhum objeto de gameplay no mapa. Coloque uma chave, cartão ou interruptor (categoria Gameplay).</div>}
              {requirable.map((p) => {
                const on = o.logic.requires.includes(p.id);
                return (
                  <label key={p.id} className="li" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} onChange={() => setLogic('Requisitos da porta', (l) => { l.requires = on ? l.requires.filter((x) => x !== p.id) : [...l.requires, p.id]; })} />
                    <span className="grow">{p.name}</span><span className="tag">{gameplayLabel(getDef(p.defId)!.gameplay!)}</span>
                  </label>
                );
              })}
              <div className="note">Todos os marcados precisam estar satisfeitos (E lógico).</div>
            </div>
          )}
          <SelectRow label="Sentido" value={o.logic.oneWay} options={[{ v: 'none', l: 'Dois sentidos' }, { v: 'front', l: 'Só a partir da frente' }, { v: 'back', l: 'Só a partir de trás' }]} onChange={(v) => setLogic('Sentido da porta', (l) => { l.oneWay = v; })} />
          <ToggleRow label="Porta falsa" value={!!o.logic.fake} hint="Desenhada, mas nunca abre" onChange={(v) => setLogic('Porta falsa', (l) => { l.fake = v; })} />
          <ToggleRow label="Começa aberta" value={!!o.logic.startOpen} onChange={(v) => setLogic('Porta aberta', (l) => { l.startOpen = v; })} />
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Objeto
function PropPanel({ p, scene }: { p: PropInst; scene: Scene }) {
  const ref: EntityRef = { kind: 'prop', id: p.id };
  const def = getDef(p.defId);
  const needs = def?.gameplay && HAS_REQUIRES.includes(def.gameplay);
  const requirable = Object.values(scene.props).filter((q) => { const g = getDef(q.defId)?.gameplay; return q.id !== p.id && g && REQUIRABLE.includes(g); });
  const setPos = (i: 0 | 1 | 2, v: number) => commit('Mover objeto', (s) => { s.props[p.id].position[i] = v; });
  return (
    <>
      <NameHead ref0={ref} kind={def ? CATEGORY_LABEL[def.category] : 'Objeto'} name={p.name} />
      <Section title="Transformação">
        {N('X', round(p.position[0], 3), (v) => setPos(0, v))}
        {N('Z', round(p.position[2], 3), (v) => setPos(2, v))}
        {N('Altura (Y)', round(p.position[1], 3), (v) => setPos(1, v), { min: 0 })}
        <NumRow label="Rotação" unit="°" step={15} {...scrub(ref, "Girar objeto", "rot", round(p.rot, 2))} onCommit={(v) => patch(ref, 'Girar objeto', { rot: ((v % 360) + 360) % 360 })} />
        <NumRow label="Escala" value={p.scale} unit="×" step={0.05} min={0.2} max={5} onCommit={(v) => patch(ref, 'Escala', { scale: v })} />
        {def && <div className="kv"><span>Tamanho real</span><b>{(def.size[0] * p.scale).toFixed(2)} × {(def.size[2] * p.scale).toFixed(2)} × {(def.size[1] * p.scale).toFixed(2)} m</b></div>}
      </Section>
      {def && def.params.length > 0 && (
        <Section title="Parâmetros">
          {def.params.map((pd) => {
            const val = p.params[pd.key] ?? pd.def;
            const set = (v: string | number | boolean) => commit('Parâmetro', (s) => { s.props[p.id].params[pd.key] = v; });
            if (pd.type === 'number') return <NumRow key={pd.key} label={pd.label} value={Number(val)} step={pd.step ?? 0.1} min={pd.min} max={pd.max} unit="" onCommit={set} />;
            if (pd.type === 'bool') return <ToggleRow key={pd.key} label={pd.label} value={!!val} onChange={set} />;
            if (pd.type === 'select') return <SelectRow key={pd.key} label={pd.label} value={String(val)} options={(pd.options ?? []).map((o) => ({ v: o, l: o }))} onChange={set} />;
            return <TextRow key={pd.key} label={pd.label} value={String(val)} onCommit={set} />;
          })}
        </Section>
      )}
      {needs && (
        <Section title="Condições">
          {requirable.length === 0 && <div className="note">Nenhum outro objeto de gameplay no mapa para exigir.</div>}
          {requirable.map((q) => {
            const on = p.requires.includes(q.id);
            return (
              <label key={q.id} className="li" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => commit('Condições do objeto', (s) => { const r = s.props[p.id].requires; s.props[p.id].requires = on ? r.filter((x) => x !== q.id) : [...r, q.id]; })} />
                <span className="grow">{q.name}</span><span className="tag">{gameplayLabel(getDef(q.defId)!.gameplay!)}</span>
              </label>
            );
          })}
        </Section>
      )}
      {def?.gameplay && <div className="sec"><div className="note"><b>{gameplayLabel(def.gameplay)}.</b> Funciona no playtest (E para interagir).</div></div>}
    </>
  );
}

// ---------------------------------------------------------------- Forma
function ShapePanel({ sh }: { sh: Shape }) {
  const ref: EntityRef = { kind: 'shape', id: sh.id };
  const setSize = (i: 0 | 1 | 2, v: number) => commit('Dimensionar forma', (s) => { s.shapes[sh.id].size[i] = v; });
  return (
    <>
      <NameHead ref0={ref} kind={`Forma · ${sh.kind}`} name={sh.name} />
      <Section title="Dimensões">
        {N('Largura (X)', sh.size[0], (v) => setSize(0, v), { min: 0.05 })}
        {N('Altura', sh.size[1], (v) => setSize(1, v), { min: 0.02 })}
        {N('Profundidade (Z)', sh.size[2], (v) => setSize(2, v), { min: 0.05 })}
        {N('Base acima do piso', sh.position[1], (v) => commit('Elevar forma', (s) => { s.shapes[sh.id].position[1] = v; }))}
        <NumRow label="Rotação" value={round(sh.rot, 2)} unit="°" step={15} onCommit={(v) => patch(ref, 'Girar forma', { rot: ((v % 360) + 360) % 360 })} />
        {sh.kind === 'prism' && <NumRow label="Lados" value={sh.sides ?? 6} unit="" step={1} min={3} max={24} decimals={0} onCommit={(v) => patch(ref, 'Lados', { sides: Math.round(v) })} />}
      </Section>
      <Section title="Aparência">
        <ColorRow label="Cor" value={sh.color} onChange={(v) => patch(ref, 'Cor', { color: v })} />
        <ToggleRow label="Colide" value={sh.collide} onChange={(v) => patch(ref, 'Colisão', { collide: v })} />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Escada
function StairPanel({ st }: { st: Stair }) {
  const ref: EntityRef = { kind: 'stair', id: st.id };
  return (
    <>
      <NameHead ref0={ref} kind={st.kind === 'ramp' ? 'Rampa' : 'Escada'} name={st.name} />
      <Section title="Dimensões">
        {N('Largura', st.width, (v) => patch(ref, 'Largura', { width: v }), { min: 0.6 })}
        {N('Comprimento', st.run, (v) => patch(ref, 'Comprimento', { run: v }), { min: 0.6 })}
        {N('Altura vencida', st.rise, (v) => patch(ref, 'Altura', { rise: v }), { min: 0.1 })}
        {st.kind === 'stair' && <NumRow label="Degraus" value={st.steps} unit="" step={1} min={2} max={60} decimals={0} onCommit={(v) => patch(ref, 'Degraus', { steps: Math.round(v) })} />}
        <NumRow label="Rotação" value={round(st.rot, 2)} unit="°" step={15} onCommit={(v) => patch(ref, 'Girar escada', { rot: ((v % 360) + 360) % 360 })} />
        {st.kind === 'stair' && <div className="kv"><span>Espelho</span><b>{((st.rise / st.steps) * 100).toFixed(1)} cm</b></div>}
        {st.kind === 'ramp' && <div className="kv"><span>Inclinação</span><b>{(Math.atan2(st.rise, st.run) * 180 / Math.PI).toFixed(1)}°</b></div>}
        <ToggleRow label="Guarda-corpo" value={st.railings} onChange={(v) => patch(ref, 'Guarda-corpo', { railings: v })} />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Marcador
function MarkerPanel({ m }: { m: Marker }) {
  const ref: EntityRef = { kind: 'marker', id: m.id };
  const info = MARKER_INFO[m.kind];
  return (
    <>
      <NameHead ref0={ref} kind="Marcador" name={m.name} />
      <Section title="Marcador">
        <SelectRow label="Tipo" value={m.kind} options={MARKER_ORDER.map((k) => ({ v: k, l: MARKER_INFO[k].label }))} onChange={(v) => patch(ref, 'Tipo de marcador', { kind: v })} />
        {N('Raio', m.radius, (v) => patch(ref, 'Raio', { radius: v }), { min: 0.2 })}
        <NumRow label="Direção" value={round(m.rot, 1)} unit="°" step={15} onCommit={(v) => patch(ref, 'Direção', { rot: ((v % 360) + 360) % 360 })} />
        <TextRow label="Descrição" multiline value={m.description} onCommit={(v) => patch(ref, 'Descrição', { description: v })} />
        <div className="note">{info.help}</div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Luz
function LightPanel({ l }: { l: Light }) {
  const ref: EntityRef = { kind: 'light', id: l.id };
  return (
    <>
      <NameHead ref0={ref} kind={`Luz · ${l.kind}`} name={l.name} />
      <Section title="Luz">
        <ColorRow label="Cor" value={l.color} onChange={(v) => patch(ref, 'Cor da luz', { color: v })} />
        <NumRow label="Intensidade" value={l.intensity} unit="" step={0.1} min={0} max={20} onCommit={(v) => patch(ref, 'Intensidade', { intensity: v })} />
        {l.kind !== 'ambient' && l.kind !== 'directional' && N('Alcance', l.range, (v) => patch(ref, 'Alcance', { range: v }), { min: 0.5, max: 60 })}
        {l.kind === 'spot' && <NumRow label="Abertura" value={l.angle} unit="°" step={5} min={5} max={120} onCommit={(v) => patch(ref, 'Abertura', { angle: v })} />}
        {l.kind !== 'ambient' && N('Altura', l.position[1], (v) => commit('Altura da luz', (s) => { s.lights[l.id].position[1] = v; }))}
        <ToggleRow label="Pisca" value={l.flicker} onChange={(v) => patch(ref, 'Pisca', { flicker: v })} />
        <ToggleRow label="Emergência" hint="Luz vermelha de emergência" value={l.emergency} onChange={(v) => patch(ref, 'Emergência', { emergency: v })} />
        <div className="note">Ative “Pré-visualizar iluminação” no menu Vista para ver o efeito no 3D.</div>
      </Section>
    </>
  );
}

function AnnotationPanel({ a }: { a: Scene['annotations'][ID] }) {
  const ref: EntityRef = { kind: 'annotation', id: a.id };
  return (
    <>
      <div className="entity-head"><div className="kind">Anotação</div></div>
      <Section title="Texto">
        <TextRow label="Texto" multiline value={a.text} onCommit={(v) => patch(ref, 'Texto', { text: v })} />
        <ColorRow label="Cor" value={a.color} onChange={(v) => patch(ref, 'Cor', { color: v })} />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Seleção múltipla
function MultiPanel({ refs }: { refs: EntityRef[] }) {
  const counts = refs.reduce<Record<string, number>>((a, r) => { a[r.kind] = (a[r.kind] ?? 0) + 1; return a; }, {});
  const al = (m: AlignMode) => commit('Alinhar', (s) => alignEntities(s, refs, m));
  const btn = (label: string, id: string, icon: string) => <button className="btn sm" onClick={() => runCommand(id)}><Icon name={icon} size={13} />{label}</button>;
  return (
    <>
      <div className="entity-head"><div className="kind">Seleção múltipla</div><div style={{ fontFamily: 'var(--f-cond)', fontSize: 20 }}>{refs.length} objetos</div></div>
      <Section title="Conteúdo">{Object.entries(counts).map(([k, n]) => <div key={k} className="kv"><span>{k}</span><b>{n}</b></div>)}</Section>
      <Section title="Alinhar">
        <div className="chips">
          {(['left', 'centerX', 'right', 'top', 'centerZ', 'bottom'] as AlignMode[]).map((m) => <button key={m} className="chip" onClick={() => al(m)}>{({ left: 'Esquerda', centerX: 'Centro H', right: 'Direita', top: 'Topo', centerZ: 'Centro V', bottom: 'Base' })[m]}</button>)}
        </div>
      </Section>
      <Section title="Ações">
        <div className="chips">
          {btn('Duplicar', 'edit.duplicate', 'copy')}
          {btn('Agrupar', 'edit.group', 'group')}
          {btn('Desagrupar', 'edit.ungroup', 'group')}
          {btn('Girar 90°', 'edit.rot90', 'rotate')}
          {btn('Excluir', 'edit.delete', 'trash')}
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Nada selecionado: pavimento e setores
function ProjectOverview() {
  const scene = useScene((s) => s.project.scene);
  const floorId = useUI((s) => s.floorId);
  const f = scene.floors[floorId];
  const floors = floorsSorted(scene);
  const sectors = Object.values(scene.sectors);
  const rooms = Object.values(scene.rooms);
  const fRef = (patchF: Record<string, unknown>, label: string) => commit(label, (s) => { Object.assign(s.floors[floorId], patchF); });
  return (
    <>
      <div className="entity-head"><div className="kind">Nada selecionado</div><div style={{ fontFamily: 'var(--f-cond)', fontSize: 20 }}>{f?.name ?? 'Projeto'}</div></div>
      {f && (
        <Section title="Pavimento">
          <TextRow label="Nome" value={f.name} onCommit={(v) => fRef({ name: v }, 'Renomear pavimento')} />
          {N('Elevação', f.elevation, (v) => fRef({ elevation: v }, 'Elevação do pavimento'), { step: 0.1 })}
          {N('Pé-direito', f.height, (v) => fRef({ height: v }, 'Pé-direito do pavimento'), { min: 1.8, max: 12 })}
          <div className="kv"><span>Salas neste pavimento</span><b>{rooms.filter((r) => r.floorId === floorId).length}</b></div>
          {floors.length > 1 && <button className="btn sm danger" onClick={async () => { if (await confirmDialog(`Excluir “${f.name}” e tudo o que há nele?`, 'Dá para desfazer com Ctrl+Z.', 'Excluir pavimento')) { commit('Excluir pavimento', (s) => removeFloor(s, floorId)); useUI.setState({ floorId: floorsSorted(getScene())[0]?.id ?? '', selection: [] }); } }}><Icon name="trash" size={12} />Excluir pavimento</button>}
        </Section>
      )}
      <Section title="Setores" count={sectors.length} right={<button className="btn sm" onClick={() => commit('Novo setor', (s) => { newSector(s); })}><Icon name="plus" size={12} />Novo</button>}>
        {sectors.length === 0 && <div className="note">Setores agrupam salas por cor e capítulo. Crie um e aplique pela sala selecionada.</div>}
        {sectors.map((x) => (
          <div key={x.id} className="li" style={{ gap: 6 }}>
            <input className="color" type="color" value={x.color} onChange={(e) => commit('Cor do setor', (s) => { s.sectors[x.id].color = e.target.value; })} style={{ width: 24, height: 22, padding: 0 }} />
            <input className="in txt" value={x.name} onChange={(e) => commit('Renomear setor', (s) => { s.sectors[x.id].name = e.target.value; })} style={{ flex: 1 }} />
            <span className="tag">{rooms.filter((r) => r.sectorId === x.id).length}</span>
          </div>
        ))}
      </Section>
      <div className="sec"><div className="note">Selecione algo na planta ou no 3D para editar suas propriedades. Clique com o botão direito para o menu de contexto.</div></div>
    </>
  );
}
