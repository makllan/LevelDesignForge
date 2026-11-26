/**
 * Editor Core — comandos de edição sobre a cena. Funções puras de mutação (rodam dentro de produce()).
 */
import { nid } from '../core/ids';
import { MARKER_INFO } from '../core/markerKinds';
import { DEG, add, dist, mul, norm, polygonBounds, polygonCentroid, projectOnSegment, rotate, round, sub } from '../core/math';
import type { EntityKind, EntityRef, Floor, ID, Light, LightKind, Marker, MarkerKind, PropInst, Scene, Shape, ShapeKind, Stair, Vec2, Vec3, Opening, Room, Wall } from '../core/types';
import { COLLECTIONS } from '../core/types';
import { getEntity, selectionBounds, floorsSorted } from '../core/scene';
import { getDef } from '../assets/props';
import { addRoom, moveRoom, removeRoom, removeWall, rotateRoom, setRoomPolygon, DetachedOpening, buildRoomWalls } from './rooms';

// ------------------------------------------------------------------ criação

export function addProp(s: Scene, defId: string, floorId: ID, x: number, z: number, opts: Partial<PropInst> = {}): ID {
  const d = getDef(defId);
  const params: PropInst['params'] = {};
  for (const p of d?.params ?? []) params[p.key] = p.def;
  const n = Object.values(s.props).filter((p) => p.defId === defId).length + 1;
  const p: PropInst = {
    id: nid('prop'), defId, name: `${d?.name ?? defId} ${n}`, floorId, position: [x, d?.y0 ?? 0, z], rot: 0, scale: 1, params, requires: [], ...opts,
  };
  if (opts.position) p.position = opts.position;
  s.props[p.id] = p;
  return p.id;
}

export function addShape(s: Scene, kind: ShapeKind, floorId: ID, x: number, z: number, opts: Partial<Shape> = {}): ID {
  const sizes: Record<ShapeKind, Vec3> = { cube: [1, 1, 1], cylinder: [1, 1, 1], sphere: [1, 1, 1], ramp: [3, 1, 1.2], plane: [2, 0.05, 2], cone: [1, 1.2, 1], prism: [1, 1, 1], custom: [2, 1, 2] };
  const names: Record<ShapeKind, string> = { cube: 'Cubo', cylinder: 'Cilindro', sphere: 'Esfera', ramp: 'Rampa', plane: 'Plano', cone: 'Cone', prism: 'Prisma', custom: 'Volume' };
  const n = Object.values(s.shapes).filter((q) => q.kind === kind).length + 1;
  const sh: Shape = {
    id: nid('shape'), name: `${names[kind]} ${n}`, floorId, kind, position: [x, 0, z], rot: 0, size: [...sizes[kind]] as Vec3,
    color: '#a39a86', collide: true, sides: kind === 'prism' ? 6 : undefined,
    polygon: kind === 'custom' ? [[-1, -1], [1, -1], [1.2, 0.3], [0, 1.2], [-1.2, 0.3]] : undefined, ...opts,
  };
  s.shapes[sh.id] = sh;
  return sh.id;
}

export function addStair(s: Scene, floorId: ID, x: number, z: number, rot: number, opts: Partial<Stair> = {}): ID {
  const fl = s.floors[floorId];
  const n = Object.values(s.stairs).length + 1;
  const st: Stair = {
    id: nid('stair'), name: `${opts.kind === 'ramp' ? 'Rampa' : 'Escada'} ${n}`, floorId, kind: 'stair', position: [x, z], rot,
    width: 1.2, run: 3.6, rise: fl?.height ?? 3, steps: 16, color: '#9a8f78', railings: true, ...opts,
  };
  if (opts.kind === 'ramp') { st.steps = 0; st.run = opts.run ?? st.rise * 5; }
  s.stairs[st.id] = st;
  return st.id;
}

