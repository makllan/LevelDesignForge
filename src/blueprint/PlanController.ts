/**
 * Controlador de interação da planta: ferramentas, snap, seleção, arraste e alças.
 * Toda mudança passa por useScene.commit/preview (undo/redo + persistência).
 */
import { DEG, add, clamp, dist, dot, mul, norm, normalOf, planToLocal, polygonBounds, pointInPolygon, projectOnSegment, segmentIntersect, snap, sub, round } from '../core/math';
import type { EntityRef, ID, Scene, Vec2 } from '../core/types';
import { useScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { addCorridor, addOpening, addRoom, addRoomRect, addStandaloneWall, nearestWall, setRoomPolygon } from '../editor/rooms';
import { addLight, addMarker, addProp, addShape, addStair, expandGroups, translateEntities, rotateEntities, MOVABLE } from '../editor/actions';
import { hitTest, handlesFor, hitHandle, Handle } from './hit';
import { View, toWorld, zoomAt } from './view';
import { C2, DrawCtx, drawDimensions, drawMarkerShape } from './draw';
import { getDef } from '../assets/props';
import { propBounds } from '../geometry/colliders';
import { MARKER_INFO } from '../core/markerKinds';
import { nid } from '../core/ids';
import { sculpt, scatterPoints, carvePath, terrainHeight, makeTerrain } from '../geometry/terrain';
import { fmtM } from '../core/math';
import { getEntity, firstFloorId, sceneBounds } from '../core/scene';

export interface PlanHost {
  askText(label: string, def?: string): Promise<string | null>;
  askNumber(label: string, def: number): Promise<number | null>;
  context(x: number, y: number, ref: EntityRef | null, world: Vec2): void;
  requestRedraw(): void;
}

type St =
  | { k: 'idle' }
  | { k: 'pan'; sx: number; sy: number; ox: number; oy: number; button: number; moved: boolean }
  | { k: 'marquee'; a: Vec2; b: Vec2; additive: boolean }
  | { k: 'move'; start: Vec2; refs: EntityRef[]; anchor: Vec2; moved: boolean; sx: number; sy: number }
  | { k: 'moveOpening'; id: ID; moved: boolean; sx: number; sy: number }
  | { k: 'handle'; h: Handle; start: Vec2; moved: boolean }
  | { k: 'rect'; a: Vec2; b: Vec2 }
  | { k: 'corridor'; a: Vec2; b: Vec2 }
  | { k: 'stair'; a: Vec2; b: Vec2 }
  | { k: 'hole'; a: Vec2; b: Vec2 }
  | { k: 'measure'; a: Vec2; b: Vec2 }
  | { k: 'brush'; last: Vec2 | null; terrain?: ReturnType<typeof makeTerrain>; groupId?: ID; items?: [number, number, number, number][]; seed: number }
  | { k: 'trace'; pts: Vec2[] };

const SNAP_PX = 12;

export class PlanController {
  view: View = { ox: 400, oy: 300, k: 40, w: 800, h: 600 };
  cursor: Vec2 | null = null;
  raw: Vec2 | null = null;
  hover: EntityRef | null = null;
  st: St = { k: 'idle' };
  poly: Vec2[] = [];
  chain: Vec2 | null = null;
  pathPts: Vec2[] = [];
  placeRot = 0;
  space = false;
  shift = false;
  alt = false;
  measureLast: { a: Vec2; b: Vec2 } | null = null;
  openingPreview: { wallId: ID; offset: number; ok: boolean; reason?: string; swing: 1 | -1 } | null = null;
  lastClick = 0;

  constructor(public host: PlanHost) {}

  private get scene(): Scene { return useScene.getState().project.scene; }
  private get ui() { return useUI.getState(); }
  private get settings() { return useScene.getState().project.settings; }
  private get floorId(): ID {
    const s = this.scene; const f = this.ui.floorId;
    return s.floors[f] ? f : firstFloorId(s);
  }
  private world(sx: number, sy: number): Vec2 { return toWorld(this.view, sx, sy); }
  private tol(px = 8) { return px / this.view.k; }

  // ------------------------------------------------------------------ snap
  snapPoint(p: Vec2, anchor?: Vec2 | null, noMagnet = false): Vec2 {
    const step = this.settings.snap;
    let q: Vec2 = this.alt ? p : [snap(p[0], step), snap(p[1], step)];
    if (this.settings.magnet && !noMagnet && !this.alt) {
      const s = this.scene, fid = this.floorId, r = SNAP_PX / this.view.k;
      let best: Vec2 | null = null, bd = r;
      const test = (c: Vec2) => { const d = dist(c, p); if (d < bd) { bd = d; best = c; } };
      for (const w of Object.values(s.walls)) if (w.floorId === fid) { test(w.a); test(w.b); }
      for (const ro of Object.values(s.rooms)) if (ro.floorId === fid) ro.polygon.forEach(test);
      for (const pt of this.poly) test(pt);
      if (best) q = best;
    }
    if (this.shift && anchor) {
      const dx = q[0] - anchor[0], dz = q[1] - anchor[1];
      q = Math.abs(dx) >= Math.abs(dz) ? [q[0], anchor[1]] : [anchor[0], q[1]];
    }
    return [round(q[0], 4), round(q[1], 4)];
  }

  // ------------------------------------------------------------------ vista
  resize(w: number, h: number) { this.view = { ...this.view, w, h }; }
  setView(v: View) { this.view = v; this.host.requestRedraw(); }
  wheel(sx: number, sy: number, dy: number) { this.view = zoomAt(this.view, sx, sy, dy < 0 ? 1.15 : 1 / 1.15); this.host.requestRedraw(); }

  // ------------------------------------------------------------------ ponteiro
  down(sx: number, sy: number, button: number, mods: { shift: boolean; alt: boolean; ctrl: boolean; detail: number }) {
    this.shift = mods.shift; this.alt = mods.alt;
    const raw = this.world(sx, sy);
    this.raw = raw;
    const ui = this.ui;
    if (button === 1 || button === 2 || (button === 0 && this.space)) { this.st = { k: 'pan', sx, sy, ox: this.view.ox, oy: this.view.oy, button, moved: false }; return; }
    if (button !== 0) return;
    const p = this.snapPoint(raw);
    this.cursor = p;
    const dbl = mods.detail >= 2;

    switch (ui.tool) {
      case 'select': this.selectDown(raw, p, mods); break;
      case 'room': this.st = { k: 'rect', a: p, b: p }; break;
      case 'corridor': this.st = { k: 'corridor', a: p, b: p }; break;
      case 'hole': this.st = { k: 'hole', a: p, b: p }; break;
      case 'measure': this.st = { k: 'measure', a: p, b: p }; break;
      case 'stair': this.st = { k: 'stair', a: p, b: p }; break;
      case 'polyroom': {
        if (this.poly.length >= 3 && (dist(p, this.poly[0]) * this.view.k < 14 || dbl)) { this.finishPoly(); break; }
        const q = this.shift && this.poly.length ? this.snapPoint(raw, this.poly[this.poly.length - 1]) : p;
        if (!this.poly.length || dist(q, this.poly[this.poly.length - 1]) > 0.01) this.poly.push(q);
        break;
      }
      case 'wall': {
        if (!this.chain) { this.chain = p; break; }
        const q = this.snapPoint(raw, this.chain);
        if (dist(q, this.chain) >= 0.1) {
          const a = this.chain;
          const ids = useScene.getState().commit('Desenhar parede', (s) => addStandaloneWall(s, this.floorId, a, q));
          void ids; this.chain = dbl ? null : q;
        }
        break;
      }
      case 'door': case 'window': case 'arch': this.placeOpening(raw); break;
      case 'prop': this.placeProp(raw); break;
      case 'shape': this.placeSimple('shape', raw, p); break;
      case 'marker': case 'start': this.placeSimple('marker', raw, p); break;
      case 'light': this.placeSimple('light', raw, p); break;
      case 'note': void this.placeNote(p); break;
      case 'path': {
        if (dbl && this.pathPts.length >= 2) { this.finishPath(); break; }
        this.pathPts.push(p); break;
      }
      case 'sculpt': this.brushStart('sculpt', raw); break;
      case 'scatter': this.brushStart('scatter', raw); break;
      case 'trace': {
        const pts = this.st.k === 'trace' ? this.st.pts : [];
        pts.push(raw);
        this.st = { k: 'trace', pts };
        if (pts.length === 2) { void this.finishCalibrate(pts as [Vec2, Vec2]); this.st = { k: 'idle' }; }
        break;
      }
      default: break;
    }
    this.host.requestRedraw();
  }

  private selectDown(raw: Vec2, p: Vec2, mods: { shift: boolean; ctrl: boolean }) {
    const ui = this.ui, s = this.scene;
    const handles = handlesFor(s, ui.selection);
    const h = hitHandle(handles, raw, SNAP_PX * 1.2 / this.view.k);
    if (h) { this.st = { k: 'handle', h, start: raw, moved: false }; return; }
    const hit = hitTest(s, this.floorId, raw, this.tol(8));
    if (hit) {
      const key = `${hit.kind}:${hit.id}`;
      const inSel = ui.selection.some((r) => `${r.kind}:${r.id}` === key);
      if (mods.shift) { ui.select(expandGroups(s, [hit]), true); return; }
      if (!inSel) ui.select(expandGroups(s, [hit]));
      const sel = useUI.getState().selection;
      if (hit.kind === 'opening' && sel.length === 1) { this.st = { k: 'moveOpening', id: hit.id, moved: false, sx: 0, sy: 0 }; return; }
      const refs = sel.filter((r) => MOVABLE.includes(r.kind));
      if (refs.length) this.st = { k: 'move', start: raw, refs, anchor: this.anchorOf(refs[0]), moved: false, sx: raw[0], sy: raw[1] };
    } else {
      if (!mods.shift) ui.select([]);
      this.st = { k: 'marquee', a: raw, b: raw, additive: mods.shift };
    }
  }

  private anchorOf(r: EntityRef): Vec2 {
    const e = getEntity(this.scene, r) as any;
    if (!e) return [0, 0];
    if (r.kind === 'room') return e.polygon[0];
    if (r.kind === 'wall') return e.a;
    if (Array.isArray(e.position) && e.position.length === 3) return [e.position[0], e.position[2]];
    return e.position ?? [0, 0];
  }

  move(sx: number, sy: number, mods: { shift: boolean; alt: boolean }) {
    this.shift = mods.shift; this.alt = mods.alt;
    const raw = this.world(sx, sy);
    this.raw = raw;
    const st = this.st;
    const ui = this.ui;
    if (st.k === 'pan') {
      if (Math.hypot(sx - st.sx, sy - st.sy) > 3) st.moved = true;
      this.view = { ...this.view, ox: st.ox + (sx - st.sx), oy: st.oy + (sy - st.sy) };
      this.host.requestRedraw(); return;
    }
    const anchor = st.k === 'rect' || st.k === 'corridor' || st.k === 'hole' || st.k === 'stair' || st.k === 'measure' ? st.a : this.chain ?? (this.poly.length ? this.poly[this.poly.length - 1] : null);
    const p = this.snapPoint(raw, ui.tool === 'polyroom' || ui.tool === 'wall' || st.k === 'corridor' ? anchor : null);
    this.cursor = p;
    useUI.setState({ cursor: { x: p[0], z: p[1] } });

    switch (st.k) {
      case 'marquee': st.b = raw; break;
      case 'rect': case 'hole': st.b = this.shift ? this.square(st.a, p) : p; break;
      case 'corridor': case 'measure': st.b = p; break;
      case 'stair': st.b = p; break;
      case 'move': {
        if (!st.moved && Math.hypot(raw[0] - st.start[0], raw[1] - st.start[1]) * this.view.k < 4) break;
        st.moved = true;
        const target: Vec2 = this.alt ? [st.anchor[0] + raw[0] - st.start[0], st.anchor[1] + raw[1] - st.start[1]] : [snap(st.anchor[0] + raw[0] - st.start[0], this.settings.snap), snap(st.anchor[1] + raw[1] - st.start[1], this.settings.snap)];
        const dx = target[0] - st.anchor[0], dz = target[1] - st.anchor[1];
        useScene.getState().preview((s) => translateEntities(s, st.refs, dx, dz));
        break;
      }
      case 'moveOpening': {
        const o = this.scene.openings[st.id]; if (!o) break;
        const base = useScene.getState().base ?? this.scene;
        const w = base.walls[o.wallId]; if (!w) break;
        const pr = projectOnSegment(raw, w.a, w.b);
        const off = clamp(snap(pr.along, Math.min(0.25, this.settings.snap)), o.width / 2 + 0.05, dist(w.a, w.b) - o.width / 2 - 0.05);
        if (Math.abs(off - o.offset) > 1e-4 || st.moved) { st.moved = true; useScene.getState().preview((s) => { const oo = s.openings[st.id]; if (!oo) return; const clash = Object.values(s.openings).some((q) => q.id !== oo.id && q.wallId === oo.wallId && Math.abs(q.offset - off) < (q.width + oo.width) / 2 + 0.02); if (!clash) oo.offset = off; }); }
        break;
      }
      case 'handle': this.dragHandle(st, raw, p); break;
      case 'brush': this.brushMove(raw); break;
      default: break;
    }
    // pré-visualização de abertura
    if (ui.tool === 'door' || ui.tool === 'window' || ui.tool === 'arch') this.updateOpeningPreview(raw); else this.openingPreview = null;
    if (ui.tool === 'select' && st.k === 'idle') {
      const h = hitTest(this.scene, this.floorId, raw, this.tol(8));
      if (h?.id !== this.hover?.id || h?.kind !== this.hover?.kind) { this.hover = h; useUI.setState({ hint: h ? `${h.kind}` : '' }); }
    }
    this.host.requestRedraw();
  }

  private square(a: Vec2, p: Vec2): Vec2 { const d = Math.max(Math.abs(p[0] - a[0]), Math.abs(p[1] - a[1])); return [a[0] + Math.sign(p[0] - a[0] || 1) * d, a[1] + Math.sign(p[1] - a[1] || 1) * d]; }

  private dragHandle(st: Extract<St, { k: 'handle' }>, raw: Vec2, p: Vec2) {
    const base = useScene.getState().base ?? this.scene;
    const h = st.h;
    if (!st.moved && dist(raw, st.start) * this.view.k < 3) return;
    st.moved = true;
    if (h.type === 'vertex') {
      const room = base.rooms[h.roomId]; if (!room) return;
      const poly = room.polygon.map((q) => [...q] as Vec2);
      const n = poly.length;
      const neighbor = poly[(h.index + n - 1) % n];
      const q = this.shift ? this.snapPoint(raw, neighbor, true) : p;
      poly[h.index] = q;
      if (!this.valid(poly)) return;
      useScene.getState().preview((s) => { setRoomPolygon(s, h.roomId, poly); });
    } else if (h.type === 'edge') {
      const room = base.rooms[h.roomId]; if (!room) return;
      const n = room.polygon.length;
      const a = room.polygon[h.index], b = room.polygon[(h.index + 1) % n];
      const nrm = normalOf(a, b);
      const t = snap(dot(sub(raw, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), nrm), this.alt ? 0 : this.settings.snap);
      const poly = room.polygon.map((q) => [...q] as Vec2);
      poly[h.index] = add(a, mul(nrm, t)); poly[(h.index + 1) % n] = add(b, mul(nrm, t));
      if (!this.valid(poly)) return;
      useScene.getState().preview((s) => { setRoomPolygon(s, h.roomId, poly); });
    } else if (h.type === 'rotate') {
      const ang = (Math.atan2(raw[1] - h.center[1], raw[0] - h.center[0]) * 180) / Math.PI;
      const stp = this.alt ? 0 : 15;
      const k = h.ref.kind;
      let rot = k === 'prop' || k === 'shape' ? ang - 90 : ang;
      rot = stp ? Math.round(rot / stp) * stp : rot;
      rot = ((rot % 360) + 360) % 360;
      useScene.getState().preview((s) => { const e = getEntity(s, h.ref) as { rot: number } | undefined; if (e) e.rot = rot; });
    }
  }

  private valid(poly: Vec2[]): boolean {
    const n = poly.length;
    for (let i = 0; i < n; i++) { if (dist(poly[i], poly[(i + 1) % n]) < 0.2) return false; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segmentIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
    return true;
  }

  up(sx: number, sy: number, button: number, mods: { shift: boolean; alt: boolean }) {
    this.shift = mods.shift; this.alt = mods.alt;
    const st = this.st;
    const raw = this.world(sx, sy);
    const ui = this.ui;
    this.st = { k: 'idle' };
    switch (st.k) {
      case 'pan':
        if (st.button === 2 && !st.moved) { const hit = hitTest(this.scene, this.floorId, raw, this.tol(8)); if (hit && !ui.selection.some((r) => r.id === hit.id)) ui.select(expandGroups(this.scene, [hit])); this.host.context(sx, sy, hit, raw); }
        break;
      case 'marquee': {
        const b = polygonBounds([st.a, st.b]);
        if (b.w * this.view.k > 4 || b.h * this.view.k > 4) ui.select(this.inRect(b), st.additive);
        break;
      }
      case 'move': if (st.moved) useScene.getState().endPreview('Mover'); break;
      case 'moveOpening': if (st.moved) useScene.getState().endPreview('Mover abertura'); break;
      case 'handle': if (st.moved) useScene.getState().endPreview(st.h.type === 'rotate' ? 'Girar' : 'Redimensionar sala'); break;
      case 'rect': {
        const b = polygonBounds([st.a, st.b]);
        if (b.w >= 0.5 && b.h >= 0.5) {
          const id = useScene.getState().commit('Criar sala', (s) => addRoomRect(s, this.floorId, b.x0, b.y0, b.w, b.h, { sectorId: ui.sectorId || undefined }));
          ui.select([{ kind: 'room', id }]);
          ui.set({ hint: 'Sala criada. Use as ferramentas de porta para abrir passagens.' });
        }
        break;
      }
      case 'corridor': {
        let a = st.a, b = st.b;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        if (Math.hypot(dx, dz) >= 1) {
          const ang = Math.abs((Math.atan2(dz, dx) * 180) / Math.PI) % 90;
          if (ang < 7 || ang > 83) b = Math.abs(dx) >= Math.abs(dz) ? [b[0], a[1]] : [a[0], b[1]];
          const id = useScene.getState().commit('Criar corredor', (s) => addCorridor(s, this.floorId, a, b, ui.place.corridorWidth, { sectorId: ui.sectorId || undefined }));
          if (id) ui.select([{ kind: 'room', id }]);
        }
        void a; break;
      }
      case 'hole': {
        const b = polygonBounds([st.a, st.b]);
        if (b.w >= 0.3 && b.h >= 0.3) this.addHole(b);
        break;
      }
      case 'stair': this.finishStair(st); break;
      case 'measure': this.measureLast = { a: st.a, b: st.b }; break;
      case 'brush': this.brushEnd(st); break;
      default: break;
    }
    this.host.requestRedraw();
  }

  private inRect(b: { x0: number; y0: number; x1: number; y1: number }): EntityRef[] {
    const s = this.scene, fid = this.floorId, out: EntityRef[] = [];
    const inside = (p: Vec2) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
    for (const r of Object.values(s.rooms)) if (r.floorId === fid) { const rb = polygonBounds(r.polygon); if (rb.x0 >= b.x0 && rb.x1 <= b.x1 && rb.y0 >= b.y0 && rb.y1 <= b.y1) out.push({ kind: 'room', id: r.id }); }
    for (const w of Object.values(s.walls)) if (w.floorId === fid && w.standalone && inside(w.a) && inside(w.b)) out.push({ kind: 'wall', id: w.id });
    for (const p of Object.values(s.props)) if (p.floorId === fid && inside([p.position[0], p.position[2]])) out.push({ kind: 'prop', id: p.id });
    for (const p of Object.values(s.shapes)) if (p.floorId === fid && inside([p.position[0], p.position[2]])) out.push({ kind: 'shape', id: p.id });
    for (const p of Object.values(s.stairs)) if (p.floorId === fid && inside(p.position)) out.push({ kind: 'stair', id: p.id });
    for (const p of Object.values(s.markers)) if (p.floorId === fid && inside([p.position[0], p.position[2]])) out.push({ kind: 'marker', id: p.id });
    for (const p of Object.values(s.lights)) if (p.floorId === fid && inside([p.position[0], p.position[2]])) out.push({ kind: 'light', id: p.id });
    for (const p of Object.values(s.annotations)) if (p.floorId === fid && inside(p.position)) out.push({ kind: 'annotation', id: p.id });
    return expandGroups(s, out);
  }

  doubleClick() { if (this.ui.tool === 'polyroom' && this.poly.length >= 3) this.finishPoly(); if (this.ui.tool === 'path' && this.pathPts.length >= 2) this.finishPath(); if (this.ui.tool === 'wall') this.chain = null; }

  // ------------------------------------------------------------------ criação
  finishPoly() {
    const poly = this.poly.slice();
    this.poly = [];
    if (poly.length < 3) return;
    if (!this.valid(poly)) { this.ui.toast('O contorno se cruza ou tem lados muito curtos. Redesenhe.', 'warn'); return; }
    const id = useScene.getState().commit('Criar sala irregular', (s) => addRoom(s, { floorId: this.floorId, polygon: poly, sectorId: this.ui.sectorId || undefined }));
    this.ui.select([{ kind: 'room', id }]);
  }

  finishPath() {
    const pts = this.pathPts.slice(); this.pathPts = [];
    if (pts.length < 2) return;
    const kind = this.ui.place.pathKind;
    const id = useScene.getState().commit('Criar caminho', (s) => {
      const pid = nid('path');
      s.paths[pid] = { id: pid, name: `${kind === 'river' ? 'Rio' : kind === 'road' ? 'Estrada' : 'Trilha'} ${Object.keys(s.paths).length + 1}`, kind, width: kind === 'road' ? 4 : kind === 'river' ? 5 : 1.6, points: pts, carve: kind === 'river' ? 0.9 : 0.12, floorId: this.floorId };
      if (s.terrain) { const pa = s.paths[pid]; s.terrain = carvePath(s.terrain, pts, pa.width * (kind === 'river' ? 0.9 : 0.7), pa.carve, kind !== 'river'); }
      return pid;
    });
    this.ui.select([{ kind: 'path', id }]);
  }

  private addHole(b: { x0: number; y0: number; x1: number; y1: number }) {
    const poly: Vec2[] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
    const s = this.scene;
    const room = Object.values(s.rooms).find((r) => r.floorId === this.floorId && poly.every((p) => pointInPolygon(p, r.polygon)));
    if (!room) { this.ui.toast('O buraco precisa ficar inteiro dentro de uma sala.', 'warn'); return; }
    useScene.getState().commit('Abrir buraco no piso', (d) => { d.rooms[room.id].holes.push(poly); });
    this.ui.toast('Buraco aberto no piso. Pé-direito duplo: aumente a altura da sala.', 'ok');
  }

  private finishStair(st: Extract<St, { k: 'stair' }>) {
    const ui = this.ui, s = this.scene;
    const fl = s.floors[this.floorId];
    const isRamp = ui.place.stairKind === 'ramp';
    let rot = 0, run = 0;
    const d = dist(st.a, st.b);
    if (d < 0.8) { rot = 0; run = 0; }
    else { rot = (Math.atan2(st.b[1] - st.a[1], st.b[0] - st.a[0]) * 180) / Math.PI; rot = this.alt ? rot : Math.round(rot / 15) * 15; run = snap(d, 0.1); }
    const rise = fl?.height ?? 3;
    const id = useScene.getState().commit(isRamp ? 'Criar rampa' : 'Criar escada', (sc) => {
      const steps = Math.max(2, Math.round(rise / 0.18));
      return addStair(sc, this.floorId, st.a[0], st.a[1], rot, isRamp ? { kind: 'ramp', rise, run: run || rise * 6, steps: 0 } : { rise, run: run || steps * 0.27, steps });
    });
    ui.select([{ kind: 'stair', id }]);
  }

  private async placeNote(p: Vec2) {
    const text = await this.host.askText('Texto da anotação', '');
    if (!text) return;
    const id = useScene.getState().commit('Criar anotação', (s) => { const a = nid('note'); s.annotations[a] = { id: a, floorId: this.floorId, position: p, text, color: '#c9a14a' }; return a; });
    this.ui.select([{ kind: 'annotation', id }]);
  }

  private placeSimple(kind: 'shape' | 'marker' | 'light', raw: Vec2, p: Vec2) {
    const ui = this.ui, fid = this.floorId;
    if (kind === 'shape') {
      const sk = ui.place.shapeKind ?? 'cube';
      const id = useScene.getState().commit('Criar forma', (s) => addShape(s, sk, fid, p[0], p[1]));
      ui.select([{ kind: 'shape', id }]);
    } else if (kind === 'marker') {
      const mk = ui.tool === 'start' ? 'start' : ui.place.markerKind ?? 'poi';
      const id = useScene.getState().commit(mk === 'start' ? 'Posicionar início' : 'Criar marcador', (s) => addMarker(s, mk, fid, p[0], p[1]));
      ui.select([{ kind: 'marker', id }]);
      if (mk === 'start') ui.toast('Ponto inicial definido. F5 inicia o teste a partir dele.', 'ok');
    } else {
      const lk = ui.place.lightKind ?? 'point';
      const id = useScene.getState().commit('Criar luz', (s) => addLight(s, lk, fid, p[0], p[1]));
      ui.select([{ kind: 'light', id }]);
    }
    void raw;
  }

  /** Cálculo do encaixe de mobiliário na parede mais próxima. */
  propPlacement(raw: Vec2, defId: string): { pos: Vec2; rot: number; snapped: boolean } {
    const def = getDef(defId);
    const p = this.snapPoint(raw, null, true);
    const rot = this.placeRot;
    const furn = def && ['office', 'industrial', 'medical', 'religious', 'containment'].includes(def.category) && def.collider !== 'none' && (def.y0 ?? 0) < 0.5;
    if (!furn || !this.settings.magnet || this.alt) return { pos: p, rot, snapped: false };
    const s = this.scene, fid = this.floorId;
    const nw = nearestWall(s, fid, raw, 0.9);
    if (!nw) return { pos: p, rot, snapped: false };
    const w = nw.wall;
    const n = normalOf(w.a, w.b);
    const side = dot(sub(raw, nw.point), n) >= 0 ? 1 : -1;
    const ns = mul(n, side);
    const b = propBounds(defId);
    const back = Math.abs(b.min[2]);
    const along = snap(nw.along, Math.min(0.25, this.settings.snap));
    const dir = norm(sub(w.b, w.a));
    const base = add(w.a, mul(dir, clamp(along, 0, dist(w.a, w.b))));
    const pos = add(base, mul(ns, w.thickness / 2 + back + 0.01));
    const prot = (Math.atan2(ns[1], ns[0]) * 180) / Math.PI - 90;
    return { pos: [round(pos[0], 3), round(pos[1], 3)], rot: ((Math.round(prot) % 360) + 360) % 360, snapped: true };
  }

  private placeProp(raw: Vec2) {
    const ui = this.ui, defId = ui.place.propId;
    if (!defId) return;
    const pl = this.propPlacement(raw, defId);
    const id = useScene.getState().commit('Posicionar objeto', (s) => addProp(s, defId, this.floorId, pl.pos[0], pl.pos[1], { rot: pl.rot }));
    ui.pushRecent(defId);
    ui.select([{ kind: 'prop', id }]);
  }

  private placeOpening(raw: Vec2) {
    this.updateOpeningPreview(raw);
    const pv = this.openingPreview;
    if (!pv) return;
    if (!pv.ok) { this.ui.toast(pv.reason ?? 'Não foi possível inserir aqui.', 'warn'); return; }
    const kind = this.ui.tool as 'door' | 'window' | 'arch';
    const width = this.ui.place.openingWidth;
    const id = useScene.getState().commit(`Inserir ${kind === 'door' ? 'porta' : kind === 'window' ? 'janela' : 'passagem'}`, (s) => {
      const r = addOpening(s, pv.wallId, pv.offset, { kind, width: width || undefined });
      if (r.id) s.openings[r.id].swing = pv.swing;
      return r.id;
    });
    if (id) this.ui.select([{ kind: 'opening', id }]);
  }

  private updateOpeningPreview(raw: Vec2) {
    const s = this.scene, kind = this.ui.tool as 'door' | 'window' | 'arch';
    const nw = nearestWall(s, this.floorId, raw, 0.5);
    if (!nw) { this.openingPreview = null; return; }
    const w = nw.wall;
    const width = this.ui.place.openingWidth || (kind === 'door' ? 1 : kind === 'window' ? 1.2 : 1.6);
    const L = dist(w.a, w.b);
    const n = normalOf(w.a, w.b);
    const swing: 1 | -1 = dot(sub(raw, nw.point), n) >= 0 ? 1 : -1;
    if (L < width + 0.1) { this.openingPreview = { wallId: w.id, offset: L / 2, ok: false, reason: `Parede curta demais (${fmtM(L)}) para ${fmtM(width)}.`, swing }; return; }
    const offset = clamp(snap(nw.along, Math.min(0.25, this.settings.snap)), width / 2 + 0.05, L - width / 2 - 0.05);
    const clash = Object.values(s.openings).find((o) => o.wallId === w.id && Math.abs(o.offset - offset) < (o.width + width) / 2 + 0.05);
    this.openingPreview = { wallId: w.id, offset, ok: !clash, reason: clash ? `Já existe "${clash.name}" neste ponto.` : undefined, swing };
  }

  // ------------------------------------------------------------------ pincéis (terreno)
  private brushStart(kind: 'sculpt' | 'scatter', raw: Vec2) {
    const s = this.scene;
    if (kind === 'sculpt' && !s.terrain) { this.ui.toast('Crie um terreno primeiro (painel Paisagem).', 'warn'); return; }
    this.st = { k: 'brush', last: null, seed: Math.floor(Math.random() * 1e6), terrain: s.terrain ?? undefined };
    this.brushMove(raw, true);
  }
  private brushMove(raw: Vec2, first = false) {
    const st = this.st; if (st.k !== 'brush') return;
    const ui = this.ui, pl = ui.place;
    if (st.last && dist(st.last, raw) < pl.brushRadius * 0.18 && !first) return;
    st.last = raw;
    if (ui.tool === 'sculpt' && st.terrain) {
      const mode = pl.brush ?? 'raise';
      const dirSign = this.alt && (mode === 'raise' || mode === 'lower') ? -1 : 1;
      const target = mode === 'flatten' ? (terrainHeight(st.terrain, raw[0], raw[1]) ?? 0) : undefined;
      if (mode === 'flatten') {
        if (st.groupId === undefined) (st as any).flatH = target; // alvo fixo = altura no início do traço
        const t = (st as any).flatH ?? target;
        st.terrain = sculpt(st.terrain, 'flatten', raw[0], raw[1], pl.brushRadius, pl.brushStrength, t);
      } else st.terrain = sculpt(st.terrain, dirSign < 0 ? (mode === 'raise' ? 'lower' : 'raise') : mode, raw[0], raw[1], pl.brushRadius, pl.brushStrength);
      const t = st.terrain;
      useScene.getState().preview((s) => { s.terrain = t; });
    } else if (ui.tool === 'scatter') {
      const def = pl.scatterDef; const fid = this.floorId;
      if (this.alt) {
        useScene.getState().preview((s) => { for (const g of Object.values(s.scatter)) { const keep = g.items.filter((it) => Math.hypot(it[0] - raw[0], it[1] - raw[1]) > pl.brushRadius); if (keep.length !== g.items.length) g.items = keep; } });
        return;
      }
      const existing: [number, number][] = [];
      for (const g of Object.values(this.scene.scatter)) for (const it of g.items) if (Math.hypot(it[0] - raw[0], it[1] - raw[1]) < pl.brushRadius + pl.scatterSpacing) existing.push([it[0], it[1]]);
      const count = Math.max(1, Math.round(pl.scatterDensity * (pl.brushRadius / 4)));
      const sceneNow = this.scene;
      const pts = scatterPoints({
        cx: raw[0], cz: raw[1], radius: pl.brushRadius, count, spacing: pl.scatterSpacing, seed: st.seed++, rotVar: 1, scaleMin: 1 - pl.scatterScaleVar, scaleMax: 1 + pl.scatterScaleVar, existing,
        avoid: (x, z) => !!Object.values(sceneNow.rooms).some((r) => r.floorId === fid && pointInPolygon([x, z], r.polygon)),
      });
      if (!pts.length) return;
      st.items = [...(st.items ?? []), ...pts];
      const items = st.items;
      if (!st.groupId) st.groupId = nid('scat');
      const gid = st.groupId;
      useScene.getState().preview((s) => { s.scatter[gid] = { id: gid, name: `Distribuição (${getDef(def)?.name ?? def})`, defId: def, floorId: fid, items }; });
    }
  }
  private brushEnd(st: Extract<St, { k: 'brush' }>) {
    useScene.getState().endPreview(this.ui.tool === 'sculpt' ? 'Esculpir terreno' : this.alt ? 'Apagar distribuição' : 'Distribuir objetos');
    void st;
  }

  private async finishCalibrate(pts: [Vec2, Vec2]) {
    const sel = this.ui.selection.find((r) => r.kind === 'refImage') ?? { kind: 'refImage' as const, id: Object.values(this.scene.refImages).find((i) => i.floorId === this.floorId)?.id ?? '' };
    const im = this.scene.refImages[sel.id];
    if (!im) { this.ui.toast('Importe uma imagem de referência antes de calibrar.', 'warn'); return; }
    const real = await this.host.askNumber('Distância real entre os dois pontos (m)', 1);
    if (!real || real <= 0) return;
    const cur = dist(pts[0], pts[1]);
    const k = real / cur;
    useScene.getState().commit('Calibrar referência', (s) => {
      const i = s.refImages[sel.id]; if (!i) return;
      i.width = round(i.width * k, 4);
      i.position = [pts[0][0] + (i.position[0] - pts[0][0]) * k, pts[0][1] + (i.position[1] - pts[0][1]) * k];
    });
    this.ui.toast(`Imagem calibrada: escala ×${k.toFixed(3)}.`, 'ok');
  }

  // ------------------------------------------------------------------ teclado
  key(e: KeyboardEvent): boolean {
    const ui = this.ui;
    if (e.key === 'Escape') {
      if (this.poly.length || this.chain || this.pathPts.length || this.st.k !== 'idle') { this.poly = []; this.chain = null; this.pathPts = []; if (useScene.getState().base) useScene.getState().cancelPreview(); this.st = { k: 'idle' }; this.host.requestRedraw(); return true; }
      if (ui.tool !== 'select') { ui.setTool('select'); return true; }
      if (ui.selection.length) { ui.select([]); return true; }
      return false;
    }
    if (e.key === 'Enter') { if (ui.tool === 'polyroom') { this.finishPoly(); return true; } if (ui.tool === 'path') { this.finishPath(); return true; } if (ui.tool === 'wall') { this.chain = null; return true; } }
    if (e.key === 'Backspace' && ui.tool === 'polyroom' && this.poly.length) { this.poly.pop(); this.host.requestRedraw(); return true; }
    if ((e.key === ',' || e.key === '.') && ui.tool === 'prop') { this.placeRot = (this.placeRot + (e.key === '.' ? 15 : -15) + 360) % 360; this.host.requestRedraw(); return true; }
    if (e.key === ' ') { this.space = true; return true; }
    return false;
  }
  keyUp(e: KeyboardEvent) { if (e.key === ' ') this.space = false; }

  // ------------------------------------------------------------------ rascunhos
  drawOverlay(dc: DrawCtx) {
    const { g, view: v } = dc;
    const toS = (p: Vec2): Vec2 => [v.ox + p[0] * v.k, v.oy + p[1] * v.k];
    const st = this.st, ui = this.ui;
    g.save();
    const dashed = (fn: () => void) => { g.setLineDash([6, 4]); fn(); g.setLineDash([]); };
    g.lineWidth = 1.5; g.strokeStyle = C2.brass; g.fillStyle = 'rgba(224,178,79,.1)';
    if (st.k === 'marquee') { const b = polygonBounds([st.a, st.b]); const a = toS([b.x0, b.y0]); g.fillRect(a[0], a[1], b.w * v.k, b.h * v.k); dashed(() => g.strokeRect(a[0], a[1], b.w * v.k, b.h * v.k)); }
    if (st.k === 'rect' || st.k === 'hole') {
      const b = polygonBounds([st.a, st.b]); const a = toS([b.x0, b.y0]);
      g.fillStyle = st.k === 'hole' ? 'rgba(196,85,63,.2)' : 'rgba(224,178,79,.14)'; g.fillRect(a[0], a[1], b.w * v.k, b.h * v.k); g.strokeRect(a[0], a[1], b.w * v.k, b.h * v.k);
      this.sizeTag(g, toS([b.x1, b.y1]), `${fmtM(b.w)} × ${fmtM(b.h)}  ·  ${(b.w * b.h).toFixed(1).replace('.', ',')} m²`);
    }
    if (st.k === 'corridor') {
      const w = ui.place.corridorWidth, L = dist(st.a, st.b);
      if (L > 0.1) {
        const dir = norm(sub(st.b, st.a)), n: Vec2 = [-dir[1], dir[0]];
        const q = [add(st.a, mul(n, w / 2)), add(st.b, mul(n, w / 2)), sub(st.b, mul(n, w / 2)), sub(st.a, mul(n, w / 2))].map(toS);
        g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); g.stroke();
        this.sizeTag(g, toS(st.b), `${fmtM(L)} × ${fmtM(w)}`);
      }
    }
    if (st.k === 'measure' || (ui.tool === 'measure' && this.measureLast)) {
      const m = st.k === 'measure' ? { a: st.a, b: st.b } : this.measureLast!;
      const a = toS(m.a), b = toS(m.b);
      g.strokeStyle = '#e8dcbc'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
      for (const p of [a, b]) { g.fillStyle = '#e8dcbc'; g.fillRect(p[0] - 3, p[1] - 3, 6, 6); }
      this.sizeTag(g, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fmtM(dist(m.a, m.b)) + `  (Δx ${fmtM(Math.abs(m.b[0] - m.a[0]))}, Δz ${fmtM(Math.abs(m.b[1] - m.a[1]))})`);
    }
    if (st.k === 'stair') {
      const d = dist(st.a, st.b);
      const rot = d < 0.8 ? 0 : Math.atan2(st.b[1] - st.a[1], st.b[0] - st.a[0]);
      const fl = dc.scene.floors[dc.floorId]; const rise = fl?.height ?? 3;
      const run = d < 0.8 ? (ui.place.stairKind === 'ramp' ? rise * 6 : Math.max(2, Math.round(rise / 0.18)) * 0.27) : d;
      const w = 1.2, a = toS(st.a);
      g.translate(a[0], a[1]); g.rotate(rot); g.fillRect(0, -w / 2 * v.k, run * v.k, w * v.k); g.strokeRect(0, -w / 2 * v.k, run * v.k, w * v.k); g.rotate(-rot); g.translate(-a[0], -a[1]);
      this.sizeTag(g, toS(st.b), `${fmtM(run)} → +${fmtM(rise)}`);
    }
    if (this.poly.length) {
      const pts = this.poly.concat(this.cursor ? [this.cursor] : []).map(toS);
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
      if (this.poly.length >= 3) { g.fillStyle = 'rgba(224,178,79,.1)'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); }
      this.poly.forEach((p, i) => { const sp = toS(p); g.fillStyle = i === 0 ? C2.green : C2.brass; g.fillRect(sp[0] - 4, sp[1] - 4, 8, 8); });
      drawDimensions(dc, this.cursor ? this.poly.concat([this.cursor]) : this.poly, false);
    }
    if (this.chain && this.cursor) {
      const a = toS(this.chain), b = toS(this.cursor);
      g.lineWidth = Math.max(2, 0.2 * v.k); g.strokeStyle = 'rgba(224,178,79,.55)'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.lineWidth = 1.5;
      this.sizeTag(g, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fmtM(dist(this.chain, this.cursor)));
    }
    if (this.pathPts.length) {
      const pts = this.pathPts.concat(this.cursor ? [this.cursor] : []).map(toS);
      g.strokeStyle = '#c9b27a'; g.setLineDash([6, 4]); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); g.setLineDash([]);
      this.pathPts.forEach((p) => { const sp = toS(p); g.fillStyle = C2.brass; g.fillRect(sp[0] - 3, sp[1] - 3, 6, 6); });
    }
    // pré-visualização de abertura
    const pv = this.openingPreview;
    if (pv && (ui.tool === 'door' || ui.tool === 'window' || ui.tool === 'arch')) {
      const w = dc.scene.walls[pv.wallId];
      if (w) {
        const dir = norm(sub(w.b, w.a)); const c = add(w.a, mul(dir, pv.offset));
        const width = ui.place.openingWidth || (ui.tool === 'door' ? 1 : ui.tool === 'window' ? 1.2 : 1.6);
        const a = toS(sub(c, mul(dir, width / 2))), b = toS(add(c, mul(dir, width / 2)));
        g.strokeStyle = pv.ok ? C2.green : C2.red; g.lineWidth = Math.max(4, w.thickness * v.k + 2); g.globalAlpha = 0.8;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.globalAlpha = 1; g.lineWidth = 1.5;
        if (!pv.ok && pv.reason) this.sizeTag(g, toS(c), pv.reason);
        else this.sizeTag(g, toS(c), `${fmtM(width)} · a ${fmtM(pv.offset)} do início`);
      }
    }
    // fantasma de objeto
    if (ui.tool === 'prop' && ui.place.propId && this.raw) {
      const pl = this.propPlacement(this.raw, ui.place.propId);
      const b = propBounds(ui.place.propId); const o = toS(pl.pos);
      g.save(); g.translate(o[0], o[1]); g.rotate(pl.rot * DEG); g.globalAlpha = 0.65; g.fillStyle = pl.snapped ? 'rgba(127,160,90,.5)' : 'rgba(224,178,79,.4)'; g.strokeStyle = pl.snapped ? C2.green : C2.brass;
      g.fillRect(b.min[0] * v.k, b.min[2] * v.k, (b.max[0] - b.min[0]) * v.k, (b.max[2] - b.min[2]) * v.k); g.strokeRect(b.min[0] * v.k, b.min[2] * v.k, (b.max[0] - b.min[0]) * v.k, (b.max[2] - b.min[2]) * v.k);
      g.restore(); g.globalAlpha = 1;
    }
    if ((ui.tool === 'marker' || ui.tool === 'start') && this.cursor) { const k = ui.tool === 'start' ? 'start' : ui.place.markerKind ?? 'poi'; const o = toS(this.cursor); g.globalAlpha = 0.7; drawMarkerShape(g, k, o[0], o[1], 9); g.globalAlpha = 1; void MARKER_INFO; }
    if (ui.tool === 'shape' && this.cursor) { const o = toS(this.cursor); g.strokeStyle = C2.brass; g.setLineDash([4, 3]); g.strokeRect(o[0] - v.k / 2, o[1] - v.k / 2, v.k, v.k); g.setLineDash([]); }
    if ((ui.tool === 'sculpt' || ui.tool === 'scatter') && this.raw) { const o = toS(this.raw); g.strokeStyle = ui.tool === 'sculpt' ? '#c9b27a' : '#8fb06a'; g.lineWidth = 1.5; g.beginPath(); g.arc(o[0], o[1], ui.place.brushRadius * v.k, 0, Math.PI * 2); g.stroke(); }
    if (ui.tool === 'trace' && this.st.k === 'trace') for (const p of this.st.pts) { const o = toS(p); g.fillStyle = C2.red; g.beginPath(); g.arc(o[0], o[1], 5, 0, Math.PI * 2); g.fill(); }
    // alças
    for (const h of handlesFor(dc.scene, ui.selection)) {
      const o = toS(h.at);
      g.fillStyle = h.type === 'vertex' ? C2.brass : h.type === 'edge' ? '#8d7a45' : '#d8d0bf'; g.strokeStyle = '#17150f'; g.lineWidth = 1.5;
      if (h.type === 'rotate') { const c = toS(h.center); g.strokeStyle = 'rgba(216,208,191,.5)'; g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(o[0], o[1]); g.stroke(); g.strokeStyle = '#17150f'; g.beginPath(); g.arc(o[0], o[1], 6, 0, Math.PI * 2); g.fill(); g.stroke(); }
      else if (h.type === 'vertex') { g.fillRect(o[0] - 5, o[1] - 5, 10, 10); g.strokeRect(o[0] - 5, o[1] - 5, 10, 10); }
      else { g.beginPath(); g.moveTo(o[0], o[1] - 5); g.lineTo(o[0] + 5, o[1]); g.lineTo(o[0], o[1] + 5); g.lineTo(o[0] - 5, o[1]); g.closePath(); g.fill(); g.stroke(); }
    }
    // indicador de snap
    if (this.cursor && !['select', 'sculpt', 'scatter'].includes(ui.tool)) { const o = toS(this.cursor); g.strokeStyle = 'rgba(224,178,79,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(o[0] - 7, o[1]); g.lineTo(o[0] + 7, o[1]); g.moveTo(o[0], o[1] - 7); g.lineTo(o[0], o[1] + 7); g.stroke(); }
    g.restore();
  }

  private sizeTag(g: CanvasRenderingContext2D, at: Vec2, text: string) {
    g.font = '500 11px "IBM Plex Mono"'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + 12;
    g.fillStyle = 'rgba(23,21,15,.92)'; g.strokeStyle = 'rgba(224,178,79,.6)'; g.lineWidth = 1;
    g.fillRect(at[0] + 12, at[1] + 6, w, 20); g.strokeRect(at[0] + 12.5, at[1] + 6.5, w, 20);
    g.fillStyle = '#e8dcbc'; g.fillText(text, at[0] + 18, at[1] + 16);
  }

  /** Enquadra tudo (ou a seleção). */
  fit(sel?: { x0: number; y0: number; x1: number; y1: number } | null) {
    const b = sel ?? sceneBounds(this.scene, this.floorId);
    const pad = 70;
    const w = Math.max(3, b.x1 - b.x0), h = Math.max(3, b.y1 - b.y0);
    const k = Math.min((this.view.w - pad * 2) / w, (this.view.h - pad * 2) / h, 70);
    this.view = { ...this.view, k, ox: this.view.w / 2 - ((b.x0 + b.x1) / 2) * k, oy: this.view.h / 2 - ((b.y0 + b.y1) / 2) * k };
    this.host.requestRedraw();
  }
}
export { rotateEntities, planToLocal };
