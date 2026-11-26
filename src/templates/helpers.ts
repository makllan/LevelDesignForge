import type { DoorLogic, ID, Project, Scene, Vec2 } from '../core/types';
import { emptyProject } from '../core/defaults';
import { addOpening, nearestWall, newSector, type OpeningInput } from '../editor/rooms';
import { addProp } from '../editor/actions';
import type { PropInst } from '../core/types';

export function build(name: string, description: string, fn: (s: Scene, p: Project) => void): Project {
  const p = emptyProject(name);
  p.description = description;
  p.scene.sectors = {};
  fn(p.scene, p);
  return p;
}

export const sector = (s: Scene, name: string, color: string) => newSector(s, name, color);

/** Abertura na parede mais próxima do ponto; lança erro se não couber (modelos precisam sair corretos). */
export function opening(s: Scene, floorId: ID, at: Vec2, input: OpeningInput, logic?: Partial<DoorLogic>, name?: string): ID {
  const hit = nearestWall(s, floorId, at, 0.6);
  if (!hit) throw new Error(`Sem parede perto de ${at.join(',')}`);
  const r = addOpening(s, hit.wall.id, at, { ...input, name });
  if (!r.id) throw new Error(`Abertura em ${at.join(',')}: ${r.reason}`);
  if (logic) Object.assign(s.openings[r.id].logic, logic);
  return r.id;
}

export function prop(s: Scene, defId: string, floorId: ID, x: number, z: number, o: Partial<PropInst> = {}): ID {
  return addProp(s, defId, floorId, x, z, o);
}
