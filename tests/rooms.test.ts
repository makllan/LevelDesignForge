import { describe, expect, it } from 'vitest';
import { produce, setAutoFreeze } from 'immer';
import { emptyProject, emptyScene } from '../src/core/defaults';
import { addCorridor, addOpening, addRoomRect, removeRoom, setRoomPolygon, addStandaloneWall } from '../src/editor/rooms';
import { wallPieces, openingProblems } from '../src/geometry/walls';
import { resizeRoomBounds, captureClip, pasteClip, deleteEntities } from '../src/editor/actions';
import type { Scene } from '../src/core/types';
import { useScene } from '../src/editor/store';
import { wallLength } from '../src/core/scene';

setAutoFreeze(false);
const fid = (s: Scene) => s.floorOrder[0];
const totalWallLength = (s: Scene) => Object.values(s.walls).reduce((a, w) => a + wallLength(w), 0);

describe('paredes compartilhadas', () => {
  it('uma sala retangular gera 4 paredes', () => {
    const s = emptyScene();
    addRoomRect(s, fid(s), 0, 0, 4, 3);
    expect(Object.keys(s.walls)).toHaveLength(4);
    expect(totalWallLength(s)).toBeCloseTo(14, 3);
  });

  it('salas vizinhas compartilham a parede sem duplicar geometria', () => {
    const s = emptyScene();
    addRoomRect(s, fid(s), 0, 0, 4, 3);
    addRoomRect(s, fid(s), 4, 0, 4, 3);
    // 4 + 4 arestas, 1 compartilhada → 7 paredes e perímetro 14 + 14 - 3
    expect(Object.keys(s.walls)).toHaveLength(7);
    expect(totalWallLength(s)).toBeCloseTo(25, 3);
    const shared = Object.values(s.walls).filter((w) => w.sources.length === 2);
    expect(shared).toHaveLength(1);
  });

  it('sobreposição parcial divide a parede existente (corredor ao longo de uma sala)', () => {
    const s = emptyScene();
    addRoomRect(s, fid(s), 0, 0, 10, 4);
    addRoomRect(s, fid(s), 3, 4, 4, 3); // encosta parcialmente na aresta inferior (y=4, x 3..7)
    const bottom = Object.values(s.walls).filter((w) => Math.abs(w.a[1] - 4) < 1e-6 && Math.abs(w.b[1] - 4) < 1e-6);
    // 0..3 (só sala 1), 3..7 (compartilhada), 7..10 (só sala 1)
    expect(bottom).toHaveLength(3);
    expect(bottom.filter((w) => w.sources.length === 2)).toHaveLength(1);
    expect(bottom.reduce((a, w) => a + wallLength(w), 0)).toBeCloseTo(10, 3);
  });

  it('remover uma sala mantém a parede compartilhada e apaga as exclusivas', () => {
    const s = emptyScene();
    const a = addRoomRect(s, fid(s), 0, 0, 4, 3);
    addRoomRect(s, fid(s), 4, 0, 4, 3);
    removeRoom(s, a);
    expect(Object.keys(s.walls)).toHaveLength(4);
    expect(Object.values(s.walls).every((w) => w.sources.length === 1)).toBe(true);
  });
});

describe('aberturas reais', () => {
  it('uma porta abre um vão sólido: peças não cobrem a largura da porta', () => {
    const s = emptyScene();
    addRoomRect(s, fid(s), 0, 0, 6, 4);
    const wall = Object.values(s.walls).find((w) => w.a[1] === 0 && w.b[1] === 0)!;
    const r = addOpening(s, wall.id, 3, { kind: 'door' });
    expect(r.id).toBeTruthy();
    const pieces = wallPieces(s, wall);
    const solid = pieces.filter((p) => p.kind === 'solid');
    expect(solid).toHaveLength(2);
    const gap = solid[1].u0 - solid[0].u1;
    expect(gap).toBeCloseTo(1.0, 3);
    // verga acima da porta
    const lintel = pieces.find((p) => p.kind === 'lintel')!;
    expect(lintel.y0).toBeCloseTo(2.1, 3);
    expect(lintel.y1).toBeCloseTo(3, 3);
  });

  it('janela produz peitoril e verga', () => {
    const s = emptyScene();
    addRoomRect(s, fid(s), 0, 0, 6, 4);
    const wall = Object.values(s.walls)[0];
    addOpening(s, wall.id, 2, { kind: 'window' });
    const kinds = wallPieces(s, wall).map((p) => p.kind).sort();
    expect(kinds).toContain('sill');
    expect(kinds).toContain('lintel');
  });

  it('rejeita abertura que não cabe ou que se sobrepõe', () => {
    const s = emptyScene();
    addRoomRect(s, fid(s), 0, 0, 6, 4);
    const wall = Object.values(s.walls).find((w) => w.a[1] === 0 && w.b[1] === 0)!;
    expect(addOpening(s, wall.id, 3, { kind: 'door', width: 9 }).reason).toMatch(/menor/);
    expect(addOpening(s, wall.id, 3, { kind: 'door' }).id).toBeTruthy();
    expect(addOpening(s, wall.id, 3.4, { kind: 'door' }).reason).toMatch(/outra abertura/);
  });

  it('dividir uma parede por uma sala vizinha preserva a porta no trecho certo', () => {
    const s = emptyScene();
    addRoomRect(s, fid(s), 0, 0, 10, 4);
    const wall = Object.values(s.walls).find((w) => w.a[1] === 4 && w.b[1] === 4)!;
    const id = addOpening(s, wall.id, 5, { kind: 'door' }).id!;
    addRoomRect(s, fid(s), 3, 4, 4, 3);
    const o = s.openings[id];
    const w = s.walls[o.wallId];
    expect(w.sources).toHaveLength(2); // a porta está agora na parede compartilhada
    expect(openingProblems(s, o)).toHaveLength(0);
  });
});

