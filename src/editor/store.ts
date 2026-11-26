import { create } from 'zustand';
import { produce, setAutoFreeze } from 'immer';
import { emptyProject } from '../core/defaults';
import type { Project, ProjectSettings, Scene } from '../core/types';

setAutoFreeze(false);

interface HistoryEntry { scene: Scene; label: string }
const MAX_HISTORY = 300;

export interface SceneStore {
  project: Project;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** cena de partida de uma interação contínua (arrastar) */
  base: Scene | null;
  baseLabel: string;
  dirty: boolean;
  savedAt: number | null;
  revision: number;
  /** Aplica uma mudança atômica com histórico. Retorna o valor devolvido pela receita. */
  commit<T = void>(label: string, recipe: (s: Scene) => T): T;
  /** Pré-visualização (sem histórico) a partir da cena base. */
  preview(recipe: (s: Scene) => void): void;
  endPreview(label: string): void;
  cancelPreview(): void;
  undo(): string | null;
  redo(): string | null;
  setProject(p: Project, opts?: { keepHistory?: boolean; markClean?: boolean }): void;
  patchMeta(patch: Partial<Pick<Project, 'name' | 'description' | 'tags' | 'notes' | 'thumbnail' | 'dismissed'>>): void;
  patchProject(recipe: (p: Project) => void): void;
  patchSettings(patch: Partial<ProjectSettings>): void;
  markSaved(): void;
}

export const useScene = create<SceneStore>((set, get) => ({
  project: emptyProject(),
  past: [], future: [], base: null, baseLabel: '', dirty: false, savedAt: null, revision: 0,

  commit(label, recipe) {
    const st = get();
    if (st.base) get().cancelPreview();
    const cur = get().project.scene;
    let ret!: ReturnType<typeof recipe>;
    const next = produce(cur, (d) => { ret = recipe(d as Scene) as any; });
    if (next === cur) return ret;
    set((s) => ({
      project: { ...s.project, scene: next, updatedAt: new Date().toISOString() },
      past: [...s.past, { scene: cur, label }].slice(-MAX_HISTORY),
      future: [], dirty: true, revision: s.revision + 1,
    }));
    return ret;
  },

  preview(recipe) {
    const st = get();
    const base = st.base ?? st.project.scene;
    const next = produce(base, (d) => { recipe(d as Scene); });
    set((s) => ({ base, project: { ...s.project, scene: next }, revision: s.revision + 1 }));
  },

  endPreview(label) {
    const st = get();
    if (!st.base) return;
    const base = st.base;
    const cur = st.project.scene;
    if (cur === base) { set({ base: null }); return; }
    set((s) => ({ base: null, past: [...s.past, { scene: base, label }].slice(-MAX_HISTORY), future: [], dirty: true, project: { ...s.project, updatedAt: new Date().toISOString() } }));
  },

  cancelPreview() {
    const st = get();
    if (!st.base) return;
    set((s) => ({ project: { ...s.project, scene: st.base! }, base: null, revision: s.revision + 1 }));
  },

  undo() {
    const st = get();
    if (st.base) get().cancelPreview();
    const { past } = get();
    if (!past.length) return null;
    const last = past[past.length - 1];
    set((s) => ({
      project: { ...s.project, scene: last.scene }, past: past.slice(0, -1),
      future: [{ scene: s.project.scene, label: last.label }, ...s.future].slice(0, MAX_HISTORY), dirty: true, revision: s.revision + 1,
    }));
    return last.label;
  },

  redo() {
    const { future } = get();
    if (!future.length) return null;
    const nxt = future[0];
    set((s) => ({
      project: { ...s.project, scene: nxt.scene }, future: future.slice(1),
      past: [...s.past, { scene: s.project.scene, label: nxt.label }].slice(-MAX_HISTORY), dirty: true, revision: s.revision + 1,
    }));
    return nxt.label;
  },

  setProject(p, opts) {
    set((s) => ({
      project: p, base: null, dirty: !opts?.markClean,
      past: opts?.keepHistory ? s.past : [], future: opts?.keepHistory ? s.future : [],
      savedAt: opts?.markClean ? Date.now() : null, revision: s.revision + 1,
    }));
  },

  patchMeta(patch) { set((s) => ({ project: { ...s.project, ...patch, updatedAt: new Date().toISOString() }, dirty: true })); },
  patchProject(recipe) { set((s) => ({ project: { ...produce(s.project, (d) => { recipe(d as Project); }), updatedAt: new Date().toISOString() }, dirty: true, revision: s.revision + 1 })); },
  patchSettings(patch) { set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, ...patch }, updatedAt: new Date().toISOString() }, dirty: true })); },
  markSaved() { set({ dirty: false, savedAt: Date.now() }); },
}));

export const getScene = () => useScene.getState().project.scene;
export const getProject = () => useScene.getState().project;
