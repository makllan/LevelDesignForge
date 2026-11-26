/** Ciclo de vida do projeto: salvar, abrir, autosave e recuperação. */
import { useScene, getProject } from '../editor/store';
import { useUI } from '../editor/ui';
import { emptyProject } from '../core/defaults';
import { captureThumbnail, clearAutosave, deleteProject, exportProjectFile, importProjectFile, listProjects, loadAutosave, loadProject, saveAutosave, saveProject } from './db';
import { confirmDialog } from '../ui/fields';
import type { Project } from '../core/types';
import { firstFloorId } from '../core/scene';

const LAST_KEY = 'forge.lastProject';

export function adoptProject(p: Project, opts: { markClean?: boolean } = {}) {
  useScene.getState().setProject(p, { markClean: opts.markClean ?? true });
  const ui = useUI.getState();
  ui.set({ selection: [], floorId: (Object.values(p.scene.floors).find((f) => f.elevation === 0)?.id ?? firstFloorId(p.scene)), isolate: null, hidden: [], sectorId: Object.keys(p.scene.sectors)[0] ?? '' });
  setTimeout(() => { window.dispatchEvent(new CustomEvent('forge:plan', { detail: 'fit' })); window.dispatchEvent(new CustomEvent('forge:3d', { detail: 'frame' })); }, 60);
}

export async function saveCurrent(opts: { silent?: boolean } = {}): Promise<boolean> {
  const st = useScene.getState();
  try {
    const thumb = captureThumbnail();
    const p = { ...st.project, thumbnail: thumb ?? st.project.thumbnail };
    await saveProject(p, thumb);
    try { localStorage.setItem(LAST_KEY, p.id); } catch { /* ignore */ }
    await clearAutosave().catch(() => {});
    st.patchMeta({ thumbnail: thumb });
    st.markSaved();
    if (!opts.silent) useUI.getState().toast('Projeto salvo neste computador.', 'ok');
    return true;
  } catch (e) {
    useUI.getState().toast(`Não foi possível salvar: ${(e as Error).message}. Use "Exportar arquivo" para não perder o trabalho.`, 'error');
    return false;
  }
}

export async function newProject(name?: string): Promise<boolean> {
  if (useScene.getState().dirty && !(await confirmDialog('Há alterações não salvas.', 'Criar um novo projeto descarta o estado atual (o autosave ainda o guardará até o próximo salvamento).', 'Descartar e criar'))) return false;
  adoptProject(emptyProject(name ?? 'Projeto sem título'), { markClean: false });
  useScene.getState().markSaved();
  return true;
}

export async function openStored(id: string): Promise<boolean> {
  if (useScene.getState().dirty && !(await confirmDialog('Há alterações não salvas.', 'Abrir outro projeto descarta as alterações atuais.', 'Descartar e abrir'))) return false;
  const r = await loadProject(id);
  if (!r.ok || !r.project) { useUI.getState().toast(`Não foi possível abrir: ${r.errors.join('; ')}`, 'error'); return false; }
  adoptProject(r.project);
  if (r.warnings.length) useUI.getState().toast(r.warnings.join(' '), 'warn');
  return true;
}

export async function importFile(file: File): Promise<boolean> {
  if (useScene.getState().dirty && !(await confirmDialog('Há alterações não salvas.', 'Importar um arquivo substitui o projeto aberto.', 'Descartar e importar'))) return false;
  const r = await importProjectFile(file);
  if (!r.ok || !r.project) { useUI.getState().toast(`Arquivo inválido: ${r.errors.slice(0, 3).join(' · ')}`, 'error'); return false; }
  adoptProject(r.project, { markClean: false });
  useUI.getState().toast(r.warnings.length ? `Importado com avisos: ${r.warnings.join(' ')}` : 'Projeto importado.', r.warnings.length ? 'warn' : 'ok');
  return true;
}

export async function duplicateProject() {
  const st = useScene.getState();
  const copy: Project = JSON.parse(JSON.stringify(st.project));
  copy.id = `proj_${Math.random().toString(36).slice(2, 10)}`;
  copy.name = `${copy.name} (cópia)`;
  copy.createdAt = new Date().toISOString(); copy.updatedAt = copy.createdAt;
  await saveProject(copy);
  useUI.getState().toast(`Cópia salva como "${copy.name}". Abra-a em Projetos recentes.`, 'ok');
}

export const storedProjects = listProjects;
export async function removeStored(id: string) { await deleteProject(id); }
export const exportFile = () => exportProjectFile(getProject());

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
export function startAutosave() {
  let lastRev = useScene.getState().revision;
  return useScene.subscribe((s) => {
    if (s.revision === lastRev || !s.dirty) return;
    lastRev = s.revision;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { void saveAutosave(useScene.getState().project).catch(() => { /* quota: aviso na próxima tentativa manual */ }); }, 1500);
  });
}

export interface StartupInfo { recovered: boolean }
export async function startup(): Promise<StartupInfo> {
  try {
    const auto = await loadAutosave();
    if (auto) {
      const when = new Date(auto.savedAt).toLocaleString('pt-BR');
      const yes = await confirmDialog(`Há alterações não salvas de "${auto.project.name}" (autosave de ${when}).`, 'Recuperar o trabalho que estava aberto?', 'Recuperar', false);
      if (yes) {
        const { validateProject } = await import('../core/schema');
        const r = validateProject(auto.project);
        if (r.ok && r.project) { adoptProject(r.project, { markClean: false }); useScene.getState().patchMeta({}); return { recovered: true }; }
        useUI.getState().toast(`O autosave estava corrompido: ${r.errors[0]}`, 'error');
      }
      await clearAutosave().catch(() => {});
    }
    const last = localStorage.getItem(LAST_KEY);
    if (last) { const r = await loadProject(last); if (r.ok && r.project) { adoptProject(r.project); return { recovered: false }; } }
  } catch { /* sem IndexedDB: segue com projeto vazio */ }
  adoptProject(emptyProject('Projeto sem título'));
  return { recovered: false };
}
