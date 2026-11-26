/**
 * Editor Core — operações sobre salas, paredes e aberturas.
 * Todas as funções MUTAM o `Scene` recebido (use dentro de produce()).
 *
 * Paredes: cada segmento de aresta é uma entidade Wall. Arestas coincidentes de salas
 * vizinhas reutilizam (e dividem, se parcial) a mesma parede — sem geometria duplicada.
 */
import { nid } from '../core/ids';
import { SECTOR_PALETTE } from '../core/defaults';
import { add, clamp, dist, dot, lerp2, mul, norm, polygonArea, polygonBounds, projectOnSegment, sub, rectPolygon, orientedRect, normalOf, pointInPolygon, round } from '../core/math';
import type { ID, Opening, OpeningKind, Room, RoomKind, Scene, Vec2, Wall, WallSource } from '../core/types';
import { wallLength } from '../core/scene';

const TOL = 0.01;
export const MIN_WALL = 0.05;
export const DEFAULT_WALL_THICKNESS = 0.2;

function paramOn(a: Vec2, u: Vec2, p: Vec2) { return dot(sub(p, a), u); }
function perpDist(a: Vec2, u: Vec2, p: Vec2) { const d = sub(p, a); return Math.abs(d[0] * u[1] - d[1] * u[0]); }

/** Divide a parede `w` nos parâmetros ts (ao longo de w.a→w.b). Retorna as peças em ordem (a primeira mantém o id). */
function splitWall(s: Scene, w: Wall, ts: number[]): Wall[] {
  const L = wallLength(w);
  const cuts = [...new Set(ts.map((t) => round(t, 4)))].filter((t) => t > MIN_WALL * 0.5 && t < L - MIN_WALL * 0.5).sort((x, y) => x - y);
  if (!cuts.length) return [w];
  const u = norm(sub(w.b, w.a));
  const bounds = [0, ...cuts, L];
  const pieces: Wall[] = [];
  const ops = Object.values(s.openings).filter((o) => o.wallId === w.id);
  const oldA = w.a, oldB = w.b;
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = add(oldA, mul(u, bounds[i])), b = add(oldA, mul(u, bounds[i + 1]));
    if (i === 0) { w.a = a; w.b = b; pieces.push(w); }
    else {
      const nw: Wall = { ...w, id: nid('wall'), a, b, sources: w.sources.map((x) => ({ ...x })) };
      s.walls[nw.id] = nw; pieces.push(nw);
    }
  }
  for (const o of ops) {
    const center = o.offset;
    let idx = bounds.findIndex((b, i) => i < bounds.length - 1 && center >= b && center <= bounds[i + 1]);
    if (idx < 0) idx = 0;
    o.wallId = pieces[idx].id;
    o.offset = clamp(center - bounds[idx], 0, bounds[idx + 1] - bounds[idx]);
  }
  return pieces;
}

function sameSource(a: WallSource, b: WallSource) { return a.roomId === b.roomId && a.edge === b.edge; }

/**
 * Garante paredes cobrindo a aresta a→b. Reutiliza e divide paredes colineares existentes.
 * `source` null = parede avulsa (desenhada à mão).
 */
