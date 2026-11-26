import { describe, expect, it } from 'vitest';
import { setAutoFreeze } from 'immer';
import { TEMPLATES } from '../src/templates';
import { analyzeScene } from '../src/analysis/companion';
import { analyzeProgression, dependencyGraph } from '../src/analysis/progression';
import { buildNavGrid, nearestCell, reachFrom } from '../src/analysis/navgrid';
import { computeLos } from '../src/analysis/los';
import { emptyScene, DEFAULT_CHARACTER } from '../src/core/defaults';
import { addOpening, addRoomRect, nearestWall } from '../src/editor/rooms';
import { addMarker, addProp } from '../src/editor/actions';
import type { Project } from '../src/core/types';

setAutoFreeze(false);
const bunker = (): Project => TEMPLATES.find((t) => t.id === 'bunker')!.build();
const cfg = DEFAULT_CHARACTER;
const byName = (p: Project, n: string) => Object.values(p.scene.props).find((x) => x.name === n)!;

describe('grade de navegação', () => {
  it('uma sala vazia é caminhável e conexa; paredes não são', () => {
    const s = emptyScene();
    addRoomRect(s, s.floorOrder[0], 0, 0, 6, 4);
    const g = buildNavGrid(s, cfg)!;
    const c = nearestCell(g, 3, 2)!;
    expect(c).toBeGreaterThanOrEqual(0);
    const r = reachFrom(g, c);
    let reached = 0; r.visited.forEach((v) => { reached += v; });
    let walk = 0; g.layers[0].walk.forEach((v) => { walk += v; });
    expect(reached).toBe(walk);
    expect(walk * g.cell * g.cell).toBeGreaterThan(18);   // ~ (6-0.2-0.6) × (4-0.2-0.6) = 16.6 m² + folga
    expect(nearestCell(g, 0, 0, undefined, 0.1)).toBe(-1);  // no eixo da parede não cabe ninguém
  });

  it('duas salas sem porta são ilhas separadas; com porta, uma só', () => {
    const s = emptyScene(); const f = s.floorOrder[0];
    addRoomRect(s, f, 0, 0, 4, 4); addRoomRect(s, f, 4, 0, 4, 4);
    let g = buildNavGrid(s, cfg)!;
    let r = reachFrom(g, nearestCell(g, 2, 2));
    expect(r.visited[nearestCell(g, 6, 2)]).toBe(0);
    addOpening(s, nearestWall(s, f, [4, 2], 0.5)!.wall.id, [4, 2], { kind: 'arch', width: 1.2 });
    g = buildNavGrid(s, cfg)!;
    r = reachFrom(g, nearestCell(g, 2, 2));
    expect(r.visited[nearestCell(g, 6, 2)]).toBe(1);
  });
});