describe('redimensionar e mover salas', () => {
  it('redimensionar preserva a porta (id estável) e reposiciona proporcionalmente', () => {
    const s = emptyScene();
    const room = addRoomRect(s, fid(s), 0, 0, 6, 4);
    const wall = Object.values(s.walls).find((w) => w.a[1] === 0 && w.b[1] === 0)!;
    const id = addOpening(s, wall.id, 3, { kind: 'door' }).id!;
    resizeRoomBounds(s, room, 10, 4);
    const o = s.openings[id];
    expect(o).toBeTruthy();
    const w = s.walls[o.wallId];
    expect(wallLength(w)).toBeCloseTo(10, 3);
    expect(o.offset).toBeCloseTo(5, 1);
  });

  it('mover uma sala leva suas portas junto', () => {
    const s = emptyScene();
    const room = addRoomRect(s, fid(s), 0, 0, 6, 4);
    const wall = Object.values(s.walls).find((w) => w.a[1] === 0 && w.b[1] === 0)!;
    const id = addOpening(s, wall.id, 3, { kind: 'door' }).id!;
    const poly = s.rooms[room].polygon.map((p) => [p[0] + 10, p[1] + 5] as [number, number]);
    setRoomPolygon(s, room, poly);
    const w = s.walls[s.openings[id].wallId];
    expect(w.a[0]).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(w.a[1]).toBeCloseTo(5, 3);
  });

  it('copiar/colar sala copia as aberturas e gera novos ids', () => {
    const s = emptyScene();
    const room = addRoomRect(s, fid(s), 0, 0, 6, 4);
    const wall = Object.values(s.walls).find((w) => w.a[1] === 0 && w.b[1] === 0)!;
    addOpening(s, wall.id, 3, { kind: 'door' });
    const clip = captureClip(s, [{ kind: 'room', id: room }]);
    const out = pasteClip(s, clip, 10, 0);
    expect(out).toHaveLength(1);
    expect(Object.keys(s.rooms)).toHaveLength(2);
    expect(Object.keys(s.openings)).toHaveLength(2);
    expect(new Set(Object.keys(s.openings)).size).toBe(2);
  });

  it('corredor orientado cria sala do tipo corredor', () => {
    const s = emptyScene();
    const id = addCorridor(s, fid(s), [0, 0], [8, 0], 2)!;
    expect(s.rooms[id].kind).toBe('corridor');
    expect(Object.keys(s.walls)).toHaveLength(4);
  });

  it('excluir sala remove suas aberturas', () => {
    const s = emptyScene();
    const room = addRoomRect(s, fid(s), 0, 0, 6, 4);
    const wall = Object.values(s.walls)[0];
    addOpening(s, wall.id, 3, { kind: 'door' });
    deleteEntities(s, [{ kind: 'room', id: room }]);
    expect(Object.keys(s.openings)).toHaveLength(0);
    expect(Object.keys(s.walls)).toHaveLength(0);
  });

  it('parede avulsa sobrevive à remoção da sala vizinha', () => {
    const s = emptyScene();
    const room = addRoomRect(s, fid(s), 0, 0, 6, 4);
    addStandaloneWall(s, fid(s), [0, 0], [6, 0]);
    removeRoom(s, room);
    expect(Object.keys(s.walls)).toHaveLength(1);
  });
});

describe('undo/redo', () => {
  it('desfaz e refaz a criação de uma sala', () => {
    useScene.getState().setProject(emptyProject('t'));
    const s0 = useScene.getState().project.scene;
    useScene.getState().commit('Criar sala', (s) => { addRoomRect(s, s.floorOrder[0], 0, 0, 4, 3); });
    expect(Object.keys(useScene.getState().project.scene.rooms)).toHaveLength(1);
    useScene.getState().undo();
    expect(Object.keys(useScene.getState().project.scene.rooms)).toHaveLength(0);
    expect(useScene.getState().project.scene).toBe(s0);
    useScene.getState().redo();
    expect(Object.keys(useScene.getState().project.scene.rooms)).toHaveLength(1);
  });

  it('pré-visualização não entra no histórico até confirmar', () => {
    useScene.getState().setProject(emptyProject('t'));
    const id = useScene.getState().commit('Criar', (s) => addRoomRect(s, s.floorOrder[0], 0, 0, 4, 3));
    const n = useScene.getState().past.length;
    useScene.getState().preview((s) => { resizeRoomBounds(s, id, 6, 3); });
    useScene.getState().preview((s) => { resizeRoomBounds(s, id, 8, 3); });
    expect(useScene.getState().past.length).toBe(n);
    useScene.getState().endPreview('Redimensionar');
    expect(useScene.getState().past.length).toBe(n + 1);
    useScene.getState().undo();
    const w = useScene.getState().project.scene.rooms[id].polygon;
    expect(w[1][0]).toBeCloseTo(4, 3);
  });

  it('produce usado fora do store também é seguro', () => {
    const s = produce(emptyScene(), (d) => { addRoomRect(d, d.floorOrder[0], 0, 0, 2, 2); });
    expect(Object.keys(s.rooms)).toHaveLength(1);
  });
});
