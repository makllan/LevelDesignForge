/**
 * Validação de progressão: simula, por ponto fixo, o que o jogador consegue alcançar.
 * Começa no ponto inicial com tudo trancado; a cada rodada coleta o que está ao alcance, ativa o que já tem requisitos
 * e abre portas liberadas. Termina quando nada muda. O que sobra é, por construção, inalcançável.
 */
import type { CharacterConfig, ID, Scene, Vec2 } from '../core/types';
import { getDef, gameplayLabel, type GameplayKind } from '../assets/props';
import { buildNavGrid, cellCenter, cellsNear, nearestCell, pathTo, reachFrom, type NavGrid, type Reach } from './navgrid';
import { floorsSorted } from '../core/scene';
import { pointInPolygon } from '../core/math';

export interface Step { order: number; kind: 'collect' | 'activate' | 'unblock' | 'open' | 'exit'; id: ID; label: string; round: number; dist: number }
export interface Obstacle { id: ID; kind: 'prop' | 'door'; name: string; reason: string; pos: Vec2; floorId: ID }
export interface ProgressionResult {
  ok: boolean;
  hasStart: boolean;
  startCell: number;
  hasExit: boolean;
  exitReached: boolean;
  steps: Step[];
  reachableRooms: ID[];
  unreachableRooms: ID[];
  stuck: Obstacle[];
  routeToExit: Vec2[];
  routeFloor?: ID;
  pathLength: number;
  grid: NavGrid | null;
  reach: Reach | null;
  rounds: number;
}

const COLLECT: GameplayKind[] = ['key', 'card', 'fuse', 'pickup'];
const ACTIVATE: GameplayKind[] = ['switch', 'generator', 'objective', 'trigger', 'checkpoint'];
const UNBLOCK: GameplayKind[] = ['block', 'shortcut'];
const EXITS: GameplayKind[] = ['exit', 'elevator'];

export function startPoint(s: Scene): { x: number; z: number; floorId: ID; y?: number } | null {
  const m = Object.values(s.markers).find((k) => k.kind === 'start');
  if (m) return { x: m.position[0], z: m.position[2], floorId: m.floorId };
  return null;
}

