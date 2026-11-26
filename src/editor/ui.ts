import { create } from 'zustand';
import type { EntityRef, ID, MarkerKind, OpeningKind, ShapeKind, LightKind } from '../core/types';

export type ToolId =
  | 'select' | 'room' | 'polyroom' | 'wall' | 'corridor' | 'door' | 'window' | 'arch' | 'hole'
  | 'prop' | 'shape' | 'stair' | 'marker' | 'light' | 'note' | 'measure' | 'start' | 'sculpt' | 'path' | 'scatter' | 'trace';

export type ViewMode = 'plan' | '3d' | 'split';
export type Shading = 'grey' | 'wire' | 'sector';
export type FloorView = 'all' | 'upto' | 'only';
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type RightTab = 'props' | 'companion' | 'progress' | 'land' | 'pacing' | 'atmo' | 'replay' | 'variants' | 'project';

export interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'warn' | 'error' }

export interface PlaceState {
  propId?: string;
  shapeKind?: ShapeKind;
  markerKind?: MarkerKind;
  lightKind?: LightKind;
  openingKind?: OpeningKind;
  openingWidth?: number;
  stairKind?: 'stair' | 'ramp';
  /** pincel de terreno */
  brush?: 'raise' | 'lower' | 'smooth' | 'flatten';
  brushRadius: number;
  brushStrength: number;
  scatterDef: string;
  scatterDensity: number;
  scatterSpacing: number;
  scatterScaleVar: number;
  pathKind: 'trail' | 'road' | 'river';
  corridorWidth: number;
}

export interface Overlays {
  navGrid: boolean;
  los: boolean;
  heat: boolean;
  ghost: boolean;
  ghostPath: boolean;
  markers: boolean;
  dims: boolean;
  character: boolean;
  routes: boolean;
  warnings: boolean;
}

export interface UIState {
  mode: 'edit' | 'playtest';
  view: ViewMode;
  tool: ToolId;
  selection: EntityRef[];
  floorId: ID;
  sectorId: ID;
  place: PlaceState;
  shading: Shading;
  hideCeilings: boolean;
  floorView: FloorView;
  ghostFloors: boolean;
  ortho: boolean;
  lit: boolean;
  freeCam: boolean;
  gizmo: GizmoMode;
  isolate: EntityRef[] | null;
  hidden: string[];
  overlays: Overlays;
  panels: { left: boolean; right: boolean; bottom: boolean; leftW: number; rightW: number; bottomH: number };
  rightTab: RightTab;
  dialog: null | 'projects' | 'smart' | 'export' | 'landscape' | 'character' | 'import';
  paletteOpen: boolean;
  helpOpen: boolean;
  onboarding: number;
  toasts: Toast[];
  cursor: { x: number; z: number } | null;
  hint: string;
  favorites: string[];
  recents: string[];
  focusNonce: number;
  focusTarget: { x: number; z: number; floorId?: ID } | null;
  playtestFrom: { x: number; z: number; floorId: ID } | null;
  losOrigin: { x: number; z: number; floorId: ID } | null;
  set(patch: Partial<UIState>): void;
  setTool(t: ToolId, place?: Partial<PlaceState>): void;
  select(refs: EntityRef[], additive?: boolean): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  toggleFavorite(id: string): void;
  pushRecent(id: string): void;
  focusOn(x: number, z: number, floorId?: ID): void;
}

let toastId = 1;
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

export const useUI = create<UIState>((set, get) => ({
  mode: 'edit', view: 'split', tool: 'select', selection: [], floorId: '', sectorId: '',
  place: { brushRadius: 4, brushStrength: 0.25, scatterDef: 'nat.pine', scatterDensity: 12, scatterSpacing: 2.2, scatterScaleVar: 0.3, pathKind: 'trail', corridorWidth: 2 },
  shading: 'grey', hideCeilings: true, floorView: 'all', ghostFloors: true, ortho: false, lit: false, freeCam: false, gizmo: 'translate',
  isolate: null, hidden: [],
  overlays: { navGrid: false, los: false, heat: false, ghost: false, ghostPath: true, markers: true, dims: true, character: true, routes: false, warnings: true },
  panels: { left: true, right: true, bottom: true, leftW: 64, rightW: 330, bottomH: 168 },
  rightTab: 'props', dialog: null, paletteOpen: false, helpOpen: false, onboarding: load('forge.onboarding', 0), toasts: [], cursor: null, hint: '',
  favorites: load<string[]>('forge.favs', []), recents: load<string[]>('forge.recents', []),
  focusNonce: 0, focusTarget: null, playtestFrom: null, losOrigin: null,
  set(patch) { set(patch); },
  setTool(t, place) { set((s) => ({ tool: t, place: { ...s.place, ...place }, hint: '' })); },
  select(refs, additive) {
    set((s) => {
      if (!additive) return { selection: refs };
      const key = (r: EntityRef) => `${r.kind}:${r.id}`;
      const cur = new Map(s.selection.map((r) => [key(r), r]));
      for (const r of refs) { if (cur.has(key(r))) cur.delete(key(r)); else cur.set(key(r), r); }
      return { selection: [...cur.values()] };
    });
  },
  toast(text, kind = 'info') {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3600);
  },
  dismissToast(id) { set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); },
  toggleFavorite(id) { const f = get().favorites; const n = f.includes(id) ? f.filter((x) => x !== id) : [...f, id]; save('forge.favs', n); set({ favorites: n }); },
  pushRecent(id) { const r = [id, ...get().recents.filter((x) => x !== id)].slice(0, 12); save('forge.recents', r); set({ recents: r }); },
  focusOn(x, z, floorId) { set((s) => ({ focusTarget: { x, z, floorId }, focusNonce: s.focusNonce + 1, ...(floorId ? { floorId } : {}) })); },
}));

export const setOnboarding = (n: number) => { save('forge.onboarding', n); useUI.setState({ onboarding: n }); };
