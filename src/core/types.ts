/**
 * Scene Core — modelo de dados único do ORDO Forge.
 *
 * Unidade: METROS. Sistema de coordenadas (ver ARCHITECTURE.md):
 *  - Mundo (three.js / glTF): X leste, Y cima, Z sul. Destro (mão direita).
 *  - Planta 2D: ponto (x, y) ↔ mundo (x, _, z). "Cima" na tela = norte = -Z.
 *  - Ângulo de planta `rot` (graus): do eixo +x local em direção a +y da planta
 *    (sentido horário na tela). Frente de um prop = +z local.
 *  - Elevação absoluta de um pavimento = Floor.elevation. Alturas locais de
 *    props/formas são relativas a esse pavimento.
 */
export type ID = string;
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface Floor {
  id: ID;
  name: string;
  /** Elevação da face superior do piso (m). Negativa = subsolo. */
  elevation: number;
  /** Pé-direito padrão (m). */
  height: number;
  color: string;
}

export interface Chapter { id: ID; name: string }
export interface Sector { id: ID; name: string; color: string; chapterId?: ID; notes?: string }

export type RoomKind = 'room' | 'corridor';

export interface Room {
  id: ID;
  name: string;
  floorId: ID;
  sectorId?: ID;
  kind: RoomKind;
  /** Polígono sobre o EIXO das paredes (m). */
  polygon: Vec2[];
  wallThickness: number;
  /** Pé-direito próprio; se ausente usa o do pavimento. Valores altos = pé-direito duplo. */
  height?: number;
  hasFloor: boolean;
  hasCeiling: boolean;
  /** Buracos no piso (polígonos totalmente dentro da sala). */
  holes: Vec2[][];
  groupId?: ID;
  presetId?: string;
  hidden?: boolean;
  tags?: string[];
  notes?: string;
}

export interface WallSource { roomId: ID; edge: number }

export interface Wall {
  id: ID;
  floorId: ID;
  a: Vec2;
  b: Vec2;
  thickness: number;
  height?: number;
  /** Salas que usam este segmento (paredes compartilhadas aparecem 1 vez). */
  sources: WallSource[];
  /** Parede desenhada à mão — não some quando a sala some. */
  standalone?: boolean;
  hidden?: boolean;
}

export type OpeningKind = 'door' | 'window' | 'arch';
export type DoorMode = 'free' | 'locked' | 'requires';
export interface DoorLogic {
  mode: DoorMode;
  /** IDs de objetos de gameplay que precisam estar satisfeitos (E lógico). */
  requires: ID[];
  /** 'front'/'back': só abre a partir daquele lado (lado front = normal (-dy,dx) da parede a→b). */
  oneWay: 'none' | 'front' | 'back';
  /** Porta falsa: desenhada mas nunca abre. */
  fake?: boolean;
  startOpen?: boolean;
}

export interface Opening {
  id: ID;
  wallId: ID;
  kind: OpeningKind;
  name: string;
  /** Distância do CENTRO da abertura a partir do ponto `a` da parede (m). */
  offset: number;
  width: number;
  height: number;
  /** Altura do peitoril (m). 0 para portas. */
  sill: number;
  hinge: 'a' | 'b';
  swing: 1 | -1;
  logic: DoorLogic;
}

export interface Stair {
  id: ID;
  name: string;
  floorId: ID;
  kind: 'stair' | 'ramp';
  /** Centro da base da escada (pé) na planta. */
  position: Vec2;
  rot: number;
  width: number;
  /** Comprimento horizontal total (m). */
  run: number;
  /** Altura vencida (m). */
  rise: number;
  steps: number;
  color: string;
  railings: boolean;
}

export type ShapeKind = 'cube' | 'cylinder' | 'sphere' | 'ramp' | 'plane' | 'cone' | 'prism' | 'custom';
export interface Shape {
  id: ID;
  name: string;
  floorId: ID;
  kind: ShapeKind;
  /** Centro em planta + base acima do piso do pavimento (y). */
  position: Vec3;
  rot: number;
  /** [x local, altura, z local]. Rampa sobe ao longo de +x. */
  size: Vec3;
  color: string;
  collide: boolean;
  /** Prisma: nº de lados. */
  sides?: number;
  /** Volume personalizado: polígono (local, centrado) extrudado por size[1]. */
  polygon?: Vec2[];
  hidden?: boolean;
  groupId?: ID;
}

export type ParamValue = number | string | boolean;
export interface PropInst {
  id: ID;
  defId: string;
  name: string;
  floorId: ID;
  /** [x, y (acima do piso), z(planta)] */
  position: Vec3;
  rot: number;
  scale: number;
  params: Record<string, ParamValue>;
  /** IDs de gameplay necessários para interagir (gerador, bloqueio, interruptor...). */
  requires: ID[];
  hidden?: boolean;
  groupId?: ID;
  sectorId?: ID;
  /** Veio de uma Smart Room / pincel. */
  origin?: string;
}

export type MarkerKind =
  | 'start' | 'main' | 'side' | 'landmark' | 'poi' | 'combat' | 'enemy' | 'ambush' | 'resource' | 'puzzle'
  | 'safe' | 'reveal' | 'event' | 'vantage' | 'pinch' | 'shortcut' | 'backtrack' | 'oneway' | 'sightline'
  | 'barrier' | 'recovery' | 'atmosphere' | 'audio';

