import { useScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { builtAreaM2 } from '../core/scene';
import { fmtM } from '../core/math';

const SNAPS = [0.1, 0.25, 0.5, 1];

export function StatusBar() {
  const cur = useUI((s) => s.cursor);
  const tool = useUI((s) => s.tool);
  const sel = useUI((s) => s.selection.length);
  const floor = useUI((s) => s.floorId);
  const scene = useScene((s) => s.project.scene);
  const settings = useScene((s) => s.project.settings);
  const patch = useScene((s) => s.patchSettings);
  const rooms = Object.keys(scene.rooms).length;
  return (
    <footer className="statusbar">
      <div className="sb-cell"><label>Pavimento</label><b>{scene.floors[floor]?.name ?? '—'}</b></div>
      <div className="sb-cell"><label>X</label><b>{cur ? fmtM(cur.x) : '—'}</b></div>
      <div className="sb-cell"><label>Z</label><b>{cur ? fmtM(cur.z) : '—'}</b></div>
      <div className="sb-cell"><label>Ferramenta</label><b>{tool}</b></div>
      <div className="sb-cell"><label>Seleção</label><b>{sel}</b></div>
      <div className="sb-cell"><label>Salas</label><b>{rooms}</b></div>
      <div className="sb-cell"><label>Área construída</label><b>{builtAreaM2(scene).toFixed(1)} m²</b></div>
      <div className="sb-cell grow" />
      <div className="sb-snap" title="Passo do snap">
        <label style={{ fontFamily: 'var(--f-cond)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-3)', marginRight: 4 }}>Snap</label>
        {SNAPS.map((s) => <button key={s} className={settings.snap === s ? 'on' : ''} onClick={() => patch({ snap: s })}>{String(s).replace('.', ',')}</button>)}
        <button className={settings.magnet ? 'on' : ''} title="Ímã: gruda em paredes e vértices próximos" onClick={() => patch({ magnet: !settings.magnet })}>Ímã</button>
      </div>
    </footer>
  );
}
