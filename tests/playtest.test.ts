import { describe, expect, it } from 'vitest';
import { setAutoFreeze } from 'immer';
import { emptyScene, DEFAULT_CHARACTER } from '../src/core/defaults';
import { addOpening, addRoomRect, nearestWall } from '../src/editor/rooms';
import { addProp, addStair, addFloor, addMarker } from '../src/editor/actions';
import { PlaySim, type PlayInput } from '../src/playtest/runtime';
import type { Scene } from '../src/core/types';

setAutoFreeze(false);
const fid = (s: Scene) => s.floorOrder[0];
const IN: PlayInput = { fwd: 0, strafe: 0, run: false, jump: false, crouch: false, up: 0 };
const EAST = -Math.PI / 2;

/** Duas salas lado a lado, porta trancada na parede compartilhada exigindo a chave da sala A. */
function bunker() {
  const s = emptyScene();
  addRoomRect(s, fid(s), 0, 0, 4, 4);
  addRoomRect(s, fid(s), 4, 0, 4, 4);
  const w = nearestWall(s, fid(s), [4, 2], 0.5)!.wall;
  const d = addOpening(s, w.id, [4, 2], { kind: 'door' });
  expect(d.id).toBeTruthy();
  const key = addProp(s, 'gp.key', fid(s), 3.2, 2.0);
  s.openings[d.id!].logic = { mode: 'requires', requires: [key], oneWay: 'none' };
  addMarker(s, 'start', fid(s), 1, 2);
  return { s, doorId: d.id!, keyId: key };
}
const walk = (sim: PlaySim, secs: number, inp: Partial<PlayInput>) => { for (let t = 0; t < secs; t += 1 / 60) sim.update(1 / 60, { ...IN, ...inp }); };

describe('playtest: movimento e colisão', () => {
  it('começa no marcador de início e é barrado por paredes', () => {
    const { s } = bunker();
    const sim = new PlaySim(s, DEFAULT_CHARACTER);
    expect(sim.p.x).toBeCloseTo(1, 1);
    sim.p.yaw = Math.PI / 2; // oeste
    walk(sim, 3, { fwd: 1 });
    expect(sim.p.x).toBeGreaterThan(0.1 + DEFAULT_CHARACTER.radius * 0.5);
    expect(sim.p.x).toBeLessThan(1);
  });

  it('porta trancada barra; a chave destranca; depois dá para atravessar', () => {
    const { s, doorId, keyId } = bunker();
    const sim = new PlaySim(s, DEFAULT_CHARACTER);
    sim.p.x = 3.2; sim.p.z = 2.7; sim.p.yaw = EAST;
    walk(sim, 3, { fwd: 1 });
    expect(sim.p.x).toBeLessThan(4);
    expect(sim.doorUnlocked(doorId)).toBe(false);

    // pega a chave (está em 3.2, 2.0) olhando para ela
    sim.p.x = 3.0; sim.p.z = 2.0; sim.p.yaw = EAST;
    expect(sim.focus()?.id).toBe(keyId);
    sim.interact();
    expect(sim.collected.has(keyId)).toBe(true);
    expect(sim.doorUnlocked(doorId)).toBe(true);

    sim.p.x = 3.4; sim.p.z = 2.0; sim.p.yaw = EAST;
    expect(sim.focus()?.id).toBe(doorId);
    sim.interact();
    walk(sim, 1, {});
    walk(sim, 3, { fwd: 1 });
    expect(sim.p.x).toBeGreaterThan(4.6);
  });

  it('mensagem de porta trancada diz o que falta', () => {
    const { s } = bunker();
    const sim = new PlaySim(s, DEFAULT_CHARACTER);
    sim.p.x = 3.4; sim.p.z = 2.4; sim.p.yaw = EAST;
    const msg = sim.interact();
    expect(msg).toMatch(/Falta: Chave/);
  });

  it('o playtest nunca altera a cena original', () => {
    const { s, keyId } = bunker();
    const before = JSON.stringify(s);
    const sim = new PlaySim(s, DEFAULT_CHARACTER);
    sim.p.x = 3.0; sim.p.z = 2.0; sim.p.yaw = EAST; sim.interact();
    expect(sim.collected.has(keyId)).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('reiniciar devolve o estado inicial', () => {
    const { s, keyId } = bunker();
    const sim = new PlaySim(s, DEFAULT_CHARACTER);
    sim.p.x = 3.0; sim.p.z = 2.0; sim.p.yaw = EAST; sim.interact();
    sim.restart();
    expect(sim.collected.has(keyId)).toBe(false);
    expect(sim.p.x).toBeCloseTo(1, 1);
  });

  it('sentido único e porta falsa não abrem', () => {
    const { s, doorId } = bunker();
    s.openings[doorId].logic = { mode: 'free', requires: [], oneWay: 'none', fake: true };
    const sim = new PlaySim(s, DEFAULT_CHARACTER);
    sim.p.x = 3.4; sim.p.z = 2.0; sim.p.yaw = EAST;
    expect(sim.interact()).toMatch(/não abre/i);
  });

  it('sobe escadas e rampas dentro do limite de degrau/inclinação', () => {
    const s = emptyScene();
    const f0 = fid(s);
    const f1 = addFloor(s, 'Andar 1', 3, 3);
    addRoomRect(s, f0, 0, 0, 10, 4);
    addRoomRect(s, f1, 5, 0, 5, 4);
    const ww = nearestWall(s, f1, [5, 2], 0.5)!.wall;
    expect(addOpening(s, ww.id, [5, 2], { kind: 'arch', width: 1.6, height: 2.2 }).id).toBeTruthy();
    addStair(s, f0, 1, 2, 0, { kind: 'stair', width: 1.2, run: 4, rise: 3, steps: 17 });
    const sim = new PlaySim(s, DEFAULT_CHARACTER, { x: 0.8, z: 2, floorId: f0 });
    sim.p.yaw = EAST;
    walk(sim, 5, { fwd: 1 });
    expect(sim.p.y).toBeGreaterThan(2.9);
    expect(sim.floorIdAt()).toBe(f1);
  });

  it('cair para fora do mapa volta ao último ponto seguro', () => {
    const { s } = bunker();
    const sim = new PlaySim(s, DEFAULT_CHARACTER);
    sim.p.x = 30; sim.p.z = 30; sim.p.y = 0; sim.p.grounded = false;
    walk(sim, 4, {});
    expect(sim.p.x).toBeCloseTo(1, 1);
  });

  it('gera registro de telemetria', () => {
    const { s } = bunker();
    const sim = new PlaySim(s, DEFAULT_CHARACTER);
    sim.p.yaw = EAST; walk(sim, 2, { fwd: 1 });
    const rec = sim.toRecord();
    expect(rec.samples.length).toBeGreaterThan(4);
    expect(rec.distance).toBeGreaterThan(1);
    expect(rec.roomsVisited.length).toBeGreaterThan(0);
  });
});
