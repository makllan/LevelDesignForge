/** Smart Rooms: ambientes paramétricos — a sala, as portas e a mobília coerente com o uso. */
import { useState } from 'react';
import { useUI } from '../editor/ui';
import { useScene, getScene } from '../editor/store';
import { addRoomRect } from '../editor/rooms';
import { addProp, addMarker } from '../editor/actions';
import { sceneBounds } from '../core/scene';
import { Icon } from './Icon';
import { NumRow } from './fields';
import type { RoomKind } from '../core/types';

/** [defId, fx, fz, rot°, margem opcional]; fx/fz em 0..1 dentro do espaço útil. */
type Item = [string, number, number, number];
interface Preset { id: string; name: string; note: string; w: number; d: number; kind: RoomKind; items: Item[]; extra?: 'checkpoint' }

export const SMART_PRESETS: Preset[] = [
  { id: 'office', name: 'Escritório', note: 'Mesa, cadeira, computador, arquivo e estante.', w: 5, d: 4, kind: 'room', items: [['office.desk', 0.5, 0.3, 0], ['office.chair', 0.5, 0.5, 180], ['office.computer', 0.5, 0.27, 0], ['office.filing', 0.1, 0.85, 90], ['office.bookshelf', 0.88, 0.1, 270]] },
  { id: 'archive', name: 'Arquivo', note: 'Fileiras de estantes com corredor central.', w: 8, d: 6, kind: 'room', items: [['office.bookshelf', 0.15, 0.12, 0], ['office.bookshelf', 0.5, 0.12, 0], ['office.bookshelf', 0.85, 0.12, 0], ['office.bookshelf', 0.15, 0.88, 180], ['office.bookshelf', 0.5, 0.88, 180], ['office.bookshelf', 0.85, 0.88, 180], ['office.table_round', 0.5, 0.5, 0]] },
  { id: 'storage', name: 'Almoxarifado', note: 'Estantes industriais e caixotes.', w: 6, d: 5, kind: 'room', items: [['ind.shelf', 0.12, 0.2, 90], ['ind.shelf', 0.12, 0.7, 90], ['ind.crate', 0.6, 0.25, 15], ['ind.crate', 0.72, 0.28, 0], ['ind.crate_small', 0.65, 0.7, 30], ['ind.crate', 0.88, 0.8, 0]] },
  { id: 'generators', name: 'Sala de máquinas', note: 'Gerador, painéis e tubulação.', w: 9, d: 7, kind: 'room', items: [['ind.generator', 0.3, 0.45, 0], ['ind.generator', 0.7, 0.45, 0], ['ind.panel', 0.5, 0.06, 0], ['ind.machine', 0.5, 0.9, 180], ['ind.pipe_h', 0.5, 0.15, 0]] },
  { id: 'infirmary', name: 'Enfermaria', note: 'Leitos e mesa cirúrgica.', w: 7, d: 5, kind: 'room', items: [['med.bed', 0.2, 0.2, 0], ['med.bed', 0.2, 0.8, 180], ['med.bed', 0.5, 0.2, 0], ['med.surgical_table', 0.78, 0.55, 0]] },
  { id: 'chapel', name: 'Capela', note: 'Altar e cruz no fundo, nave livre.', w: 8, d: 12, kind: 'room', items: [['rel.altar', 0.5, 0.1, 0], ['rel.cross', 0.5, 0.03, 0]] },
  { id: 'cell', name: 'Cela de contenção', note: 'Mesa de contenção e luz de aviso.', w: 5, d: 5, kind: 'room', items: [['cont.restraint_table', 0.5, 0.5, 0], ['cont.warning_light', 0.5, 0.05, 0]] },
  { id: 'lounge', name: 'Sala de descanso', note: 'Sofá, mesa e um ponto seguro.', w: 5, d: 4.5, kind: 'room', items: [['office.sofa', 0.5, 0.2, 0], ['office.table_round', 0.5, 0.55, 0]], extra: 'checkpoint' },
  { id: 'corridor', name: 'Corredor técnico', note: 'Longo, estreito, com tubulação.', w: 14, d: 2.4, kind: 'corridor', items: [['ind.pipe_h', 0.5, 0.06, 0]] },
];

export function SmartRoomsDialog() {
  const dialog = useUI((s) => s.dialog);
  const [id, setId] = useState('office');
  const preset = SMART_PRESETS.find((p) => p.id === id)!;
  const [w, setW] = useState<number | null>(null);
  const [d, setD] = useState<number | null>(null);
  const [furn, setFurn] = useState(true);
  if (dialog !== 'smart') return null;
  const close = () => useUI.setState({ dialog: null });
  const W = w ?? preset.w, D = d ?? preset.d;
  const create = () => {
    const ui = useUI.getState();
    const roomId = useScene.getState().commit<string>(`Smart Room: ${preset.name}`, (s) => {
      const fid = ui.floorId || s.floorOrder[0];
      const b = sceneBounds(s, fid);
      const x = b ? b.x1 + 1.5 : 0, y = b ? b.y0 : 0;
      const rid = addRoomRect(s, fid, x, y, W, D, { name: preset.name, kind: preset.kind });
      const m = 0.6, iw = W - 2 * m, ih = D - 2 * m;
      if (furn) for (const [def, fx, fz, rot] of preset.items) addProp(s, def, fid, x + m + fx * iw, y + m + fz * ih, { rot });
      if (preset.extra === 'checkpoint') addMarker(s, 'safe', fid, x + W / 2, y + D * 0.8);
      return rid;
    });
    ui.select([{ kind: 'room', id: roomId }]);
    const r = getScene().rooms[roomId];
    if (r) ui.focusOn(r.polygon[0][0] + W / 2, r.polygon[0][1] + D / 2, r.floorId);
    ui.toast(`${preset.name} criado ao lado do mapa. Ligue com portas ou arcos.`, 'ok');
    close();
  };
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <div className="dialog" style={{ width: 640 }}>
        <header><span>Smart Rooms</span><button className="btn icon sm" onClick={close} aria-label="Fechar"><Icon name="close" /></button></header>
        <div className="body">
          <div className="lib-card-grid">
            {SMART_PRESETS.map((p) => (
              <button key={p.id} className={`tpl ${p.id === id ? 'on' : ''}`} onClick={() => { setId(p.id); setW(null); setD(null); }}>
                <h5>{p.name}</h5><p>{p.note}</p><div className="meta">{p.w} × {p.d} m</div>
              </button>
            ))}
          </div>
          <div className="hr" />
          <NumRow label="Largura" unit="m" value={W} step={0.5} min={2} max={40} onCommit={setW} />
          <NumRow label="Profundidade" unit="m" value={D} step={0.5} min={1.6} max={40} onCommit={setD} />
          <label className="row"><input type="checkbox" checked={furn} onChange={(e) => setFurn(e.target.checked)} /> <span>Incluir mobília</span></label>
        </div>
        <footer><button className="btn" onClick={close}>Cancelar</button><button className="btn primary" onClick={create}>Criar ambiente</button></footer>
      </div>
    </div>
  );
}