export function addMarker(s: Scene, kind: MarkerKind, floorId: ID, x: number, z: number, opts: Partial<Marker> = {}): ID {
  const info = MARKER_INFO[kind];
  if (kind === 'start') for (const m of Object.values(s.markers)) if (m.kind === 'start') delete s.markers[m.id];
  const n = Object.values(s.markers).filter((m) => m.kind === kind).length + 1;
  const m: Marker = { id: nid('mark'), kind, name: `${info.label} ${n}`, description: '', floorId, position: [x, 0, z], radius: info.radius, rot: 0, props: {}, ...opts };
  s.markers[m.id] = m;
  return m.id;
}

export function addLight(s: Scene, kind: LightKind, floorId: ID, x: number, z: number, opts: Partial<Light> = {}): ID {
  const names: Record<LightKind, string> = { point: 'Luz pontual', spot: 'Holofote', directional: 'Luz direcional', ambient: 'Luz ambiente' };
  const n = Object.values(s.lights).filter((l) => l.kind === kind).length + 1;
  const l: Light = {
    id: nid('light'), name: `${names[kind]} ${n}`, kind, floorId, position: [x, kind === 'directional' ? 8 : 2.4, z], rot: 0,
    color: kind === 'spot' ? '#e8dcbc' : '#e9cf9a', intensity: kind === 'ambient' ? 0.4 : kind === 'directional' ? 1 : 6, range: 8, angle: 40, flicker: false, emergency: false, ...opts,
  };
  s.lights[l.id] = l;
  return l.id;
}

export function addFloor(s: Scene, name?: string, elevation?: number, height = 3): ID {
  const sorted = floorsSorted(s);
  const top = sorted[sorted.length - 1];
  const f: Floor = {
    id: nid('floor'), name: name ?? `Pavimento ${sorted.length + 1}`, elevation: elevation ?? (top ? round(top.elevation + top.height, 3) : 0),
    height, color: '#b9ae96',
  };
  s.floors[f.id] = f; s.floorOrder.push(f.id);
  return f.id;
}

export function addBasement(s: Scene, name?: string, height = 3): ID {
  const sorted = floorsSorted(s);
  const bot = sorted[0];
  const f: Floor = { id: nid('floor'), name: name ?? `Subsolo ${sorted.filter((x) => x.elevation < 0).length + 1}`, elevation: round((bot?.elevation ?? 0) - height, 3), height, color: '#8d867a' };
  s.floors[f.id] = f; s.floorOrder.unshift(f.id);
  return f.id;
}

export function removeFloor(s: Scene, floorId: ID) {
  if (s.floorOrder.length <= 1) return false;
  for (const k of ['rooms', 'walls', 'stairs', 'shapes', 'props', 'markers', 'lights', 'annotations', 'paths', 'scatter', 'refImages'] as const) {
    const rec = s[k] as Record<ID, { id: ID; floorId: ID }>;
    for (const e of Object.values(rec)) if (e.floorId === floorId) delete rec[e.id];
  }
  for (const o of Object.values(s.openings)) if (!s.walls[o.wallId]) delete s.openings[o.id];
  delete s.floors[floorId];
  s.floorOrder = s.floorOrder.filter((f) => f !== floorId);
  return true;
}

// ------------------------------------------------------------------ remoção

export function deleteEntities(s: Scene, refs: EntityRef[]) {
  const ids = new Set<string>();
  for (const r of refs) ids.add(`${r.kind}:${r.id}`);
  // salas primeiro (removem paredes/aberturas associadas)
  for (const r of refs) if (r.kind === 'room' && s.rooms[r.id]) removeRoom(s, r.id);
  for (const r of refs) {
    if (r.kind === 'room') continue;
    if (r.kind === 'wall') removeWall(s, r.id);
    else if (r.kind === 'opening') delete s.openings[r.id];
    else delete (s[COLLECTIONS[r.kind]] as Record<ID, unknown>)[r.id];
  }
  cleanupRefs(s);
}

/** Remove referências de lógica a entidades que não existem mais. */
export function cleanupRefs(s: Scene) {
  const alive = (id: ID) => !!s.props[id];
  for (const o of Object.values(s.openings)) if (o.logic.requires.some((r) => !alive(r))) o.logic.requires = o.logic.requires.filter(alive);
  for (const p of Object.values(s.props)) if (p.requires.some((r) => !alive(r))) p.requires = p.requires.filter(alive);
}

// ------------------------------------------------------------------ transformação