export function addWallEdge(s: Scene, floorId: ID, a: Vec2, b: Vec2, source: WallSource | null, thickness = DEFAULT_WALL_THICKNESS, height?: number): ID[] {
  const L = dist(a, b);
  if (L < MIN_WALL) return [];
  const u = norm(sub(b, a));
  // 1) candidatas: paredes colineares com sobreposição real.
  const cands: Wall[] = [];
  for (const w of Object.values(s.walls)) {
    if (w.floorId !== floorId) continue;
    if (perpDist(a, u, w.a) > TOL || perpDist(a, u, w.b) > TOL) continue;
    const t0 = paramOn(a, u, w.a), t1 = paramOn(a, u, w.b);
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(L, Math.max(t0, t1));
    if (hi - lo > TOL) cands.push(w);
  }
  // 2) pontos de quebra: extremos das candidatas dentro da aresta + extremos da aresta nas candidatas.
  const breaks = new Set<number>([0, L]);
  for (const w of cands) for (const p of [w.a, w.b]) { const t = paramOn(a, u, p); if (t > TOL && t < L - TOL) breaks.add(round(t, 4)); }
  // 3) divide candidatas onde a aresta nova tem extremos dentro delas.
  const covering: Wall[] = [];
  for (const w of cands) {
    const wu = norm(sub(w.b, w.a));
    const wl = wallLength(w);
    const cuts: number[] = [];
    for (const t of [0, L]) { const p = add(a, mul(u, t)); const tw = paramOn(w.a, wu, p); if (tw > TOL && tw < wl - TOL && perpDist(w.a, wu, p) < TOL) cuts.push(tw); }
    covering.push(...splitWall(s, w, cuts));
  }
  // 4) intervalos elementares.
  const ts = [...breaks].sort((x, y) => x - y);
  const ids: ID[] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const p = ts[i], q = ts[i + 1];
    if (q - p < TOL) continue;
    const mid = add(a, mul(u, (p + q) / 2));
    const existing = covering.find((w) => {
      const wu = norm(sub(w.b, w.a));
      const tm = paramOn(w.a, wu, mid);
      return tm > -TOL && tm < wallLength(w) + TOL && perpDist(w.a, wu, mid) < TOL;
    });
    if (existing) {
      if (source && !existing.sources.some((x) => sameSource(x, source))) existing.sources.push({ ...source });
      if (!source) existing.standalone = true;
      ids.push(existing.id);
    } else {
      const w: Wall = {
        id: nid('wall'), floorId, a: add(a, mul(u, p)), b: add(a, mul(u, q)), thickness, height,
        sources: source ? [{ ...source }] : [], standalone: source ? undefined : true,
      };
      s.walls[w.id] = w; ids.push(w.id);
    }
  }
  return ids;
}

export function buildRoomWalls(s: Scene, room: Room) {
  const n = room.polygon.length;
  for (let i = 0; i < n; i++) addWallEdge(s, room.floorId, room.polygon[i], room.polygon[(i + 1) % n], { roomId: room.id, edge: i }, room.wallThickness);
}

export interface DetachedOpening { opening: Opening; edge: number; fraction: number; center: Vec2 }

/** Remove a participação de `roomId` nas paredes. Paredes órfãs somem; suas aberturas são devolvidas para re-ancoragem. */
export function removeRoomWalls(s: Scene, roomId: ID): DetachedOpening[] {
  const detached: DetachedOpening[] = [];
  for (const w of Object.values(s.walls)) {
    const mine = w.sources.filter((x) => x.roomId === roomId);
    if (!mine.length) continue;
    w.sources = w.sources.filter((x) => x.roomId !== roomId);
    if (w.sources.length === 0 && !w.standalone) {
      const room = s.rooms[roomId];
      for (const o of Object.values(s.openings)) {
        if (o.wallId !== w.id) continue;
        const u = norm(sub(w.b, w.a));
        const center = add(w.a, mul(u, o.offset));
        let fraction = 0.5;
        const edge = mine[0].edge;
        if (room) {
          const p0 = room.polygon[edge], p1 = room.polygon[(edge + 1) % room.polygon.length];
          fraction = projectOnSegment(center, p0, p1).t;
        }
        detached.push({ opening: { ...o, logic: { ...o.logic, requires: [...o.logic.requires] } }, edge, fraction, center });
        delete s.openings[o.id];
      }
      delete s.walls[w.id];
    }
  }
  return detached;
}

export interface ReattachResult { moved: number; lost: string[] }

function reattach(s: Scene, room: Room, detached: DetachedOpening[]): ReattachResult {
  const res: ReattachResult = { moved: 0, lost: [] };
  const n = room.polygon.length;
  for (const d of detached) {
    if (d.edge >= n) { res.lost.push(d.opening.name); continue; }
    const p0 = room.polygon[d.edge], p1 = room.polygon[(d.edge + 1) % n];
    const target = lerp2(p0, p1, d.fraction);
    let best: { w: Wall; along: number; dist: number } | null = null;
    for (const w of Object.values(s.walls)) {
      if (w.floorId !== room.floorId) continue;
      if (!w.sources.some((x) => x.roomId === room.id && x.edge === d.edge)) continue;
      const pr = projectOnSegment(target, w.a, w.b);
      if (!best || pr.dist < best.dist) best = { w, along: pr.along, dist: pr.dist };
    }
    if (!best) { res.lost.push(d.opening.name); continue; }
    const L = wallLength(best.w);
    const half = d.opening.width / 2;
    const off = L >= d.opening.width + 0.1 ? clamp(best.along, half + 0.05, L - half - 0.05) : L / 2;
    s.openings[d.opening.id] = { ...d.opening, wallId: best.w.id, offset: off };
    res.moved++;
    if (L < d.opening.width + 0.1) res.lost.push(`${d.opening.name} (não cabe mais)`);
  }
  return res;
}