describe('progressão', () => {
  it('Núcleo do bunker: tudo alcançável, saída atingida, ordem lógica das etapas', () => {
    const p = bunker();
    const r = analyzeProgression(p.scene, cfg);
    expect(r.ok).toBe(true);
    expect(r.unreachableRooms).toEqual([]);
    expect(r.exitReached).toBe(true);
    const order = (name: string) => r.steps.findIndex((s) => s.label.includes(name));
    expect(order('Chave do almoxarifado')).toBeGreaterThanOrEqual(0);
    expect(order('Chave do almoxarifado')).toBeLessThan(order('Porta do almoxarifado'));
    expect(order('Porta do almoxarifado')).toBeLessThan(order('Fusível principal'));
    expect(order('Fusível principal')).toBeLessThan(order('Gerador de emergência'));
    expect(order('Gerador de emergência')).toBeLessThan(order('Elevador de serviço'));
    expect(order('Cartão de acesso')).toBeLessThan(order('Porta da contenção'));
    expect(r.routeToExit.length).toBeGreaterThan(10);
    expect(r.pathLength).toBeGreaterThan(30);
    // só a porta externa (falsa) fica de fora
    expect(r.stuck.map((x) => x.name)).toEqual(['Porta externa (falsa)']);
  });

  it('Núcleo do bunker: o Companion não aponta erros', () => {
    const rep = analyzeScene(bunker().scene, cfg);
    const errors = rep.findings.filter((f) => f.sev === 'error');
    expect(errors, errors.map((e) => e.title).join(' | ')).toEqual([]);
    expect(rep.metrics.stepsToExit).toBeGreaterThan(8);
  });

  it('apagar a chave quebra a cadeia: porta, fusível, gerador e saída viram erros', () => {
    const p = bunker();
    const chave = byName(p, 'Chave do almoxarifado');
    // coloca a chave dentro do almoxarifado trancado (ciclo): ela fica inalcançável
    chave.position = [13, 0.8, 7.5];
    const rep = analyzeScene(p.scene, cfg);
    const titles = rep.findings.filter((f) => f.sev === 'error').map((f) => f.title).join(' | ');
    expect(titles).toMatch(/Chave do almoxarifado/);
    expect(titles).toMatch(/Porta do almoxarifado/);
    expect(titles).toMatch(/Fusível/);
    expect(rep.progression.exitReached).toBe(false);
    expect(rep.findings.some((f) => f.id === 'exit-unreachable')).toBe(true);
  });

  it('sala isolada e porta sem requisitos são detectadas', () => {
    const s = emptyScene(); const f = s.floorOrder[0];
    addRoomRect(s, f, 0, 0, 5, 5); addRoomRect(s, f, 5, 0, 5, 5); addRoomRect(s, f, 20, 0, 5, 5, { name: 'Ilha' });
    const d = addOpening(s, nearestWall(s, f, [5, 2.5], 0.5)!.wall.id, [5, 2.5], { kind: 'door' }).id!;
    s.openings[d].logic = { mode: 'requires', requires: [], oneWay: 'none' };
    addMarker(s, 'start', f, 2, 2);
    const rep = analyzeScene(s, cfg);
    expect(rep.findings.some((x) => x.id.startsWith('unreach:') && /Ilha/.test(x.title))).toBe(true);
    expect(rep.findings.some((x) => x.id === `emptyreq:${d}`)).toBe(true);
  });

  it('corredor estreito e porta baixa são erros de escala humana', () => {
    const s = emptyScene(); const f = s.floorOrder[0];
    addRoomRect(s, f, 0, 0, 5, 5); addRoomRect(s, f, 5, 0, 5, 5);
    addOpening(s, nearestWall(s, f, [5, 2.5], 0.5)!.wall.id, [5, 2.5], { kind: 'door', width: 0.55, height: 1.6 });
    const rep = analyzeScene(s, cfg);
    expect(rep.findings.some((x) => x.id.startsWith('narrow:'))).toBe(true);
    expect(rep.findings.some((x) => x.id.startsWith('low:'))).toBe(true);
  });

  it('achados ignorados não voltam', () => {
    const s = emptyScene(); addRoomRect(s, s.floorOrder[0], 0, 0, 5, 5);
    const a = analyzeScene(s, cfg);
    expect(a.findings.some((x) => x.id === 'no-start')).toBe(true);
    const b = analyzeScene(s, cfg, ['no-start']);
    expect(b.findings.some((x) => x.id === 'no-start')).toBe(false);
  });

  it('grafo de dependências liga requisitos a portas e gerador', () => {
    const g = dependencyGraph(bunker().scene);
    const label = (id: string) => g.nodes.find((n) => n.id === id)?.label;
    const edges = g.edges.map((e) => `${label(e.from)} → ${label(e.to)}`);
    expect(edges).toContain('Chave do almoxarifado → Porta do almoxarifado');
    expect(edges).toContain('Fusível principal → Gerador de emergência');
    expect(edges).toContain('Gerador de emergência → Elevador de serviço');
  });
});

describe('linha de visão', () => {
  it('paredes bloqueiam; abertura sem porta deixa ver; porta fechada bloqueia', () => {
    const s = emptyScene(); const f = s.floorOrder[0];
    addRoomRect(s, f, 0, 0, 6, 6); addRoomRect(s, f, 6, 0, 6, 6);
    const marker = addMarker(s, 'main', f, 9, 3);
    s.markers[marker].name = 'Alvo';
    let los = computeLos(s, cfg, f, 3, 3);
    expect(los.targets.find((t) => t.name === 'Alvo')!.visible).toBe(false);
    const arch = addOpening(s, nearestWall(s, f, [6, 3], 0.5)!.wall.id, [6, 3], { kind: 'arch', width: 1.4 }).id!;
    los = computeLos(s, cfg, f, 3, 3);
    expect(los.targets.find((t) => t.name === 'Alvo')!.visible).toBe(true);
    s.openings[arch].kind = 'door';
    los = computeLos(s, cfg, f, 3, 3);
    expect(los.targets.find((t) => t.name === 'Alvo')!.visible).toBe(false);
    void addProp;
  });
});