export const MOVABLE: EntityKind[] = ['room', 'wall', 'stair', 'shape', 'prop', 'marker', 'light', 'annotation', 'refImage'];

export function translateEntities(s: Scene, refs: EntityRef[], dx: number, dz: number, dy = 0) {
  for (const r of refs) {
    const e = getEntity(s, r) as any;
    if (!e) continue;
    switch (r.kind) {
      case 'room': moveRoom(s, r.id, dx, dz); break;
      case 'wall': { const w = e as Wall; if (w.standalone) { w.a = [w.a[0] + dx, w.a[1] + dz]; w.b = [w.b[0] + dx, w.b[1] + dz]; } break; }
      case 'stair': e.position = [e.position[0] + dx, e.position[1] + dz]; break;
      case 'annotation': case 'refImage': e.position = [e.position[0] + dx, e.position[1] + dz]; break;
      case 'shape': case 'prop': case 'marker': case 'light': e.position = [e.position[0] + dx, e.position[1] + dy, e.position[2] + dz]; break;
      default: break;
    }
  }
}

export function setPlanPosition(s: Scene, ref: EntityRef, x: number, z: number) {
  const e = getEntity(s, ref) as any;
  if (!e) return;
  if (ref.kind === 'stair' || ref.kind === 'annotation' || ref.kind === 'refImage') e.position = [x, z];
  else if (['shape', 'prop', 'marker', 'light'].includes(ref.kind)) e.position = [x, e.position[1], z];
}

export function rotateEntities(s: Scene, refs: EntityRef[], deg: number, pivot?: Vec2) {
  const b = selectionBounds(s, refs);
  const c: Vec2 = pivot ?? (b ? [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] : [0, 0]);
  const single = refs.length === 1;
  for (const r of refs) {
    const e = getEntity(s, r) as any;
    if (!e) continue;
    if (r.kind === 'room') { rotateRoom(s, r.id, deg, single ? polygonCentroid((e as Room).polygon) : c); continue; }
    if (r.kind === 'stair') { if (!single) e.position = rotate(e.position, deg, c); e.rot = round(e.rot + deg, 3); continue; }
    if (r.kind === 'annotation') { e.position = rotate(e.position, deg, c); continue; }
    if (['shape', 'prop', 'marker', 'light'].includes(r.kind)) {
      if (!single) { const p = rotate([e.position[0], e.position[2]], deg, c); e.position = [p[0], e.position[1], p[1]]; }
      e.rot = round((((e.rot + deg) % 360) + 360) % 360, 3);
    }
  }
}

export function scaleEntities(s: Scene, refs: EntityRef[], k: number) {
  for (const r of refs) {
    const e = getEntity(s, r) as any;
    if (!e) continue;
    if (r.kind === 'prop') e.scale = Math.max(0.05, round(e.scale * k, 4));
    else if (r.kind === 'shape') e.size = e.size.map((v: number) => Math.max(0.02, round(v * k, 4)));
    else if (r.kind === 'stair') { e.width = Math.max(0.3, round(e.width * k, 3)); }
  }
}

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerZ';
export function alignEntities(s: Scene, refs: EntityRef[], mode: AlignMode) {
  const items = refs.map((r) => ({ r, b: selectionBounds(s, [r]) })).filter((x) => x.b);
  if (items.length < 2) return;
  const bx0 = Math.min(...items.map((i) => i.b!.x0)), bx1 = Math.max(...items.map((i) => i.b!.x1));
  const by0 = Math.min(...items.map((i) => i.b!.y0)), by1 = Math.max(...items.map((i) => i.b!.y1));
  for (const { r, b } of items) {
    let dx = 0, dz = 0;
    if (mode === 'left') dx = bx0 - b!.x0; else if (mode === 'right') dx = bx1 - b!.x1;
    else if (mode === 'top') dz = by0 - b!.y0; else if (mode === 'bottom') dz = by1 - b!.y1;
    else if (mode === 'centerX') dx = (bx0 + bx1) / 2 - (b!.x0 + b!.x1) / 2;
    else dz = (by0 + by1) / 2 - (b!.y0 + b!.y1) / 2;
    translateEntities(s, [r], dx, dz);
  }
}

