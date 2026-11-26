/** Blueprint Editor — desenho 2D do mesmo Scene que o 3D usa (sem modelo paralelo). */
import { DEG, dist, polygonCentroid, polygonBounds, rotate, fmtM } from '../core/math';
import type { CharacterConfig, EntityRef, ID, Scene, Terrain, Vec2 } from '../core/types';
import { MARKER_INFO } from '../core/markerKinds';
import { getDef } from '../assets/props';
import { propBounds } from '../geometry/colliders';
import { wallPieces, openingFrame, openingProblems } from '../geometry/walls';
import { roomArea, floorsSorted } from '../core/scene';
import { roomInnerSize, nearestWall } from '../editor/rooms';
import { terrainHeight, cellSize } from '../geometry/terrain';
import { View, gridStep, toScreen } from './view';
import { stairStats } from '../geometry/stairs';

export interface DrawExtra {
  nav?: { floorId: ID; origin: Vec2; cell: number; w: number; h: number; walk: Uint8Array; reach?: Uint8Array };
  los?: { origin: Vec2; poly: Vec2[]; targets: { pos: Vec2; visible: boolean; name: string }[] };
  heat?: { origin: Vec2; cell: number; w: number; h: number; data: Float32Array; max: number };
  ghostPath?: { pts: [number, number, string][]; upto: number };
  routes?: { pts: Vec2[]; kind: 'main' | 'alt' | 'return'; label?: string }[];
  issues?: { pos: Vec2; text: string; sev: 'error' | 'warn' | 'info'; floorId?: ID }[];
}

export interface DrawOpts {
  dims: boolean; markers: boolean; character: boolean; showGrid: boolean; warnings: boolean;
  snap: number; shading: 'grey' | 'wire' | 'sector';
}

export const C2 = {
  bg: '#1d1b17', gridMinor: '#2a2721', gridMajor: '#38342a', axis: '#4a4435', wall: '#d3cab4', wallEdge: '#8d8570', roomFill: '#2a2722',
  text: '#b9ae96', textDim: '#7d7664', brass: '#e0b24f', red: '#c4553f', green: '#7fa05a', ghost: '#554e3d', hover: '#f0e8d4',
};

const TERRAIN_CACHE = new WeakMap<Terrain, HTMLCanvasElement>();
function terrainCanvas(t: Terrain): HTMLCanvasElement {
  let c = TERRAIN_CACHE.get(t);
  if (c) return c;
  c = document.createElement('canvas'); c.width = t.res + 1; c.height = t.res + 1;
  const g = c.getContext('2d')!;
  const img = g.createImageData(t.res + 1, t.res + 1);
  let lo = Infinity, hi = -Infinity;
  for (const v of t.heights) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const rng = Math.max(0.5, hi - lo), n = t.res + 1;
  const [cx, cz] = cellSize(t);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = t.heights[j * n + i];
    const dx = (t.heights[j * n + Math.min(t.res, i + 1)] - t.heights[j * n + Math.max(0, i - 1)]) / (2 * cx);
    const dz = (t.heights[Math.min(t.res, j + 1) * n + i] - t.heights[Math.max(0, j - 1) * n + i]) / (2 * cz);
    const shade = Math.max(0.35, Math.min(1.4, 0.85 + (-dx * 0.55 - dz * 0.55)));
    const f = (h - lo) / rng;
    const r = (62 + f * 84) * shade, gg = (66 + f * 70) * shade, b = (44 + f * 48) * shade;
    const k = (j * n + i) * 4;
    img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  TERRAIN_CACHE.set(t, c);
  return c;
}

const IMG_CACHE = new Map<string, HTMLImageElement>();
export function refImage(src: string, onLoad: () => void): HTMLImageElement {
  let im = IMG_CACHE.get(src);
  if (!im) { im = new Image(); im.onload = onLoad; im.src = src; IMG_CACHE.set(src, im); }
  return im;
}

export interface DrawCtx {
  g: CanvasRenderingContext2D;
  view: View;
  scene: Scene;
  floorId: ID;
  selected: Set<string>;
  hover: string | null;
  opts: DrawOpts;
  extra: DrawExtra;
  character: CharacterConfig;
  cursor: Vec2 | null;
  invalidate: () => void;
  time: number;
  isolate: Set<string> | null;
  hidden: Set<string>;
}

const key = (kind: string, id: string) => `${kind}:${id}`;