export interface Marker {
  id: ID;
  kind: MarkerKind;
  name: string;
  description: string;
  floorId: ID;
  position: Vec3;
  radius: number;
  sectorId?: ID;
  /** Direção (graus) para marcadores direcionais (linha de visão, sentido único). */
  rot: number;
  props: Record<string, ParamValue>;
}

export type LightKind = 'point' | 'spot' | 'directional' | 'ambient';
export interface Light {
  id: ID;
  name: string;
  kind: LightKind;
  floorId: ID;
  position: Vec3;
  rot: number;
  color: string;
  intensity: number;
  range: number;
  angle: number;
  flicker: boolean;
  emergency: boolean;
}

export interface Annotation { id: ID; floorId: ID; position: Vec2; text: string; color: string }
export interface Group { id: ID; name: string }

export interface Terrain {
  /** Origem (canto noroeste) e tamanho em metros. */
  origin: Vec2;
  size: Vec2;
  /** Resolução = nº de células por lado; amostras = (res+1)². */
  res: number;
  /** Alturas absolutas (m), linha a linha (z), res+1 amostras por linha. */
  heights: number[];
  seed: number;
  color: string;
}

export interface PathCurve {
  id: ID;
  name: string;
  kind: 'trail' | 'road' | 'river';
  width: number;
  points: Vec2[];
  carve: number;
  floorId: ID;
}

/** Instâncias distribuídas por pincel (renderizadas por instanciamento). */
export interface ScatterGroup {
  id: ID;
  name: string;
  defId: string;
  floorId: ID;
  /** [x, z, rot, scale] */
  items: [number, number, number, number][];
}

export interface RefImage {
  id: ID;
  name: string;
  floorId: ID;
  /** data URL */
  src: string;
  position: Vec2;
  /** Largura em metros no mundo. */
  width: number;
  rot: number;
  opacity: number;
  locked: boolean;
  aspect: number;
}

export type Emotion = 'safety' | 'curiosity' | 'mystery' | 'anticipation' | 'disorientation' | 'fear' | 'combat' | 'discovery' | 'relief';
export interface PacingBeat {
  id: ID;
  /** Sala/setor/ponto de referência para localizar no mapa. */
  roomId?: ID;
  sectorId?: ID;
  name: string;
  tension: number;
  minutes: number;
  gameplay: string;
  narrative: string;
  emotion: Emotion;
  encounter: string;
  lighting: string;
  audio: string;
}

export interface Atmosphere {
  preset: string;
  fog: number;
  fogColor: string;
  timeOfDay: number;
  ambient: number;
  ambientColor: string;
  sunIntensity: number;
  sky: string;
  flashlight: boolean;
}

export interface Scene {
  floors: Record<ID, Floor>;
  floorOrder: ID[];
  chapters: Record<ID, Chapter>;
  sectors: Record<ID, Sector>;
  rooms: Record<ID, Room>;
  walls: Record<ID, Wall>;
  openings: Record<ID, Opening>;
  stairs: Record<ID, Stair>;
  shapes: Record<ID, Shape>;
  props: Record<ID, PropInst>;
  markers: Record<ID, Marker>;
  lights: Record<ID, Light>;
  annotations: Record<ID, Annotation>;
  groups: Record<ID, Group>;
  paths: Record<ID, PathCurve>;
  scatter: Record<ID, ScatterGroup>;
  refImages: Record<ID, RefImage>;
  pacing: PacingBeat[];
  atmosphere: Atmosphere;
  terrain: Terrain | null;
}

export interface CharacterConfig {
  height: number;
  width: number;
  radius: number;
  eyeHeight: number;
  walkSpeed: number;
  runSpeed: number;
  stepHeight: number;
  maxSlopeDeg: number;
  fov: number;
  cameraDistance: number;
  allowJump: boolean;
  allowCrouch: boolean;
}

export interface ProjectSettings {
  snap: number;
  magnet: boolean;
  showGrid: boolean;
  character: CharacterConfig;
}

export interface Variant {
  id: ID;
  name: string;
  description: string;
  hypothesis: string;
  notes: string;
  createdAt: string;
  scene: Scene;
  metrics: VariantMetrics;
  playtestIds: ID[];
}

export interface VariantMetrics {
  builtAreaM2: number;
  rooms: number;
  doors: number;
  connections: number;
  objectivesVisible?: number;
  objectivesTotal?: number;
}

export interface PlaytestSample { t: number; x: number; y: number; z: number; yaw: number; floorId?: ID }
export interface PlaytestEvent { t: number; type: string; ref?: ID; label: string }
export interface PlaytestRecord {
  id: ID;
  startedAt: string;
  variantId?: ID;
  durationSec: number;
  distance: number;
  samples: PlaytestSample[];
  events: PlaytestEvent[];
  roomsVisited: ID[];
  completed: boolean;
}

export interface Project {
  schema: number;
  id: ID;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  notes: string;
  thumbnail?: string;
  settings: ProjectSettings;
  scene: Scene;
  variants: Variant[];
  playtests: PlaytestRecord[];
  dismissed: string[];
}

export type EntityKind =
  | 'room' | 'wall' | 'opening' | 'stair' | 'shape' | 'prop' | 'marker' | 'light' | 'annotation'
  | 'path' | 'scatter' | 'refImage';

export interface EntityRef { kind: EntityKind; id: ID }

export const COLLECTIONS: Record<EntityKind, keyof Scene> = {
  room: 'rooms', wall: 'walls', opening: 'openings', stair: 'stairs', shape: 'shapes', prop: 'props',
  marker: 'markers', light: 'lights', annotation: 'annotations', path: 'paths', scatter: 'scatter', refImage: 'refImages',
};
