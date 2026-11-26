/**
 * Grade de navegação em camadas (uma por pavimento) sobre o mesmo mundo de colisão do playtest.
 * Células são caminháveis se há apoio, a altura de degrau é respeitada e o corpo do personagem cabe.
 * Escadas ligam camadas pelas células que pertencem a ambas.
 */
import type { CharacterConfig, ID, Scene, Vec2 } from '../core/types';
import { buildWorld, groundAt, pointInBox, pushOut, type Box, type World } from '../geometry/colliders';
import { floorsSorted, sceneBounds } from '../core/scene';

export interface NavGrid {
  cell: number;
  origin: Vec2;
  w: number;
  h: number;
  layers: { floorId: ID; elev: number; y: Float32Array; walk: Uint8Array }[];
  world: World;
  cfg: CharacterConfig;
  /** células (índice global) que cada porta/bloqueio fecha quando está trancado */
  gate: Map<ID, number[]>;
  /** células perto do gate (para saber se o jogador pode chegar até ele) */
  touch: Map<ID, number[]>;
}

/** Duas células vizinhas podem cruzar dois degraus ao mesmo tempo; o jogador real sobe um por vez. */
const SAMPLE_SLACK = 0.06;
const NB: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function chooseCell(areaM2: number) { return areaM2 < 4500 ? 0.25 : areaM2 < 22000 ? 0.5 : 1; }

export function buildNavGrid(scene: Scene, cfg: CharacterConfig, opts: { cell?: number; pad?: number } = {}): NavGrid | null {
  const b = sceneBounds(scene);
  if (!b) return null;
  const pad = opts.pad ?? 1.5;
  const x0 = b.x0 - pad, y0 = b.y0 - pad, x1 = b.x1 + pad, y1 = b.y1 + pad;
  const cell = opts.cell ?? chooseCell((x1 - x0) * (y1 - y0));
  const w = Math.max(1, Math.ceil((x1 - x0) / cell)), h = Math.max(1, Math.ceil((y1 - y0) / cell));
  const world = buildWorld(scene);
  // análise parte de "tudo fechado": desliga portas/bloqueios e registra o que cada um fecha
  for (const bx of world.doors.values()) bx.active = false;
  for (const bx of world.blocks.values()) bx.active = false;
  const floors = floorsSorted(scene);
  const layers = floors.map((f, k) => {
    const next = floors[k + 1];
    const maxY = next ? next.elevation - 0.05 : 1e6;
    const y = new Float32Array(w * h).fill(NaN);
    const walk = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * cell, z = y0 + (j + 0.5) * cell;
      const g = groundAt(world, x, z, maxY);
      if (!Number.isFinite(g) || g < f.elevation - 0.3) continue;
      const [px, pz] = pushOut(world, x, z, cfg.radius, g + cfg.stepHeight + 0.02, g + cfg.height);
      if (Math.hypot(px - x, pz - z) > 0.03) continue;
      y[j * w + i] = g; walk[j * w + i] = 1;
    }
    return { floorId: f.id, elev: f.elevation, y, walk };
  });
  const grid: NavGrid = { cell, origin: [x0, y0], w, h, layers, world, cfg, gate: new Map(), touch: new Map() };
  const regionCells = (bx: Box, grow: number) => {
    const out: number[] = [];
    const rad = Math.hypot(bx.hx, bx.hz) + grow;
    const i0 = Math.max(0, Math.floor((bx.cx - rad - x0) / cell)), i1 = Math.min(w - 1, Math.floor((bx.cx + rad - x0) / cell));
    const j0 = Math.max(0, Math.floor((bx.cz - rad - y0) / cell)), j1 = Math.min(h - 1, Math.floor((bx.cz + rad - y0) / cell));
    for (let k = 0; k < layers.length; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const idx = k * w * h + j * w + i;
      if (!layers[k].walk[j * w + i]) continue;
      const yy = layers[k].y[j * w + i];
      if (yy + cfg.height < bx.y0 || yy > bx.y1) continue;
      if (pointInBox(bx, x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell, grow)) out.push(idx);
    }
    return out;
  };
  for (const [id, bx] of [...world.doors, ...world.blocks]) {
    grid.gate.set(id, regionCells(bx, cfg.radius + 0.02));
    grid.touch.set(id, regionCells(bx, cfg.radius + 0.9));
  }
  return grid;
}

export const cellIndex = (g: NavGrid, layer: number, i: number, j: number) => layer * g.w * g.h + j * g.w + i;
export const cellCenter = (g: NavGrid, idx: number): { layer: number; i: number; j: number; x: number; z: number; y: number } => {
  const per = g.w * g.h; const layer = Math.floor(idx / per); const r = idx - layer * per; const j = Math.floor(r / g.w), i = r - j * g.w;
  return { layer, i, j, x: g.origin[0] + (i + 0.5) * g.cell, z: g.origin[1] + (j + 0.5) * g.cell, y: g.layers[layer].y[r] };
};

