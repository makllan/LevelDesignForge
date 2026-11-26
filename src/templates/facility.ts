/** Instalação subterrânea — três pavimentos ligados por escadas, com cartões, um interruptor e um elevador final. */
import type { Project } from '../core/types';
import { addBasement, addLight, addMarker, addStair } from '../editor/actions';
import { addCorridor, addRoomRect } from '../editor/rooms';
import { build, opening, prop, sector } from './helpers';

export function buildFacility(): Project {
  return build('Instalação subterrânea', 'Pavilhão de superfície e dois subsolos. Segurança → laboratório → poço → celas → elevador.', (s) => {
    const f0 = s.floorOrder[0];
    s.floors[f0].name = 'Superfície';
    const sup = sector(s, 'Superfície', '#8a5a44'), tec = sector(s, 'Técnico', '#6f7f56'), cel = sector(s, 'Celas', '#7d5f7a');
    const s1 = addBasement(s, 'Subsolo 1', 3);
    const s2 = addBasement(s, 'Subsolo 2', 3);
    // addBasement empilha para baixo: s1 = -3, s2 = -6

    // superfície
    addRoomRect(s, f0, 0, 0, 10, 8, { name: 'Pavilhão de entrada', sectorId: sup });
    addCorridor(s, f0, [10, 4], [20, 4], 2.4, { name: 'Passagem coberta', sectorId: sup });
    const hall = addRoomRect(s, f0, 20, 0, 10, 8, { name: 'Hall do elevador', sectorId: sup });
    s.rooms[hall].holes = [[[21.8, 5], [26, 5], [26, 6.4], [21.8, 6.4]]];

    // subsolo 1
    addRoomRect(s, s1, 20, 0, 10, 8, { name: 'Vestíbulo', sectorId: tec, hasCeiling: false });
    addCorridor(s, s1, [30, 4], [46, 4], 2.4, { name: 'Corredor técnico', sectorId: tec });
    addRoomRect(s, s1, 36, -5.2, 10, 8, { name: 'Laboratório', sectorId: tec });
    addRoomRect(s, s1, 36, 5.2, 8, 6, { name: 'Segurança', sectorId: tec });
    const poco = addRoomRect(s, s1, 46, 0, 8, 8, { name: 'Poço de acesso', sectorId: tec });
    s.rooms[poco].holes = [[[47.8, 5], [52, 5], [52, 6.4], [47.8, 6.4]]];
    addStair(s, s1, 22, 5.7, 0, { kind: 'stair', width: 1.4, run: 4, rise: 3, steps: 17 });

    // subsolo 2
    addRoomRect(s, s2, 46, 0, 8, 8, { name: 'Anel das celas', sectorId: cel, hasCeiling: false });
    addCorridor(s, s2, [54, 4], [70, 4], 2.4, { name: 'Corredor das celas', sectorId: cel });
    for (let i = 0; i < 3; i++) addRoomRect(s, s2, 56 + i * 5, -3.2, 5, 6, { name: `Cela ${i + 1}`, sectorId: cel });
    addRoomRect(s, s2, 70, 0, 8, 8, { name: 'Elevador de carga', sectorId: cel });
    addStair(s, s2, 48, 5.7, 0, { kind: 'stair', width: 1.4, run: 4, rise: 3, steps: 17 });

    // aberturas
    opening(s, f0, [10, 4], { kind: 'door', width: 1.4 }, undefined, 'Portão do pavilhão');
    opening(s, f0, [20, 4], { kind: 'door', width: 1.4 }, undefined, 'Porta do hall');
    opening(s, s1, [30, 4], { kind: 'arch', width: 1.6 }, undefined, 'Arco do vestíbulo');
    const dLab = opening(s, s1, [41, 2.8], { kind: 'door' }, undefined, 'Porta do laboratório');
    const dSeg = opening(s, s1, [40, 5.2], { kind: 'door' }, undefined, 'Porta da segurança');
    const dPoco = opening(s, s1, [46, 4], { kind: 'door', width: 1.4 }, undefined, 'Porta do poço');
    opening(s, s2, [54, 4], { kind: 'arch', width: 1.6 }, undefined, 'Arco das celas');
    for (let i = 0; i < 3; i++) opening(s, s2, [58.5 + i * 5, 2.8], { kind: 'door', width: 0.9 }, i === 2 ? { mode: 'locked', requires: [], oneWay: 'none' } : undefined, `Porta da cela ${i + 1}`);
    const dElev = opening(s, s2, [70, 4], { kind: 'door', width: 1.6 }, undefined, 'Porta do elevador');

    const cartao = prop(s, 'gp.card', s1, 40.5, 8.8, { name: 'Cartão de segurança', position: [40.5, 0.9, 8.8] });
    const interruptor = prop(s, 'gp.switch', s1, 41, -4.6, { name: 'Alavanca do poço', position: [41, 1.2, -4.6] });
    const chave = prop(s, 'gp.key', s2, 58.5, -1.2, { name: 'Chave do elevador', position: [58.5, 0.8, -1.2] });
    s.openings[dSeg].logic = { mode: 'free', requires: [], oneWay: 'none' };
    s.openings[dLab].logic = { mode: 'requires', requires: [cartao], oneWay: 'none' };
    s.openings[dPoco].logic = { mode: 'requires', requires: [interruptor], oneWay: 'none' };
    s.openings[dElev].logic = { mode: 'requires', requires: [chave], oneWay: 'none' };
    prop(s, 'gp.exit', s2, 75, 4, { name: 'Elevador de carga', requires: [] });
    prop(s, 'gp.checkpoint', s1, 25, 2, {});
    prop(s, 'ind.panel', s1, 36.6, -4.4, { rot: 90 });
    prop(s, 'med.surgical_table', s1, 41, 0, {});
    prop(s, 'office.desk', s1, 40, 9, {});
    prop(s, 'cont.restraint_table', s2, 63.5, 1, {});
    prop(s, 'gp.enemy', s2, 66, -1, { name: 'Criatura na cela 3' });
    prop(s, 'cont.vessel', s2, 49.5, 2, {});
    prop(s, 'gp.ammo', s1, 33, 3, {});

    addMarker(s, 'start', f0, 3, 4, { rot: 0 });
    addMarker(s, 'main', s1, 41, -1.5, { radius: 3, name: 'Acionar a alavanca' });
    addMarker(s, 'puzzle', s1, 41, -4.6, { radius: 2, name: 'Alavanca do poço' });
    addMarker(s, 'combat', s2, 64, 2, { radius: 6, name: 'Corredor das celas' });
    addMarker(s, 'main', s2, 75, 4, { radius: 3, name: 'Sair pelo elevador' });
    addMarker(s, 'pinch', s1, 33, 4, { name: 'Estreitamento do corredor' });
    addMarker(s, 'recovery', s1, 25, 3, { name: 'Retorno após falha' });
    for (const [fl, x, z] of [[f0, 5, 4], [f0, 25, 3], [s1, 25, 4], [s1, 40, 4], [s1, 40, -2], [s2, 50, 3], [s2, 62, 4], [s2, 74, 4]] as const)
      addLight(s, 'point', fl, x, z, { intensity: 4.5, range: 9, flicker: z === 4 && x > 60, position: [x, 2.5, z], color: fl === s2 ? '#d98a76' : '#e9cf9a' });
    s.atmosphere = { ...s.atmosphere, preset: 'underground', ambient: 0.3, fog: 0.25, fogColor: '#1a1815', sky: '#12100d', flashlight: true, sunIntensity: 0 };
    s.pacing = [
      { id: 'i1', sectorId: sup, name: 'Superfície', tension: 2, minutes: 2, gameplay: 'Entrar', narrative: 'Instalação abandonada.', emotion: 'curiosity', encounter: 'Nenhum', lighting: 'Dia nublado', audio: 'Vento' },
      { id: 'i2', sectorId: tec, name: 'Técnico', tension: 5, minutes: 8, gameplay: 'Cartão e alavanca', narrative: 'Logs de experimentos.', emotion: 'mystery', encounter: 'Nenhum', lighting: 'Fluorescente', audio: 'Zumbido' },
      { id: 'i3', sectorId: cel, name: 'Celas', tension: 9, minutes: 6, gameplay: 'Chave e fuga', narrative: 'O que havia nas celas.', emotion: 'fear', encounter: 'Criatura', lighting: 'Vermelho de emergência', audio: 'Raspar de unhas' },
    ];
  });
}
