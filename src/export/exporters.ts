/** Exportações puras (texto): testáveis sem navegador. GLB e PNG ficam no ExportDialog. */
import type { CharacterConfig, Scene } from '../core/types';
import { floorsSorted, roomArea, openingsOfWall, wallLength, wallDir } from '../core/scene';
import { polygonBounds } from '../core/math';
import { MARKER_INFO } from '../core/markerKinds';
import { getDef } from '../assets/props';
import { analyzeProgression } from '../analysis/progression';
import { openingSpan } from '../editor/rooms';

const esc = (v: unknown) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n');
const f = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

export function dimensionReportCsv(s: Scene): string {
  const rows: unknown[][] = [['Tipo', 'Nome', 'Pavimento', 'Largura (m)', 'Profundidade (m)', 'Altura (m)', 'Área (m²)', 'Observação']];
  for (const r of Object.values(s.rooms)) {
    const b = polygonBounds(r.polygon);
    const h = r.height ?? s.floors[r.floorId]?.height ?? 3;
    rows.push([r.kind === 'corridor' ? 'Corredor' : 'Ambiente', r.name, s.floors[r.floorId]?.name, f(b.x1 - b.x0), f(b.y1 - b.y0), f(h), f(roomArea(r), 1), r.polygon.length > 4 ? 'polígono irregular' : '']);
  }
  for (const o of Object.values(s.openings)) {
    const w = s.walls[o.wallId]; if (!w) continue;
    rows.push([o.kind === 'door' ? 'Porta' : o.kind === 'window' ? 'Janela' : 'Passagem', o.name, s.floors[w.floorId]?.name, f(o.width), '', f(o.height), '', o.sill ? `peitoril ${f(o.sill)} m` : '']);
  }
  for (const st of Object.values(s.stairs)) rows.push([st.kind === 'ramp' ? 'Rampa' : 'Escada', st.name ?? '', s.floors[st.floorId]?.name, f(st.width), f(st.run), f(st.rise), '', '']);
  return csv(rows);
}

export function propsListCsv(s: Scene): string {
  const rows: unknown[][] = [['Objeto', 'Nome', 'Categoria', 'Pavimento', 'X', 'Y (altura)', 'Z', 'Giro (°)', 'Escala', 'Gameplay', 'Requer']];
  for (const p of Object.values(s.props)) {
    const d = getDef(p.defId);
    rows.push([d?.name ?? p.defId, p.name, d?.category ?? '', s.floors[p.floorId]?.name, f(p.position[0]), f(p.position[1]), f(p.position[2]), f(p.rot, 0), f(p.scale), d?.gameplay ?? '', p.requires.map((id) => s.props[id]?.name ?? s.openings[id]?.name ?? id).join(' + ')]);
  }
  const tally = new Map<string, number>();
  for (const p of Object.values(s.props)) tally.set(getDef(p.defId)?.name ?? p.defId, (tally.get(getDef(p.defId)?.name ?? p.defId) ?? 0) + 1);
  rows.push([], ['RESUMO']);
  [...tally].sort((a, b) => b[1] - a[1]).forEach(([n, c]) => rows.push([n, c]));
  return csv(rows);
}

export function progressionJson(s: Scene, cfg: CharacterConfig): string {
  const p = analyzeProgression(s, cfg);
  return JSON.stringify({
    geradoEm: new Date().toISOString(),
    ok: p.ok, temInicio: p.hasStart, temSaida: p.hasExit, saidaAlcancada: p.exitReached,
    distanciaAteSaidaM: p.exitReached ? Math.round(p.pathLength * 10) / 10 : null,
    etapas: p.steps.map((x) => ({ ordem: x.order, tipo: x.kind, nome: x.label, distanciaM: Math.round(x.dist * 10) / 10 })),
    inalcancaveis: p.stuck.map((x) => ({ nome: x.name, motivo: x.reason })),
    ambientesInalcancaveis: p.unreachableRooms,
    marcadores: Object.values(s.markers).map((m) => ({ tipo: m.kind, rotulo: MARKER_INFO[m.kind].label, nome: m.name, pavimento: s.floors[m.floorId]?.name, x: m.position[0], z: m.position[2], raio: m.radius, descricao: m.description })),
    ritmo: s.pacing.map((b) => ({ nome: b.name, tensao: b.tension, minutos: b.minutes, emocao: b.emotion, gameplay: b.gameplay, narrativa: b.narrative })),
  }, null, 2);
}

