/**
 * Mundo de colisão derivado da cena. Usado pelo Playtest e pela análise espacial.
 * Colisão = caixas orientadas (OBB) em planta + superfícies de apoio (pisos, rampas/escadas, topos, terreno).
 * Formas curvas (cilindro, esfera, cone) usam a caixa envolvente — aproximação documentada.
 */
import { DEG, pointInPolygon, polygonBounds } from '../core/math';
import type { ID, Scene, Terrain, Vec2 } from '../core/types';
import { getDef, partBounds } from '../assets/props';
import { wallBoxesWorld, openingFrame } from './walls';
import { stairHeightAtLocal } from './stairs';
import { terrainHeight } from './terrain';
import { wallHeight } from '../core/scene';

export interface Box {
  id: string;
  owner?: ID;
  kind: 'wall' | 'lintel' | 'sill' | 'prop' | 'shape' | 'door' | 'block';
  cx: number; cz: number; hx: number; hz: number; cos: number; sin: number; y0: number; y1: number;
  /** caixas desativadas (porta aberta, bloqueio removido) são ignoradas */
  active: boolean;
  /** se verdadeiro, o topo pode servir de apoio */
  walkableTop: boolean;
}
export interface Slab { floorId: ID; elev: number; poly: Vec2[]; holes: Vec2[][]; b: ReturnType<typeof polygonBounds> }
export interface Ramp { id: ID; kind: 'stair' | 'ramp'; cx: number; cz: number; cos: number; sin: number; run: number; hw: number; y0: number; rise: number; stairId: ID; shapeLike: boolean; steps: number }

export interface World {
  boxes: Box[];
  slabs: Slab[];
  ramps: Ramp[];
  terrain: Terrain | null;
  doors: Map<ID, Box>;
  blocks: Map<ID, Box>;
  minY: number;
}

export interface BuildOptions { propCollisions?: boolean }

const propBoundsCache = new Map<string, { min: [number, number, number]; max: [number, number, number] }>();
export function propBounds(defId: string) {
  let b = propBoundsCache.get(defId);
  if (b) return b;
  const d = getDef(defId);
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of d?.parts ?? []) { const q = partBounds(p); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], q.min[i]); max[i] = Math.max(max[i], q.max[i]); } }
  if (!isFinite(min[0])) { min.fill(0); max.fill(0.5); }
  b = { min, max };
  propBoundsCache.set(defId, b);
  return b;
}

function mkBox(id: string, kind: Box['kind'], cx: number, cz: number, w: number, d: number, rotDeg: number, y0: number, y1: number, owner?: ID, walkableTop = true): Box {
  return { id, owner, kind, cx, cz, hx: w / 2, hz: d / 2, cos: Math.cos(rotDeg * DEG), sin: Math.sin(rotDeg * DEG), y0, y1, active: true, walkableTop };
}

