/**
 * Playtest Runtime — simulação sem DOM nem three.js (testável em Node).
 * Trabalha sobre uma CÓPIA da cena: nada do que acontece aqui altera o projeto.
 *
 * Convenções: yaw 0 olha para -Z (norte); positivo gira para a esquerda (anti-horário visto de cima),
 * igual à rotação Y do three.js. Y do jogador = altura absoluta dos PÉS.
 */
import type { CharacterConfig, ID, PlaytestEvent, PlaytestRecord, PlaytestSample, Scene, Vec2 } from '../core/types';
import { buildWorld, groundAt, pushOut, raycast, type World } from '../geometry/colliders';
import { getDef, gameplayLabel, type GameplayKind } from '../assets/props';
import { pointInPolygon, polygonCentroid } from '../core/math';
import { floorsSorted } from '../core/scene';
import { nid } from '../core/ids';

export interface PlayInput { fwd: number; strafe: number; run: boolean; jump: boolean; crouch: boolean; up: number }
export interface Interactable { kind: 'door' | 'prop'; id: ID; label: string; pos: [number, number, number]; prompt: string }

const GRAVITY = 22;
const INTERACT_RANGE = 2.3;

export class PlaySim {
  readonly scene: Scene;
  readonly cfg: CharacterConfig;
  readonly world: World;
  p = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vy: 0, grounded: true, crouch: false };
  noclip = false;
  collected = new Set<ID>();
  activated = new Set<ID>();
  removed = new Set<ID>();
  doors = new Map<ID, { amt: number; target: 0 | 1 }>();
  respawn = { x: 0, y: 0, z: 0, yaw: 0 };
  events: PlaytestEvent[] = [];
  samples: PlaytestSample[] = [];
  visited = new Set<ID>();
  reachedMarkers = new Set<ID>();
  completed = false;
  distance = 0;
  time = 0;
  message: { text: string; until: number } | null = null;
  private sampleT = 0;
  private startFrom: { x: number; z: number; floorId: ID } | null;
  /** callbacks visuais */
  onDoor?: (id: ID, amt: number) => void;
  onHide?: (kind: 'prop', id: ID, visible: boolean) => void;

  constructor(scene: Scene, cfg: CharacterConfig, from?: { x: number; z: number; floorId: ID } | null) {
    this.scene = JSON.parse(JSON.stringify(scene)) as Scene;
    this.cfg = cfg;
    this.world = buildWorld(this.scene);
    this.startFrom = from ?? null;
    for (const o of Object.values(this.scene.openings)) {
      if (o.kind !== 'door') continue;
      const open = !!o.logic.startOpen && !o.logic.fake;
      this.doors.set(o.id, { amt: open ? 1 : 0, target: open ? 1 : 0 });
      const b = this.world.doors.get(o.id); if (b) b.active = !open;
    }
    this.restart();
  }

  // ------------------------------------------------------------------ início / reinício
  startPoint(): { x: number; z: number; floorId: ID; yaw: number } {
    const s = this.scene;
    if (this.startFrom) return { ...this.startFrom, yaw: 0 };
    const m = Object.values(s.markers).find((k) => k.kind === 'start');
    if (m) return { x: m.position[0], z: m.position[2], floorId: m.floorId, yaw: Math.atan2(-Math.cos(m.rot * Math.PI / 180), -Math.sin(m.rot * Math.PI / 180)) };
    const r = Object.values(s.rooms)[0];
    if (r) { const c = polygonCentroid(r.polygon); return { x: c[0], z: c[1], floorId: r.floorId, yaw: 0 }; }
    const fl = floorsSorted(s)[0];
    const t = s.terrain;
    return { x: t ? t.origin[0] + t.size[0] / 2 : 0, z: t ? t.origin[1] + t.size[1] / 2 : 0, floorId: fl?.id ?? '', yaw: 0 };
  }

  restart() {
    const sp = this.startPoint();
    const elev = this.scene.floors[sp.floorId]?.elevation ?? 0;
    const g = groundAt(this.world, sp.x, sp.z, elev + this.cfg.stepHeight + 0.6);
    this.p = { x: sp.x, y: Number.isFinite(g) ? g : elev, z: sp.z, yaw: sp.yaw, pitch: 0, vy: 0, grounded: true, crouch: false };
    this.respawn = { x: this.p.x, y: this.p.y, z: this.p.z, yaw: this.p.yaw };
    this.collected.clear(); this.activated.clear(); this.removed.clear();
    for (const [id, st] of this.doors) { const o = this.scene.openings[id]; const open = !!o?.logic.startOpen && !o.logic.fake; st.amt = st.target = open ? 1 : 0; const b = this.world.doors.get(id); if (b) b.active = !open; this.onDoor?.(id, st.amt); }
    for (const [id, b] of this.world.blocks) { b.active = true; this.onHide?.('prop', id, true); }
    for (const p of Object.values(this.scene.props)) this.onHide?.('prop', p.id, true);
    this.events = []; this.samples = []; this.visited.clear(); this.reachedMarkers.clear();
    this.completed = false; this.distance = 0; this.time = 0; this.sampleT = 0;
    this.log('start', undefined, 'Início do teste');
  }

  // ------------------------------------------------------------------ consultas
  get height() { return this.cfg.height * (this.p.crouch ? 0.68 : 1); }
  get eyeY() { return this.p.y + this.cfg.eyeHeight * (this.p.crouch ? 0.68 : 1); }
  floorIdAt(): ID {
    const fl = floorsSorted(this.scene);
    let best = fl[0]?.id ?? '';
    for (const f of fl) if (f.elevation <= this.p.y + 0.45) best = f.id;
    return best;
  }
  roomAt(): ID | undefined {
    const fid = this.floorIdAt();
    const pt: Vec2 = [this.p.x, this.p.z];
    for (const r of Object.values(this.scene.rooms)) if (r.floorId === fid && pointInPolygon(pt, r.polygon) && !r.holes.some((h) => pointInPolygon(pt, h))) return r.id;
    return undefined;
  }
  private kindOf(propId: ID): GameplayKind | undefined { const p = this.scene.props[propId]; return p ? getDef(p.defId)?.gameplay : undefined; }
  private nameOf(propId: ID) { return this.scene.props[propId]?.name ?? 'objeto removido'; }

  /** Um requisito (objeto de gameplay) está cumprido? */
  satisfied(id: ID): boolean {
    const p = this.scene.props[id];
    if (!p) return false;
    switch (this.kindOf(id)) {
      case 'key': case 'card': case 'fuse': case 'pickup': return this.collected.has(id);
      case 'switch': case 'generator': case 'trigger': case 'objective': case 'checkpoint': case 'elevator': case 'exit': return this.activated.has(id);
      case 'block': case 'shortcut': return this.removed.has(id);
      default: return true;
    }
  }
  missing(ids: ID[]): ID[] { return ids.filter((i) => !this.satisfied(i)); }
  doorUnlocked(id: ID): boolean {
    const o = this.scene.openings[id]; if (!o) return false;
    if (o.logic.fake) return false;
    if (o.logic.mode === 'free') return true;
    if (o.logic.mode === 'locked') return false;
    return this.missing(o.logic.requires).length === 0;
  }
  /** Lado do jogador em relação à parede da porta: true = frente. */
  private sideOf(id: ID): boolean {
    const o = this.scene.openings[id]; const w = o && this.scene.walls[o.wallId]; const b = this.world.doors.get(id);
    if (!w || !b) return true;
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1];
    return (this.p.x - b.cx) * -dy + (this.p.z - b.cz) * dx >= 0;
  }

  interactables(): Interactable[] {
    const out: Interactable[] = [];
    for (const o of Object.values(this.scene.openings)) {
      if (o.kind !== 'door') continue;
      const b = this.world.doors.get(o.id); if (!b) continue;
      if (b.y0 > this.p.y + 3 || b.y1 < this.p.y - 0.5) continue;
      const open = (this.doors.get(o.id)?.target ?? 0) === 1;
      out.push({ kind: 'door', id: o.id, label: o.name, pos: [b.cx, (b.y0 + b.y1) / 2, b.cz], prompt: open ? 'Fechar porta' : 'Abrir porta' });
    }
    for (const p of Object.values(this.scene.props)) {
      const g = this.kindOf(p.id); if (!g) continue;
      if (this.removed.has(p.id)) continue;
      const def = getDef(p.defId)!;
      const elev = this.scene.floors[p.floorId]?.elevation ?? 0;
      const pos: [number, number, number] = [p.position[0], elev + p.position[1] + (def.size[1] * p.scale) / 2, p.position[2]];
      let prompt: string | null = null;
      if (['key', 'card', 'fuse', 'pickup'].includes(g)) { if (!this.collected.has(p.id)) prompt = `Pegar: ${p.name}`; }
      else if (['switch', 'generator'].includes(g)) prompt = this.activated.has(p.id) ? null : `Acionar: ${p.name}`;
      else if (g === 'block' || g === 'shortcut') prompt = `Interagir: ${p.name}`;
      else if (g === 'exit' || g === 'elevator') prompt = `Usar: ${p.name}`;
      else if (g === 'objective') prompt = this.activated.has(p.id) ? null : `Concluir: ${p.name}`;
      if (prompt) out.push({ kind: 'prop', id: p.id, label: p.name, pos, prompt });
    }
    return out;
  }

  /** O que está sob a mira (para o prompt "E"). */
  focus(): Interactable | null {
    let best: Interactable | null = null, bestScore = Infinity;
    const fx = -Math.sin(this.p.yaw), fz = -Math.cos(this.p.yaw);
    for (const it of this.interactables()) {
      const dx = it.pos[0] - this.p.x, dz = it.pos[2] - this.p.z;
      const d = Math.hypot(dx, dz);
      if (d > INTERACT_RANGE || Math.abs(it.pos[1] - (this.p.y + 1)) > 2.2) continue;
      const cos = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (cos < 0.55 && d > 0.9) continue;
      const score = d + (1 - cos) * 2;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  // ------------------------------------------------------------------ ações
  say(text: string, secs = 2.6) { this.message = { text, until: this.time + secs }; }
  private log(type: string, ref: ID | undefined, label: string) { this.events.push({ t: Math.round(this.time * 100) / 100, type, ref, label }); }

  private unmetText(ids: ID[]) { return this.missing(ids).map((i) => this.nameOf(i)).join(', '); }

  interact(): string {
    const f = this.focus();
    if (!f) return '';
    if (f.kind === 'door') {
      const o = this.scene.openings[f.id]; const st = this.doors.get(f.id)!;
      if (st.target === 1) { st.target = 0; this.log('door', f.id, `Fechou ${o.name}`); return 'Porta fechada.'; }
      if (o.logic.fake) { this.say('Esta porta não abre.'); this.log('door-blocked', f.id, `${o.name}: porta falsa`); return this.message!.text; }
      const side = this.sideOf(f.id);
      if (o.logic.oneWay === 'front' && !side) { this.say('Não abre deste lado.'); this.log('door-blocked', f.id, `${o.name}: sentido único`); return this.message!.text; }
      if (o.logic.oneWay === 'back' && side) { this.say('Não abre deste lado.'); this.log('door-blocked', f.id, `${o.name}: sentido único`); return this.message!.text; }
      if (!this.doorUnlocked(f.id)) {
        const t = o.logic.mode === 'locked' ? 'Trancada.' : `Trancada. Falta: ${this.unmetText(o.logic.requires)}.`;
        this.say(t); this.log('door-blocked', f.id, `${o.name}: ${t}`); return t;
      }
      st.target = 1; this.log('door', f.id, `Abriu ${o.name}`);
      return 'Porta aberta.';
    }
    const p = this.scene.props[f.id]; const g = this.kindOf(f.id)!;
    if (['key', 'card', 'fuse', 'pickup'].includes(g)) {
      this.collected.add(p.id); this.onHide?.('prop', p.id, false);
      this.say(`Pegou: ${p.name}`); this.log('pickup', p.id, `Pegou ${p.name}`); return `Pegou ${p.name}`;
    }
    if (p.requires.length && this.missing(p.requires).length) {
      const t = `${p.name}: falta ${this.unmetText(p.requires)}.`;
      this.say(t); this.log('blocked', p.id, t); return t;
    }
    if (g === 'switch' || g === 'generator' || g === 'objective') {
      this.activated.add(p.id); this.say(`${gameplayLabel(g)} ativado: ${p.name}`); this.log('activate', p.id, `Ativou ${p.name}`); return 'ok';
    }
    if (g === 'block' || g === 'shortcut') {
      this.removed.add(p.id); const b = this.world.blocks.get(p.id); if (b) b.active = false; this.onHide?.('prop', p.id, false);
      this.say(g === 'shortcut' ? `Atalho aberto: ${p.name}` : `Caminho liberado: ${p.name}`); this.log('unblock', p.id, `Liberou ${p.name}`); return 'ok';
    }
    if (g === 'exit' || g === 'elevator') { this.activated.add(p.id); this.completed = true; this.say('Saída alcançada. Fim do teste.', 6); this.log('exit', p.id, `Chegou à saída: ${p.name}`); return 'exit'; }
    return '';
  }

  // ------------------------------------------------------------------ passo de simulação
  update(dt: number, inp: PlayInput) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const p = this.p, c = this.cfg;
    // agachar
    if (c.allowCrouch) {
      const want = inp.crouch;
      if (want !== p.crouch) {
        if (want) p.crouch = true;
        else if (!this.headBlocked()) p.crouch = false;
      }
    }
    // portas
    for (const [id, st] of this.doors) {
      if (st.amt === st.target) continue;
      const dir = st.target > st.amt ? 1 : -1;
      const nxt = Math.min(1, Math.max(0, st.amt + dir * dt / 0.55));
      const b = this.world.doors.get(id);
      if (b && dir < 0 && st.amt >= 0.3 && nxt < 0.3 && this.playerInBox(b)) { st.target = 1; continue; } // não fecha em cima do jogador
      st.amt = nxt;
      if (b) b.active = st.amt < 0.3;
      this.onDoor?.(id, st.amt);
    }
    // movimento
    const speedBase = inp.run && !p.crouch ? c.runSpeed : p.crouch ? c.walkSpeed * 0.55 : c.walkSpeed;
    const len = Math.hypot(inp.fwd, inp.strafe);
    const sx = len > 0 ? (inp.strafe / Math.max(1, len)) : 0, sf = len > 0 ? (inp.fwd / Math.max(1, len)) : 0;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const vx = (fx * sf + rx * sx) * speedBase, vz = (fz * sf + rz * sx) * speedBase;
    const dist = Math.hypot(vx, vz) * dt;
    if (this.noclip) {
      const fly = this.noclipSpeed(inp);
      p.x += vx * 2.2 * dt; p.z += vz * 2.2 * dt; p.y += inp.up * fly * dt; p.vy = 0; p.grounded = false;
    } else {
      const steps = Math.max(1, Math.ceil(dist / (c.radius * 0.5)));
      for (let i = 0; i < steps; i++) {
        let nx = p.x + (vx * dt) / steps, nz = p.z + (vz * dt) / steps;
        // slope check: não sobe rampas mais íngremes que o limite
        const [px, pz] = pushOut(this.world, nx, nz, c.radius, p.y + c.stepHeight + 0.02, p.y + this.height);
        nx = px; nz = pz;
        const gNew = groundAt(this.world, nx, nz, p.y + c.stepHeight + 0.001);
        if (p.grounded && Number.isFinite(gNew) && gNew - p.y > 0.001) {
          const horiz = Math.hypot(nx - p.x, nz - p.z) || 1e-6;
          const slope = Math.atan2(gNew - p.y, horiz) * 180 / Math.PI;
          // degraus (altura ≤ stepHeight) são sempre permitidos; rampa íngreme só passa se for degrau
          if (slope > c.maxSlopeDeg && gNew - p.y > c.stepHeight * 0.6 && this.isRampAt(nx, nz)) { continue; }
        }
        p.x = nx; p.z = nz;
      }
      this.distance += dist;
      // vertical
      const g = groundAt(this.world, p.x, p.z, p.y + (p.grounded ? c.stepHeight : 0.05) + 0.001);
      if (p.grounded && Number.isFinite(g) && p.y - g <= c.stepHeight + 0.001) { p.y = g; p.vy = 0; }
      else {
        p.grounded = false;
        p.vy -= GRAVITY * dt;
        const ny = p.y + p.vy * dt;
        const g2 = groundAt(this.world, p.x, p.z, Math.max(p.y, ny) + 0.001);
        if (Number.isFinite(g2) && ny <= g2 && p.vy <= 0) { p.y = g2; p.vy = 0; p.grounded = true; }
        else p.y = ny;
      }
      if (p.grounded && inp.jump && c.allowJump) { p.vy = Math.sqrt(2 * GRAVITY * 1.0); p.grounded = false; p.y += 0.02; }
      if (p.y < this.world.minY - 25) { this.say('Caiu fora do mapa — voltando ao último ponto seguro.'); this.log('fall', undefined, 'Caiu do mapa'); this.toRespawn(); }
    }
    this.proximity();
    // amostras de telemetria
    this.sampleT += dt;
    if (this.sampleT >= 0.25) { this.sampleT = 0; this.samples.push({ t: Math.round(this.time * 100) / 100, x: round2(p.x), y: round2(p.y), z: round2(p.z), yaw: round2(p.yaw), floorId: this.floorIdAt() }); }
    if (this.message && this.time > this.message.until) this.message = null;
  }

  private noclipSpeed(inp: PlayInput) { return inp.run ? 8 : 4; }
  private isRampAt(x: number, z: number) {
    for (const r of this.world.ramps) {
      if (r.kind !== 'ramp') continue;
      const dx = x - r.cx, dz = z - r.cz; const lx = dx * r.cos + dz * r.sin, lz = -dx * r.sin + dz * r.cos;
      if (lx >= -0.2 && lx <= r.run + 0.2 && Math.abs(lz) <= r.hw + 0.2) return Math.atan2(r.rise, r.run) * 180 / Math.PI > this.cfg.maxSlopeDeg;
    }
    return false;
  }
  private headBlocked() {
    const r = pushOut(this.world, this.p.x, this.p.z, this.cfg.radius * 0.9, this.p.y + this.cfg.height * 0.7, this.p.y + this.cfg.height);
    return Math.abs(r[0] - this.p.x) > 1e-4 || Math.abs(r[1] - this.p.z) > 1e-4;
  }
  private playerInBox(b: { cx: number; cz: number; hx: number; hz: number; cos: number; sin: number }) {
    const dx = this.p.x - b.cx, dz = this.p.z - b.cz;
    const lx = dx * b.cos + dz * b.sin, lz = -dx * b.sin + dz * b.cos;
    return Math.abs(lx) < b.hx + this.cfg.radius && Math.abs(lz) < b.hz + this.cfg.radius;
  }
  toRespawn() { Object.assign(this.p, { x: this.respawn.x, y: this.respawn.y, z: this.respawn.z, yaw: this.respawn.yaw, vy: 0, grounded: true }); }

  teleport(x: number, z: number, floorId: ID) {
    const elev = this.scene.floors[floorId]?.elevation ?? 0;
    const g = groundAt(this.world, x, z, elev + this.cfg.stepHeight + 0.6);
    this.p.x = x; this.p.z = z; this.p.y = Number.isFinite(g) ? g : elev; this.p.vy = 0; this.p.grounded = true;
    this.log('teleport', undefined, 'Teletransporte de depuração');
  }

  /** Gatilhos por proximidade: checkpoints, gatilhos, salas visitadas e marcadores alcançados. */
  private proximity() {
    const rid = this.roomAt();
    if (rid && !this.visited.has(rid)) { this.visited.add(rid); this.log('room', rid, `Entrou em ${this.scene.rooms[rid].name}`); }
    for (const pr of Object.values(this.scene.props)) {
      const g = this.kindOf(pr.id);
      if (g !== 'trigger' && g !== 'checkpoint') continue;
      if (this.activated.has(pr.id)) continue;
      const elev = this.scene.floors[pr.floorId]?.elevation ?? 0;
      if (Math.hypot(pr.position[0] - this.p.x, pr.position[2] - this.p.z) < 1.4 && Math.abs(elev + pr.position[1] - this.p.y) < 1.5) {
        this.activated.add(pr.id);
        if (g === 'checkpoint') { this.respawn = { x: this.p.x, y: this.p.y, z: this.p.z, yaw: this.p.yaw }; this.say(`Checkpoint: ${pr.name}`); }
        this.log(g, pr.id, `${gameplayLabel(g)}: ${pr.name}`);
      }
    }
    for (const m of Object.values(this.scene.markers)) {
      if (this.reachedMarkers.has(m.id) || m.kind === 'start') continue;
      const elev = this.scene.floors[m.floorId]?.elevation ?? 0;
      if (Math.hypot(m.position[0] - this.p.x, m.position[2] - this.p.z) <= Math.max(0.8, m.radius * 0.6) && Math.abs(elev + m.position[1] - this.p.y) < 2) {
        this.reachedMarkers.add(m.id); this.log('marker', m.id, `Alcançou ${m.name}`);
      }
    }
  }

  /** Distância livre da câmera em 3ª pessoa. */
  cameraBoom(dir: [number, number, number], want: number): number {
    const o: [number, number, number] = [this.p.x, this.eyeY, this.p.z];
    const hit = raycast(this.world, o, dir, want + 0.3, (b) => b.kind !== 'door' || b.active);
    return hit ? Math.max(0.3, hit.t - 0.25) : want;
  }

  toRecord(): PlaytestRecord {
    return {
      id: nid('play'), startedAt: new Date(Date.now() - this.time * 1000).toISOString(), durationSec: Math.round(this.time * 10) / 10,
      distance: Math.round(this.distance * 10) / 10, samples: this.samples, events: this.events.slice(0, 400), roomsVisited: [...this.visited], completed: this.completed,
    };
  }
}
const round2 = (n: number) => Math.round(n * 100) / 100;
