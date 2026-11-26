import { DEFAULT_ATMOSPHERE, DEFAULT_CHARACTER, SCHEMA_VERSION, emptyScene } from './defaults';
import type { Project, Scene } from './types';

export interface ValidationResult {
  ok: boolean;
  project?: Project;
  errors: string[];
  warnings: string[];
}

/** Migrações: índice = versão de origem. Cada função devolve o objeto na versão seguinte. */
const MIGRATIONS: Array<(p: any) => any> = [
  // v0 → v1: projetos sem campo `schema` (protótipos) ganham os campos padrão.
  (p) => ({ ...p, schema: 1 }),
];

const COLLECTION_KEYS = [
  'floors', 'chapters', 'sectors', 'rooms', 'walls', 'openings', 'stairs', 'shapes', 'props', 'markers',
  'lights', 'annotations', 'groups', 'paths', 'scatter', 'refImages',
] as const;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(isNum);

export function migrateProject(raw: any): { data: any; from: number } {
  let data = raw;
  const from = isNum(raw?.schema) ? raw.schema : 0;
  for (let v = from; v < SCHEMA_VERSION; v++) data = MIGRATIONS[v](data);
  return { data, from };
}

/** Valida e normaliza um projeto importado. Nunca descarta dados em silêncio: tudo vai para errors/warnings. */
export function validateProject(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['O arquivo não contém um objeto de projeto.'], warnings };
  if (isNum(raw.schema) && raw.schema > SCHEMA_VERSION) {
    return { ok: false, errors: [`Projeto criado por uma versão mais nova (schema ${raw.schema}; esta versão entende até ${SCHEMA_VERSION}).`], warnings };
  }
  const { data, from } = migrateProject(raw);
  if (from < SCHEMA_VERSION) warnings.push(`Projeto migrado do schema ${from} para ${SCHEMA_VERSION}.`);
  if (typeof data.name !== 'string') errors.push('Campo "name" ausente.');
  if (!isObj(data.scene)) { errors.push('Campo "scene" ausente.'); return { ok: false, errors, warnings }; }

  const base = emptyScene();
  const sc = data.scene as Record<string, any>;
  const scene: any = { ...base, ...sc };
  for (const k of COLLECTION_KEYS) {
    if (sc[k] === undefined) { scene[k] = {}; continue; }
    if (!isObj(sc[k])) { errors.push(`scene.${k} deve ser um dicionário id→entidade.`); continue; }
    for (const [id, e] of Object.entries(sc[k])) {
      if (!isObj(e)) { errors.push(`scene.${k}.${id} inválido.`); continue; }
      if (e.id !== id) errors.push(`scene.${k}.${id}: id interno "${e.id}" não confere com a chave.`);
    }
  }
  if (!Array.isArray(scene.floorOrder)) scene.floorOrder = Object.keys(scene.floors);
  if (!Array.isArray(scene.pacing)) scene.pacing = [];
  scene.atmosphere = { ...DEFAULT_ATMOSPHERE, ...(isObj(sc.atmosphere) ? sc.atmosphere : {}) };
  scene.terrain = isObj(sc.terrain) ? sc.terrain : null;
  if (Object.keys(scene.floors).length === 0) errors.push('O projeto não possui nenhum pavimento.');

  // Geometria básica
  for (const w of Object.values<any>(scene.walls)) {
    if (!isVec(w.a, 2) || !isVec(w.b, 2) || !isNum(w.thickness)) errors.push(`Parede ${w.id}: geometria inválida.`);
    if (!scene.floors[w.floorId]) errors.push(`Parede ${w.id}: pavimento "${w.floorId}" não existe.`);
    if (!Array.isArray(w.sources)) w.sources = [];
  }
  for (const r of Object.values<any>(scene.rooms)) {
    if (!Array.isArray(r.polygon) || r.polygon.length < 3 || !r.polygon.every((p: unknown) => isVec(p, 2))) errors.push(`Sala ${r.id}: polígono inválido.`);
    if (!scene.floors[r.floorId]) errors.push(`Sala ${r.id}: pavimento "${r.floorId}" não existe.`);
    if (!Array.isArray(r.holes)) r.holes = [];
  }
  // Referências soltas: reportadas e removidas de forma explícita.
  for (const o of Object.values<any>(scene.openings)) {
    if (!scene.walls[o.wallId]) { warnings.push(`Abertura "${o.name ?? o.id}" apontava para parede inexistente e foi removida.`); delete scene.openings[o.id]; }
    else if (!o.logic) o.logic = { mode: 'free', requires: [], oneWay: 'none' };
  }
  for (const k of ['stairs', 'shapes', 'props', 'markers', 'lights', 'annotations'] as const) {
    for (const e of Object.values<any>(scene[k])) {
      if (!scene.floors[e.floorId]) errors.push(`${k}.${e.id}: pavimento "${e.floorId}" não existe.`);
      if (k === 'props' && !Array.isArray(e.requires)) e.requires = [];
    }
  }
  for (const m of Object.values<any>(scene.markers)) { if (!isVec(m.position, 3)) errors.push(`Marcador ${m.id}: posição inválida.`); }
  for (const p of Object.values<any>(scene.props)) { if (!isVec(p.position, 3)) errors.push(`Prop ${p.id}: posição inválida.`); if (!p.params) p.params = {}; }
  for (const f of scene.floorOrder.slice()) if (!scene.floors[f]) { warnings.push(`Ordem de pavimentos citava "${f}" inexistente.`); scene.floorOrder = scene.floorOrder.filter((x: string) => x !== f); }
  for (const f of Object.keys(scene.floors)) if (!scene.floorOrder.includes(f)) scene.floorOrder.push(f);

  if (errors.length) return { ok: false, errors, warnings };

  const project: Project = {
    schema: SCHEMA_VERSION,
    id: String(data.id ?? 'proj_import'),
    name: data.name,
    description: String(data.description ?? ''),
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    notes: String(data.notes ?? ''),
    thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail : undefined,
    settings: {
      snap: isNum(data.settings?.snap) ? data.settings.snap : 0.5,
      magnet: data.settings?.magnet !== false,
      showGrid: data.settings?.showGrid !== false,
      character: { ...DEFAULT_CHARACTER, ...(isObj(data.settings?.character) ? data.settings.character : {}) },
    },
    scene: scene as Scene,
    variants: Array.isArray(data.variants) ? data.variants : [],
    playtests: Array.isArray(data.playtests) ? data.playtests : [],
    dismissed: Array.isArray(data.dismissed) ? data.dismissed.map(String) : [],
  };
  return { ok: true, project, errors, warnings };
}

export function parseProjectJson(text: string): ValidationResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, errors: [`JSON inválido: ${(e as Error).message}`], warnings: [] }; }
  return validateProject(raw);
}
