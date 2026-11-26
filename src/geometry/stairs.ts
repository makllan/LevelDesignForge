import { localToPlan } from '../core/math';
import type { Scene, Stair, Vec2, Vec3 } from '../core/types';

export interface StepBox { center: Vec3; size: Vec3; rot: number }

/** Degraus como blocos sólidos empilhados (do chão ao topo de cada degrau). Retorna coords de mundo. */
export function stairSteps(s: Scene, st: Stair): StepBox[] {
  const elev = s.floors[st.floorId]?.elevation ?? 0;
  const n = Math.max(1, Math.round(st.steps));
  const treads = st.run / n, risers = st.rise / n;
  const out: StepBox[] = [];
  if (st.kind === 'ramp') return out;
  for (let i = 0; i < n; i++) {
    const top = risers * (i + 1);
    const lx = treads * (i + 0.5);
    const c: Vec2 = localToPlan(st.position, st.rot, lx, 0);
    out.push({ center: [c[0], elev + top / 2, c[1]], size: [treads, top, st.width], rot: st.rot });
  }
  return out;
}

/** Altura (relativa ao piso do pavimento) da superfície da escada/rampa no ponto local (lx ao longo da subida). */
export function stairHeightAtLocal(st: Stair, lx: number, lz: number): number | null {
  if (lx < 0 || lx > st.run || Math.abs(lz) > st.width / 2) return null;
  if (st.kind === 'ramp') return (st.rise * lx) / st.run;
  const n = Math.max(1, Math.round(st.steps));
  const i = Math.min(n - 1, Math.floor((lx / st.run) * n));
  return (st.rise / n) * (i + 1);
}

/** Dados derivados para validação (ergonomia da escada). */
export function stairStats(st: Stair) {
  const n = Math.max(1, Math.round(st.steps));
  const riser = st.rise / n, tread = st.run / n;
  const slopeDeg = (Math.atan2(st.rise, st.run) * 180) / Math.PI;
  return { riser, tread, slopeDeg, blondel: 2 * riser + tread };
}

/** Ponto de chegada (topo) da escada em planta. */
export function stairTop(st: Stair): Vec2 { return localToPlan(st.position, st.rot, st.run, 0); }

/** Pavimento atingido pelo topo da escada: o de elevação mais próxima de (base + rise), com tolerância. */
export function stairTargetFloor(s: Scene, st: Stair): string | undefined {
  const base = s.floors[st.floorId]?.elevation ?? 0;
  let best: string | undefined, bd = 0.35;
  for (const f of Object.values(s.floors)) {
    const d = Math.abs(f.elevation - (base + st.rise));
    if (d < bd) { bd = d; best = f.id; }
  }
  return best;
}
