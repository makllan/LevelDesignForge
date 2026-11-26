import { useEffect, useRef, useState } from 'react';
import { useScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { allCommands, runCommand } from '../editor/commands';
import { Icon } from './Icon';

interface MenuDef { label: string; items: (string | '-')[] }
const MENUS: MenuDef[] = [
  { label: 'Arquivo', items: ['file.new', 'file.open', 'file.save', 'file.duplicate', '-', 'file.export', 'export.dialog'] },
  { label: 'Editar', items: ['edit.undo', 'edit.redo', '-', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '-', 'edit.all', 'edit.group', 'edit.ungroup', '-', 'edit.rot90', 'edit.hide', 'edit.showall', 'edit.isolate'] },
  { label: 'Vista', items: ['view.plan', 'view.3d', 'view.split', '-', 'view.ceil', 'view.wire', 'view.grey', 'view.sector', 'view.lit', '-', 'view.fit', 'view.focus', '-', 'view.left', 'view.right', 'view.bottom'] },
  { label: 'Pavimentos', items: ['floor.add', 'floor.basement'] },
  { label: 'Ajuda', items: ['help.shortcuts', 'help.onboarding', 'palette'] },
];

function Menu({ def }: { def: MenuDef }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [open]);
  const cmds = allCommands();
  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`btn ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{def.label}</button>
      {open && (
        <div className="menu" role="menu">
          {def.items.map((id, i) => {
            if (id === '-') return <div key={i} className="menu-sep" />;
            const c = cmds.find((x) => x.id === id);
            if (!c) return null;
            const on = !c.enabled || c.enabled();
            return <button key={id} role="menuitem" className="menu-item" disabled={!on} onClick={() => { setOpen(false); runCommand(id); }}>{c.label}{c.shortcut && <kbd>{c.shortcut}</kbd>}</button>;
          })}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const name = useScene((s) => s.project.name);
  const dirty = useScene((s) => s.dirty);
  const canUndo = useScene((s) => s.past.length > 0);
  const canRedo = useScene((s) => s.future.length > 0);
  const patchMeta = useScene((s) => s.patchMeta);
  const view = useUI((s) => s.view);
  const mode = useUI((s) => s.mode);
  return (
    <header className="topbar">
      <div className="brand"><i /> Ordo Forge <small>Level Design</small></div>
      <div className="tb-group">{MENUS.map((m) => <Menu key={m.label} def={m} />)}</div>
      <div className="tb-title">
        <span className={dirty ? 'dot-dirty' : 'dot-saved'} title={dirty ? 'Alterações não salvas' : 'Tudo salvo'} />
        <input aria-label="Nome do projeto" value={name} onChange={(e) => patchMeta({ name: e.target.value })} spellCheck={false} />
      </div>
      <div className="tb-group">
        <button className="btn icon" title="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={() => runCommand('edit.undo')}><Icon name="undo" size={16} /></button>
        <button className="btn icon" title="Refazer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => runCommand('edit.redo')}><Icon name="redo" size={16} /></button>
        <button className="btn icon" title="Salvar (Ctrl+S)" onClick={() => runCommand('file.save')}><Icon name="save" size={16} /></button>
      </div>
      <div className="tb-group">
        <button className={`btn icon ${view === 'plan' ? 'on' : ''}`} title="Só planta" onClick={() => useUI.setState({ view: 'plan' })}><Icon name="plan" size={16} /></button>
        <button className={`btn icon ${view === 'split' ? 'on' : ''}`} title="Planta + 3D" onClick={() => useUI.setState({ view: 'split' })}><Icon name="split" size={16} /></button>
        <button className={`btn icon ${view === '3d' ? 'on' : ''}`} title="Só 3D" onClick={() => useUI.setState({ view: '3d' })}><Icon name="cube" size={16} /></button>
      </div>
      <div className="spacer" />
      <div className="tb-group" style={{ borderRight: 'none', borderLeft: '1px solid var(--line)' }}>
        <button className="btn icon" title="Paleta de comandos (Ctrl+K)" onClick={() => runCommand('palette')}><Icon name="search" size={16} /></button>
        <button className={`btn play`} title="Testar o nível (F5)" onClick={() => runCommand(mode === 'playtest' ? 'play.stop' : 'play.start')}>
          <Icon name={mode === 'playtest' ? 'stop' : 'play'} size={14} />{mode === 'playtest' ? 'Sair' : 'Testar'}
        </button>
      </div>
    </header>
  );
}