export function setRoomPolygon(s: Scene, roomId: ID, polygon: Vec2[]): ReattachResult {
  const room = s.rooms[roomId];
  if (!room) return { moved: 0, lost: [] };
  const detached = removeRoomWalls(s, roomId);
  room.polygon = polygon.map((p) => [round(p[0], 4), round(p[1], 4)] as Vec2);
  room.holes = room.holes.filter((h) => h.every((p) => pointInPolygon(p, room.polygon)));
  buildRoomWalls(s, room);
  return reattach(s, room, detached);
}

export function setRoomThickness(s: Scene, roomId: ID, t: number) {
  const room = s.rooms[roomId]; if (!room) return;
  room.wallThickness = t;
  for (const w of Object.values(s.walls)) if (w.sources.some((x) => x.roomId === roomId)) w.thickness = t;
}

export interface RoomInput {
  floorId: ID;
  polygon: Vec2[];
  name?: string;
  kind?: RoomKind;
  sectorId?: ID;
  wallThickness?: number;
  height?: number;
  hasFloor?: boolean;
  hasCeiling?: boolean;
  presetId?: string;
}

export function activeSectorFallback(s: Scene): ID | undefined { return Object.keys(s.sectors)[0]; }

export function addRoom(s: Scene, input: RoomInput): ID {
  const count = Object.values(s.rooms).filter((r) => r.kind === (input.kind ?? 'room')).length + 1;
  const room: Room = {
    id: nid('room'),
    name: input.name ?? (input.kind === 'corridor' ? `Corredor ${count}` : `Sala ${count}`),
    floorId: input.floorId,
    sectorId: input.sectorId ?? activeSectorFallback(s),
    kind: input.kind ?? 'room',
    polygon: input.polygon.map((p) => [round(p[0], 4), round(p[1], 4)] as Vec2),
    wallThickness: input.wallThickness ?? DEFAULT_WALL_THICKNESS,
    height: input.height,
    hasFloor: input.hasFloor ?? true,
    hasCeiling: input.hasCeiling ?? true,
    holes: [],
    presetId: input.presetId,
  };
  s.rooms[room.id] = room;
  buildRoomWalls(s, room);
  return room.id;
}

export function addRoomRect(s: Scene, floorId: ID, x: number, y: number, w: number, h: number, extra: Partial<RoomInput> = {}): ID {
  return addRoom(s, { floorId, polygon: rectPolygon(x, y, w, h), ...extra });
}

/** Corredor: retângulo orientado ao longo de a→b com a largura dada. */
export function addCorridor(s: Scene, floorId: ID, a: Vec2, b: Vec2, width = 2, extra: Partial<RoomInput> = {}): ID | null {
  const L = dist(a, b);
  if (L < 0.5) return null;
  const rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return addRoom(s, { floorId, polygon: orientedRect(lerp2(a, b, 0.5), L, width, rot), kind: 'corridor', ...extra });
}

export function removeRoom(s: Scene, roomId: ID) {
  removeRoomWalls(s, roomId);
  delete s.rooms[roomId];
  for (const p of s.pacing) if (p.roomId === roomId) p.roomId = undefined;
}

export function moveRoom(s: Scene, roomId: ID, dx: number, dy: number): ReattachResult {
  const r = s.rooms[roomId]; if (!r) return { moved: 0, lost: [] };
  r.holes = r.holes.map((h) => h.map((p) => [p[0] + dx, p[1] + dy] as Vec2));
  const holes = r.holes;
  const res = setRoomPolygon(s, roomId, r.polygon.map((p) => [p[0] + dx, p[1] + dy] as Vec2));
  s.rooms[roomId].holes = holes;
  return res;
}

export function rotateRoom(s: Scene, roomId: ID, deg: number, around: Vec2) {
  const r = s.rooms[roomId]; if (!r) return;
  const rad = (deg * Math.PI) / 180, c = Math.cos(rad), si = Math.sin(rad);
  const rot = (p: Vec2): Vec2 => [around[0] + (p[0] - around[0]) * c - (p[1] - around[1]) * si, around[1] + (p[0] - around[0]) * si + (p[1] - around[1]) * c];
  const holes = r.holes.map((h) => h.map(rot));
  setRoomPolygon(s, roomId, r.polygon.map(rot));
  s.rooms[roomId].holes = holes;
}

