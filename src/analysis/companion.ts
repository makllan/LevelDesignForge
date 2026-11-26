/**
 * Design Companion — achados explicáveis sobre o espaço. Sem nota arbitrária: cada achado diz o que viu, onde e por quê.
 * Severidades: error = quebra o jogo/ progressão; warn = provável problema; info = sugestão de design.
 */
import type { CharacterConfig, EntityRef, ID, Scene, Vec2 } from '../core/types';
import { analyzeProgression, type ProgressionResult } from './progression';
import { getDef } from '../assets/props';
import { dist, polygonBounds } from '../core/math';
import { roomArea } from '../core/scene';
import { openingProblems } from '../geometry/walls';
import { stairStats } from '../geometry/stairs';

export type Severity = 'error' | 'warn' | 'info';
export interface Finding {
  /** estável: tipo + alvo. Usado para "ignorar" achados */
  id: string;
  sev: Severity;
  title: string;
  detail: string;
  ref?: EntityRef;
  pos?: Vec2;
  floorId?: ID;
}
export interface Metrics {
  rooms: number; builtAreaM2: number; doors: number; props: number; walkableM2: number;
  reachableRooms: number; stepsToExit: number | null; pathLengthM: number | null; estSeconds: number | null; deadEnds: number; gameplayItems: number;
}
export interface Report { findings: Finding[]; progression: ProgressionResult; metrics: Metrics }

const roomCenter = (r: Scene['rooms'][ID]): Vec2 => { const b = polygonBounds(r.polygon); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };

export function analyzeScene(scene: Scene, cfg: CharacterConfig, dismissed: string[] = []): Report {
  const f: Finding[] = [];
  const add = (x: Finding) => { if (!dismissed.includes(x.id)) f.push(x); };
  const prog = analyzeProgression(scene, cfg);
  const rooms = Object.values(scene.rooms);

  // ---- estrutura
  if (!rooms.length && !scene.terrain) add({ id: 'empty', sev: 'info', title: 'Cena vazia', detail: 'Desenhe uma sala ou crie um terreno para começar.' });
  if (!prog.hasStart && (rooms.length || scene.terrain)) add({ id: 'no-start', sev: 'error', title: 'Sem ponto inicial do jogador', detail: 'Coloque um marcador “Início” (ferramenta Início). Sem ele o playtest usa o centro da primeira sala.' });
  else if (prog.hasStart && prog.startCell < 0) add({ id: 'start-blocked', sev: 'error', title: 'O ponto inicial não está em chão caminhável', detail: 'O marcador de início está fora de qualquer piso ou dentro de um objeto/parede.' });

  // ---- tamanho humano
  const minGap = cfg.radius * 2 + 0.1;
  for (const o of Object.values(scene.openings)) {
    const wall = scene.walls[o.wallId];
    if (!wall) continue;
    if (o.kind !== 'window' && o.width < minGap) add({ id: `narrow:${o.id}`, sev: 'error', title: `${o.name} é estreita demais`, detail: `Largura ${o.width.toFixed(2)} m; o personagem precisa de ao menos ${minGap.toFixed(2)} m (diâmetro ${(cfg.radius * 2).toFixed(2)} m + folga).`, ref: { kind: 'opening', id: o.id }, floorId: wall.floorId });
    if (o.kind === 'door' && o.height < cfg.height + 0.05) add({ id: `low:${o.id}`, sev: 'error', title: `${o.name} é baixa demais`, detail: `Altura ${o.height.toFixed(2)} m para um personagem de ${cfg.height.toFixed(2)} m.`, ref: { kind: 'opening', id: o.id }, floorId: wall.floorId });
    for (const prob of openingProblems(scene, o)) add({ id: `open:${o.id}:${prob}`, sev: 'warn', title: `${o.name}: ${prob}`, detail: 'Problema de geometria da abertura.', ref: { kind: 'opening', id: o.id }, floorId: wall.floorId });
  }
  for (const r of rooms) {
    const b = polygonBounds(r.polygon);
    const inner = Math.min(b.w, b.h) - r.wallThickness;
    if (r.kind === 'corridor' && inner < minGap) add({ id: `corr:${r.id}`, sev: 'error', title: `${r.name} é estreito demais`, detail: `Largura útil ${inner.toFixed(2)} m < ${minGap.toFixed(2)} m necessários.`, ref: { kind: 'room', id: r.id }, pos: roomCenter(r), floorId: r.floorId });
    else if (inner < 1.3 && r.kind === 'room') add({ id: `tiny:${r.id}`, sev: 'warn', title: `${r.name} é muito apertada`, detail: `Largura útil ${inner.toFixed(2)} m. Combate ou fuga aqui seria desconfortável.`, ref: { kind: 'room', id: r.id }, pos: roomCenter(r), floorId: r.floorId });
    const ceil = r.height ?? scene.floors[r.floorId]?.height ?? 3;
    if (ceil < cfg.height + 0.2) add({ id: `ceil:${r.id}`, sev: 'error', title: `Pé-direito de ${r.name} menor que o personagem`, detail: `${ceil.toFixed(2)} m para ${cfg.height.toFixed(2)} m.`, ref: { kind: 'room', id: r.id }, pos: roomCenter(r), floorId: r.floorId });
  }
  for (const st of Object.values(scene.stairs)) {
    const x = stairStats(st);
    if (st.kind === 'stair' && x.riser > cfg.stepHeight + 0.001) add({ id: `riser:${st.id}`, sev: 'error', title: `${st.name}: degrau alto demais`, detail: `Espelho de ${(x.riser * 100).toFixed(1)} cm; o personagem sobe no máximo ${(cfg.stepHeight * 100).toFixed(0)} cm.`, ref: { kind: 'stair', id: st.id }, pos: st.position, floorId: st.floorId });
    if (st.kind === 'ramp' && Math.atan2(st.rise, st.run) * 180 / Math.PI > cfg.maxSlopeDeg) add({ id: `slope:${st.id}`, sev: 'error', title: `${st.name}: inclinação acima do limite`, detail: `${(Math.atan2(st.rise, st.run) * 180 / Math.PI).toFixed(1)}° > ${cfg.maxSlopeDeg}°.`, ref: { kind: 'stair', id: st.id }, pos: st.position, floorId: st.floorId });
  }

  // ---- portas e requisitos
  for (const o of Object.values(scene.openings)) {
    if (o.kind !== 'door') continue;
    const w = scene.walls[o.wallId]; if (!w) continue;
    const L = dist(w.a, w.b), t = L ? o.offset / L : 0;
    const pos: Vec2 = [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
    if (o.logic.mode === 'requires' && !o.logic.requires.length) add({ id: `emptyreq:${o.id}`, sev: 'error', title: `${o.name} exige objetos, mas nenhum foi escolhido`, detail: 'No inspetor, marque a chave/cartão necessários ou mude o estado para Livre.', ref: { kind: 'opening', id: o.id }, pos, floorId: w.floorId });
    if (o.logic.mode === 'locked' && !o.logic.fake) add({ id: `locked:${o.id}`, sev: 'warn', title: `${o.name} está trancada sem solução`, detail: 'Trancada permanente. Se for barreira narrativa, ignore; senão, troque para “Exige objetos”.', ref: { kind: 'opening', id: o.id }, pos, floorId: w.floorId });
  }
  for (const p of Object.values(scene.props)) {
    const g = getDef(p.defId)?.gameplay;
    if (g && p.requires.some((r) => !scene.props[r])) add({ id: `dangling:${p.id}`, sev: 'error', title: `${p.name} depende de um objeto que não existe mais`, detail: 'Refaça as condições no inspetor.', ref: { kind: 'prop', id: p.id }, pos: [p.position[0], p.position[2]], floorId: p.floorId });
  }

  // ---- progressão
  if (prog.ok) {
    for (const st of prog.stuck) {
      if (st.kind === 'door' && st.reason.startsWith('porta falsa')) { add({ id: `fake:${st.id}`, sev: 'info', title: `${st.name} é falsa`, detail: 'Porta que nunca abre. Garanta que o jogador entenda isso (som, texto, luz).', ref: { kind: 'opening', id: st.id }, pos: st.pos, floorId: st.floorId }); continue; }
      add({ id: `stuck:${st.id}`, sev: 'error', title: `${st.name}: ${st.reason}`, detail: 'A simulação de progressão a partir do início não consegue chegar nem concluir isto.', ref: { kind: st.kind === 'door' ? 'opening' : 'prop', id: st.id }, pos: st.pos, floorId: st.floorId });
    }
    for (const rid of prog.unreachableRooms) {
      const r = scene.rooms[rid];
      add({ id: `unreach:${rid}`, sev: 'error', title: `${r.name} é inalcançável`, detail: 'Nenhum caminho (mesmo com todas as chaves possíveis) leva do início até esta sala. Falta uma abertura ou ela está isolada.', ref: { kind: 'room', id: rid }, pos: roomCenter(r), floorId: r.floorId });
    }
    if (prog.hasExit && !prog.exitReached) add({ id: 'exit-unreachable', sev: 'error', title: 'A saída não pode ser alcançada', detail: 'Há saída no mapa, mas a progressão trava antes dela. Veja os itens “inalcançáveis” acima.' });
    if (!prog.hasExit && rooms.length > 2) add({ id: 'no-exit', sev: 'info', title: 'Sem saída/objetivo final', detail: 'Coloque um objeto “Saída” ou “Elevador” para a validação de progressão ter um destino.' });
  }

  // ---- ritmo e design
  const markers = Object.values(scene.markers);
  if (rooms.length > 3 && !markers.some((m) => m.kind === 'main')) add({ id: 'no-main', sev: 'info', title: 'Nenhum objetivo principal marcado', detail: 'Marcadores “Objetivo principal” ajudam o jogador (e a análise) a entender o fluxo.' });
  const checkpoints = Object.values(scene.props).filter((p) => getDef(p.defId)?.gameplay === 'checkpoint');
  for (const m of markers.filter((k) => k.kind === 'combat' || k.kind === 'ambush')) {
    const near = checkpoints.some((c) => c.floorId === m.floorId && Math.hypot(c.position[0] - m.position[0], c.position[2] - m.position[2]) < 30);
    if (!near) add({ id: `nocp:${m.id}`, sev: 'info', title: `${m.name}: nenhum checkpoint a menos de 30 m`, detail: 'Falhar aqui pode custar muito progresso. Considere um checkpoint antes do encontro.', ref: { kind: 'marker', id: m.id }, pos: [m.position[0], m.position[2]], floorId: m.floorId });
    if (!markers.some((k) => k.kind === 'safe' || k.kind === 'recovery')) { add({ id: 'no-safe', sev: 'info', title: 'Combate sem área de respiro', detail: 'Há encontros, mas nenhuma área segura ou de recuperação marcada.' }); break; }
  }
  for (let i = 1; i < scene.pacing.length; i++) {
    if (scene.pacing[i].tension >= 8 && scene.pacing[i - 1].tension >= 8) add({ id: `pace:${scene.pacing[i].id}`, sev: 'info', title: `Duas batidas seguidas de tensão alta (“${scene.pacing[i - 1].name}” → “${scene.pacing[i].name}”)`, detail: 'Sem respiro entre elas o pico perde força.' });
  }
  const long = rooms.filter((r) => r.kind === 'corridor').map((r) => ({ r, b: polygonBounds(r.polygon) })).filter((x) => Math.max(x.b.w, x.b.h) > 14);
  for (const { r } of long) {
    const hasStuff = Object.values(scene.props).some((p) => p.floorId === r.floorId && pointInRoom(r, p.position[0], p.position[2])) || markers.some((m) => m.floorId === r.floorId && pointInRoom(r, m.position[0], m.position[2]));
    if (!hasStuff) add({ id: `longcorr:${r.id}`, sev: 'warn', title: `${r.name} é longo e vazio`, detail: 'Corredor com mais de 14 m sem objeto ou marcador tende a cansar. Quebre com um evento, luz ou curva.', ref: { kind: 'room', id: r.id }, pos: roomCenter(r), floorId: r.floorId });
  }

  // becos sem saída: sala com 1 única abertura e nada dentro
  const doorCount = new Map<ID, number>();
  for (const o of Object.values(scene.openings)) {
    if (o.kind === 'window') continue;
    const w = scene.walls[o.wallId]; if (!w) continue;
    for (const s of w.sources) doorCount.set(s.roomId, (doorCount.get(s.roomId) ?? 0) + 1);
  }
  let deadEnds = 0;
  for (const r of rooms) {
    if (r.kind !== 'room' || (doorCount.get(r.id) ?? 0) !== 1) continue;
    deadEnds++;
    const has = Object.values(scene.props).some((p) => p.floorId === r.floorId && pointInRoom(r, p.position[0], p.position[2]) && getDef(p.defId)?.gameplay) || markers.some((m) => m.floorId === r.floorId && pointInRoom(r, m.position[0], m.position[2]));
    if (!has) add({ id: `dead:${r.id}`, sev: 'info', title: `${r.name} é beco sem saída sem recompensa`, detail: 'Uma única entrada e nada de gameplay ou marcador. Dê um motivo para o jogador ir até lá (item, narrativa) ou conecte a outro ambiente.', ref: { kind: 'room', id: r.id }, pos: roomCenter(r), floorId: r.floorId });
  }
  if (scene.atmosphere.preset !== 'greybox') {
    for (const r of rooms) {
      if (r.kind === 'corridor' && roomArea(r) < 10) continue;
      const lit = Object.values(scene.lights).some((l) => l.floorId === r.floorId && l.kind !== 'ambient' && Math.hypot(l.position[0] - roomCenter(r)[0], l.position[2] - roomCenter(r)[1]) <= l.range + 3);
      if (!lit && !scene.atmosphere.flashlight) add({ id: `dark:${r.id}`, sev: 'warn', title: `${r.name} sem iluminação`, detail: 'A atmosfera está escura e o jogador não tem lanterna: a sala fica ilegível.', ref: { kind: 'room', id: r.id }, pos: roomCenter(r), floorId: r.floorId });
    }
  }

  const order = { error: 0, warn: 1, info: 2 } as const;
  f.sort((a, b) => order[a.sev] - order[b.sev]);

  let walkable = 0;
  const g = prog.grid;
  if (g) for (const L of g.layers) for (let i = 0; i < L.walk.length; i++) walkable += L.walk[i];
  const metrics: Metrics = {
    rooms: rooms.length, builtAreaM2: rooms.reduce((a, r) => a + roomArea(r), 0), doors: Object.values(scene.openings).filter((o) => o.kind === 'door').length,
    props: Object.keys(scene.props).length, walkableM2: g ? walkable * g.cell * g.cell : 0, reachableRooms: prog.reachableRooms.length,
    stepsToExit: prog.exitReached ? prog.steps.length : null, pathLengthM: prog.exitReached ? prog.pathLength : null, estSeconds: prog.exitReached ? prog.pathLength / cfg.walkSpeed : null,
    deadEnds, gameplayItems: Object.values(scene.props).filter((p) => getDef(p.defId)?.gameplay).length,
  };
  return { findings: f, progression: prog, metrics };
}

function pointInRoom(r: Scene['rooms'][ID], x: number, z: number) {
  const b = polygonBounds(r.polygon);
  return x >= b.x0 && x <= b.x1 && z >= b.y0 && z <= b.y1;
}
