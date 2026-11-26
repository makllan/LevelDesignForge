/** Terreno por heightmap. Todas as funções são puras (devolvem novo Terrain) para funcionar com undo/redo. */
import { clamp, lerp, mulberry32, pointInPolygon, polygonBounds } from '../core/math';
import type { Terrain, Vec2 } from '../core/types';

export function makeTerrain(origin: Vec2, size: Vec2, res: number, seed = 1, base = 0): Terrain {
  return { origin, size, res, heights: new Array((res + 1) * (res + 1)).fill(base), seed, color: '#6b6a4a' };
}

const idx = (t: Terrain, i: number, j: number) => j * (t.res + 1) + i;
export const cellSize = (t: Terrain): Vec2 => [t.size[0] / t.res, t.size[1] / t.res];

export function terrainHeight(t: Terrain, x: number, z: number): number | null {
  const [cx, cz] = cellSize(t);
  const fx = (x - t.origin[0]) / cx, fz = (z - t.origin[1]) / cz;
  if (fx < 0 || fz < 0 || fx > t.res || fz > t.res) return null;
  const i = Math.min(t.res - 1, Math.floor(fx)), j = Math.min(t.res - 1, Math.floor(fz));
  const tx = fx - i, tz = fz - j;
  const h00 = t.heights[idx(t, i, j)], h10 = t.heights[idx(t, i + 1, j)];
  const h01 = t.heights[idx(t, i, j + 1)], h11 = t.heights[idx(t, i + 1, j + 1)];
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

export function terrainSlopeDeg(t: Terrain, x: number, z: number): number {
  const d = Math.max(...cellSize(t)) * 0.5;
  const hx1 = terrainHeight(t, x + d, z) ?? 0, hx0 = terrainHeight(t, x - d, z) ?? 0;
  const hz1 = terrainHeight(t, x, z + d) ?? 0, hz0 = terrainHeight(t, x, z - d) ?? 0;
  return (Math.atan(Math.hypot((hx1 - hx0) / (2 * d), (hz1 - hz0) / (2 * d))) * 180) / Math.PI;
}

export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten';

/** Aplica um pincel circular com falloff suave. `strength` em metros por aplicação (raise/lower). */
export function sculpt(t: Terrain, mode: BrushMode, cx: number, cz: number, radius: number, strength: number, target?: number): Terrain {
  const h = t.heights.slice();
  const [sx, sz] = cellSize(t);
  const i0 = Math.max(0, Math.floor((cx - radius - t.origin[0]) / sx)), i1 = Math.min(t.res, Math.ceil((cx + radius - t.origin[0]) / sx));
  const j0 = Math.max(0, Math.floor((cz - radius - t.origin[1]) / sz)), j1 = Math.min(t.res, Math.ceil((cz + radius - t.origin[1]) / sz));
  const avg = (i: number, j: number) => {
    let s = 0, n = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const ii = i + a, jj = j + b;
      if (ii < 0 || jj < 0 || ii > t.res || jj > t.res) continue;
      s += t.heights[idx(t, ii, jj)]; n++;
    }
    return s / n;
  };
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = t.origin[0] + i * sx, z = t.origin[1] + j * sz;
    const d = Math.hypot(x - cx, z - cz);
    if (d > radius) continue;
    const fall = 0.5 * (1 + Math.cos((d / radius) * Math.PI));
    const k = idx(t, i, j);
    if (mode === 'raise') h[k] += strength * fall;
    else if (mode === 'lower') h[k] -= strength * fall;
    else if (mode === 'smooth') h[k] = lerp(h[k], avg(i, j), clamp(0.6 * fall, 0, 1));
    else h[k] = lerp(h[k], target ?? 0, clamp(fall * 1.4, 0, 1));
  }
  return { ...t, heights: h };
}

function hash2(ix: number, iz: number, seed: number) {
  let n = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967295;
}
function vnoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz, seed), hash2(ix + 1, iz, seed), u), lerp(hash2(ix, iz + 1, seed), hash2(ix + 1, iz + 1, seed), u), v);
}