export function analyzeProgression(scene: Scene, cfg: CharacterConfig, existing?: NavGrid | null): ProgressionResult {
  const grid = existing ?? buildNavGrid(scene, cfg);
  const empty: ProgressionResult = { ok: false, hasStart: false, startCell: -1, hasExit: false, exitReached: false, steps: [], reachableRooms: [], unreachableRooms: Object.keys(scene.rooms), stuck: [], routeToExit: [], pathLength: 0, grid, reach: null, rounds: 0 };
  if (!grid) return empty;
  const sp = startPoint(scene);
  if (!sp) return { ...empty, grid };
  const elev = scene.floors[sp.floorId]?.elevation ?? 0;
  const startCell = nearestCell(grid, sp.x, sp.z, sp.floorId, 2.5, elev);
  const res: ProgressionResult = { ...empty, hasStart: true, startCell };
  if (startCell < 0) return res;

  const gate = (id: ID) => grid.gate.get(id) ?? [];
  const collected = new Set<ID>(), activated = new Set<ID>(), removed = new Set<ID>(), opened = new Set<ID>();
  const steps: Step[] = [];
  const satisfied = (id: ID) => {
    const p = scene.props[id]; if (!p) return false;
    const g = getDef(p.defId)?.gameplay;
    if (!g) return true;
    if (COLLECT.includes(g)) return collected.has(id);
    if (ACTIVATE.includes(g) || EXITS.includes(g)) return activated.has(id);
    if (UNBLOCK.includes(g)) return removed.has(id);
    return true;
  };
  const allOf = (ids: ID[]) => ids.every(satisfied);
  const cand = new Map<ID, number[]>();
  for (const p of Object.values(scene.props)) if (getDef(p.defId)?.gameplay) cand.set(p.id, cellsNear(grid, p.position[0], p.position[2], p.floorId, 1.7));
  let reach: Reach = reachFrom(grid, startCell);
  const bestCell = (id: ID) => (cand.get(id) ?? []).find((c) => reach.visited[c] === 1) ?? -1;

  let round = 0, changed = true;
  const log = (kind: Step['kind'], id: ID, label: string, c: number) => steps.push({ order: steps.length + 1, kind, id, label, round, dist: reach.dist[c] ?? 0 });

  while (changed && round < 60) {
    round++; changed = false;
    const blocked = new Set<number>();
    for (const o of Object.values(scene.openings)) if (o.kind === 'door' && !opened.has(o.id)) for (const c of gate(o.id)) blocked.add(c);
    for (const id of grid.world.blocks.keys()) if (!removed.has(id)) for (const c of gate(id)) blocked.add(c);
    reach = reachFrom(grid, startCell, blocked);

    for (const p of Object.values(scene.props)) {
      const g = getDef(p.defId)?.gameplay; if (!g) continue;
      const c = bestCell(p.id);
      if (c < 0) continue;
      if (COLLECT.includes(g) && !collected.has(p.id)) { collected.add(p.id); log('collect', p.id, `Pegar ${p.name}`, c); changed = true; }
      else if (ACTIVATE.includes(g) && !activated.has(p.id) && allOf(p.requires)) { activated.add(p.id); log('activate', p.id, `Ativar ${p.name}`, c); changed = true; }
      else if (UNBLOCK.includes(g) && !removed.has(p.id) && allOf(p.requires)) { removed.add(p.id); log('unblock', p.id, `Liberar ${p.name}`, c); changed = true; }
      else if (EXITS.includes(g) && !activated.has(p.id) && allOf(p.requires)) { activated.add(p.id); log('exit', p.id, `Usar ${p.name}`, c); changed = true; }
    }
    for (const o of Object.values(scene.openings)) {
      if (o.kind !== 'door' || opened.has(o.id) || o.logic.fake) continue;
      if (o.logic.mode === 'locked') continue;
      if (o.logic.mode === 'requires' && (o.logic.requires.length === 0 || !allOf(o.logic.requires))) continue;
      const touch = grid.touch.get(o.id) ?? [];
      const c = touch.find((t) => reach.visited[t] === 1);
      if (c === undefined) continue;
      opened.add(o.id); log('open', o.id, `Abrir ${o.name}`, c); changed = true;
    }
  }

  // salas alcançadas
  const reachableRooms: ID[] = [];
  for (const r of Object.values(scene.rooms)) {
    const fl = floorsSorted(scene).findIndex((f) => f.id === r.floorId);
    if (fl < 0) continue;
    const per = grid.w * grid.h; let hit = false;
    const xs = r.polygon.map((p) => p[0]), zs = r.polygon.map((p) => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - grid.origin[0]) / grid.cell)), i1 = Math.min(grid.w - 1, Math.floor((Math.max(...xs) - grid.origin[0]) / grid.cell));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - grid.origin[1]) / grid.cell)), j1 = Math.min(grid.h - 1, Math.floor((Math.max(...zs) - grid.origin[1]) / grid.cell));
    for (let j = j0; j <= j1 && !hit; j++) for (let i = i0; i <= i1; i++) {
      if (!reach.visited[fl * per + j * grid.w + i]) continue;
      if (pointInPolygon([grid.origin[0] + (i + 0.5) * grid.cell, grid.origin[1] + (j + 0.5) * grid.cell], r.polygon)) { hit = true; break; }
    }
    if (hit) reachableRooms.push(r.id);
  }

  // o que ficou preso
  const stuck: Obstacle[] = [];
  const unmet = (ids: ID[]) => ids.filter((i) => !satisfied(i)).map((i) => scene.props[i]?.name ?? '?').join(', ');
  for (const p of Object.values(scene.props)) {
    const g = getDef(p.defId)?.gameplay; if (!g || g === 'enemy' || g === 'checkpoint' || g === 'trigger') continue;
    const done = COLLECT.includes(g) ? collected.has(p.id) : ACTIVATE.includes(g) || EXITS.includes(g) ? activated.has(p.id) : UNBLOCK.includes(g) ? removed.has(p.id) : true;
    if (done) continue;
    const hasCells = (cand.get(p.id) ?? []).length > 0;
    const pos: Vec2 = [p.position[0], p.position[2]];
    if (!hasCells) stuck.push({ id: p.id, kind: 'prop', name: p.name, reason: 'não tem chão caminhável a até 1,7 m (suspenso, dentro de parede/móvel ou sem piso)', pos, floorId: p.floorId });
    else if (bestCell(p.id) < 0) stuck.push({ id: p.id, kind: 'prop', name: p.name, reason: `${gameplayLabel(g)} em área que o jogador nunca alcança`, pos, floorId: p.floorId });
    else stuck.push({ id: p.id, kind: 'prop', name: p.name, reason: `exige ${unmet(p.requires) || 'algo impossível'}, que nunca é cumprido`, pos, floorId: p.floorId });
  }
  for (const o of Object.values(scene.openings)) {
    if (o.kind !== 'door' || opened.has(o.id)) continue;
    const w = scene.walls[o.wallId]; if (!w) continue;
    const t = (o.offset) / Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const pos: Vec2 = [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
    const touched = (grid.touch.get(o.id) ?? []).some((c) => reach.visited[c] === 1);
    let reason: string;
    if (o.logic.fake) reason = 'porta falsa (intencional?)';
    else if (o.logic.mode === 'locked') reason = 'trancada sem forma de abrir';
    else if (o.logic.mode === 'requires' && o.logic.requires.length === 0) reason = 'exige objetos, mas a lista está vazia';
    else if (o.logic.mode === 'requires' && !allOf(o.logic.requires)) reason = `exige ${unmet(o.logic.requires)}, que nunca é obtido`;
    else if (!touched) reason = 'o jogador nunca chega até ela';
    else reason = 'não pôde ser aberta';
    stuck.push({ id: o.id, kind: 'door', name: o.name, reason, pos, floorId: w.floorId });
  }

  // rota até a saída
  const exits = Object.values(scene.props).filter((p) => { const g = getDef(p.defId)?.gameplay; return g && EXITS.includes(g); });
  let routeToExit: Vec2[] = [], pathLength = 0, routeFloor: ID | undefined;
  const exitsReached = exits.filter((p) => activated.has(p.id));
  if (exitsReached.length) {
    const best = exitsReached.map((p) => ({ p, c: bestCell(p.id) })).filter((x) => x.c >= 0).sort((a, b) => reach.dist[a.c] - reach.dist[b.c])[0];
    if (best) { routeToExit = pathTo(grid, reach, best.c); pathLength = reach.dist[best.c]; routeFloor = best.p.floorId; }
  }
  return {
    ...res, ok: true, hasExit: exits.length > 0, exitReached: exitsReached.length > 0, steps, reachableRooms,
    unreachableRooms: Object.keys(scene.rooms).filter((r) => !reachableRooms.includes(r)), stuck, routeToExit, routeFloor, pathLength, reach, rounds: round,
  };
}

/** Grafo de dependências (sem simular): o que exige o quê. */
export interface GraphNode { id: ID; label: string; kind: 'door' | GameplayKind }
export interface GraphEdge { from: ID; to: ID }
export function dependencyGraph(s: Scene): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [], edges: GraphEdge[] = [];
  for (const p of Object.values(s.props)) {
    const g = getDef(p.defId)?.gameplay; if (!g || g === 'enemy') continue;
    if (g === 'pickup' || g === 'checkpoint' || g === 'trigger') { if (!p.requires.length) continue; }
    nodes.push({ id: p.id, label: p.name, kind: g });
    for (const r of p.requires) edges.push({ from: r, to: p.id });
  }
  for (const o of Object.values(s.openings)) {
    if (o.kind !== 'door' || (o.logic.mode === 'free' && !o.logic.fake && o.logic.oneWay === 'none')) continue;
    nodes.push({ id: o.id, label: o.name, kind: 'door' });
    for (const r of o.logic.requires) edges.push({ from: r, to: o.id });
  }
  return { nodes: nodes.filter((n, i, a) => a.findIndex((m) => m.id === n.id) === i), edges: edges.filter((e) => s.props[e.from]) };
}
void cellCenter;
