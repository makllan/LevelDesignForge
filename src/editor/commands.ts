/** Registro único de comandos: atalhos, menus, paleta e menu de contexto usam a mesma fonte. */
import { useScene, getScene } from './store';
import { useUI, type ToolId, setOnboarding } from './ui';
import { alignEntities, captureClip, deleteEntities, duplicateEntities, groupEntities, pasteClip, rotateEntities, ungroupEntities, expandGroups, addFloor, addBasement, addMarker, type AlignMode, type Clip } from './actions';
import { confirmDialog } from '../ui/fields';
import { firstFloorId, getEntity } from '../core/scene';
import type { EntityRef } from '../core/types';
import { saveCurrent, newProject, exportFile, duplicateProject } from '../storage/session';
import { startPlaytest, stopPlaytest } from '../playtest/control';

let clipboard: Clip | null = null;

export interface Command {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  keys?: string;
  run: () => void | Promise<void>;
  enabled?: () => boolean;
}

const sel = () => useUI.getState().selection;
const hasSel = () => sel().length > 0;
const commit = <T,>(label: string, fn: Parameters<ReturnType<typeof useScene.getState>['commit']>[1]) => useScene.getState().commit(label, fn as never) as T;

export async function deleteSelection() {
  const refs = sel(); if (!refs.length) return;
  const s = getScene();
  const rooms = refs.filter((r) => r.kind === 'room').length;
  const big = refs.length >= 8 || rooms >= 2;
  if (big && !(await confirmDialog(`Excluir ${refs.length} objetos?`, 'Dá para desfazer com Ctrl+Z.', 'Excluir'))) return;
  void s;
  commit('Excluir', (d) => { deleteEntities(d, refs); });
  useUI.getState().select([]);
}
export function duplicateSelection() {
  const refs = sel(); if (!refs.length) return;
  const out = commit<EntityRef[]>('Duplicar', (d) => duplicateEntities(d, refs, 1, 1));
  useUI.getState().select(out);
}
export function copySelection() { if (!hasSel()) return; clipboard = captureClip(getScene(), sel()); useUI.getState().toast(`${sel().length} objeto(s) copiado(s).`); }
export function pasteClipboard() {
  if (!clipboard) { useUI.getState().toast('Nada para colar.', 'warn'); return; }
  const c = clipboard; const ui = useUI.getState();
  const fid = getScene().floors[ui.floorId] ? ui.floorId : undefined;
  const out = commit<EntityRef[]>('Colar', (d) => pasteClip(d, c, 1.5, 1.5, fid));
  ui.select(out);
}
export function selectAll() {
  const s = getScene(), fid = useUI.getState().floorId;
  const refs: EntityRef[] = [];
  for (const [kind, key] of [['room', 'rooms'], ['prop', 'props'], ['shape', 'shapes'], ['stair', 'stairs'], ['marker', 'markers']] as const)
    for (const e of Object.values(s[key] as Record<string, { id: string; floorId: string }>)) if (e.floorId === fid) refs.push({ kind, id: e.id });
  useUI.getState().select(refs);
}
export function focusSelection() {
  window.dispatchEvent(new CustomEvent('forge:3d', { detail: 'frame' }));
  window.dispatchEvent(new CustomEvent('forge:plan', { detail: 'fit-sel' }));
}
export function playFrom(x?: number, z?: number, floorId?: string) {
  const ui = useUI.getState();
  if (x !== undefined && z !== undefined) ui.set({ playtestFrom: { x, z, floorId: floorId ?? ui.floorId } });
  else {
    const s = getScene();
    const first = ui.selection[0];
    const e = first ? (getEntity(s, first) as { position?: number[]; floorId?: string } | undefined) : undefined;
    if (e?.position && e.floorId && e.position.length === 3) ui.set({ playtestFrom: { x: e.position[0], z: e.position[2], floorId: e.floorId } });
    else ui.set({ playtestFrom: null });
  }
  startPlaytest();
}

export function setStartAt(x: number, z: number) {
  const fid = useUI.getState().floorId;
  commit('Definir início', (d: import('../core/types').Scene) => { for (const m of Object.values(d.markers)) if (m.kind === 'start') delete d.markers[m.id]; addMarker(d, 'start', fid, x, z); });
  useUI.getState().toast('Início do jogador definido aqui.', 'ok');
}