/** Planta de um pavimento em SVG (1 m = 40 px). Paredes com aberturas reais, rótulos e marcadores. */
export function planSvg(s: Scene, floorId: string): string {
  const K = 40;
  const walls = Object.values(s.walls).filter((w) => w.floorId === floorId && !w.hidden);
  const rooms = Object.values(s.rooms).filter((r) => r.floorId === floorId);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  walls.forEach((w) => { grow(w.a[0], w.a[1]); grow(w.b[0], w.b[1]); });
  rooms.forEach((r) => r.polygon.forEach((p) => grow(p[0], p[1])));
  if (!Number.isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 10; }
  const pad = 1.5;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const W = (x1 - x0) * K, H = (y1 - y0) * K;
  const X = (x: number) => ((x - x0) * K).toFixed(1), Y = (y: number) => ((y - y0) * K).toFixed(1);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" font-family="Barlow Condensed, Arial, sans-serif">`);
  out.push(`<rect width="100%" height="100%" fill="#f3efe4"/>`);
  for (let gx = Math.ceil(x0); gx <= x1; gx++) out.push(`<line x1="${X(gx)}" y1="0" x2="${X(gx)}" y2="${H}" stroke="${gx % 5 === 0 ? '#cfc6ae' : '#e1dac7'}" stroke-width="${gx % 5 === 0 ? 1 : 0.5}"/>`);
  for (let gy = Math.ceil(y0); gy <= y1; gy++) out.push(`<line x1="0" y1="${Y(gy)}" x2="${W}" y2="${Y(gy)}" stroke="${gy % 5 === 0 ? '#cfc6ae' : '#e1dac7'}" stroke-width="${gy % 5 === 0 ? 1 : 0.5}"/>`);
  for (const r of rooms) {
    out.push(`<polygon points="${r.polygon.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="${s.sectors[r.sectorId ?? '']?.color ?? '#8a5a44'}" fill-opacity="0.16"/>`);
  }
  for (const w of walls) {
    const L = wallLength(w), d = wallDir(w);
    const ops = openingsOfWall(s, w.id).map((o) => ({ o, span: openingSpan(w, o) })).sort((a, b) => a.span[0] - b.span[0]);
    let cur = 0;
    const seg = (u0: number, u1: number) => { if (u1 - u0 < 1e-3) return; out.push(`<line x1="${X(w.a[0] + d[0] * u0)}" y1="${Y(w.a[1] + d[1] * u0)}" x2="${X(w.a[0] + d[0] * u1)}" y2="${Y(w.a[1] + d[1] * u1)}" stroke="#2a2722" stroke-width="${(w.thickness * K).toFixed(1)}" stroke-linecap="butt"/>`); };
    for (const { o, span } of ops) {
      seg(cur, span[0]); cur = span[1];
      const m0 = [w.a[0] + d[0] * span[0], w.a[1] + d[1] * span[0]], m1 = [w.a[0] + d[0] * span[1], w.a[1] + d[1] * span[1]];
      if (o.kind === 'window') out.push(`<line x1="${X(m0[0])}" y1="${Y(m0[1])}" x2="${X(m1[0])}" y2="${Y(m1[1])}" stroke="#5f7482" stroke-width="${(w.thickness * K * 0.4).toFixed(1)}"/>`);
      else if (o.kind === 'door') {
        const hinge = o.hinge === 'a' ? m0 : m1, free = o.hinge === 'a' ? m1 : m0;
        const nx = -d[1] * o.swing, ny = d[0] * o.swing;
        out.push(`<line x1="${X(hinge[0])}" y1="${Y(hinge[1])}" x2="${X(hinge[0] + nx * o.width)}" y2="${Y(hinge[1] + ny * o.width)}" stroke="#7a5a2a" stroke-width="2"/>`);
        out.push(`<path d="M${X(free[0])},${Y(free[1])} A${(o.width * K).toFixed(1)},${(o.width * K).toFixed(1)} 0 0 ${o.swing * (o.hinge === 'a' ? 1 : -1) > 0 ? 1 : 0} ${X(hinge[0] + nx * o.width)},${Y(hinge[1] + ny * o.width)}" fill="none" stroke="#a88b55" stroke-width="1" stroke-dasharray="3 3"/>`);
        if (o.logic.mode !== 'free') out.push(`<circle cx="${X((m0[0] + m1[0]) / 2)}" cy="${Y((m0[1] + m1[1]) / 2)}" r="4" fill="#c4553f"/>`);
      }
    }
    seg(cur, L);
  }
  for (const r of rooms) {
    const b = polygonBounds(r.polygon);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    out.push(`<text x="${X(cx)}" y="${Y(cy)}" text-anchor="middle" font-size="15" fill="#3a352b" letter-spacing="1">${xml(r.name.toUpperCase())}</text>`);
    out.push(`<text x="${X(cx)}" y="${(parseFloat(Y(cy)) + 14).toFixed(1)}" text-anchor="middle" font-size="11" fill="#7d7664">${f(b.x1 - b.x0, 1)} × ${f(b.y1 - b.y0, 1)} m · ${f(roomArea(r), 1)} m²</text>`);
  }
  for (const m of Object.values(s.markers)) {
    if (m.floorId !== floorId) continue;
    const i = MARKER_INFO[m.kind];
    out.push(`<circle cx="${X(m.position[0])}" cy="${Y(m.position[2])}" r="9" fill="${i.color}" stroke="#2a2722"/><text x="${X(m.position[0])}" y="${(parseFloat(Y(m.position[2])) + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#1d1b17">${xml(i.glyph)}</text>`);
  }
  // barra de escala 5 m
  out.push(`<g transform="translate(20,${(H - 22).toFixed(0)})"><line x2="${5 * K}" stroke="#2a2722" stroke-width="2"/><line y1="-4" y2="4" stroke="#2a2722" stroke-width="2"/><line x1="${5 * K}" x2="${5 * K}" y1="-4" y2="4" stroke="#2a2722" stroke-width="2"/><text y="-8" font-size="11" fill="#2a2722">5 m</text></g>`);
  out.push(`<text x="${(W - 12).toFixed(0)}" y="22" text-anchor="end" font-size="14" fill="#3a352b">${xml((s.floors[floorId]?.name ?? '').toUpperCase())}</text>`);
  out.push('</svg>');
  return out.join('\n');
}
const xml = (t: string) => t.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

export const floorList = (s: Scene) => floorsSorted(s).map((x) => ({ id: x.id, name: x.name }));