function poly(g: CanvasRenderingContext2D, v: View, pts: Vec2[], close = true) {
  pts.forEach((p, i) => { const s = toScreen(v, p); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
  if (close) g.closePath();
}

function drawGrid(dc: DrawCtx) {
  const { g, view: v } = dc;
  const step = gridStep(v.k);
  const x0 = -v.ox / v.k, y0 = -v.oy / v.k, x1 = (v.w - v.ox) / v.k, y1 = (v.h - v.oy) / v.k;
  const major = step >= 1 ? (step >= 5 ? step * 2 : 5) : 1;
  g.lineWidth = 1;
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass === 0 ? C2.gridMinor : C2.gridMajor;
    g.beginPath();
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      const isMaj = Math.abs(x / major - Math.round(x / major)) < 1e-6;
      if ((pass === 1) !== isMaj) continue;
      const sx = Math.round(v.ox + x * v.k) + 0.5; g.moveTo(sx, 0); g.lineTo(sx, v.h);
    }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
      const isMaj = Math.abs(y / major - Math.round(y / major)) < 1e-6;
      if ((pass === 1) !== isMaj) continue;
      const sy = Math.round(v.oy + y * v.k) + 0.5; g.moveTo(0, sy); g.lineTo(v.w, sy);
    }
    g.stroke();
  }
  g.strokeStyle = C2.axis; g.lineWidth = 1.5; g.beginPath();
  g.moveTo(Math.round(v.ox) + 0.5, 0); g.lineTo(Math.round(v.ox) + 0.5, v.h); g.moveTo(0, Math.round(v.oy) + 0.5); g.lineTo(v.w, Math.round(v.oy) + 0.5); g.stroke();
}

function drawRoom(dc: DrawCtx, id: ID, ghost: boolean) {
  const { g, view: v, scene: s } = dc;
  const r = s.rooms[id];
  const sec = r.sectorId ? s.sectors[r.sectorId] : undefined;
  g.beginPath(); poly(g, v, r.polygon);
  for (const h of r.holes) poly(g, v, h);
  g.fillStyle = ghost ? '#26231e' : sec ? hexA(sec.color, 0.3) : C2.roomFill;
  g.fill('evenodd');
  if (!ghost && r.holes.length) {
    g.save(); g.beginPath(); for (const h of r.holes) poly(g, v, h); g.clip();
    g.strokeStyle = C2.red; g.lineWidth = 1; g.beginPath();
    const b = polygonBounds(r.holes.flat());
    for (let x = b.x0 - b.h; x < b.x1; x += 0.3) { const a = toScreen(v, [x, b.y1]), c = toScreen(v, [x + b.h, b.y0]); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); }
    g.stroke(); g.restore();
  }
}

