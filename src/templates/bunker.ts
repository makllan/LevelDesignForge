/**
 * Núcleo do bunker — cenário de validação do ORDO Forge.
 * Cadeia: Chave (Escritório) → Almoxarifado → Fusível → Gerador → Saída;
 * Cartão (Arquivo) → porta da Contenção; atalho barricado entre Hall e Arquivo; porta falsa na entrada.
 */
import type { Project } from '../core/types';
import { addBasement, addLight, addMarker } from '../editor/actions';
import { addCorridor, addRoomRect } from '../editor/rooms';
import { addStair } from '../editor/actions';
import { build, opening, prop, sector } from './helpers';

export function buildBunker(): Project {
  return build('Núcleo do bunker', 'Complexo subterrâneo de contenção sob uma abadia. Duas camadas de trancas, um atalho e uma descida ao subsolo.', (s, p) => {
    const f0 = s.floorOrder[0];
    s.floors[f0].name = 'Térreo';
    const acesso = sector(s, 'Acesso', '#8a5a44'), adm = sector(s, 'Administração', '#a38a4a'), ind = sector(s, 'Industrial', '#6f7f56'), cont = sector(s, 'Contenção', '#7d5f7a');

    // ---- térreo
    addRoomRect(s, f0, 0, 0, 8, 6, { name: 'Hall de entrada', sectorId: acesso });
    addRoomRect(s, f0, 0, -6.2, 10, 6.2, { name: 'Arquivo', sectorId: adm });
    addRoomRect(s, f0, 10, -6.2, 8, 8, { name: 'Escritório', sectorId: adm });
    addCorridor(s, f0, [8, 3], [22, 3], 2.4, { name: 'Corredor principal', sectorId: acesso });
    addRoomRect(s, f0, 10, 4.2, 6, 6, { name: 'Almoxarifado', sectorId: ind });
    const ger = addRoomRect(s, f0, 22, -1.5, 12, 9, { name: 'Sala dos geradores', sectorId: ind });
    s.rooms[ger].holes = [[[24.2, 5.3], [28.6, 5.3], [28.6, 6.7], [24.2, 6.7]]];

    // ---- subsolo
    const sub = addBasement(s, 'Subsolo 1', 3);
    s.floors[sub].color = '#8d867a';
    const ante = addRoomRect(s, sub, 22, -1.5, 7.5, 9, { name: 'Antecâmara', sectorId: cont, hasCeiling: false });
    const camara = addRoomRect(s, sub, 29.5, -1.5, 4.5, 9, { name: 'Câmara de contenção', sectorId: cont, hasCeiling: false });
    void ante; void camara;
    addStair(s, sub, 24.4, 6, 0, { kind: 'stair', width: 1.4, run: 4, rise: 3, steps: 17 });

    // ---- aberturas (depois de todas as salas, para não perder vãos ao dividir paredes)
    opening(s, f0, [0, 3], { kind: 'door' }, { mode: 'free', fake: true, requires: [], oneWay: 'none' }, 'Porta externa (falsa)');
    const dHall = opening(s, f0, [8, 3], { kind: 'door' }, undefined, 'Porta do hall');
    opening(s, f0, [14, 1.8], { kind: 'door' }, undefined, 'Porta do escritório');
    opening(s, f0, [10, -3], { kind: 'door' }, undefined, 'Porta do arquivo');
    opening(s, f0, [4, 0], { kind: 'arch', width: 1.2, height: 2.3 }, undefined, 'Passagem barricada');
    const dAlmox = opening(s, f0, [13, 4.2], { kind: 'door' }, undefined, 'Porta do almoxarifado');
    opening(s, f0, [22, 3], { kind: 'door', width: 1.4 }, undefined, 'Porta dos geradores');
    const dCont = opening(s, sub, [29.5, 3], { kind: 'door', width: 1.2 }, undefined, 'Porta da contenção');
    void dHall;

    // ---- objetos de gameplay e cadeia lógica
    const chave = prop(s, 'gp.key', f0, 16.2, -4.8, { name: 'Chave do almoxarifado', position: [16.2, 0.8, -4.8] });
    const cartao = prop(s, 'gp.card', f0, 8.8, -4.8, { name: 'Cartão de acesso Nível 2', position: [8.8, 0.9, -4.8] });
    const fusivel = prop(s, 'gp.fuse', f0, 14.2, 9.4, { name: 'Fusível principal', position: [14.2, 1.0, 9.4] });
    const gerador = prop(s, 'gp.generator', f0, 29.5, 4.5, { name: 'Gerador de emergência', requires: [fusivel] });
    prop(s, 'gp.checkpoint', f0, 3, 3, { name: 'Checkpoint do hall' });
    prop(s, 'gp.shortcut', f0, 4, 0, { name: 'Barricada do arquivo' });
    prop(s, 'gp.exit', sub, 32.8, 3, { name: 'Elevador de serviço', requires: [gerador] });
    s.openings[dAlmox].logic = { mode: 'requires', requires: [chave], oneWay: 'none' };
    s.openings[dCont].logic = { mode: 'requires', requires: [cartao], oneWay: 'none' };

    // ---- ambientação
    prop(s, 'office.desk', f0, 13.4, -4.6, { name: 'Mesa do administrador' });
    prop(s, 'office.chair', f0, 13.4, -3.6, { rot: 180 });
    prop(s, 'office.computer', f0, 13.4, -4.8, { position: [13.4, 0.76, -4.8] });
    prop(s, 'office.filing', f0, 17.2, -2, { rot: -90 });
    prop(s, 'office.bookshelf', f0, 2, -5.6, { name: 'Estante do arquivo' });
    prop(s, 'office.bookshelf', f0, 5, -5.6);
    prop(s, 'office.filing', f0, 8.9, -1.6, { rot: 90 });
    prop(s, 'office.sofa', f0, 2.2, 4.8, { rot: 0 });
    prop(s, 'office.table_round', f0, 5.5, 5.0);
    prop(s, 'ind.shelf', f0, 11, 9.4, { rot: 180 });
    prop(s, 'ind.crate', f0, 15, 5.2);
    prop(s, 'ind.crate_small', f0, 11, 5.2);
    prop(s, 'ind.panel', f0, 22.5, 6.8, { rot: 90 });
    prop(s, 'ind.generator', f0, 29.5, 0.5, { name: 'Gerador principal (apagado)' });
    prop(s, 'ind.machine', f0, 24.5, 0.2);
    prop(s, 'ind.pipe_h', f0, 26, -1.2, { position: [26, 2.2, -1.2] });
    prop(s, 'cont.cell', sub, 32.2, 0.4, { name: 'Cela de contenção' });
    prop(s, 'cont.chamber', sub, 24.5, 0.2);
    prop(s, 'cont.warning_light', sub, 27.2, 5.5);
    prop(s, 'gp.enemy', sub, 32.4, 5.8, { name: 'Entidade contida' });
    prop(s, 'gp.ammo', f0, 3, 4.6, { name: 'Munição' });
    prop(s, 'gp.note', f0, 13.4, -4.2, { name: 'Bilhete: diário do administrador', position: [13.4, 0.77, -4.2] });

    // ---- marcadores de level design
    addMarker(s, 'start', f0, 3, 3, { rot: 0 });
    addMarker(s, 'safe', f0, 3.5, 3, { radius: 3.5, name: 'Hall seguro' });
    addMarker(s, 'main', f0, 14, -2.5, { radius: 3, name: 'Encontrar a chave', description: 'A chave abre o almoxarifado.' });
    addMarker(s, 'puzzle', f0, 29.5, 4.5, { radius: 2, name: 'Ligar o gerador', description: 'Precisa do fusível guardado no almoxarifado.' });
    addMarker(s, 'landmark', f0, 29.5, 0.5, { radius: 3, name: 'Gerador gigante' });
    addMarker(s, 'shortcut', f0, 4, -1.2, { radius: 1.5, name: 'Atalho Hall → Arquivo' });
    addMarker(s, 'resource', f0, 3, 4.6, { name: 'Munição' });
    addMarker(s, 'combat', sub, 32, 4.5, { radius: 4, name: 'Entidade na contenção' });
    addMarker(s, 'reveal', sub, 32.2, 0.4, { name: 'Revelação: o que foi contido' });
    addMarker(s, 'main', sub, 32.8, 3, { radius: 2, name: 'Alcançar o elevador' });
    addMarker(s, 'sightline', f0, 22, 3, { rot: 0, radius: 12, name: 'Corredor revela o gerador' });

    // ---- luz
    for (const [x, z, fl, flicker] of [[3, 3, f0, false], [14, -2, f0, false], [13, 7, f0, true], [15, 3, f0, true], [27, 3, f0, false], [24.5, 1.5, sub, true], [32, 3, sub, false]] as const)
      addLight(s, 'point', fl, x, z, { intensity: 5, range: 9, flicker, position: [x, fl === sub ? 2.4 : 2.5, z] });
    s.atmosphere = { ...s.atmosphere, preset: 'bunker', ambient: 0.28, ambientColor: '#b8a98a', fog: 0.35, fogColor: '#1c1a17', sky: '#14130f', flashlight: true, sunIntensity: 0 };

    s.pacing = [
      { id: 'beat1', roomId: undefined, sectorId: acesso, name: 'Chegada', tension: 2, minutes: 3, gameplay: 'Explorar o hall e achar o corredor', narrative: 'A porta externa está trancada: não há volta.', emotion: 'curiosity', encounter: 'Nenhum', lighting: 'Lâmpadas estáveis', audio: 'Ventilação baixa' },
      { id: 'beat2', sectorId: adm, name: 'Rastro do administrador', tension: 4, minutes: 6, gameplay: 'Escritório e arquivo; achar chave e cartão', narrative: 'Bilhete sobre o que foi contido.', emotion: 'mystery', encounter: 'Nenhum', lighting: 'Luz cintilando', audio: 'Passos distantes' },
      { id: 'beat3', sectorId: ind, name: 'Restaurar a energia', tension: 6, minutes: 8, gameplay: 'Fusível → gerador', narrative: 'A energia desperta algo no subsolo.', emotion: 'anticipation', encounter: 'Emboscada leve', lighting: 'Escuro com lanterna', audio: 'Zumbido do gerador' },
      { id: 'beat4', sectorId: cont, name: 'Contenção', tension: 9, minutes: 5, gameplay: 'Descer, evitar a entidade e chegar ao elevador', narrative: 'Revelação do que a Igreja guarda.', emotion: 'fear', encounter: 'Entidade', lighting: 'Emergência vermelha', audio: 'Respiração' },
    ];
    void p;
  });
}