/** Célula caminhável mais próxima de (x,z) no pavimento dado (ou em qualquer, se não informado). */
export function nearestCell(g: NavGrid, x: number, z: number, floorId?: ID, maxDist = 1.6, y?: number): number {
  const ci = Math.floor((x - g.origin[0]) / g.cell), cj = Math.floor((z - g.origin[1]) / g.cell);
  const R = Math.ceil(maxDist / g.cell);
  let best = -1, bd = Infinity;
  for (let k = 0; k < g.layers.length; k++) {
    if (floorId && g.layers[k].floorId !== floorId) continue;
    for (let j = Math.max(0, cj - R); j <= Math.min(g.h - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(g.w - 1, ci + R); i++) {
      const r = j * g.w + i; if (!g.layers[k].walk[r]) continue;
      const d = Math.hypot(g.origin[0] + (i + 0.5) * g.cell - x, g.origin[1] + (j + 0.5) * g.cell - z) + (y !== undefined ? Math.abs(g.layers[k].y[r] - y) * 2 : 0);
      if (d < bd && d <= maxDist) { bd = d; best = k * g.w * g.h + r; }
    }
  }
  return best;
}

/** Todas as células caminháveis dentro do raio de interação de (x,z) no pavimento dado, da mais próxima à mais distante. */
export function cellsNear(g: NavGrid, x: number, z: number, floorId: ID | undefined, radius: number): number[] {
  const ci = Math.floor((x - g.origin[0]) / g.cell), cj = Math.floor((z - g.origin[1]) / g.cell);
  const R = Math.ceil(radius / g.cell);
  const out: { c: number; d: number }[] = [];
  for (let k = 0; k < g.layers.length; k++) {
    if (floorId && g.layers[k].floorId !== floorId) continue;
    for (let j = Math.max(0, cj - R); j <= Math.min(g.h - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(g.w - 1, ci + R); i++) {
      const r = j * g.w + i; if (!g.layers[k].walk[r]) continue;
      const d = Math.hypot(g.origin[0] + (i + 0.5) * g.cell - x, g.origin[1] + (j + 0.5) * g.cell - z);
      if (d <= radius) out.push({ c: k * g.w * g.h + r, d });
    }
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.c);
}

export interface Reach { visited: Uint8Array; dist: Float32Array; parent: Int32Array }

/** BFS ponderado (passo reto = 1 célula, diagonal = √2) a partir de `start`, ignorando células bloqueadas. */
export function reachFrom(g: NavGrid, start: number, blocked?: Set<number>): Reach {
  const per = g.w * g.h, total = per * g.layers.length;
  const visited = new Uint8Array(total), dist = new Float32Array(total).fill(Infinity), parent = new Int32Array(total).fill(-1);
  if (start < 0 || blocked?.has(start)) return { visited, dist, parent };
  // fila de prioridade simples por baldes (distâncias pequenas e inteiras ×2)
  const buckets: number[][] = [[start]]; dist[start] = 0;
  const tryRelax = (from: number, to: number, cost: number, b: number) => {
    if (blocked?.has(to)) return;
    const nd = dist[from] + cost;
    if (nd < dist[to] - 1e-6) { dist[to] = nd; parent[to] = from; const bi = Math.floor(nd * 2); (buckets[bi] ??= []).push(to); }
    void b;
  };
  for (let bi = 0; bi < buckets.length; bi++) {
    const bucket = buckets[bi]; if (!bucket) continue;
    for (let q = 0; q < bucket.length; q++) {
      const u = bucket[q];
      if (visited[u]) continue;
      if (Math.floor(dist[u] * 2) !== bi) continue;
      visited[u] = 1;
      const layer = Math.floor(u / per), r = u - layer * per, j = Math.floor(r / g.w), i = r - j * g.w;
      const L = g.layers[layer], yu = L.y[r];
      for (const [dx, dy] of NB) {
        const ni = i + dx, nj = j + dy;
        if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue;
        const nr = nj * g.w + ni;
        if (!L.walk[nr] || Math.abs(L.y[nr] - yu) > g.cfg.stepHeight + SAMPLE_SLACK) continue;
        if (dx && dy && (!L.walk[j * g.w + ni] || !L.walk[nj * g.w + i])) continue;
        tryRelax(u, layer * per + nr, dx && dy ? Math.SQRT2 : 1, bi);
      }
      for (let k = 0; k < g.layers.length; k++) {
        if (k === layer || !g.layers[k].walk[r]) continue;
        if (Math.abs(g.layers[k].y[r] - yu) <= g.cfg.stepHeight + SAMPLE_SLACK) tryRelax(u, k * per + r, 0.01, bi);
      }
    }
  }
  for (let i = 0; i < total; i++) if (!Number.isFinite(dist[i])) dist[i] = Infinity; else dist[i] *= g.cell;
  return { visited, dist, parent };
}

export function pathTo(g: NavGrid, reach: Reach, target: number): Vec2[] {
  if (target < 0 || !reach.visited[target]) return [];
  const pts: Vec2[] = [];
  for (let c = target, guard = 0; c >= 0 && guard < 100000; c = reach.parent[c], guard++) { const p = cellCenter(g, c); pts.push([p.x, p.z]); }
  return pts.reverse();
}
