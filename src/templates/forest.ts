/** O silêncio da floresta — paisagem aberta com terreno procedural, trilha, aglomerados de pinheiros e uma cabana trancada. */
import type { Project, ScatterGroup, Vec2 } from '../core/types';
import { addLight, addMarker } from '../editor/actions';
import { addRoomRect } from '../editor/rooms';
import { makeTerrain, generateTerrain, flattenUnder, carvePath, scatterPoints } from '../geometry/terrain';
import { nid } from '../core/ids';
import { build, opening, prop, sector } from './helpers';

export function buildForest(): Project {
  return build('O silêncio da floresta', 'Trilha em mata fechada até uma cabana abandonada. Terreno gerado por seed, instâncias de árvores e uma chave escondida.', (s) => {
    const f0 = s.floorOrder[0];
    s.floors[f0].name = 'Solo';
    const mata = sector(s, 'Mata', '#6f7f56'), ruina = sector(s, 'Ruínas', '#6b6258'), cabana = sector(s, 'Cabana', '#8a5a44');
    void mata;

    const cabinPoly: Vec2[] = [[0, 0], [6, 0], [6, 5], [0, 5]];
    const trailhead: Vec2 = [-46, 38];
    const ruins: Vec2 = [-18, -30];
    const trail: Vec2[] = [trailhead, [-38, 28], [-28, 18], [-16, 12], [-6, 8], [1.5, 6.5]];
    const trail2: Vec2[] = [[-16, 12], [-14, -8], [-16, -22], ruins];

    let t = makeTerrain([-70, -70], [140, 140], 112, 11, 0);
    t = generateTerrain(t, { seed: 11, amplitude: 7, scale: 38, octaves: 4, base: 0 });
    t = flattenUnder(t, [{ poly: cabinPoly, height: 0 }, { poly: [[-49, 35], [-43, 35], [-43, 41], [-49, 41]], height: 0 }, { poly: [[-21, -33], [-15, -33], [-15, -27], [-21, -27]], height: 0 }], 4);
    t = carvePath(t, trail, 2.2, 0.15, true);
    t = carvePath(t, trail2, 1.8, 0.15, true);
    s.terrain = t;

    s.paths['path_trail'] = { id: 'path_trail', name: 'Trilha principal', kind: 'trail', width: 2.2, points: trail, carve: 0.15, floorId: f0 };
    s.paths['path_trail2'] = { id: 'path_trail2', name: 'Desvio às ruínas', kind: 'trail', width: 1.8, points: trail2, carve: 0.15, floorId: f0 };

    const nearPath = (x: number, z: number) => [trail, trail2].some((pts) => pts.some((p, i) => { const q = pts[i + 1]; if (!q) return false; const dx = q[0] - p[0], dz = q[1] - p[1]; const L2 = dx * dx + dz * dz || 1; const u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)); return Math.hypot(x - (p[0] + u * dx), z - (p[1] + u * dz)) < 3.2; }));
    const nearCabin = (x: number, z: number) => x > -4 && x < 10 && z > -4 && z < 9;
    const avoid = (x: number, z: number) => nearPath(x, z) || nearCabin(x, z) || Math.hypot(x - ruins[0], z - ruins[1]) < 6;
    const addScatter = (defId: string, name: string, count: number, seed: number, spacing: number, smin: number, smax: number, existing: [number, number][] = []) => {
      const g: ScatterGroup = { id: nid('scat'), name, defId, floorId: f0, items: scatterPoints({ cx: 0, cz: 0, radius: 68, count, spacing, seed, rotVar: 1, scaleMin: smin, scaleMax: smax, avoid, existing }) };
      s.scatter[g.id] = g;
      return g.items.map((i) => [i[0], i[1]] as [number, number]);
    };
    const pines = addScatter('nat.pine', 'Pinheiros', 420, 5, 3.4, 0.8, 1.3);
    addScatter('nat.dead_tree', 'Árvores mortas', 40, 9, 6, 0.8, 1.15, pines);
    addScatter('nat.fern', 'Samambaias', 160, 13, 1.6, 0.8, 1.4);
    addScatter('nat.rock_l', 'Rochas', 30, 21, 7, 0.7, 1.5);

    // cabana
    const room = addRoomRect(s, f0, 0, 0, 6, 5, { name: 'Cabana', sectorId: cabana, height: 2.7 });
    const pivotRoom = s.rooms[room]; void pivotRoom;
    const chave = prop(s, 'gp.key', f0, ruins[0], ruins[1], { name: 'Chave enferrujada', position: [ruins[0], 0.35, ruins[1]] });
    opening(s, f0, [3, 5], { kind: 'door' }, { mode: 'requires', requires: [chave], oneWay: 'none' }, 'Porta da cabana');
    opening(s, f0, [0, 2.5], { kind: 'window', width: 1.0 }, undefined, 'Janela oeste');
    prop(s, 'rel.altar', f0, 3, 1, { name: 'Altar improvisado' });
    prop(s, 'office.table_round', f0, 1.2, 3.8);
    prop(s, 'med.bed', f0, 5, 3.8, { rot: 90 });
    prop(s, 'gp.note', f0, 1.2, 3.8, { name: 'Carta do guarda-florestal', position: [1.2, 0.76, 3.8] });
    prop(s, 'gp.exit', f0, 5.3, 0.7, { name: 'Alçapão do porão', rot: 0 });
    prop(s, 'gp.checkpoint', f0, -44, 38, { name: 'Início da trilha' });
    prop(s, 'arch.fence_wood', f0, -47, 33, { rot: 20 });
    prop(s, 'nat.log', f0, -33, 22, { rot: 40 });
    prop(s, 'arch.wall_block', f0, ruins[0] + 2, ruins[1] - 2, { name: 'Muro caído' });
    prop(s, 'rel.cross', f0, ruins[0] - 2, ruins[1] + 1, { name: 'Cruz de pedra' });
    prop(s, 'gp.ammo', f0, -10, 10, { name: 'Munição' });

    addMarker(s, 'start', f0, trailhead[0], trailhead[1], { rot: -50 });
    addMarker(s, 'landmark', f0, 3, 2.5, { radius: 12, name: 'Cabana (visível entre as árvores)' });
    addMarker(s, 'side', f0, ruins[0], ruins[1], { radius: 5, name: 'Ruínas da capela', description: 'Onde está a chave.' });
    addMarker(s, 'main', f0, 3, 2.5, { radius: 3, name: 'Entrar na cabana' });
    addMarker(s, 'ambush', f0, -12, 14, { radius: 5, name: 'Algo segue o jogador' });
    addMarker(s, 'atmosphere', f0, -30, 24, { radius: 6, name: 'A névoa fecha' });
    addMarker(s, 'resource', f0, -10, 10, {});
    addMarker(s, 'audio', f0, ruins[0], ruins[1], { radius: 10, name: 'Sino distante' });
    addLight(s, 'directional', f0, 0, 0, { color: '#8fa0b8', intensity: 0.7, position: [-20, 30, 15] });
    addLight(s, 'point', f0, 3, 2.5, { intensity: 4, range: 8, color: '#e0b878', flicker: true, position: [3, 2.2, 2.5] });
    s.atmosphere = { ...s.atmosphere, preset: 'forest-dusk', fog: 0.9, fogColor: '#2c3330', ambient: 0.35, ambientColor: '#8fa09a', sky: '#1d2523', timeOfDay: 19, sunIntensity: 0.25, flashlight: true };
    s.pacing = [
      { id: 'f1', name: 'Entrada na mata', tension: 2, minutes: 4, gameplay: 'Seguir a trilha', narrative: 'O silêncio é anormal.', emotion: 'curiosity', encounter: 'Nenhum', lighting: 'Crepúsculo', audio: 'Vento' },
      { id: 'f2', name: 'Ruínas', tension: 5, minutes: 5, gameplay: 'Achar a chave', narrative: 'Sinais de culto.', emotion: 'mystery', encounter: 'Algo à espreita', lighting: 'Névoa', audio: 'Sino' },
      { id: 'f3', name: 'Cabana', tension: 8, minutes: 4, gameplay: 'Abrir a cabana e descer', narrative: 'A carta revela o porão.', emotion: 'fear', encounter: 'Ameaça', lighting: 'Lanterna', audio: 'Respiração' },
    ];
  });
}