export interface GenParams { seed: number; amplitude: number; scale: number; octaves: number; base: number }
/** Relevo procedural determinístico (ruído de valor fractal) a partir da seed. */
export function generateTerrain(t: Terrain, p: GenParams): Terrain {
  const h = new Array(t.heights.length);
  const [sx, sz] = cellSize(t);
  for (let j = 0; j <= t.res; j++) for (let i = 0; i <= t.res; i++) {
    let amp = 1, f = 1 / Math.max(1, p.scale), sum = 0, norm = 0;
    for (let o = 0; o < p.octaves; o++) {
      sum += (vnoise((t.origin[0] + i * sx) * f, (t.origin[1] + j * sz) * f, p.seed + o * 101) - 0.5) * 2 * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    h[idx(t, i, j)] = p.base + (sum / norm) * p.amplitude;
  }
  return { ...t, heights: h, seed: p.seed };
}

/** Nivela o terreno sob polígonos (salas) na altura dada, com rampa suave nas bordas. */
export function flattenUnder(t: Terrain, polys: { poly: Vec2[]; height: number }[], margin = 2.5): Terrain {
  const h = t.heights.slice();
  const [sx, sz] = cellSize(t);
  for (const { poly, height } of polys) {
    const b = polygonBounds(poly);
    const i0 = Math.max(0, Math.floor((b.x0 - margin - t.origin[0]) / sx)), i1 = Math.min(t.res, Math.ceil((b.x1 + margin - t.origin[0]) / sx));
    const j0 = Math.max(0, Math.floor((b.y0 - margin - t.origin[1]) / sz)), j1 = Math.min(t.res, Math.ceil((b.y1 + margin - t.origin[1]) / sz));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const p: Vec2 = [t.origin[0] + i * sx, t.origin[1] + j * sz];
      const k = idx(t, i, j);
      if (pointInPolygon(p, poly)) { h[k] = height - 0.12; continue; }
      let d = Infinity;
      for (let a = 0; a < poly.length; a++) {
        const q0 = poly[a], q1 = poly[(a + 1) % poly.length];
        const dx = q1[0] - q0[0], dz = q1[1] - q0[1], L2 = dx * dx + dz * dz || 1;
        const u = clamp(((p[0] - q0[0]) * dx + (p[1] - q0[1]) * dz) / L2, 0, 1);
        d = Math.min(d, Math.hypot(p[0] - (q0[0] + dx * u), p[1] - (q0[1] + dz * u)));
      }
      if (d < margin) { const f = 0.5 * (1 + Math.cos((d / margin) * Math.PI)); h[k] = lerp(h[k], height - 0.12, f); }
    }
  }
  return { ...t, heights: h };
}

/** Escava/aplaina uma faixa ao longo de uma curva (trilha, estrada ou rio). */
export function carvePath(t: Terrain, pts: Vec2[], width: number, depth: number, level: boolean): Terrain {
  let cur = t;
  const h = t.heights.slice();
  const [sx, sz] = cellSize(t);
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(sx, sz)));
    for (let n = 0; n <= steps; n++) {
      const x = lerp(a[0], b[0], n / steps), z = lerp(a[1], b[1], n / steps);
      const base = terrainHeight({ ...cur, heights: h }, x, z);
      if (base == null) continue;
      const i0 = Math.max(0, Math.floor((x - width - t.origin[0]) / sx)), i1 = Math.min(t.res, Math.ceil((x + width - t.origin[0]) / sx));
      const j0 = Math.max(0, Math.floor((z - width - t.origin[1]) / sz)), j1 = Math.min(t.res, Math.ceil((z + width - t.origin[1]) / sz));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(t.origin[0] + i * sx - x, t.origin[1] + j * sz - z);
        if (d > width) continue;
        const f = 0.5 * (1 + Math.cos((d / width) * Math.PI));
        const k = idx(t, i, j);
        h[k] = level ? lerp(h[k], base - depth, f * 0.6) : h[k] - depth * f * 0.25;
      }
    }
  }
  return { ...cur, heights: h };
}

export function terrainStats(t: Terrain) {
  let lo = Infinity, hi = -Infinity;
  for (const v of t.heights) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { min: lo, max: hi, range: hi - lo };
}

/** Distribuição determinística de pontos por pincel (Poisson simples por rejeição). */
export function scatterPoints(opts: { cx: number; cz: number; radius: number; count: number; spacing: number; seed: number; rotVar: number; scaleMin: number; scaleMax: number; avoid?: (x: number, z: number) => boolean; existing?: [number, number][] }): [number, number, number, number][] {
  const rnd = mulberry32(opts.seed);
  const out: [number, number, number, number][] = [];
  const pts: [number, number][] = [...(opts.existing ?? [])];
  let tries = 0;
  while (out.length < opts.count && tries < opts.count * 30) {
    tries++;
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * opts.radius;
    const x = opts.cx + Math.cos(a) * r, z = opts.cz + Math.sin(a) * r;
    if (opts.avoid?.(x, z)) continue;
    if (pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < opts.spacing)) continue;
    pts.push([x, z]);
    out.push([x, z, (rnd() * 360 * opts.rotVar) % 360, opts.scaleMin + rnd() * (opts.scaleMax - opts.scaleMin)]);
  }
  return out;
}