export function addStandaloneWall(s: Scene, floorId: ID, a: Vec2, b: Vec2, thickness = DEFAULT_WALL_THICKNESS, height?: number): ID[] {
  return addWallEdge(s, floorId, a, b, null, thickness, height);
}

export function removeWall(s: Scene, wallId: ID) {
  for (const o of Object.values(s.openings)) if (o.wallId === wallId) delete s.openings[o.id];
  const w = s.walls[wallId];
  if (w) for (const src of w.sources) { /* o polígono da sala permanece; a parede some e a sala fica "aberta" */ void src; }
  delete s.walls[wallId];
}

// ---------------------------------------------------------------- aberturas

export const OPENING_DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  door: { width: 1.0, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.1, sill: 1.0 },
  arch: { width: 1.6, height: 2.4, sill: 0 },
};

export interface OpeningInput { kind: OpeningKind; width?: number; height?: number; sill?: number; name?: string }

/** Cria uma abertura numa parede, no ponto mais próximo de `at`. Retorna null com motivo se não couber. */
export function addOpening(s: Scene, wallId: ID, at: Vec2 | number, input: OpeningInput): { id?: ID; reason?: string } {
  const w = s.walls[wallId];
  if (!w) return { reason: 'Parede inexistente.' };
  const d = OPENING_DEFAULTS[input.kind];
  const width = input.width ?? d.width, height = input.height ?? d.height, sill = input.sill ?? d.sill;
  const L = wallLength(w);
  if (L < width + 0.1) return { reason: `A parede (${L.toFixed(2)} m) é menor que a abertura (${width.toFixed(2)} m).` };
  const along = typeof at === 'number' ? at : projectOnSegment(at, w.a, w.b).along;
  const offset = clamp(along, width / 2 + 0.05, L - width / 2 - 0.05);
  for (const o of Object.values(s.openings)) {
    if (o.wallId !== wallId) continue;
    if (Math.abs(o.offset - offset) < (o.width + width) / 2 + 0.05) return { reason: 'Já existe outra abertura neste ponto da parede.' };
  }
  const n = Object.values(s.openings).filter((o) => o.kind === input.kind).length + 1;
  const label = input.kind === 'door' ? 'Porta' : input.kind === 'window' ? 'Janela' : 'Passagem';
  const o: Opening = {
    id: nid('open'), wallId, kind: input.kind, name: input.name ?? `${label} ${n}`,
    offset, width, height, sill, hinge: 'a', swing: 1,
    logic: { mode: 'free', requires: [], oneWay: 'none' },
  };
  s.openings[o.id] = o;
  return { id: o.id };
}

/** Intervalo [u0,u1] de uma abertura ao longo da parede, já limitado à parede. */
export function openingSpan(w: Wall, o: Opening): [number, number] {
  const L = wallLength(w);
  return [clamp(o.offset - o.width / 2, 0, L), clamp(o.offset + o.width / 2, 0, L)];
}

export function wallNormal(w: Wall): Vec2 { return normalOf(w.a, w.b); }

/** Acha a parede mais próxima de p (planta) no pavimento, dentro do raio. */
export function nearestWall(s: Scene, floorId: ID, p: Vec2, radius: number): { wall: Wall; along: number; dist: number; point: Vec2 } | null {
  let best: { wall: Wall; along: number; dist: number; point: Vec2 } | null = null;
  for (const w of Object.values(s.walls)) {
    if (w.floorId !== floorId) continue;
    const pr = projectOnSegment(p, w.a, w.b);
    if (pr.dist <= Math.max(radius, w.thickness / 2) && (!best || pr.dist < best.dist)) best = { wall: w, along: pr.along, dist: pr.dist, point: pr.point };
  }
  return best;
}

export function newSector(s: Scene, name?: string, color?: string): ID {
  const n = Object.keys(s.sectors).length;
  const id = nid('sec');
  s.sectors[id] = { id, name: name ?? `Setor ${String.fromCharCode(65 + (n % 26))}${n >= 26 ? n : ''}`, color: color ?? SECTOR_PALETTE[n % SECTOR_PALETTE.length] };
  return id;
}

export function roomInnerSize(r: Room): { w: number; h: number } {
  const b = polygonBounds(r.polygon);
  return { w: Math.max(0, b.w - r.wallThickness), h: Math.max(0, b.h - r.wallThickness) };
}

export function roomOrientation(r: Room) { return Math.sign(polygonArea(r.polygon)); }
