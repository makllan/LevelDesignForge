import type { Vec2 } from './types';

export const DEG = Math.PI / 180;
export const EPS = 1e-6;

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2) => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a: Vec2): Vec2 => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Normal (lado "front") de um segmento a→b: (-dy, dx) normalizada. */
export const normalOf = (a: Vec2, b: Vec2): Vec2 => norm([-(b[1] - a[1]), b[0] - a[0]]);

export function rotate(p: Vec2, deg: number, around: Vec2 = [0, 0]): Vec2 {
  const r = deg * DEG, c = Math.cos(r), s = Math.sin(r);
  const x = p[0] - around[0], y = p[1] - around[1];
  return [around[0] + x * c - y * s, around[1] + x * s + y * c];
}

/** Converte um ponto local (x ao longo de rot, z perpendicular) para planta. */
export function localToPlan(center: Vec2, rotDeg: number, lx: number, lz: number): Vec2 {
  const r = rotDeg * DEG, c = Math.cos(r), s = Math.sin(r);
  return [center[0] + lx * c - lz * s, center[1] + lx * s + lz * c];
}
export function planToLocal(center: Vec2, rotDeg: number, p: Vec2): Vec2 {
  const r = -rotDeg * DEG, c = Math.cos(r), s = Math.sin(r);
  const x = p[0] - center[0], y = p[1] - center[1];
  return [x * c - y * s, x * s + y * c];
}

export const snap = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
export const snap2 = (p: Vec2, step: number): Vec2 => [snap(p[0], step), snap(p[1], step)];
export const round = (v: number, d = 3) => { const k = 10 ** d; return Math.round(v * k) / k; };

export function polygonArea(p: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return a / 2;
}
export function polygonCentroid(p: Vec2[]): Vec2 {
  const A = polygonArea(p);
  if (Math.abs(A) < 1e-9) {
    const s = p.reduce((m, q) => add(m, q), [0, 0] as Vec2);
    return mul(s, 1 / Math.max(1, p.length));
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    const f = p[i][0] * q[1] - q[0] * p[i][1];
    cx += (p[i][0] + q[0]) * f; cy += (p[i][1] + q[1]) * f;
  }
  return [cx / (6 * A), cy / (6 * A)];
}
export function polygonBounds(p: Vec2[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a), L2 = dot(ab, ab);
  const t = L2 < EPS ? 0 : clamp(dot(sub(p, a), ab) / L2, 0, 1);
  const point = add(a, mul(ab, t));
  return { t, point, dist: dist(p, point), along: t * Math.sqrt(L2) };
}

export function segmentIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return add(a, mul(r, t));
}

export function rectPolygon(x: number, y: number, w: number, h: number): Vec2[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}
export function orientedRect(center: Vec2, w: number, h: number, rotDeg: number): Vec2[] {
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Vec2[]).map((p) => localToPlan(center, rotDeg, p[0], p[1]));
}

/** SAT para dois polígonos convexos. Retorna profundidade mínima de penetração (>0) ou 0. */
export function convexOverlap(A: Vec2[], B: Vec2[]): number {
  let minOverlap = Infinity;
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const axis = norm([-(q[1] - p[1]), q[0] - p[0]]);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const d = dot(v, axis); a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const v of B) { const d = dot(v, axis); b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return 0;
      minOverlap = Math.min(minOverlap, o);
    }
  }
  return minOverlap === Infinity ? 0 : minOverlap;
}

/** Interseção segmento/polígono (qualquer interseção de arestas ou contenção). */
export function polygonsIntersect(A: Vec2[], B: Vec2[]): boolean {
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++)
      if (segmentIntersect(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return pointInPolygon(A[0], B) || pointInPolygon(B[0], A);
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtM(v: number, d = 2) { return `${v.toFixed(d).replace('.', ',')} m`; }