export function buildWorld(s: Scene, opts: BuildOptions = {}): World {
  const w: World = { boxes: [], slabs: [], ramps: [], terrain: s.terrain, doors: new Map(), blocks: new Map(), minY: 0 };
  let minY = Infinity;
  for (const f of Object.values(s.floors)) minY = Math.min(minY, f.elevation);
  w.minY = isFinite(minY) ? minY : 0;

  for (const r of Object.values(s.rooms)) {
    if (!r.hasFloor || r.hidden) continue;
    const el = s.floors[r.floorId]?.elevation ?? 0;
    w.slabs.push({ floorId: r.floorId, elev: el, poly: r.polygon, holes: r.holes, b: polygonBounds(r.polygon) });
  }
  for (const wall of Object.values(s.walls)) {
    if (wall.hidden) continue;
    for (const b of wallBoxesWorld(s, wall)) {
      w.boxes.push(mkBox(`${wall.id}:${b.kind}`, b.kind === 'solid' ? 'wall' : b.kind, b.center[0], b.center[2], b.size[0], b.size[2], b.rot, b.center[1] - b.size[1] / 2, b.center[1] + b.size[1] / 2, wall.id, false));
    }
  }
  for (const o of Object.values(s.openings)) {
    if (o.kind !== 'door') continue;
    const fr = openingFrame(s, o);
    if (!fr) continue;
    const box = mkBox(`door:${o.id}`, 'door', fr.center[0], fr.center[1], o.width, Math.max(0.12, fr.wall.thickness * 0.6), fr.rot, fr.elev, fr.elev + o.height, o.id, false);
    w.boxes.push(box);
    w.doors.set(o.id, box);
  }
  for (const st of Object.values(s.stairs)) {
    const el = s.floors[st.floorId]?.elevation ?? 0;
    const rad = st.rot * DEG;
    w.ramps.push({ id: st.id, stairId: st.id, kind: st.kind, cx: st.position[0], cz: st.position[1], cos: Math.cos(rad), sin: Math.sin(rad), run: st.run, hw: st.width / 2, y0: el, rise: st.rise, shapeLike: false, steps: st.steps });
  }
  for (const sh of Object.values(s.shapes)) {
    if (!sh.collide || sh.hidden) continue;
    const el = s.floors[sh.floorId]?.elevation ?? 0;
    const y0 = el + sh.position[1];
    const rad = sh.rot * DEG;
    if (sh.kind === 'ramp') {
      // sobe ao longo de +x local; origem no centro → base da rampa começa em -size.x/2
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const sx = sh.size[0];
      w.ramps.push({ id: sh.id, stairId: sh.id, kind: 'ramp', cx: sh.position[0] - (sx / 2) * cos, cz: sh.position[2] - (sx / 2) * sin, cos, sin, run: sx, hw: sh.size[2] / 2, y0, rise: sh.size[1], shapeLike: true, steps: 0 });
    } else {
      const thick = sh.kind === 'plane' ? Math.max(0.05, sh.size[1]) : sh.size[1];
      w.boxes.push(mkBox(sh.id, 'shape', sh.position[0], sh.position[2], sh.size[0], sh.size[2], sh.rot, y0, y0 + thick, sh.id, sh.kind !== 'sphere' && sh.kind !== 'cone'));
    }
  }
  if (opts.propCollisions !== false) {
    for (const p of Object.values(s.props)) {
      if (p.hidden) continue;
      const d = getDef(p.defId);
      if (!d || d.collider === 'none') continue;
      const el = s.floors[p.floorId]?.elevation ?? 0;
      const b = propBounds(p.defId);
      const sc = p.scale;
      const rad = p.rot * DEG, cos = Math.cos(rad), sin = Math.sin(rad);
      const lx = ((b.min[0] + b.max[0]) / 2) * sc, lz = ((b.min[2] + b.max[2]) / 2) * sc;
      const cx = p.position[0] + lx * cos - lz * sin, cz = p.position[2] + lx * sin + lz * cos;
      const y0 = el + p.position[1] + b.min[1] * sc;
      const box = mkBox(p.id, d.gameplay === 'block' || d.gameplay === 'shortcut' ? 'block' : 'prop', cx, cz, (b.max[0] - b.min[0]) * sc, (b.max[2] - b.min[2]) * sc, p.rot, y0, y0 + (b.max[1] - b.min[1]) * sc, p.id, true);
      w.boxes.push(box);
      if (box.kind === 'block') w.blocks.set(p.id, box);
    }
  }
  return w;
}

export function pointInBox(b: Box, x: number, z: number, grow = 0): boolean {
  const dx = x - b.cx, dz = z - b.cz;
  const lx = dx * b.cos + dz * b.sin, lz = -dx * b.sin + dz * b.cos;
  return Math.abs(lx) <= b.hx + grow && Math.abs(lz) <= b.hz + grow;
}