const tool = (id: ToolId, label: string, keys?: string, extra?: () => void): Command => ({ id: `tool.${id}`, label, group: 'Ferramenta', keys, shortcut: keys?.toUpperCase(), run: () => { useUI.getState().setTool(id); extra?.(); } });

export const COMMANDS: Command[] = [
  { id: 'file.save', label: 'Salvar projeto', group: 'Arquivo', shortcut: 'Ctrl+S', run: () => { void saveCurrent(); } },
  { id: 'file.new', label: 'Novo projeto vazio', group: 'Arquivo', run: () => { void newProject(); } },
  { id: 'export.dialog', label: 'Exportar…  (planta, relatórios, GLB)', group: 'Arquivo', run: () => useUI.setState({ dialog: 'export' }) },
  { id: 'room.smart', label: 'Smart Rooms: criar ambiente pronto…', group: 'Espaço', run: () => useUI.setState({ dialog: 'smart' }) },
  ...(([['companion','Análise (Design Companion)'],['progress','Progressão'],['land','Paisagem'],['pacing','Ritmo (Pacing Director)'],['atmo','Atmosfera'],['replay','Ghost Replay'],['variants','Reality Lab (variantes)']]) as [import('./ui').RightTab,string][]).map(([t,l]): Command => ({ id: 'panel.'+t, label: 'Abrir painel: '+l, group: 'Painéis', run: () => useUI.setState((s) => ({ rightTab: t, panels: { ...s.panels, right: true } })) })),
  { id: 'file.export', label: 'Exportar arquivo .ordoforge.json', group: 'Arquivo', run: () => exportFile() },
  { id: 'file.duplicate', label: 'Duplicar projeto', group: 'Arquivo', run: () => { void duplicateProject(); } },
  { id: 'file.open', label: 'Projetos e modelos…', group: 'Arquivo', run: () => useUI.setState({ dialog: 'projects' }) },
  { id: 'edit.undo', label: 'Desfazer', group: 'Editar', shortcut: 'Ctrl+Z', run: () => { const l = useScene.getState().undo(); if (l) useUI.getState().toast(`Desfeito: ${l}`); } },
  { id: 'edit.redo', label: 'Refazer', group: 'Editar', shortcut: 'Ctrl+Shift+Z', run: () => { const l = useScene.getState().redo(); if (l) useUI.getState().toast(`Refeito: ${l}`); } },
  { id: 'edit.copy', label: 'Copiar', group: 'Editar', shortcut: 'Ctrl+C', run: copySelection, enabled: hasSel },
  { id: 'edit.paste', label: 'Colar', group: 'Editar', shortcut: 'Ctrl+V', run: pasteClipboard },
  { id: 'edit.duplicate', label: 'Duplicar', group: 'Editar', shortcut: 'Ctrl+D', run: duplicateSelection, enabled: hasSel },
  { id: 'edit.delete', label: 'Excluir', group: 'Editar', shortcut: 'Del', run: () => { void deleteSelection(); }, enabled: hasSel },
  { id: 'edit.all', label: 'Selecionar tudo no pavimento', group: 'Editar', shortcut: 'Ctrl+A', run: selectAll },
  { id: 'edit.group', label: 'Agrupar seleção', group: 'Editar', shortcut: 'Ctrl+G', run: () => { const r = sel(); const g = commit<string | null>('Agrupar', (d) => groupEntities(d, r)); if (!g) useUI.getState().toast('Selecione 2 ou mais salas, formas ou objetos.', 'warn'); }, enabled: hasSel },
  { id: 'edit.ungroup', label: 'Desagrupar', group: 'Editar', shortcut: 'Ctrl+Shift+G', run: () => { const r = sel(); commit('Desagrupar', (d) => ungroupEntities(d, r)); }, enabled: hasSel },
  ...(['left', 'right', 'top', 'bottom', 'centerX', 'centerZ'] as AlignMode[]).map((m): Command => ({ id: `edit.align.${m}`, label: `Alinhar: ${({ left: 'esquerda', right: 'direita', top: 'topo', bottom: 'base', centerX: 'centro horizontal', centerZ: 'centro vertical' })[m]}`, group: 'Editar', run: () => { const r = sel(); commit('Alinhar', (d) => alignEntities(d, r, m)); }, enabled: () => sel().length > 1 })),
  { id: 'edit.rot90', label: 'Girar 90°', group: 'Editar', run: () => { const r = sel(); commit('Girar 90°', (d) => rotateEntities(d, r, 90)); }, enabled: hasSel },
  { id: 'edit.hide', label: 'Ocultar seleção', group: 'Editar', shortcut: 'H', keys: 'h', run: () => { const u = useUI.getState(); u.set({ hidden: [...u.hidden, ...u.selection.map((r) => `${r.kind}:${r.id}`)], selection: [] }); }, enabled: hasSel },
  { id: 'edit.showall', label: 'Mostrar tudo', group: 'Editar', shortcut: 'Alt+H', run: () => useUI.setState({ hidden: [], isolate: null }) },
  { id: 'edit.isolate', label: 'Isolar seleção (liga/desliga)', group: 'Editar', shortcut: 'I', keys: 'i', run: () => { const u = useUI.getState(); useUI.setState({ isolate: u.isolate ? null : u.selection.length ? u.selection : null }); } },
  { id: 'view.focus', label: 'Focar seleção', group: 'Vista', shortcut: 'F', keys: 'f', run: focusSelection },
  { id: 'view.fit', label: 'Enquadrar tudo', group: 'Vista', shortcut: 'Home', run: () => { window.dispatchEvent(new CustomEvent('forge:plan', { detail: 'fit' })); window.dispatchEvent(new CustomEvent('forge:3d', { detail: 'frame-all' })); } },
  { id: 'view.plan', label: 'Mostrar só a planta', group: 'Vista', run: () => useUI.setState({ view: 'plan' }) },
  { id: 'view.3d', label: 'Mostrar só o 3D', group: 'Vista', run: () => useUI.setState({ view: '3d' }) },
  { id: 'view.split', label: 'Planta + 3D', group: 'Vista', run: () => useUI.setState({ view: 'split' }) },
  { id: 'view.ceil', label: 'Alternar teto', group: 'Vista', run: () => useUI.setState((s) => ({ hideCeilings: !s.hideCeilings })) },
  { id: 'view.wire', label: 'Modo wireframe', group: 'Vista', run: () => useUI.setState({ shading: 'wire' }) },
  { id: 'view.grey', label: 'Modo greybox', group: 'Vista', run: () => useUI.setState({ shading: 'grey' }) },
  { id: 'view.sector', label: 'Cores por setor', group: 'Vista', run: () => useUI.setState({ shading: 'sector' }) },
  { id: 'view.lit', label: 'Pré-visualizar iluminação no 3D', group: 'Vista', run: () => useUI.setState((s) => ({ lit: !s.lit })) },
  { id: 'view.left', label: 'Painel esquerdo', group: 'Vista', run: () => useUI.setState((s) => ({ panels: { ...s.panels, left: !s.panels.left } })) },
  { id: 'view.right', label: 'Painel direito', group: 'Vista', run: () => useUI.setState((s) => ({ panels: { ...s.panels, right: !s.panels.right } })) },
  { id: 'view.bottom', label: 'Biblioteca de props', group: 'Vista', run: () => useUI.setState((s) => ({ panels: { ...s.panels, bottom: !s.panels.bottom } })) },
  { id: 'gizmo.move', label: 'Gizmo: mover', group: 'Transformar', shortcut: 'W', keys: 'w', run: () => useUI.setState({ gizmo: 'translate' }) },
  { id: 'gizmo.rotate', label: 'Gizmo: girar', group: 'Transformar', shortcut: 'E', keys: 'e', run: () => useUI.setState({ gizmo: 'rotate' }) },
  { id: 'gizmo.scale', label: 'Gizmo: escalar', group: 'Transformar', shortcut: 'R', keys: 'r', run: () => useUI.setState({ gizmo: 'scale' }) },
  tool('select', 'Selecionar', 'q'),
  tool('room', 'Sala retangular'), tool('polyroom', 'Sala irregular'), tool('wall', 'Parede'), tool('corridor', 'Corredor'),
  tool('door', 'Porta'), tool('window', 'Janela'), tool('arch', 'Passagem (arco)'), tool('hole', 'Buraco no piso'),
  tool('stair', 'Escada'), tool('note', 'Anotação'), tool('measure', 'Medir'), tool('start', 'Ponto inicial do jogador'),
  { id: 'tool.ramp', label: 'Rampa', group: 'Ferramenta', run: () => useUI.getState().setTool('stair', { stairKind: 'ramp' }) },
  { id: 'floor.add', label: 'Novo pavimento acima', group: 'Pavimentos', run: () => { const id = commit<string>('Novo pavimento', (d) => addFloor(d)); useUI.getState().set({ floorId: id }); } },
  { id: 'floor.basement', label: 'Novo subsolo', group: 'Pavimentos', run: () => { const id = commit<string>('Novo subsolo', (d) => addBasement(d)); useUI.getState().set({ floorId: id }); } },
  { id: 'play.start', label: 'Iniciar playtest', group: 'Playtest', shortcut: 'F5', run: () => playFrom() },
  { id: 'play.here', label: 'Playtest a partir da seleção', group: 'Playtest', shortcut: 'Shift+F5', run: () => playFrom(), enabled: hasSel },
  { id: 'play.stop', label: 'Sair do playtest', group: 'Playtest', shortcut: 'Esc', run: () => stopPlaytest(), enabled: () => useUI.getState().mode === 'playtest' },
  { id: 'help.shortcuts', label: 'Atalhos de teclado', group: 'Ajuda', shortcut: '?', run: () => useUI.setState({ helpOpen: true }) },
  { id: 'help.onboarding', label: 'Rever tutorial inicial', group: 'Ajuda', run: () => setOnboarding(1) },
  { id: 'palette', label: 'Paleta de comandos', group: 'Ajuda', shortcut: 'Ctrl+K', run: () => useUI.setState({ paletteOpen: true }) },
];

