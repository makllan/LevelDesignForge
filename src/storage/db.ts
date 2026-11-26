/** Project Storage — IndexedDB (projetos, autosave) + arquivos .ordoforge.json. */
import { parseProjectJson, type ValidationResult } from '../core/schema';
import type { Project } from '../core/types';

const DB_NAME = 'ordo-forge';
const DB_VERSION = 1;

export interface ProjectRecord { id: string; name: string; updatedAt: string; thumbnail?: string; project: Project }
export interface AutosaveRecord { key: 'current'; project: Project; savedAt: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('autosave')) db.createObjectStore('autosave', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o IndexedDB'));
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); resolve(r.result); };
    t.onerror = () => { db.close(); reject(t.error ?? new Error('Falha na transação')); };
    t.onabort = () => { db.close(); reject(t.error ?? new Error('Transação abortada (armazenamento cheio?)')); };
  }));
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export async function saveProject(p: Project, thumbnail?: string): Promise<void> {
  const rec: ProjectRecord = { id: p.id, name: p.name, updatedAt: p.updatedAt, thumbnail: thumbnail ?? p.thumbnail, project: clone(p) };
  await tx('projects', 'readwrite', (s) => s.put(rec));
}
export async function loadProject(id: string): Promise<ValidationResult> {
  const rec = await tx<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id));
  if (!rec) return { ok: false, errors: ['Projeto não encontrado.'], warnings: [] };
  return parseProjectJson(JSON.stringify(rec.project));
}
export async function listProjects(): Promise<Omit<ProjectRecord, 'project'>[]> {
  const all = await tx<ProjectRecord[]>('projects', 'readonly', (s) => s.getAll());
  return all.map(({ id, name, updatedAt, thumbnail }) => ({ id, name, updatedAt, thumbnail })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function deleteProject(id: string): Promise<void> { await tx('projects', 'readwrite', (s) => s.delete(id)); }

export async function saveAutosave(p: Project): Promise<void> {
  const rec: AutosaveRecord = { key: 'current', project: clone(p), savedAt: Date.now() };
  await tx('autosave', 'readwrite', (s) => s.put(rec));
}
export async function loadAutosave(): Promise<AutosaveRecord | null> {
  const rec = await tx<AutosaveRecord | undefined>('autosave', 'readonly', (s) => s.get('current'));
  return rec ?? null;
}
export async function clearAutosave(): Promise<void> { await tx('autosave', 'readwrite', (s) => s.delete('current')); }

// ---------------------------------------------------------------- arquivos
export const FILE_EXT = '.ordoforge.json';
export const fileNameFor = (name: string) => `${name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'projeto'}${FILE_EXT}`;

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const downloadText = (name: string, text: string, mime = 'application/json') => downloadBlob(name, new Blob([text], { type: `${mime};charset=utf-8` }));

export function exportProjectFile(p: Project) { downloadText(fileNameFor(p.name), JSON.stringify(p, null, 2)); }

export async function importProjectFile(file: File): Promise<ValidationResult> {
  if (file.size > 80 * 1024 * 1024) return { ok: false, errors: ['Arquivo grande demais (>80 MB).'], warnings: [] };
  return parseProjectJson(await file.text());
}

/** Miniatura a partir do primeiro canvas visível da área de trabalho. */
export function captureThumbnail(): string | undefined {
  try {
    const src = document.querySelector<HTMLCanvasElement>('.vp canvas');
    if (!src || !src.width) return undefined;
    const out = document.createElement('canvas'); out.width = 240; out.height = 150;
    const g = out.getContext('2d')!;
    g.fillStyle = '#1c1a17'; g.fillRect(0, 0, 240, 150);
    const k = Math.min(240 / src.width, 150 / src.height);
    g.drawImage(src, (240 - src.width * k) / 2, (150 - src.height * k) / 2, src.width * k, src.height * k);
    return out.toDataURL('image/jpeg', 0.7);
  } catch { return undefined; }
}