export function groupEntities(s: Scene, refs: EntityRef[], name?: string): ID | null {
  const ok = refs.filter((r) => ['room', 'shape', 'prop'].includes(r.kind));
  if (ok.length < 2) return null;
  const id = nid('grp');
  s.groups[id] = { id, name: name ?? `Grupo ${Object.keys(s.groups).length + 1}` };
  for (const r of ok) (getEntity(s, r) as { groupId?: ID }).groupId = id;
  return id;
}
export function ungroupEntities(s: Scene, refs: EntityRef[]) {
  const gids = new Set<ID>();
  for (const r of refs) { const e = getEntity(s, r) as { groupId?: ID } | undefined; if (e?.groupId) { gids.add(e.groupId); } }
  for (const k of ['rooms', 'shapes', 'props'] as const) for (const e of Object.values(s[k] as Record<ID, { groupId?: ID }>)) if (e.groupId && gids.has(e.groupId)) e.groupId = undefined;
  for (const g of gids) delete s.groups[g];
}
export function expandGroups(s: Scene, refs: EntityRef[]): EntityRef[] {
  const gids = new Set<ID>();
  for (const r of refs) { const e = getEntity(s, r) as { groupId?: ID } | undefined; if (e?.groupId) gids.add(e.groupId); }
  if (!gids.size) return refs;
  const out = [...refs];
  const has = new Set(refs.map((r) => `${r.kind}:${r.id}`));
  for (const [kind, key] of [['room', 'rooms'], ['shape', 'shapes'], ['prop', 'props']] as const) {
    for (const e of Object.values(s[key] as Record<ID, { id: ID; groupId?: ID }>)) if (e.groupId && gids.has(e.groupId) && !has.has(`${kind}:${e.id}`)) out.push({ kind, id: e.id });
  }
  return out;
}

// ------------------------------------------------------------------ copiar / colar / duplicar

export interface Clip {
  rooms: { room: Room; openings: { opening: Opening; edge: number; fraction: number }[] }[];
  walls: Wall[];
  entities: { kind: EntityKind; data: any }[];
}

export function captureClip(s: Scene, refs: EntityRef[]): Clip {
  const clip: Clip = { rooms: [], walls: [], entities: [] };
  for (const r of refs) {
    const e = getEntity(s, r);
    if (!e) continue;
    if (r.kind === 'room') {
      const room = JSON.parse(JSON.stringify(e)) as Room;
      const ops: Clip['rooms'][number]['openings'] = [];
      for (const w of Object.values(s.walls)) {
        const src = w.sources.find((x) => x.roomId === room.id);
        if (!src || w.sources.length > 1) continue;
        for (const o of Object.values(s.openings)) {
          if (o.wallId !== w.id) continue;
          const center = add(w.a, mul(norm(sub(w.b, w.a)), o.offset));
          const p0 = room.polygon[src.edge], p1 = room.polygon[(src.edge + 1) % room.polygon.length];
          ops.push({ opening: JSON.parse(JSON.stringify(o)), edge: src.edge, fraction: projectOnSegment(center, p0, p1).t });
        }
      }
      clip.rooms.push({ room, openings: ops });
    } else if (r.kind === 'wall') { if ((e as Wall).standalone) clip.walls.push(JSON.parse(JSON.stringify(e))); }
    else if (r.kind !== 'opening') clip.entities.push({ kind: r.kind, data: JSON.parse(JSON.stringify(e)) });
  }
  return clip;
}

