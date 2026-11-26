import { nid } from './ids';
import type { Atmosphere, CharacterConfig, Floor, Project, Scene, Sector } from './types';

export const SCHEMA_VERSION = 1;

/** Valores iniciais plausíveis — NÃO são as medidas definitivas do personagem de ORDO. */
export const DEFAULT_CHARACTER: CharacterConfig = {
  height: 1.75,
  width: 0.55,
  radius: 0.28,
  eyeHeight: 1.62,
  walkSpeed: 1.7,
  runSpeed: 3.9,
  stepHeight: 0.35,
  maxSlopeDeg: 38,
  fov: 72,
  cameraDistance: 2.7,
  allowJump: false,
  allowCrouch: false,
};

export const DEFAULT_ATMOSPHERE: Atmosphere = {
  preset: 'greybox',
  fog: 0,
  fogColor: '#2a2722',
  timeOfDay: 14,
  ambient: 0.9,
  ambientColor: '#d9d2c3',
  sunIntensity: 0.8,
  sky: '#26231f',
  flashlight: false,
};

export const SECTOR_PALETTE = ['#8a5a44', '#6f7f56', '#5f7482', '#a38a4a', '#7d5f7a', '#4f7c73', '#9a6a3a', '#6b6258'];

export function emptyScene(): Scene {
  const floor: Floor = { id: nid('floor'), name: 'Térreo', elevation: 0, height: 3, color: '#b9ae96' };
  const sector: Sector = { id: nid('sec'), name: 'Setor A', color: SECTOR_PALETTE[0] };
  return {
    floors: { [floor.id]: floor },
    floorOrder: [floor.id],
    chapters: {},
    sectors: { [sector.id]: sector },
    rooms: {}, walls: {}, openings: {}, stairs: {}, shapes: {}, props: {}, markers: {}, lights: {},
    annotations: {}, groups: {}, paths: {}, scatter: {}, refImages: {},
    pacing: [],
    atmosphere: { ...DEFAULT_ATMOSPHERE },
    terrain: null,
  };
}

export function emptyProject(name = 'Projeto sem título'): Project {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA_VERSION,
    id: nid('proj'),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    tags: [],
    notes: '',
    settings: { snap: 0.5, magnet: true, showGrid: true, character: { ...DEFAULT_CHARACTER } },
    scene: emptyScene(),
    variants: [],
    playtests: [],
    dismissed: [],
  };
}
