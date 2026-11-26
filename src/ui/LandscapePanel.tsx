import { useScene, getScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { Section, NumRow, SelectRow, ColorRow } from './fields';
import { Icon } from './Icon';
import { makeTerrain, generateTerrain, flattenUnder, terrainStats, terrainHeight } from '../geometry/terrain';
import { PROP_DEFS, getDef } from '../assets/props';
import { addProp } from '../editor/actions';
import { floorsSorted } from '../core/scene';
import { useState } from 'react';

const BRUSHES = [
  { id: 'raise', label: 'Elevar' }, { id: 'lower', label: 'Rebaixar' }, { id: 'smooth', label: 'Suavizar' }, { id: 'flatten', label: 'Nivelar' },
] as const;

export function LandscapePanel() {
  const t = useScene((s) => s.project.scene.terrain);
  const nPaths = useScene((s) => Object.keys(s.project.scene.paths).length);
  const scatters = useScene((s) => s.project.scene.scatter);
  const commit = useScene((s) => s.commit);
  const ui = useUI();
  const [size, setSize] = useState(120);
  const [res, setRes] = useState(96);
  const [seed, setSeed] = useState(7);
  const [amp, setAmp] = useState(3);
  const [scale, setScale] = useState(28);

  const create = () => commit('Criar terreno', (s) => {
    const b = { x: -size / 2 + 10, z: -size / 2 + 10 };
    s.terrain = generateTerrain(makeTerrain([b.x, b.z], [size, size], res, seed, 0), { seed, amplitude: amp, scale, octaves: 4, base: 0 });
  });
  const regen = () => commit('Regerar relevo', (s) => { if (s.terrain) s.terrain = generateTerrain(s.terrain, { seed, amplitude: amp, scale, octaves: 4, base: 0 }); });
  const flatten = () => {
    const s = getScene();
    const polys = Object.values(s.rooms).map((r) => ({ poly: r.polygon, height: s.floors[r.floorId]?.elevation ?? 0 })).filter((p) => p.height >= -0.01);
    if (!polys.length) { ui.toast('Nenhum ambiente para nivelar.', 'warn'); return; }
    commit('Nivelar terreno sob ambientes', (d) => { if (d.terrain) d.terrain = flattenUnder(d.terrain, polys); });
    ui.toast('Terreno nivelado sob os ambientes, com rampa suave nas bordas.', 'ok');
  };
  const toProps = () => {
    const s = getScene();
    const ids = Object.keys(s.scatter);
    if (!ids.length) return;
    commit('Converter distribuição em objetos', (d) => {
      for (const g of Object.values(d.scatter)) {
        for (const it of g.items) {
          const y = d.terrain ? terrainHeight(d.terrain, it[0], it[1]) ?? 0 : 0;
          const id = addProp(d, g.defId, g.floorId, it[0], it[1], { rot: it[2], scale: it[3] });
          d.props[id].position[1] = y + (getDef(g.defId)?.y0 ?? 0);
        }
        delete d.scatter[g.id];
      }
    });
    ui.toast('Distribuições viraram objetos editáveis um a um.', 'ok');
  };
  const arm = (tool: 'sculpt' | 'scatter' | 'path', place: Record<string, unknown> = {}) => { useUI.getState().setTool(tool, place as never); useUI.setState({ view: ui.view === '3d' ? 'split' : ui.view }); };
  const natureDefs = PROP_DEFS.filter((d) => d.category === 'nature');
  const stats = t ? terrainStats(t) : null;
  const scatterCount = Object.values(scatters).reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <Section title={t ? 'Terreno' : 'Criar terreno'}>
        <NumRow label="Tamanho" unit="m" value={size} step={10} min={30} max={400} onCommit={setSize} disabled={!!t} />
        <NumRow label="Resolução" value={res} step={8} min={32} max={192} decimals={0} onCommit={setRes} disabled={!!t} />
        <NumRow label="Semente" value={seed} step={1} decimals={0} onCommit={setSeed} />
        <NumRow label="Amplitude" unit="m" value={amp} step={0.5} min={0} max={20} onCommit={setAmp} />
        <NumRow label="Escala do relevo" unit="m" value={scale} step={2} min={4} max={120} onCommit={setScale} />
        {!t && <button className="btn primary" onClick={create}>Criar terreno com relevo</button>}
        {t && (
          <>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn sm" onClick={regen} title="Substitui o relevo atual pela semente e amplitude acima">Regerar relevo</button>
              <button className="btn sm" onClick={flatten} title="Nivela sob cada ambiente, com rampa suave nas bordas">Nivelar sob ambientes</button>
              <button className="btn sm danger" onClick={() => commit('Remover terreno', (s) => { s.terrain = null; })}>Remover</button>
            </div>
            <ColorRow label="Cor" value={t.color} onChange={(v) => commit('Cor do terreno', (s) => { if (s.terrain) s.terrain.color = v; })} />
            {stats && <div className="note">Altura de {stats.min.toFixed(1)} a {stats.max.toFixed(1)} m (desnível {stats.range.toFixed(1)} m). Inclinação acima do limite de {getScene() && useScene.getState().project.settings.character.maxSlopeDeg}° bloqueia o jogador.</div>}
          </>
        )}
      </Section>
      {t && (
        <>
          <Section title="Esculpir">
            <div className="chips">
              {BRUSHES.map((b) => <button key={b.id} className={`chip ${ui.tool === 'sculpt' && ui.place.brush === b.id ? 'on' : ''}`} onClick={() => arm('sculpt', { brush: b.id })}>{b.label}</button>)}
            </div>
            <NumRow label="Raio do pincel" unit="m" value={ui.place.brushRadius} step={0.5} min={1} max={30} onCommit={(v) => useUI.setState((s) => ({ place: { ...s.place, brushRadius: v } }))} />
            <NumRow label="Força" value={ui.place.brushStrength} step={0.05} min={0.02} max={1} onCommit={(v) => useUI.setState((s) => ({ place: { ...s.place, brushStrength: v } }))} />
            <div className="note">Arraste na planta. Alt inverte elevar/rebaixar; “Nivelar” fixa a altura onde você começou o traço.</div>
          </Section>
          <Section title="Caminhos" count={nPaths}>
            <SelectRow label="Tipo" value={ui.place.pathKind} options={[{ v: 'trail', l: 'Trilha' }, { v: 'road', l: 'Estrada' }, { v: 'river', l: 'Rio' }]} onChange={(v) => arm('path', { pathKind: v })} />
            <button className="btn sm" onClick={() => arm('path')}><Icon name="path" size={13} />Desenhar caminho</button>
            <div className="note">Clique os pontos na planta; duplo clique ou Enter conclui. A trilha e a estrada aplainam o terreno; o rio cava um leito.</div>
          </Section>
          <Section title="Vegetação e objetos" count={`${scatterCount} instâncias`}>
            <SelectRow label="Objeto" value={ui.place.scatterDef} options={natureDefs.map((d) => ({ v: d.id, l: d.name }))} onChange={(v) => useUI.setState((s) => ({ place: { ...s.place, scatterDef: v } }))} />
            <NumRow label="Densidade" value={ui.place.scatterDensity} step={1} min={1} max={60} decimals={0} onCommit={(v) => useUI.setState((s) => ({ place: { ...s.place, scatterDensity: v } }))} />
            <NumRow label="Espaçamento" unit="m" value={ui.place.scatterSpacing} step={0.2} min={0.4} max={10} onCommit={(v) => useUI.setState((s) => ({ place: { ...s.place, scatterSpacing: v } }))} />
            <NumRow label="Variação de escala" value={ui.place.scatterScaleVar} step={0.05} min={0} max={0.8} onCommit={(v) => useUI.setState((s) => ({ place: { ...s.place, scatterScaleVar: v } }))} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn sm" onClick={() => arm('scatter')}>Pincel de distribuição</button>
              <button className="btn sm" disabled={!scatterCount} onClick={toProps} title="Cada instância vira um objeto selecionável">Converter em objetos</button>
            </div>
            <div className="note">Alt apaga dentro do pincel. Distribuições são instanciadas (leves) e não colidem até serem convertidas em objetos.</div>
          </Section>
        </>
      )}
      <div style={{ display: 'none' }}>{floorsSorted(getScene()).length}</div>
    </>
  );
}
