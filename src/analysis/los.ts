/** Linha de visão por raycast 3D contra o mundo de colisão (portas fechadas bloqueiam). */
import type { CharacterConfig, ID, Scene, Vec2 } from '../core/types';
import { buildWorld, raycast, type World } from '../geometry/colliders';
import { getDef } from '../assets/props';
import { MARKER_INFO } from '../core/markerKinds';

export interface LosResult { origin: Vec2; poly: Vec2[]; targets: { pos: Vec2; visible: boolean; name: string }[]; visibleCount: number }

/** Polígono de visibilidade (leque de raios) + quais alvos de interesse ficam visíveis a partir de um ponto. */
export function computeLos(scene: Scene, cfg: CharacterConfig, floorId: ID, x: number, z: number, opts: { world?: World; range?: number; rays?: number; targetHeight?: number } = {}): LosResult {
  const world = opts.world ?? buildWorld(scene);
  for (const b of world.blocks.values()) b.active = true;
  for (const b of world.doors.values()) b.active = true;
  const elev = scene.floors[floorId]?.elevation ?? 0;
  const eye = elev + cfg.eyeHeight;
  const range = opts.range ?? 40, N = opts.rays ?? 360;
  const poly: Vec2[] = [];
  const ignoreFloorSlab = (b: { kind: string }) => b.kind !== 'sill' || true;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    const hit = raycast(world, [x, eye, z], [dx, 0, dz], range, ignoreFloorSlab);
    const t = hit ? hit.t : range;
    poly.push([x + dx * t, z + dz * t]);
  }
  const targets: LosResult['targets'] = [];
  const test = (tx: number, ty: number, tz: number, name: string) => {
    const dx = tx - x, dy = ty - eye, dz = tz - z; const L = Math.hypot(dx, dy, dz);
    if (L < 0.01 || L > range) { targets.push({ pos: [tx, tz], visible: false, name }); return; }
    const hit = raycast(world, [x, eye, z], [dx / L, dy / L, dz / L], L - 0.15);
    targets.push({ pos: [tx, tz], visible: !hit, name });
  };
  for (const m of Object.values(scene.markers)) {
    if (m.floorId !== floorId || !['main', 'side', 'landmark', 'poi', 'enemy', 'puzzle', 'reveal', 'vantage', 'sightline'].includes(m.kind)) continue;
    test(m.position[0], (scene.floors[m.floorId]?.elevation ?? 0) + 1.3, m.position[2], m.name || MARKER_INFO[m.kind].label);
  }
  for (const p of Object.values(scene.props)) {
    const g = getDef(p.defId)?.gameplay; if (!g || p.floorId !== floorId || g === 'checkpoint' || g === 'trigger') continue;
    const d = getDef(p.defId)!;
    test(p.position[0], elev + p.position[1] + Math.min(1.6, d.size[1] * p.scale * 0.6), p.position[2], p.name);
  }
  return { origin: [x, z], poly, targets, visibleCount: targets.filter((t) => t.visible).length };
}
