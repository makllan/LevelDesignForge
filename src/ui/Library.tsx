import { useMemo, useState } from 'react';
import { useUI } from '../editor/ui';
import { CATEGORY_LABEL, getDef, propThumbnail, searchProps, type PropCategory } from '../assets/props';
import { MARKER_INFO, MARKER_ORDER } from '../core/markerKinds';
import type { LightKind, ShapeKind } from '../core/types';
import { Icon } from './Icon';

type Tab = 'props' | 'shapes' | 'markers' | 'lights';
const SHAPES: { k: ShapeKind; l: string }[] = [
  { k: 'cube', l: 'Cubo' }, { k: 'cylinder', l: 'Cilindro' }, { k: 'sphere', l: 'Esfera' }, { k: 'ramp', l: 'Cunha / rampa' },
  { k: 'plane', l: 'Plano' }, { k: 'cone', l: 'Cone' }, { k: 'prism', l: 'Prisma' },
];
const LIGHTS: { k: LightKind; l: string }[] = [{ k: 'point', l: 'Ponto' }, { k: 'spot', l: 'Spot / lanterna' }, { k: 'directional', l: 'Direcional (sol/lua)' }, { k: 'ambient', l: 'Ambiente' }];

export function Library() {
  const [tab, setTab] = useState<Tab>('props');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<PropCategory | 'all' | 'fav' | 'recent'>('all');
  const ui = useUI();
  const list = useMemo(() => {
    if (cat === 'fav') return ui.favorites.map(getDef).filter((d): d is NonNullable<typeof d> => !!d).filter((d) => !q || searchProps(q).includes(d));
    if (cat === 'recent') return ui.recents.map(getDef).filter((d): d is NonNullable<typeof d> => !!d).filter((d) => !q || searchProps(q).includes(d));
    return searchProps(q, cat);
  }, [q, cat, ui.favorites, ui.recents]);

  return (
    <div className="library" style={{ height: ui.panels.bottomH }}>
      <div className="lib-head">
        {(['props', 'shapes', 'markers', 'lights'] as Tab[]).map((x) => (
          <button key={x} className={`lib-cat ${tab === x ? 'on' : ''}`} onClick={() => setTab(x)}>{({ props: 'Objetos', shapes: 'Formas', markers: 'Marcadores', lights: 'Luzes' })[x]}</button>
        ))}
        {tab === 'props' && (
          <>
            <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)', margin: '0 6px' }} />
            <div className="lib-search"><Icon name="search" size={14} /><input placeholder="Buscar objeto ou tag…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className={`lib-cat ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Todos</button>
            <button className={`lib-cat ${cat === 'fav' ? 'on' : ''}`} onClick={() => setCat('fav')}>★ Favoritos</button>
            <button className={`lib-cat ${cat === 'recent' ? 'on' : ''}`} onClick={() => setCat('recent')}>Recentes</button>
            {(Object.keys(CATEGORY_LABEL) as PropCategory[]).map((c) => <button key={c} className={`lib-cat ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>)}
          </>
        )}
        <span className="spacer" />
        <span style={{ color: 'var(--text-3)', fontSize: 11, whiteSpace: 'nowrap' }}>Clique para colocar · arraste para a planta ou o 3D</span>
      </div>
      <div className="lib-grid">
        {tab === 'props' && list.map((d) => (
          <div key={d.id} className={`card ${ui.tool === 'prop' && ui.place.propId === d.id ? 'on' : ''}`} draggable title={`${d.name} — ${d.size.map((n) => n.toFixed(2)).join(' × ')} m`}
            onDragStart={(e) => { e.dataTransfer.setData('application/x-forge-prop', d.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { ui.setTool('prop', { propId: d.id }); ui.pushRecent(d.id); }}>
            <button className={`fav ${ui.favorites.includes(d.id) ? 'on' : ''}`} title="Favoritar" onClick={(e) => { e.stopPropagation(); ui.toggleFavorite(d.id); }}><Icon name="star" size={13} /></button>
            <img src={propThumbnail(d, 64)} alt="" draggable={false} />
            <div className="nm">{d.name}</div>
            <div className="dm">{d.size[0].toFixed(1)}×{d.size[2].toFixed(1)}×{d.size[1].toFixed(1)}</div>
          </div>
        ))}
        {tab === 'props' && !list.length && <div className="empty" style={{ width: '100%' }}>{cat === 'fav' ? 'Nenhum favorito ainda. Passe o mouse sobre um objeto e clique na estrela.' : 'Nada encontrado.'}</div>}
        {tab === 'shapes' && SHAPES.map((s) => (
          <div key={s.k} className={`card ${ui.tool === 'shape' && ui.place.shapeKind === s.k ? 'on' : ''}`} draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/x-forge-shape', s.k); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => ui.setTool('shape', { shapeKind: s.k })}>
            <div style={{ height: 56, display: 'grid', placeItems: 'center', color: 'var(--text-2)' }}><Icon name="shape" size={30} /></div>
            <div className="nm">{s.l}</div>
          </div>
        ))}
        {tab === 'markers' && MARKER_ORDER.map((k) => {
          const m = MARKER_INFO[k];
          return (
            <div key={k} className={`card ${ui.tool === 'marker' && ui.place.markerKind === k ? 'on' : ''}`} title={m.help} onClick={() => ui.setTool('marker', { markerKind: k })}>
              <div style={{ height: 56, display: 'grid', placeItems: 'center' }}><span style={{ width: 34, height: 34, border: `2px solid ${m.color}`, color: m.color, display: 'grid', placeItems: 'center', fontFamily: 'var(--f-cond)', fontWeight: 700, fontSize: 17, borderRadius: m.shape === 'circle' ? '50%' : m.shape === 'diamond' ? 4 : 0, transform: m.shape === 'diamond' ? 'rotate(45deg)' : undefined }}><span style={{ transform: m.shape === 'diamond' ? 'rotate(-45deg)' : undefined }}>{m.glyph}</span></span></div>
              <div className="nm">{m.label}</div>
            </div>
          );
        })}
        {tab === 'lights' && LIGHTS.map((l) => (
          <div key={l.k} className={`card ${ui.tool === 'light' && ui.place.lightKind === l.k ? 'on' : ''}`} onClick={() => ui.setTool('light', { lightKind: l.k })}>
            <div style={{ height: 56, display: 'grid', placeItems: 'center', color: 'var(--brass-2)' }}><Icon name="light" size={30} /></div>
            <div className="nm">{l.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
