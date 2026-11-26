import { useEffect } from 'react';
import { create } from 'zustand';
import type { EntityRef, Vec2 } from '../core/types';
import { runCommand, playFrom, deleteSelection, duplicateSelection, setStartAt } from '../editor/commands';
import { useUI } from '../editor/ui';
import { useScene, getScene } from '../editor/store';
import { getEntity } from '../core/scene';

interface Ctx { x: number; y: number; ref: EntityRef | null; world: Vec2 | null }
const useCtx = create<{ cur: Ctx | null }>(() => ({ cur: null }));
export const openContextMenu = (x: number, y: number, ref: EntityRef | null, world: Vec2 | null) => useCtx.setState({ cur: { x, y, ref, world } });
const close = () => useCtx.setState({ cur: null });

export function ContextMenu() {
  const c = useCtx((s) => s.cur);
  useEffect(() => {
    if (!c) return;
    const h = () => close();
    window.addEventListener('pointerdown', h); window.addEventListener('blur', h); window.addEventListener('wheel', h);
    return () => { window.removeEventListener('pointerdown', h); window.removeEventListener('blur', h); window.removeEventListener('wheel', h); };
  }, [c]);
  if (!c) return null;
  const ui = useUI.getState();
  const sel = ui.selection;
  const ent = c.ref ? (getEntity(getScene(), c.ref) as Record<string, unknown> | undefined) : undefined;
  const item = (label: string, fn: () => void, opts: { kbd?: string; disabled?: boolean } = {}) => (
    <button className="menu-item" disabled={opts.disabled} onPointerDown={(e) => e.stopPropagation()} onClick={() => { close(); fn(); }}>{label}{opts.kbd && <kbd>{opts.kbd}</kbd>}</button>
  );
  const name = ent && typeof ent.name === 'string' ? ent.name : c.ref?.kind;
  return (
    <div className="ctx" style={{ left: Math.min(c.x, window.innerWidth - 230), top: Math.min(c.y, window.innerHeight - 340) }} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}>
      {c.ref && <div className="menu-label">{name}</div>}
      {sel.length > 0 && item('Duplicar', duplicateSelection, { kbd: 'Ctrl+D' })}
      {sel.length > 0 && item('Copiar', () => runCommand('edit.copy'), { kbd: 'Ctrl+C' })}
      {item('Colar', () => runCommand('edit.paste'), { kbd: 'Ctrl+V' })}
      {sel.length > 0 && item('Focar', () => runCommand('view.focus'), { kbd: 'F' })}
      {sel.length > 0 && item('Isolar / mostrar tudo', () => runCommand('edit.isolate'), { kbd: 'I' })}
      {sel.length > 0 && item('Ocultar', () => runCommand('edit.hide'), { kbd: 'H' })}
      {sel.length > 0 && item('Girar 90°', () => runCommand('edit.rot90'))}
      {c.ref?.kind === 'opening' && item('Inverter lado de abertura', () => useScene.getState().commit('Inverter abertura', (s) => { const o = s.openings[c.ref!.id]; if (o) o.swing = (o.swing * -1) as 1 | -1; }))}
      {c.ref?.kind === 'opening' && item('Trocar dobradiça', () => useScene.getState().commit('Trocar dobradiça', (s) => { const o = s.openings[c.ref!.id]; if (o) o.hinge = o.hinge === 'a' ? 'b' : 'a'; }))}
      {c.world && <div className="menu-sep" />}
      {c.world && item('Testar a partir daqui', () => playFrom(c.world![0], c.world![1]))}
      {c.world && item('Definir início do jogador aqui', () => setStartAt(c.world![0], c.world![1]))}
      {c.world && item('Calcular visibilidade a partir daqui', () => { useUI.setState({ losOrigin: { x: c.world![0], z: c.world![1], floorId: useUI.getState().floorId }, rightTab: 'companion', overlays: { ...useUI.getState().overlays, los: true } }); })}
      {sel.length > 0 && <div className="menu-sep" />}
      {sel.length > 0 && <button className="menu-item" style={{ color: '#d98a76' }} onPointerDown={(e) => e.stopPropagation()} onClick={() => { close(); void deleteSelection(); }}>Excluir<kbd>Del</kbd></button>}
    </div>
  );
}