export function pasteClip(s: Scene, clip: Clip, dx: number, dz: number, floorId?: ID): EntityRef[] {
  const out: EntityRef[] = [];
  const idMap = new Map<ID, ID>();
  for (const e of clip.entities) if (['prop'].includes(e.kind)) idMap.set(e.data.id, nid('prop'));
  for (const { room, openings } of clip.rooms) {
    const fid = floorId ?? room.floorId;
    const polygon = room.polygon.map((p) => [p[0] + dx, p[1] + dz] as Vec2);
    const id = addRoom(s, { floorId: fid, polygon, name: room.name + ' (cópia)', kind: room.kind, sectorId: room.sectorId, wallThickness: room.wallThickness, height: room.height, hasFloor: room.hasFloor, hasCeiling: room.hasCeiling });
    s.rooms[id].holes = room.holes.map((h) => h.map((p) => [p[0] + dx, p[1] + dz] as Vec2));
    for (const op of openings) {
      const nr = s.rooms[id];
      const p0 = nr.polygon[op.edge], p1 = nr.polygon[(op.edge + 1) % nr.polygon.length];
      const pt = add(p0, mul(sub(p1, p0), op.fraction));
      let best: { w: Wall; along: number; d: number } | null = null;
      for (const w of Object.values(s.walls)) {
        if (w.floorId !== fid || !w.sources.some((x) => x.roomId === id && x.edge === op.edge)) continue;
        const pr = projectOnSegment(pt, w.a, w.b);
        if (!best || pr.dist < best.d) best = { w, along: pr.along, d: pr.dist };
      }
      if (best) { const no = { ...op.opening, id: nid('open'), wallId: best.w.id, offset: best.along, logic: { ...op.opening.logic, requires: [] } }; s.openings[no.id] = no; }
    }
    out.push({ kind: 'room', id });
  }
  for (const w of clip.walls) {
    const ids = addWallClone(s, w, floorId ?? w.floorId, dx, dz);
    ids.forEach((i) => out.push({ kind: 'wall', id: i }));
  }
  for (const e of clip.entities) {
    const d = e.data;
    const id = e.kind === 'prop' ? idMap.get(d.id)! : nid(e.kind);
    const copy = { ...d, id, floorId: floorId ?? d.floorId, groupId: undefined };
    if (copy.name) copy.name = `${d.name} (cópia)`;
    if (e.kind === 'prop') copy.requires = (d.requires as ID[]).map((r) => idMap.get(r) ?? r);
    if (Array.isArray(copy.position) && copy.position.length === 3) copy.position = [d.position[0] + dx, d.position[1], d.position[2] + dz];
    else if (Array.isArray(copy.position) && copy.position.length === 2) copy.position = [d.position[0] + dx, d.position[1] + dz];
    (s[COLLECTIONS[e.kind]] as Record<ID, unknown>)[id] = copy;
    out.push({ kind: e.kind, id });
  }
  return out;
}

function addWallClone(s: Scene, w: Wall, floorId: ID, dx: number, dz: number): ID[] {
  const nw: Wall = { ...w, id: nid('wall'), floorId, a: [w.a[0] + dx, w.a[1] + dz], b: [w.b[0] + dx, w.b[1] + dz], sources: [], standalone: true };
  s.walls[nw.id] = nw;
  return [nw.id];
}

export function duplicateEntities(s: Scene, refs: EntityRef[], dx = 1, dz = 1): EntityRef[] {
  return pasteClip(s, captureClip(s, refs), dx, dz);
}

// ------------------------------------------------------------------ propriedades

export function patchEntity(s: Scene, ref: EntityRef, patch: Record<string, unknown>) {
  const e = getEntity(s, ref) as any;
  if (!e) return;
  for (const [k, v] of Object.entries(patch)) e[k] = v;
}

/** Altera as dimensões de uma sala retangular (caixa envolvente) preservando aberturas. */
export function resizeRoomBounds(s: Scene, roomId: ID, w: number, h: number, anchor: 'nw' | 'center' = 'nw') {
  const r = s.rooms[roomId]; if (!r) return;
  const b = polygonBounds(r.polygon);
  if (b.w < 1e-6 || b.h < 1e-6) return;
  const sx = w / b.w, sy = h / b.h;
  const ox = anchor === 'center' ? (b.x0 + b.x1) / 2 : b.x0, oy = anchor === 'center' ? (b.y0 + b.y1) / 2 : b.y0;
  const f = (p: Vec2): Vec2 => [ox + (p[0] - ox) * sx, oy + (p[1] - oy) * sy];
  const holes = r.holes.map((hh) => hh.map(f));
  const res = setRoomPolygon(s, roomId, r.polygon.map(f));
  s.rooms[roomId].holes = holes;
  return res;
}

export { DEG, dist, buildRoomWalls };
