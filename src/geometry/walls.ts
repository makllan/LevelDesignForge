/** Geometry Engine — paredes por segmentos, com aberturas reais (sem booleanas). */
import { clamp, norm, sub, add, mul } from '../core/math';
import type { Opening, Scene, Vec2, Vec3, Wall } from '../core/types';
import { openingsOfWall, wallHeight, wallLength } from '../core/scene';

export interface WallPiece {
  kind: 'solid' | 'lintel' | 'sill';
  /** intervalo ao longo da parede (m) */
  u0: number; u1: number;
  /** altura relativa ao piso do pavimento */
  y0: number; y1: number;
}

/** Quebra uma parede em blocos sólidos deixando vãos reais para portas/janelas. */
export function wallPieces(s: Scene, w: Wall): WallPiece[] {
  const L = wallLength(w);
  const H = wallHeight(s, w);
  const ext = w.thickness / 2;
  const ops = openingsOfWall(s, w.id).map((o) => ({ o, u0: clamp(o.offset - o.width / 2, 0, L), u1: clamp(o.offset + o.width / 2, 0, L) }));
  const out: WallPiece[] = [];
  let cursor = 0;
  for (const { o, u0, u1 } of ops) {
    if (u0 > cursor + 1e-3) out.push({ kind: 'solid', u0: cursor, u1: u0, y0: 0, y1: H });
    const top = clamp(o.sill + o.height, 0, H);
    if (top < H - 1e-3) out.push({ kind: 'lintel', u0, u1, y0: top, y1: H });
    if (o.sill > 1e-3) out.push({ kind: 'sill', u0, u1, y0: 0, y1: Math.min(o.sill, H) });
    cursor = Math.max(cursor, u1);
  }
  if (L > cursor + 1e-3) out.push({ kind: 'solid', u0: cursor, u1: L, y0: 0, y1: H });
  if (out.length) {
    // Extensão nas pontas para fechar cantos.
    const first = out.filter((p) => p.u0 <= 1e-3);
    const last = out.filter((p) => p.u1 >= L - 1e-3);
    first.forEach((p) => { p.u0 -= ext; });
    last.forEach((p) => { p.u1 += ext; });
  }
  return out;
}

export interface WorldBox { center: Vec3; size: Vec3; rot: number; kind: WallPiece['kind'] }

export function wallBoxesWorld(s: Scene, w: Wall): WorldBox[] {
  const floor = s.floors[w.floorId];
  const elev = floor?.elevation ?? 0;
  const dir = norm(sub(w.b, w.a));
  const rot = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  return wallPieces(s, w).map((p) => {
    const mid = (p.u0 + p.u1) / 2;
    const c = add(w.a, mul(dir, mid));
    return { kind: p.kind, rot, center: [c[0], elev + (p.y0 + p.y1) / 2, c[1]] as Vec3, size: [p.u1 - p.u0, p.y1 - p.y0, w.thickness] as Vec3 };
  });
}

/** Centro, direção e rotação do vão de uma abertura (para portas, colisores, análise). */
export function openingFrame(s: Scene, o: Opening) {
  const w = s.walls[o.wallId];
  if (!w) return null;
  const dir = norm(sub(w.b, w.a));
  const center: Vec2 = add(w.a, mul(dir, o.offset));
  const normal: Vec2 = [-dir[1], dir[0]];
  const rot = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  const elev = s.floors[w.floorId]?.elevation ?? 0;
  return { wall: w, dir, normal, center, rot, elev };
}

/** Problemas verificáveis de uma abertura. */
export function openingProblems(s: Scene, o: Opening): string[] {
  const w = s.walls[o.wallId];
  if (!w) return ['Parede inexistente'];
  const out: string[] = [];
  const L = wallLength(w);
  if (o.width > L - 0.05) out.push('A abertura é maior que a parede.');
  else if (o.offset - o.width / 2 < -1e-3 || o.offset + o.width / 2 > L + 1e-3) out.push('A abertura ultrapassa a extremidade da parede.');
  if (o.sill + o.height > wallHeight(s, w) + 1e-3) out.push('A abertura é mais alta que a parede.');
  for (const q of Object.values(s.openings)) {
    if (q.id !== o.id && q.wallId === o.wallId && Math.abs(q.offset - o.offset) < (q.width + o.width) / 2 - 1e-3 && q.id > o.id) out.push(`Sobrepõe "${q.name}".`);
  }
  return out;
}