function drawWall(dc: DrawCtx, id: ID, ghost: boolean) {
  const { g, view: v, scene: s } = dc;
  const w = s.walls[id];
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy) || 1;
  const u: Vec2 = [dx / L, dy / L], n: Vec2 = [-u[1], u[0]], t2 = w.thickness / 2;
  const sel = dc.selected.has(key('wall', id)), hov = dc.hover === key('wall', id);
  const base = ghost ? C2.ghost : C2.wall;
  const pieces = wallPieces(s, w).filter((p) => p.kind === 'solid');
  const ext = w.thickness / 2;
  for (const p of pieces) {
    const a0: Vec2 = [w.a[0] + u[0] * (p.u0 + (p.u0 < 0 ? ext : 0)), w.a[1] + u[1] * (p.u0 + (p.u0 < 0 ? ext : 0))];
    const b0: Vec2 = [w.a[0] + u[0] * (p.u1 - (p.u1 > L ? ext : 0)), w.a[1] + u[1] * (p.u1 - (p.u1 > L ? ext : 0))];
    const q: Vec2[] = [[a0[0] + n[0] * t2, a0[1] + n[1] * t2], [b0[0] + n[0] * t2, b0[1] + n[1] * t2], [b0[0] - n[0] * t2, b0[1] - n[1] * t2], [a0[0] - n[0] * t2, a0[1] - n[1] * t2]];
    g.beginPath(); poly(g, v, q);
    g.fillStyle = sel ? C2.brass : hov ? C2.hover : base; g.fill();
    if (!ghost) { g.strokeStyle = sel ? '#6f5520' : '#1d1b17'; g.lineWidth = 1; g.stroke(); }
  }
  if (ghost) return;
  // aberturas
  for (const o of Object.values(s.openings)) {
    if (o.wallId !== id) continue;
    const fr = openingFrame(s, o)!;
    const osel = dc.selected.has(key('opening', o.id)), ohov = dc.hover === key('opening', o.id);
    const bad = openingProblems(s, o).length > 0;
    const a: Vec2 = [fr.center[0] - fr.dir[0] * o.width / 2, fr.center[1] - fr.dir[1] * o.width / 2];
    const b: Vec2 = [fr.center[0] + fr.dir[0] * o.width / 2, fr.center[1] + fr.dir[1] * o.width / 2];
    g.lineWidth = 2;
    const col = bad ? C2.red : osel ? C2.brass : ohov ? C2.hover : o.kind === 'window' ? '#8fb0b4' : o.logic.mode === 'locked' ? '#c4553f' : o.logic.mode === 'requires' ? '#d0a040' : '#b49a6a';
    g.strokeStyle = col; g.fillStyle = col;
    if (o.kind === 'window') {
      for (const sd of [-0.5, 0.5]) { const p0 = toScreen(v, [a[0] + n[0] * t2 * sd, a[1] + n[1] * t2 * sd]), p1 = toScreen(v, [b[0] + n[0] * t2 * sd, b[1] + n[1] * t2 * sd]); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
    } else if (o.kind === 'arch') {
      g.setLineDash([4, 4]); const p0 = toScreen(v, a), p1 = toScreen(v, b); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); g.setLineDash([]);
    } else {
      const hingeSign = o.hinge === 'a' ? -1 : 1;
      const hinge: Vec2 = [fr.center[0] + fr.dir[0] * hingeSign * o.width / 2, fr.center[1] + fr.dir[1] * hingeSign * o.width / 2];
      const closedDir: Vec2 = [-fr.dir[0] * hingeSign, -fr.dir[1] * hingeSign];
      const sw = o.swing;
      const openDir: Vec2 = [n[0] * sw, n[1] * sw];
      const tip: Vec2 = [hinge[0] + openDir[0] * o.width, hinge[1] + openDir[1] * o.width];
      const hs = toScreen(v, hinge), ts = toScreen(v, tip);
      g.beginPath(); g.moveTo(hs[0], hs[1]); g.lineTo(ts[0], ts[1]); g.stroke();
      const a0 = Math.atan2(closedDir[1], closedDir[0]), a1 = Math.atan2(openDir[1], openDir[0]);
      g.globalAlpha = 0.55; g.lineWidth = 1; g.beginPath();
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      g.arc(hs[0], hs[1], o.width * v.k, a0, a0 + da, da < 0); g.stroke(); g.globalAlpha = 1;
      if (o.logic.oneWay !== 'none') { const m = toScreen(v, fr.center); g.font = '700 11px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText(o.logic.oneWay === 'front' ? '→' : '←', m[0], m[1] - 6); }
    }
    if (dc.opts.dims && v.k > 22) {
      const m = toScreen(v, [fr.center[0] + n[0] * (t2 + 0.5), fr.center[1] + n[1] * (t2 + 0.5)]);
      g.font = '500 10px "IBM Plex Mono"'; g.textAlign = 'center'; g.fillStyle = o.width < dc.character.width + 0.1 ? C2.red : C2.textDim; g.fillText(o.width.toFixed(2).replace('.', ','), m[0], m[1]);
    }
  }
}

function drawStair(dc: DrawCtx, id: ID, ghost: boolean) {
  const { g, view: v, scene: s } = dc;
  const st = s.stairs[id];
  const sel = dc.selected.has(key('stair', id)), hov = dc.hover === key('stair', id);
  const o = toScreen(v, st.position);
  g.save(); g.translate(o[0], o[1]); g.rotate(st.rot * DEG);
  const k = v.k;
  g.fillStyle = ghost ? '#2d2a23' : hexA(st.color, 0.45); g.strokeStyle = sel ? C2.brass : hov ? C2.hover : ghost ? C2.ghost : '#b6a98a'; g.lineWidth = sel ? 2 : 1.2;
  g.fillRect(0, (-st.width / 2) * k, st.run * k, st.width * k); g.strokeRect(0, (-st.width / 2) * k, st.run * k, st.width * k);
  if (st.kind === 'stair' && !ghost) {
    g.beginPath(); const n = Math.max(1, st.steps);
    for (let i = 1; i < n; i++) { const x = (st.run / n) * i * k; g.moveTo(x, (-st.width / 2) * k); g.lineTo(x, (st.width / 2) * k); }
    g.globalAlpha = 0.6; g.stroke(); g.globalAlpha = 1;
  }
  // seta de subida
  g.fillStyle = sel ? C2.brass : '#c9bd9e'; g.beginPath();
  g.moveTo(st.run * k * 0.15, 0); g.lineTo(st.run * k * 0.85, 0); g.strokeStyle = g.fillStyle; g.lineWidth = 1.5; g.stroke();
  g.beginPath(); g.moveTo(st.run * k * 0.85, -5); g.lineTo(st.run * k * 0.85 + 9, 0); g.lineTo(st.run * k * 0.85, 5); g.closePath(); g.fill();
  g.restore();
  if (!ghost && v.k > 14) {
    const c = toScreen(v, [st.position[0] + Math.cos(st.rot * DEG) * st.run / 2, st.position[1] + Math.sin(st.rot * DEG) * st.run / 2]);
    g.font = '600 11px "Barlow Condensed"'; g.textAlign = 'center'; g.fillStyle = C2.text;
    const sts = stairStats(st);
    g.fillText(`${st.kind === 'ramp' ? 'rampa' : 'escada'} +${st.rise.toFixed(2).replace('.', ',')} m`, c[0], c[1] - st.width * k / 2 - 6);
    if (st.kind === 'stair' && v.k > 26) { g.font = '500 9px "IBM Plex Mono"'; g.fillStyle = C2.textDim; g.fillText(`${st.steps}× ${(sts.riser * 100).toFixed(0)}/${(sts.tread * 100).toFixed(0)} cm`, c[0], c[1] + st.width * k / 2 + 13); }
  }
}

