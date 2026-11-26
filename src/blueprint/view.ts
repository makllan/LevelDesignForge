import type { Vec2 } from '../core/types';

export interface View { ox: number; oy: number; k: number; w: number; h: number }

export const toScreen = (v: View, p: Vec2): Vec2 => [v.ox + p[0] * v.k, v.oy + p[1] * v.k];
export const toWorld = (v: View, sx: number, sy: number): Vec2 => [(sx - v.ox) / v.k, (sy - v.oy) / v.k];

export function zoomAt(v: View, sx: number, sy: number, factor: number): View {
  const k = Math.min(260, Math.max(2.5, v.k * factor));
  const f = k / v.k;
  return { ...v, k, ox: sx - (sx - v.ox) * f, oy: sy - (sy - v.oy) * f };
}

export function fitView(v: View, b: { x0: number; y0: number; x1: number; y1: number }, pad = 60): View {
  const w = Math.max(2, b.x1 - b.x0), h = Math.max(2, b.y1 - b.y0);
  const k = Math.min((v.w - pad * 2) / w, (v.h - pad * 2) / h, 80);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return { ...v, k, ox: v.w / 2 - cx * k, oy: v.h / 2 - cy * k };
}

/** Espaçamento "bonito" da grade menor, em metros, de acordo com o zoom. */
export function gridStep(k: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25];
  for (const s of steps) if (s * k >= 14) return s;
  return 50;
}