const extra: Command[] = [];
export function registerCommands(cmds: Command[]) { for (const c of cmds) if (!COMMANDS.some((x) => x.id === c.id) && !extra.some((x) => x.id === c.id)) extra.push(c); }
export const allCommands = () => [...COMMANDS, ...extra];

export function runCommand(id: string) { const c = allCommands().find((x) => x.id === id); if (c && (!c.enabled || c.enabled())) void c.run(); }

/** Atalhos de uma letra (sem modificador) → comando. Respeita campos de texto e menus. */
export function handleKey(e: KeyboardEvent, planKey: (e: KeyboardEvent) => boolean): boolean {
  const el = e.target as HTMLElement | null;
  const typing = !!el && (el.matches('input, textarea, select, [contenteditable="true"]'));
  const mod = e.ctrlKey || e.metaKey;
  const ui = useUI.getState();
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); useUI.setState({ paletteOpen: !ui.paletteOpen }); return true; }
  if (typing && !(mod && ['s'].includes(e.key.toLowerCase()))) { if (e.key === 'Escape') (el as HTMLElement).blur(); return false; }
  if (ui.paletteOpen || ui.helpOpen) return false;
  if (mod) {
    const k = e.key.toLowerCase();
    const map: Record<string, string> = { s: 'file.save', z: e.shiftKey ? 'edit.redo' : 'edit.undo', y: 'edit.redo', c: 'edit.copy', v: 'edit.paste', d: 'edit.duplicate', a: 'edit.all', g: e.shiftKey ? 'edit.ungroup' : 'edit.group' };
    if (map[k] && ui.mode === 'edit') { e.preventDefault(); runCommand(map[k]); return true; }
    return false;
  }
  if (e.key === 'F5') { e.preventDefault(); if (ui.mode === 'playtest') stopPlaytest(); else playFrom(); return true; }
  if (ui.mode === 'playtest') return false;
  if (e.key === 'Escape') { if (planKey(e)) return true; return false; }
  if (e.key === 'Delete' || e.key === 'Backspace' && ui.tool === 'select') { if (hasSel()) { e.preventDefault(); void deleteSelection(); return true; } }
  if (e.key === '?' ) { runCommand('help.shortcuts'); return true; }
  if (e.key === 'Home') { runCommand('view.fit'); return true; }
  if (e.altKey && e.key.toLowerCase() === 'h') { runCommand('edit.showall'); return true; }
  if (planKey(e)) { e.preventDefault(); return true; }
  const k = e.key.toLowerCase();
  if (!e.altKey) {
    const c = allCommands().find((x) => x.keys === k);
    if (c && (!c.enabled || c.enabled())) { e.preventDefault(); void c.run(); return true; }
  }
  return false;
}

export { expandGroups, firstFloorId };