function drawShape(dc: DrawCtx, id: ID) {
  const { g, view: v, scene: s } = dc;
  const sh = s.shapes[id];
  const sel = dc.selected.has(key('shape', id)), hov = dc.hover === key('shape', id);
  const o = toScreen(v, [sh.position[0], sh.position[2]]);
  g.save(); g.translate(o[0], o[1]); g.rotate(sh.rot * DEG);
  const k = v.k, hw = (sh.size[0] / 2) * k, hd = (sh.size[2] / 2) * k;
  g.fillStyle = hexA(sh.color, 0.55); g.strokeStyle = sel ? C2.brass : hov ? C2.hover : '#8d836d'; g.lineWidth = sel ? 2 : 1.2;
  g.beginPath();
  if (sh.kind === 'cylinder' || sh.kind === 'sphere' || sh.kind === 'cone') g.ellipse(0, 0, hw, hd, 0, 0, Math.PI * 2);
  else if (sh.kind === 'prism') { const n = sh.sides ?? 6; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const px = Math.cos(a) * hw, py = Math.sin(a) * hd; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); }
  else if (sh.kind === 'custom' && sh.polygon) sh.polygon.forEach((p, i) => { const px = (p[0] * sh.size[0] / 2) * k, py = (p[1] * sh.size[2] / 2) * k; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
  else g.rect(-hw, -hd, hw * 2, hd * 2);
  if (sh.kind === 'custom') g.closePath();
  g.fill(); g.stroke();
  if (sh.kind === 'ramp') { g.beginPath(); g.moveTo(-hw * 0.6, 0); g.lineTo(hw * 0.6, 0); g.moveTo(hw * 0.35, -5); g.lineTo(hw * 0.6, 0); g.lineTo(hw * 0.35, 5); g.stroke(); }
  g.restore();
}

function drawProp(dc: DrawCtx, id: ID) {
  const { g, view: v, scene: s } = dc;
  const p = s.props[id];
  const d = getDef(p.defId);
  const sel = dc.selected.has(key('prop', id)), hov = dc.hover === key('prop', id);
  const b = propBounds(p.defId);
  const o = toScreen(v, [p.position[0], p.position[2]]);
  g.save(); g.translate(o[0], o[1]); g.rotate(p.rot * DEG);
  const k = v.k * p.scale;
  const x0 = b.min[0] * k, x1 = b.max[0] * k, z0 = b.min[2] * k, z1 = b.max[2] * k;
  const col = d?.parts[0]?.c ?? '#999';
  g.fillStyle = hexA(col, d?.gameplay ? 0.9 : 0.7); g.strokeStyle = sel ? C2.brass : hov ? C2.hover : 'rgba(0,0,0,.65)'; g.lineWidth = sel ? 2.2 : 1;
  const gp = d?.gameplay;
  if (gp && !['block', 'shortcut', 'generator'].includes(gp)) {
    g.beginPath(); g.arc(0, 0, Math.max(7, Math.min(14, v.k * 0.35)), 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#17150f'; g.font = '700 11px "Barlow Condensed"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.rotate(-p.rot * DEG);
    g.fillText(GP_GLYPH[gp] ?? '?', 0, 1);
  } else {
    g.fillRect(x0, z0, x1 - x0, z1 - z0); g.strokeRect(x0, z0, x1 - x0, z1 - z0);
    g.fillStyle = sel ? C2.brass : 'rgba(255,255,255,.55)';
    g.beginPath(); g.moveTo((x0 + x1) / 2 - 3, z1); g.lineTo((x0 + x1) / 2 + 3, z1); g.lineTo((x0 + x1) / 2, z1 + 5); g.closePath(); g.fill();
  }
  g.restore();
  const radius = typeof p.params.radius === 'number' ? (p.params.radius as number) : 0;
  if (radius > 0 && gp && ['enemy', 'trigger', 'checkpoint', 'objective', 'exit'].includes(gp)) {
    g.strokeStyle = gp === 'enemy' ? '#a0402e' : '#c9a14a'; g.setLineDash([5, 4]); g.lineWidth = 1; g.beginPath(); g.arc(o[0], o[1], radius * v.k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    if (gp === 'enemy' && typeof p.params.range === 'number') { g.globalAlpha = 0.25; g.beginPath(); g.arc(o[0], o[1], (p.params.range as number) * v.k, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
  }
  if (dc.opts.dims && v.k > 18 && (sel || gp)) {
    const label = (p.params.label as string) || (p.params.code as string) || '';
    if (label) { g.font = '600 10px "Barlow Condensed"'; g.fillStyle = C2.text; g.textAlign = 'center'; g.fillText(label, o[0], o[1] - 14); }
  }
}
const GP_GLYPH: Record<string, string> = { key: 'K', card: 'C', fuse: 'F', switch: 'S', generator: 'G', trigger: 'T', checkpoint: 'P', objective: 'O', exit: 'X', elevator: 'E', pickup: '+', enemy: '!' };

export function drawMarkerShape(g: CanvasRenderingContext2D, kind: keyof typeof MARKER_INFO, x: number, y: number, r: number, sel = false) {
  const info = MARKER_INFO[kind];
  g.fillStyle = info.color; g.strokeStyle = sel ? C2.brass : '#17150f'; g.lineWidth = sel ? 2.5 : 1.5;
  g.beginPath();
  if (info.shape === 'circle') g.arc(x, y, r, 0, Math.PI * 2);
  else if (info.shape === 'diamond') { g.moveTo(x, y - r * 1.15); g.lineTo(x + r * 1.15, y); g.lineTo(x, y + r * 1.15); g.lineTo(x - r * 1.15, y); g.closePath(); }
  else if (info.shape === 'square') g.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  else { g.moveTo(x, y - r * 1.1); g.lineTo(x + r * 1.1, y + r * 0.8); g.lineTo(x - r * 1.1, y + r * 0.8); g.closePath(); }
  g.fill(); g.stroke();
  g.fillStyle = '#17150f'; g.font = `700 ${Math.round(r * 1.25)}px "Barlow Condensed"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(info.glyph, x, y + (info.shape === 'tri' ? r * 0.2 : 1));
}

function drawMarker(dc: DrawCtx, id: ID) {
  const { g, view: v, scene: s } = dc;
  const m = s.markers[id];
  const sel = dc.selected.has(key('marker', id)), hov = dc.hover === key('marker', id);
  const o = toScreen(v, [m.position[0], m.position[2]]);
  const info = MARKER_INFO[m.kind];
  if (m.radius > 0.2) { g.strokeStyle = hexA(info.color, 0.6); g.fillStyle = hexA(info.color, 0.08); g.setLineDash([5, 4]); g.lineWidth = 1; g.beginPath(); g.arc(o[0], o[1], m.radius * v.k, 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([]); }
  if (m.kind === 'sightline' || m.kind === 'oneway') {
    const e = toScreen(v, [m.position[0] + Math.cos(m.rot * DEG) * Math.min(m.radius, 8), m.position[2] + Math.sin(m.rot * DEG) * Math.min(m.radius, 8)]);
    g.strokeStyle = info.color; g.lineWidth = 2; g.beginPath(); g.moveTo(o[0], o[1]); g.lineTo(e[0], e[1]); g.stroke();
  }
  drawMarkerShape(g, m.kind, o[0], o[1], hov ? 11 : 9, sel);
  if (v.k > 16) { g.font = '600 10px "Barlow Condensed"'; g.fillStyle = C2.text; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(m.name, o[0], o[1] + 22); }
}

function drawLight(dc: DrawCtx, id: ID) {
  const { g, view: v, scene: s } = dc;
  const l = s.lights[id];
  const sel = dc.selected.has(key('light', id));
  const o = toScreen(v, [l.position[0], l.position[2]]);
  if (l.kind === 'point' || l.kind === 'spot') { g.strokeStyle = hexA(l.color, 0.5); g.setLineDash([2, 5]); g.lineWidth = 1; g.beginPath(); g.arc(o[0], o[1], l.range * v.k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = sel ? C2.brass : l.color; g.fillStyle = hexA(l.color, 0.85); g.lineWidth = 1.5;
  g.beginPath(); g.arc(o[0], o[1], 5, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.moveTo(o[0] + Math.cos(a) * 8, o[1] + Math.sin(a) * 8); g.lineTo(o[0] + Math.cos(a) * 11.5, o[1] + Math.sin(a) * 11.5); } g.stroke();
  if (l.kind === 'spot') { const e = toScreen(v, [l.position[0] + Math.cos(l.rot * DEG) * l.range, l.position[2] + Math.sin(l.rot * DEG) * l.range]); g.beginPath(); g.moveTo(o[0], o[1]); g.lineTo(e[0], e[1]); g.stroke(); }
}

function drawLabels(dc: DrawCtx, id: ID) {
  const { g, view: v, scene: s } = dc;
  const r = s.rooms[id];
  if (v.k < 9) return;
  const c = toScreen(v, polygonCentroid(r.polygon));
  const inner = roomInnerSize(r);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = '600 13px "Barlow Condensed"'; g.fillStyle = C2.text; g.fillText(r.name.toUpperCase(), c[0], c[1] - 2);
  if (dc.opts.dims) {
    g.font = '500 10px "IBM Plex Mono"'; g.fillStyle = C2.textDim;
    g.fillText(`${inner.w.toFixed(1).replace('.', ',')} × ${inner.h.toFixed(1).replace('.', ',')} m · ${roomArea(r).toFixed(1).replace('.', ',')} m²`, c[0], c[1] + 12);
  }
}

export function drawDimensions(dc: DrawCtx, pts: Vec2[], closed = true, color = C2.brass) {
  const { g, view: v } = dc;
  g.font = '500 10px "IBM Plex Mono"'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = dist(a, b); if (L < 0.05) continue;
    const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const sp = toScreen(v, m);
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const text = fmtM(L, 2);
    const w = g.measureText(text).width + 8;
    g.fillStyle = 'rgba(29,27,23,.88)'; g.fillRect(sp[0] - w / 2 + uy * 0, sp[1] - 8 - 0, w, 16);
    g.fillStyle = color; g.fillText(text, sp[0], sp[1]);
    void ux;
  }
}

function hexA(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawPlan(dc: DrawCtx) {
  const { g, view: v, scene: s, floorId } = dc;
  g.save();
  g.fillStyle = C2.bg; g.fillRect(0, 0, v.w, v.h);
  if (dc.opts.showGrid) drawGrid(dc);

  // terreno
  if (s.terrain) {
    const t = s.terrain, c = terrainCanvas(t);
    const a = toScreen(v, t.origin);
    g.imageSmoothingEnabled = true; g.globalAlpha = 0.85;
    const [cx, cz] = cellSize(t);
    g.drawImage(c, a[0] - (cx * v.k) / 2, a[1] - (cz * v.k) / 2, (t.size[0] + cx) * v.k, (t.size[1] + cz) * v.k);
    g.globalAlpha = 1;
    g.strokeStyle = '#5b553f'; g.lineWidth = 1; g.strokeRect(a[0], a[1], t.size[0] * v.k, t.size[1] * v.k);
  }
  // imagens de referência
  for (const im of Object.values(s.refImages)) {
    if (im.floorId !== floorId) continue;
    const el = refImage(im.src, dc.invalidate);
    if (!el.complete || !el.naturalWidth) continue;
    const o = toScreen(v, im.position);
    g.save(); g.translate(o[0], o[1]); g.rotate(im.rot * DEG); g.globalAlpha = im.opacity;
    const w = im.width * v.k, h = w / im.aspect;
    g.drawImage(el, -w / 2, -h / 2, w, h);
    if (dc.selected.has(key('refImage', im.id))) { g.strokeStyle = C2.brass; g.setLineDash([6, 4]); g.strokeRect(-w / 2, -h / 2, w, h); g.setLineDash([]); }
    g.restore();
  }

  const sorted = floorsSorted(s);
  const idx = sorted.findIndex((f) => f.id === floorId);
  // pavimentos vizinhos em transparência (casca de cebola)
  for (const nb of [sorted[idx - 1], sorted[idx + 1]]) {
    if (!nb) continue;
    g.globalAlpha = 0.28;
    for (const w of Object.values(s.walls)) if (w.floorId === nb.id) drawWall(dc, w.id, true);
    for (const st of Object.values(s.stairs)) if (st.floorId === nb.id) drawStair(dc, st.id, true);
    g.globalAlpha = 1;
  }
  const vis = (kind: string, id: string) => !dc.hidden.has(key(kind, id)) && (!dc.isolate || dc.isolate.has(key(kind, id)));

  for (const r of Object.values(s.rooms)) if (r.floorId === floorId && !r.hidden && vis('room', r.id)) drawRoom(dc, r.id, false);
  for (const r of Object.values(s.rooms)) if (r.floorId === floorId && dc.selected.has(key('room', r.id))) {
    g.beginPath(); poly(g, v, r.polygon); g.strokeStyle = C2.brass; g.lineWidth = 2; g.setLineDash([7, 4]); g.stroke(); g.setLineDash([]);
  }
  for (const r of Object.values(s.rooms)) if (r.floorId === floorId && dc.hover === key('room', r.id) && !dc.selected.has(key('room', r.id))) { g.beginPath(); poly(g, v, r.polygon); g.strokeStyle = C2.hover; g.lineWidth = 1; g.stroke(); }

  // caminhos
  for (const pa of Object.values(s.paths)) {
    if (pa.floorId !== floorId || pa.points.length < 2) continue;
    g.strokeStyle = pa.kind === 'river' ? 'rgba(92,119,130,.8)' : pa.kind === 'road' ? 'rgba(120,114,100,.85)' : 'rgba(150,126,86,.8)';
    g.lineWidth = Math.max(2, pa.width * v.k); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); poly(g, v, pa.points, false); g.stroke();
    if (dc.selected.has(key('path', pa.id))) { g.strokeStyle = C2.brass; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath(); poly(g, v, pa.points, false); g.stroke(); g.setLineDash([]); pa.points.forEach((p) => { const sp = toScreen(v, p); g.fillStyle = C2.brass; g.fillRect(sp[0] - 3, sp[1] - 3, 6, 6); }); }
    g.lineCap = 'butt';
  }
  // distribuição (scatter)
  for (const sc of Object.values(s.scatter)) {
    if (sc.floorId !== floorId) continue;
    const def = getDef(sc.defId); const col = def?.parts[1]?.c ?? def?.parts[0]?.c ?? '#6a7a50';
    g.fillStyle = hexA(col, 0.8);
    const rad = Math.max(1.5, Math.min(7, ((def?.size[0] ?? 1) * v.k) / 2.4));
    for (const it of sc.items) { const p = toScreen(v, [it[0], it[1]]); if (p[0] < -10 || p[1] < -10 || p[0] > v.w + 10 || p[1] > v.h + 10) continue; g.beginPath(); g.arc(p[0], p[1], rad * it[3], 0, Math.PI * 2); g.fill(); }
    if (dc.selected.has(key('scatter', sc.id))) { g.strokeStyle = C2.brass; g.setLineDash([4, 4]); const b = polygonBounds(sc.items.map((i) => [i[0], i[1]] as Vec2)); const a = toScreen(v, [b.x0, b.y0]); g.strokeRect(a[0], a[1], b.w * v.k, b.h * v.k); g.setLineDash([]); }
  }

  for (const sh of Object.values(s.shapes)) if (sh.floorId === floorId && !sh.hidden && vis('shape', sh.id)) drawShape(dc, sh.id);
  for (const st of Object.values(s.stairs)) if (st.floorId === floorId && vis('stair', st.id)) drawStair(dc, st.id, false);
  for (const w of Object.values(s.walls)) if (w.floorId === floorId && !w.hidden && vis('wall', w.id)) drawWall(dc, w.id, false);
  for (const r of Object.values(s.rooms)) if (r.floorId === floorId && !r.hidden && vis('room', r.id)) drawLabels(dc, r.id);
  for (const p of Object.values(s.props)) if (p.floorId === floorId && !p.hidden && vis('prop', p.id)) drawProp(dc, p.id);

  // análise (por baixo dos marcadores)
  const ex = dc.extra;
  if (ex.nav && ex.nav.floorId === floorId) {
    const n = ex.nav;
    for (let j = 0; j < n.h; j++) for (let i = 0; i < n.w; i++) {
      const val = n.walk[j * n.w + i];
      if (!val) continue;
      const reach = n.reach ? n.reach[j * n.w + i] : 1;
      const p = toScreen(v, [n.origin[0] + i * n.cell, n.origin[1] + j * n.cell]);
      g.fillStyle = !reach ? 'rgba(196,85,63,.45)' : val === 2 ? 'rgba(216,160,64,.4)' : 'rgba(127,160,90,.2)';
      g.fillRect(p[0], p[1], n.cell * v.k + 0.5, n.cell * v.k + 0.5);
    }
  }
  if (ex.heat) {
    const h = ex.heat;
    for (let j = 0; j < h.h; j++) for (let i = 0; i < h.w; i++) {
      const val = h.data[j * h.w + i]; if (val <= 0) continue;
      const p = toScreen(v, [h.origin[0] + i * h.cell, h.origin[1] + j * h.cell]);
      const f = Math.min(1, val / h.max);
      g.fillStyle = `rgba(${Math.round(150 + 90 * f)},${Math.round(110 - 60 * f)},${Math.round(60 - 20 * f)},${0.12 + 0.55 * f})`;
      g.fillRect(p[0], p[1], h.cell * v.k + 0.5, h.cell * v.k + 0.5);
    }
  }
  if (ex.los) {
    g.beginPath(); poly(g, v, ex.los.poly); g.fillStyle = 'rgba(224,178,79,.14)'; g.fill(); g.strokeStyle = 'rgba(224,178,79,.6)'; g.lineWidth = 1; g.stroke();
    for (const t of ex.los.targets) { const p = toScreen(v, t.pos); g.strokeStyle = t.visible ? C2.green : C2.red; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 12, 0, Math.PI * 2); g.stroke(); g.fillStyle = t.visible ? C2.green : C2.red; g.font = '600 10px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText(t.visible ? 'visível' : 'oculto', p[0], p[1] - 16); }
    const o = toScreen(v, ex.los.origin); g.fillStyle = C2.brass; g.beginPath(); g.arc(o[0], o[1], 5, 0, Math.PI * 2); g.fill();
  }
  if (ex.routes) for (const r of ex.routes) {
    g.strokeStyle = r.kind === 'main' ? '#7fa05a' : r.kind === 'alt' ? '#6fa0b0' : '#c9a14a'; g.lineWidth = 3; g.setLineDash(r.kind === 'main' ? [] : [8, 5]); g.lineJoin = 'round';
    g.beginPath(); poly(g, v, r.pts, false); g.stroke(); g.setLineDash([]);
    if (r.label && r.pts.length) { const m = toScreen(v, r.pts[Math.floor(r.pts.length / 2)]); g.font = '600 11px "Barlow Condensed"'; g.fillStyle = g.strokeStyle; g.textAlign = 'center'; g.fillText(r.label, m[0], m[1] - 6); }
  }
  if (ex.ghostPath) {
    const pts = ex.ghostPath.pts.slice(0, ex.ghostPath.upto);
    g.strokeStyle = 'rgba(160,190,200,.8)'; g.lineWidth = 2; g.beginPath(); let started = false;
    for (const p of pts) { if (p[2] !== floorId) { started = false; continue; } const sp = toScreen(v, [p[0], p[1]]); if (!started) { g.moveTo(sp[0], sp[1]); started = true; } else g.lineTo(sp[0], sp[1]); }
    g.stroke();
    const last = pts[pts.length - 1];
    if (last && last[2] === floorId) { const sp = toScreen(v, [last[0], last[1]]); g.fillStyle = 'rgba(190,215,225,.95)'; g.beginPath(); g.arc(sp[0], sp[1], 7, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#17150f'; g.lineWidth = 2; g.stroke(); }
  }

  if (dc.opts.markers) for (const m of Object.values(s.markers)) if (m.floorId === floorId && vis('marker', m.id)) drawMarker(dc, m.id);
  for (const l of Object.values(s.lights)) if (l.floorId === floorId && vis('light', l.id)) drawLight(dc, l.id);
  for (const a of Object.values(s.annotations)) {
    if (a.floorId !== floorId) continue;
    const p = toScreen(v, a.position); const sel = dc.selected.has(key('annotation', a.id));
    g.font = '600 12px "Barlow Condensed"'; const w = g.measureText(a.text).width + 14;
    g.fillStyle = 'rgba(29,27,23,.9)'; g.strokeStyle = sel ? C2.brass : a.color; g.lineWidth = 1.5;
    g.beginPath(); g.rect(p[0] + 8, p[1] - 22, w, 20); g.fill(); g.stroke();
    g.fillStyle = a.color; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + 8, p[1] - 12); g.lineTo(p[0] + 8, p[1] - 4); g.closePath(); g.fill();
    g.fillStyle = C2.text; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(a.text, p[0] + 15, p[1] - 12);
  }
  if (dc.opts.warnings && ex.issues) {
    for (const i of ex.issues) {
      if (i.floorId && i.floorId !== floorId) continue;
      const p = toScreen(v, i.pos);
      g.fillStyle = i.sev === 'error' ? C2.red : i.sev === 'warn' ? '#d0a040' : '#6fa0b0'; g.strokeStyle = '#17150f'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(p[0], p[1] - 9); g.lineTo(p[0] + 8, p[1] + 6); g.lineTo(p[0] - 8, p[1] + 6); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#17150f'; g.font = '700 10px "Barlow Condensed"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', p[0], p[1] + 1);
    }
  }
  // dimensões de salas selecionadas
  for (const r of Object.values(s.rooms)) if (r.floorId === floorId && dc.selected.has(key('room', r.id)) && dc.opts.dims) drawDimensions(dc, r.polygon, true);

  // personagem sob o cursor
  if (dc.opts.character && dc.cursor) {
    const c = toScreen(v, dc.cursor);
    g.strokeStyle = 'rgba(224,178,79,.8)'; g.fillStyle = 'rgba(224,178,79,.12)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(c[0], c[1], dc.character.radius * v.k, 0, Math.PI * 2); g.fill(); g.stroke();
    g.setLineDash([3, 3]); g.beginPath(); g.arc(c[0], c[1], (dc.character.width / 2) * v.k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  g.restore();
}

export function nearestWallInfo(s: Scene, floorId: ID, p: Vec2, tolMeters: number) { return nearestWall(s, floorId, p, tolMeters); }
export const _unused = { rotate };
export type { EntityRef };
