import type { EntityKind, EntityRef, Floor, ID, Opening, Room, Scene, Vec2, Wall } from './types';
import { COLLECTIONS } from './types';
import { dist, len, polygonArea, polygonBounds, sub } from './math';

export const values = <T,>(r: Record<ID, T>): T[] => Object.values(r);

export function floorsSorted(s: Scene): Floor[] {
  return s.floorOrder.map((id) => s.floors[id]).filter(Boolean).sort((a, b) => a.elevation - b.elevation);
}
export function firstFloorId(s: Scene): ID { return floorsSorted(s)[0]?.id ?? s.floorOrder[0]; }

export function getEntity(s: Scene, ref: EntityRef): any {
  return (s[COLLECTIONS[ref.kind]] as Record<ID, unknown>)[ref.id];
}
export function hasEntity(s: Scene, ref: EntityRef) { return !!getEntity(s, ref); }

export function entityFloorId(s: Scene, ref: EntityRef): ID | undefined {
  const e = getEntity(s, ref);
  if (!e) return undefined;
  if (ref.kind === 'opening') return s.walls[(e as Opening).wallId]?.floorId;
  return (e as { floorId?: ID }).floorId;
}

export function roomHeight(s: Scene, r: Room): number { return r.height ?? s.floors[r.floorId]?.height ?? 3; }

/** Altura efetiva de uma parede: sua própria, ou a maior entre as salas que a usam, ou a do pavimento. */
export function wallHeight(s: Scene, w: Wall): number {
  if (w.height != null) return w.height;
  let h = 0;
  for (const src of w.sources) { const r = s.rooms[src.roomId]; if (r) h = Math.max(h, roomHeight(s, r)); }
  return h || s.floors[w.floorId]?.height || 3;
}
export const wallLength = (w: Wall) => dist(w.a, w.b);
export function wallDir(w: Wall): Vec2 { const d = sub(w.b, w.a); const l = len(d) || 1; return [d[0] / l, d[1] / l]; }

export function openingsOfWall(s: Scene, wallId: ID): Opening[] {
  return Object.values(s.openings).filter((o) => o.wallId === wallId).sort((a, b) => a.offset - b.offset);
}

export function roomArea(r: Room): number {
  let a = Math.abs(polygonArea(r.polygon));
  for (const h of r.holes) a -= Math.abs(polygonArea(h));
  return a;
}
export function roomsOnFloor(s: Scene, floorId: ID): Room[] { return Object.values(s.rooms).filter((r) => r.floorId === floorId); }

export function sceneBounds(s: Scene, floorId?: ID) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (p: Vec2) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  for (const w of Object.values(s.walls)) if (!floorId || w.floorId === floorId) { take(w.a); take(w.b); }
  for (const r of Object.values(s.rooms)) if (!floorId || r.floorId === floorId) r.polygon.forEach(take);
  for (const p of Object.values(s.props)) if (!floorId || p.floorId === floorId) take([p.position[0], p.position[2]]);
  for (const m of Object.values(s.markers)) if (!floorId || m.floorId === floorId) take([m.position[0], m.position[2]]);
  for (const st of Object.values(s.stairs)) if (!floorId || st.floorId === floorId) take(st.position);
  for (const sh of Object.values(s.shapes)) if (!floorId || sh.floorId === floorId) take([sh.position[0], sh.position[2]]);
  if (s.terrain) { take(s.terrain.origin); take([s.terrain.origin[0] + s.terrain.size[0], s.terrain.origin[1] + s.terrain.size[1]]); }
  if (!isFinite(x0)) return { x0: -5, y0: -5, x1: 5, y1: 5, w: 10, h: 10 };
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function builtAreaM2(s: Scene): number {
  return Object.values(s.rooms).reduce((a, r) => a + roomArea(r), 0);
}

export function selectionBounds(s: Scene, refs: EntityRef[]) {
  const pts: Vec2[] = [];
  for (const ref of refs) {
    const e = getEntity(s, ref);
    if (!e) continue;
    switch (ref.kind) {
      case 'room': pts.push(...(e as Room).polygon); break;
      case 'wall': pts.push((e as Wall).a, (e as Wall).b); break;
      case 'opening': { const w = s.walls[(e as Opening).wallId]; if (w) pts.push(w.a, w.b); break; }
      case 'stair': pts.push(e.position); break;
      case 'shape': case 'prop': case 'marker': case 'light': pts.push([e.position[0], e.position[2]]); break;
      case 'annotation': pts.push(e.position); break;
      default: break;
    }
  }
  return pts.length ? polygonBounds(pts) : null;
}

export const kindOfCollection = (key: keyof Scene): EntityKind | undefined =>
  (Object.entries(COLLECTIONS).find(([, v]) => v === key)?.[0]) as EntityKind | undefined;
