import { useUI } from '../editor/ui';
import { getScene } from '../editor/store';

/** Entra no playtest (cena temporária; o projeto nunca é alterado pelo teste). */
export function startPlaytest() {
  const ui = useUI.getState();
  if (ui.mode === 'playtest') return;
  const s = getScene();
  if (!Object.keys(s.rooms).length && !s.terrain) { ui.toast('Crie ao menos uma sala (ou terreno) antes de testar.', 'warn'); return; }
  useUI.setState({ mode: 'playtest' });
}
export function stopPlaytest() {
  useUI.setState({ mode: 'edit' });
}
