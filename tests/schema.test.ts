import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { emptyProject } from '../src/core/defaults';
import { parseProjectJson, validateProject } from '../src/core/schema';
import { addRoomRect, addOpening } from '../src/editor/rooms';
import { addProp } from '../src/editor/actions';

function sample() {
  const p = emptyProject('Teste');
  const s = p.scene;
  addRoomRect(s, s.floorOrder[0], 0, 0, 6, 4);
  const w = Object.values(s.walls)[0];
  addOpening(s, w.id, 3, { kind: 'door' });
  addProp(s, 'office.desk', s.floorOrder[0], 2, 2);
  return p;
}

describe('schema e persistência', () => {
  it('ida e volta em JSON não perde dados', () => {
    const p = sample();
    const r = parseProjectJson(JSON.stringify(p));
    expect(r.ok).toBe(true);
    expect(r.project!.scene).toEqual(p.scene);
    expect(r.project!.name).toBe('Teste');
  });

  it('migra projeto sem schema (v0) avisando', () => {
    const p: any = JSON.parse(JSON.stringify(sample()));
    delete p.schema;
    const r = validateProject(p);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/migrado/);
  });

  it('rejeita schema mais novo e JSON inválido com mensagem', () => {
    const p: any = JSON.parse(JSON.stringify(sample()));
    p.schema = 999;
    expect(validateProject(p).ok).toBe(false);
    expect(parseProjectJson('{oops').errors[0]).toMatch(/JSON inválido/);
  });

  it('detecta referência quebrada e id incoerente', () => {
    const p: any = JSON.parse(JSON.stringify(sample()));
    const wallId = Object.keys(p.scene.walls)[0];
    p.scene.walls[wallId].floorId = 'floor_inexistente';
    const r = validateProject(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/pavimento/);
    const q: any = JSON.parse(JSON.stringify(sample()));
    const rid = Object.keys(q.scene.rooms)[0];
    q.scene.rooms[rid].id = 'outro';
    expect(validateProject(q).errors.join(' ')).toMatch(/não confere/);
  });

  it('abertura órfã é removida COM aviso (nunca em silêncio)', () => {
    const p: any = JSON.parse(JSON.stringify(sample()));
    const oid = Object.keys(p.scene.openings)[0];
    p.scene.openings[oid].wallId = 'wall_fantasma';
    const r = validateProject(p);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/removida/);
    expect(Object.keys(r.project!.scene.openings)).toHaveLength(0);
  });
});
