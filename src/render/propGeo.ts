import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getDef, type Part } from '../assets/props';

const unit = new Map<string, THREE.BufferGeometry>();
function unitGeo(kind: Part['s']): THREE.BufferGeometry {
  let g = unit.get(kind);
  if (g) return g;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); break;
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 20); g.translate(0, 0.5, 0); break;
    case 'sph': g = new THREE.SphereGeometry(0.5, 16, 12); g.translate(0, 0.5, 0); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 18); g.translate(0, 0.5, 0); break;
    case 'prism': {
      const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.closePath();
      g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      break;
    }
  }
  unit.set(kind, g!);
  return g!;
}

export interface PropMesh { geo: THREE.BufferGeometry; color: string; glass: boolean }
const cache = new Map<string, PropMesh[]>();

/** Peças do prop fundidas por material (poucas draw calls, geometria compartilhada entre instâncias). */
export function propMeshes(defId: string): PropMesh[] {
  const hit = cache.get(defId);
  if (hit) return hit;
  const d = getDef(defId);
  const groups = new Map<string, { color: string; glass: boolean; geos: THREE.BufferGeometry[] }>();
  for (const p of d?.parts ?? []) {
    const g = unitGeo(p.s).clone();
    g.scale(p.w, p.s === 'sph' ? p.w : p.h, p.d);
    // pivô no centro da altura para rotações
    const hh = p.s === 'sph' ? p.w : p.h;
    g.translate(0, -hh / 2, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(((p.rx ?? 0) * Math.PI) / 180, ((p.ry ?? 0) * Math.PI) / 180, ((p.rz ?? 0) * Math.PI) / 180, 'ZYX'));
    g.applyMatrix4(m);
    g.translate(p.x, p.y + hh / 2, p.z);
    const key = `${p.c}|${p.glass ? 1 : 0}`;
    let grp = groups.get(key);
    if (!grp) { grp = { color: p.c, glass: !!p.glass, geos: [] }; groups.set(key, grp); }
    grp.geos.push(g.index ? g.toNonIndexed() : g);
  }
  const out: PropMesh[] = [];
  for (const grp of groups.values()) {
    const merged = mergeGeometries(grp.geos, false);
    if (merged) { merged.computeVertexNormals(); out.push({ geo: merged, color: grp.color, glass: grp.glass }); }
    grp.geos.forEach((g) => g.dispose());
  }
  cache.set(defId, out);
  return out;
}
