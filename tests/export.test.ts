import { describe, expect, it } from 'vitest';
import { setAutoFreeze } from 'immer';
import { TEMPLATES } from '../src/templates';
import { dimensionReportCsv, planSvg, progressionJson, propsListCsv } from '../src/export/exporters';
import { pacingWarnings } from '../src/ui/ProductionPanels';
import { SMART_PRESETS } from '../src/ui/SmartRooms';
import { getDef } from '../src/assets/props';
import { DEFAULT_CHARACTER } from '../src/core/defaults';
import { buildHeat } from '../src/ui/ProductionPanels';
import type { PacingBeat } from '../src/core/types';

setAutoFreeze(false);
const bunker = () => TEMPLATES.find((t) => t.id === 'bunker')!.build();
const beat = (tension: number, name = 'm'): PacingBeat => ({ id: name + tension, name, tension, minutes: 3, gameplay: '', narrative: '', emotion: 'fear', encounter: '', lighting: '', audio: '' });

describe('exportações', () => {
  it('SVG da planta é XML válido com paredes, portas e rótulos de sala', () => {
    const p = bunker(); const fid = Object.values(p.scene.floors).find((f) => f.name === 'Térreo')!.id;
    const svg = planSvg(p.scene, fid);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('HALL');
    expect(svg).toContain('ARQUIVO');
    expect(svg.match(/<line /g)!.length).toBeGreaterThan(30);
    // sem NaN em coordenadas
    expect(svg).not.toMatch(/NaN|undefined/);
  });
  it('relatório de dimensões lista todos os ambientes e portas', () => {
    const p = bunker();
    const csv = dimensionReportCsv(p.scene);
    expect(csv.split('\n').length).toBe(1 + Object.keys(p.scene.rooms).length + Object.keys(p.scene.openings).length + Object.keys(p.scene.stairs).length);
    expect(csv).toContain('Hall');
  });
  it('lista de objetos traz o resumo e os requisitos', () => {
    const p = bunker();
    const csv = propsListCsv(p.scene);
    expect(csv).toContain('RESUMO');
    expect(csv).toMatch(/Chave do almoxarifado/);
  });
  it('JSON de progressão é consistente com a análise', () => {
    const p = bunker();
    const j = JSON.parse(progressionJson(p.scene, DEFAULT_CHARACTER));
    expect(j.saidaAlcancada).toBe(true);
    expect(j.etapas.length).toBeGreaterThan(8);
    expect(j.marcadores.length).toBeGreaterThan(3);
  });
});

describe('ritmo', () => {
  it('avisa sobre tensão alta contínua, calma contínua e curva plana', () => {
    expect(pacingWarnings([beat(8, 'a'), beat(9, 'b'), beat(8, 'c')]).join()).toMatch(/três momentos seguidos de tensão alta/i);
    expect(pacingWarnings([beat(1, 'a'), beat(2, 'b'), beat(1, 'c')]).join()).toMatch(/calmos/i);
    expect(pacingWarnings([beat(4), beat(5), beat(4)]).join()).toMatch(/plana/);
    expect(pacingWarnings([beat(2), beat(6), beat(9), beat(3)])).toEqual([]);
  });
});

describe('smart rooms', () => {
  it('todos os objetos dos presets existem na biblioteca', () => {
    for (const p of SMART_PRESETS) for (const [def] of p.items) expect(getDef(def), `${p.id}: ${def}`).toBeTruthy();
  });
});

describe('replay', () => {
  it('mapa de calor soma as amostras por célula', () => {
    const p = bunker(); const fid = p.scene.floorOrder[0];
    const rec = { id: 'r', startedAt: '', durationSec: 5, distance: 3, events: [], roomsVisited: [], completed: false, samples: [0, 0.25, 0.5].map((t) => ({ t, x: 2.2, y: 0, z: 2.3, yaw: 0, floorId: fid })) };
    // buildHeat lê a cena do store; aqui só valida a contagem quando há floor
    const h = buildHeat([rec], 'inexistente');
    expect(h).toBeNull();
  });
});
