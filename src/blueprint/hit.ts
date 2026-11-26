import { DEG, dist, pointInPolygon, polygonArea, projectOnSegment, planToLocal, localToPlan } from '../core/math';
import type { EntityRef, ID, Scene, Vec2 } from '../core/types';
import { getDef } from '../assets/props';
import { propBounds } from '../geometry/colliders';
import { openingFrame } from '../geometry/walls';

export interface Hit { ref: EntityRef; dist: number }

/** Entidade sob o ponto de planta p (pavimento ativo), com tolerância em metros. */
export function hitTest(s: Scene, floorId: ID, p: Vec2, tol: number): EntityRef | null {
  const cands: { ref: EntityRef; score: number }[] = [];
  const push = (kind: EntityRef['kind'], id: ID, score: number) => cands.push({ ref: { kind, id }, score });

  for (const m of Object.values(s.markers)) if (m.floorId === floorId) { const d = dist(p, [m.position[0], m.position[2]]); if (d <= Math.max(tol * 1.3, 0.45)) push('marker', m.id, d - 100); }
  for (const l of Object.values(s.lights)) if (l.floorId === floorId) { const d = dist(p, [l.position[0], l.position[2]]); if (d <= Math.max(tol, 0.4)) push('light', l.id, d - 90); }
  for (const a of Object.values(s.annotations)) if (a.floorId === floorId) { const d = dist(p, a.position); if (d <= Math.max(tol * 1.4, 0.4)) push('annotation', a.id, d - 80); }
  for (const pr of Object.values(s.props)) {
    if (pr.floorId !== floorId || pr.hidden) continue;
    const b = propBounds(pr.defId);
    const lp = planToLocal([pr.position[0], pr.position[2]], pr.rot, p);
    const pad = tol * 0.4;
    if (lp[0] >= b.min[0] * pr.scale - pad && lp[0] <= b.max[0] * pr.scale + pad && lp[1] >= b.min[2] * pr.scale - pad && lp[1] <= b.max[2] * pr.scale + pad) {
      const def = getDef(pr.defId);
      push('prop', pr.id, -60 + (def?.gameplay ? -20 : 0) + (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) * 0.01);
    }
  }
  for (const sh of Object.values(s.shapes)) {
    if (sh.floorId !== floorId || sh.hidden) continue;
    const lp = planToLocal([sh.position[0], sh.position[2]], sh.rot, p);
    if (Math.abs(lp[0]) <= sh.size[0] / 2 + tol * 0.3 && Math.abs(lp[1]) <= sh.size[2] / 2 + tol * 0.3) push('shape', sh.id, -50 + sh.size[0] * sh.size[2] * 0.01);
  }
  for (const st of Object.values(s.stairs)) {
    if (st.floorId !== floorId) continue;
    const lp = planToLocal(st.position, st.rot, p);
    if (lp[0] >= -tol * 0.3 && lp[0] <= st.run + tol * 0.3 && Math.abs(lp[1]) <= st.width / 2 + tol * 0.3) push('stair', st.id, -45);
  }
  for (const o of Object.values(s.openings)) {
    const fr = openingFrame(s, o);
    if (!fr || fr.wall.floorId !== floorId) continue;
    const lp = planToLocal(fr.center, fr.rot, p);
    if (Math.abs(lp[0]) <= o.width / 2 + tol * 0.2 && Math.abs(lp[1]) <= Math.max(fr.wall.thickness / 2, tol) + 0.25) push('opening', o.id, -40);
  }
  for (const w of Object.values(s.walls)) {
    if (w.floorId !== floorId || w.hidden) continue;
    const pr = projectOnSegment(p, w.a, w.b);
    if (pr.dist <= Math.max(w.thickness / 2, tol * 0.6)) push('wall', w.id, -30 + pr.dist);
  }
  for (const r of Object.values(s.rooms)) {
    if (r.floorId !== floorId || r.hidden) continue;
    if (pointInPolygon(p, r.polygon)) push('room', r.id, Math.abs(polygonArea(r.polygon)) * 0.01);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.score - b.score);
  return cands[0].ref;
}

export type Handle =
  | { type: 'vertex'; roomId: ID; index: number; at: Vec2 }
  | { type: 'edge'; roomId: ID; index: number; at: Vec2 }
  | { type: 'rotate'; ref: EntityRef; at: Vec2; center: Vec2 };

export function handlesFor(s: Scene, sel: EntityRef[]): Handle[] {
  if (sel.length !== 1) return [];
  const r = sel[0];
  const out: Handle[] = [];
  if (r.kind === 'room') {
    const room = s.rooms[r.id]; if (!room) return out;
    room.polygon.forEach((p, i) => {
      out.push({ type: 'vertex', roomId: room.id, index: i, at: p });
      const q = room.polygon[(i + 1) % room.polygon.length];
      out.push({ type: 'edge', roomId: room.id, index: i, at: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] });
    });
  } else if (r.kind === 'prop' || r.kind === 'shape') {
    const e = (r.kind === 'prop' ? s.props[r.id] : s.shapes[r.id]);
    if (e) { const c: Vec2 = [e.position[0], e.position[2]]; const reach = r.kind === 'prop' ? Math.max(0.9, ((propBounds((e as any).defId).max[2]) * (e as any).scale) + 0.45) : (e as any).size[2] / 2 + 0.5; out.push({ type: 'rotate', ref: r, at: localToPlan(c, e.rot, 0, reach), center: c }); }
  } else if (r.kind === 'stair') {
    const st = s.stairs[r.id]; if (st) out.push({ type: 'rotate', ref: r, at: localToPlan(st.position, st.rot, st.run + 0.6, 0), center: st.position });
  } else if (r.kind === 'marker') {
    const m = s.markers[r.id]; if (m && (m.kind === 'sightline' || m.kind === 'oneway')) { const c: Vec2 = [m.position[0], m.position[2]]; out.push({ type: 'rotate', ref: r, at: [c[0] + Math.cos(m.rot * DEG) * 1.2, c[1] + Math.sin(m.rot * DEG) * 1.2], center: c }); }
  }
  return out;
}

export function hitHandle(handles: Handle[], p: Vec2, tol: number): Handle | null {
  let best: Handle | null = null, bd = tol;
  for (const h of handles) { const d = dist(h.at, p); if (d < bd) { bd = d; best = h; } }
  return best;
}