/** Apoio mais alto em (x,z) cuja altura ≤ maxY. -Infinity se não houver. */
export function groundAt(w: World, x: number, z: number, maxY: number): number {
  let best = -Infinity;
  const p: Vec2 = [x, z];
  for (const sl of w.slabs) {
    if (sl.elev > maxY || sl.elev <= best) continue;
    if (x < sl.b.x0 || x > sl.b.x1 || z < sl.b.y0 || z > sl.b.y1) continue;
    if (!pointInPolygon(p, sl.poly)) continue;
    if (sl.holes.some((h) => pointInPolygon(p, h))) continue;
    best = sl.elev;
  }
  for (const r of w.ramps) {
    const dx = x - r.cx, dz = z - r.cz;
    const lx = dx * r.cos + dz * r.sin, lz = -dx * r.sin + dz * r.cos;
    if (lx < 0 || lx > r.run || Math.abs(lz) > r.hw) continue;
    let h: number;
    if (r.kind === 'ramp') h = (r.rise * lx) / r.run;
    else {
      const n = Math.max(1, Math.round(r.steps));
      h = (r.rise / n) * (Math.min(n - 1, Math.floor((lx / r.run) * n)) + 1);
    }
    const y = r.y0 + h;
    if (y <= maxY && y > best) best = y;
  }
  for (const b of w.boxes) {
    if (!b.active || !b.walkableTop || b.y1 > maxY || b.y1 <= best) continue;
    if (pointInBox(b, x, z)) best = b.y1;
  }
  if (w.terrain) {
    const h = terrainHeight(w.terrain, x, z);
    if (h != null && h <= maxY && h > best) best = h;
  }
  return best;
}

/** Empurra um círculo (x,z,r) para fora das caixas que cruzam o intervalo vertical [yLo,yHi]. Retorna nova posição. */
export function pushOut(w: World, x: number, z: number, r: number, yLo: number, yHi: number): Vec2 {
  let px = x, pz = z;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const b of w.boxes) {
      if (!b.active || b.y1 <= yLo || b.y0 >= yHi) continue;
      const dx = px - b.cx, dz = pz - b.cz;
      if (Math.abs(dx) > b.hx + b.hz + r + 0.5 && Math.abs(dz) > b.hx + b.hz + r + 0.5) continue;
      const lx = dx * b.cos + dz * b.sin, lz = -dx * b.sin + dz * b.cos;
      const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
      const ex = lx - qx, ez = lz - qz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      let nx: number, nz: number, pen: number;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; }
      else { // centro dentro da caixa: sai pelo lado mais próximo
        const ox = b.hx - Math.abs(lx), oz = b.hz - Math.abs(lz);
        if (ox < oz) { nx = Math.sign(lx) || 1; nz = 0; pen = ox + r; } else { nx = 0; nz = Math.sign(lz) || 1; pen = oz + r; }
      }
      const wx = nx * b.cos - nz * b.sin, wz = nx * b.sin + nz * b.cos;
      px += wx * pen; pz += wz * pen; moved = true;
    }
    if (!moved) break;
  }
  return [px, pz];
}

/** Raio 3D contra uma OBB vertical. Retorna distância t ou null. */
export function rayBox(b: Box, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number | null {
  const ldx0 = ox - b.cx, ldz0 = oz - b.cz;
  const lox = ldx0 * b.cos + ldz0 * b.sin, loz = -ldx0 * b.sin + ldz0 * b.cos;
  const ldx = dx * b.cos + dz * b.sin, ldz = -dx * b.sin + dz * b.cos;
  let t0 = 0, t1 = maxT;
  const slab = (o: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    return t0 <= t1;
  };
  if (!slab(lox, ldx, -b.hx, b.hx)) return null;
  if (!slab(oy, dy, b.y0, b.y1)) return null;
  if (!slab(loz, ldz, -b.hz, b.hz)) return null;
  return t0;
}

/** Primeiro impacto de raio contra caixas ativas (ignora portas abertas). */
export function raycast(w: World, o: [number, number, number], d: [number, number, number], maxT: number, filter?: (b: Box) => boolean): { t: number; box: Box } | null {
  let best: { t: number; box: Box } | null = null;
  for (const b of w.boxes) {
    if (!b.active) continue;
    if (filter && !filter(b)) continue;
    const t = rayBox(b, o[0], o[1], o[2], d[0], d[1], d[2], best ? best.t : maxT);
    if (t != null && (!best || t < best.t)) best = { t, box: b };
  }
  return best;
}

export { stairHeightAtLocal, wallHeight };
