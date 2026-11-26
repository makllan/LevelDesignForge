/**
 * Renderer — visualização 3D do modelo único (Scene). Não guarda estado de projeto:
 * apenas reflete `Scene` + estado de UI. Reconstrói só as entidades cujas dependências mudaram.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EntityRef, ID, Opening, Scene } from '../core/types';
import { DEG } from '../core/math';
import { getEntity, selectionBounds, wallHeight } from '../core/scene';
import { getDef } from '../assets/props';
import { wallBoxesWorld, openingFrame } from '../geometry/walls';
import { stairSteps } from '../geometry/stairs';
import { terrainHeight, cellSize } from '../geometry/terrain';
import { MARKER_INFO } from '../core/markerKinds';
import { propMeshes } from './propGeo';

export interface RenderUI {
  floorId: ID;
  floorView: 'all' | 'upto' | 'only';
  ghostFloors: boolean;
  shading: 'grey' | 'wire' | 'sector';
  hideCeilings: boolean;
  hidden: string[];
  isolate: EntityRef[] | null;
  markers: boolean;
  lit: boolean;
  editorHelpers: boolean;
}

export interface PickResult { ref: EntityRef; point: THREE.Vector3; distance: number }
type Deps = unknown[];
interface Built { obj: THREE.Object3D; deps: Deps }

const COL = {
  wall: '#aaa28f', floor: '#7d7667', ceiling: '#948c79', stair: '#9a8f78', shape: '#a39a86', bg: '#1c1a17',
  doorFree: '#8a6a45', doorReq: '#b8923a', doorLocked: '#8f3b2c', doorFake: '#5d5a52', select: '#e0b24f', hover: '#d8d0bf',
};

const matCache = new Map<string, THREE.Material>();
export function getMat(color: string, glass = false, extra: { emissive?: string; double?: boolean } = {}): THREE.MeshLambertMaterial {
  const key = `${color}|${glass}|${extra.emissive ?? ''}|${extra.double ?? ''}`;
  let m = matCache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, transparent: glass, opacity: glass ? 0.38 : 1, depthWrite: !glass, side: extra.double || glass ? THREE.DoubleSide : THREE.FrontSide });
    if (extra.emissive) m.emissive = new THREE.Color(extra.emissive);
    matCache.set(key, m);
  }
  return m;
}
const ghostCache = new Map<string, THREE.Material>();
function ghostOf(m: THREE.Material): THREE.Material {
  let g = ghostCache.get(m.uuid);
  if (!g) { g = m.clone(); g.transparent = true; (g as THREE.MeshLambertMaterial).opacity = 0.14; g.depthWrite = false; ghostCache.set(m.uuid, g); }
  return g;
}

/** φ em radianos: 0 = fechada, ~1.5 = aberta. Sinal consistente com a normal da parede (lado front). */
export function setDoorOpen(pivot: THREE.Object3D, phi: number, dirSign = 1) {
  pivot.rotation.y = (pivot.userData.baseRot as number) + (pivot.userData.hingeSign as number) * (pivot.userData.swing as number) * phi * dirSign;
}

function tagMesh(mesh: THREE.Mesh, mat: THREE.Material, extra: Record<string, unknown> = {}) {
  mesh.userData.mat = mat; mesh.userData.owned = true; Object.assign(mesh.userData, extra);
  return mesh;
}

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  readonly persp: THREE.PerspectiveCamera;
  readonly ortho: THREE.OrthographicCamera;
  camera: THREE.Camera;
  orbit: OrbitControls;
  readonly tc: TransformControls;
  readonly dom: HTMLElement;
  private built = new Map<string, Built>();
  private overlay = new THREE.Group();
  private hoverGroup = new THREE.Group();
  private gridHelper: THREE.GridHelper;
  private dirty = true;
  private raf = 0;
  private ro: ResizeObserver;
  private lastScene: Scene | null = null;
  private lastUI: RenderUI | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private terrainRef: unknown = null;
  private doorPivots = new Map<ID, THREE.Object3D>();
  private lights = new THREE.Group();
  private selection: EntityRef[] = [];
  private hoverRef: EntityRef | null = null;
  private proxy = new THREE.Object3D();
  private proxyBase = { pos: new THREE.Vector3(), rotY: 0, scale: 1 };
  private gizmoRefs: EntityRef[] = [];
  dragging = false;
  freeCam = false;
  private keys = new Set<string>();
  private freeLook = { yaw: 0, pitch: -0.5, active: false };
  private lastT = performance.now();
  onFrame: ((dt: number) => void) | null = null;
  continuous = false;
  onGizmo: { start?: () => void; change?: (d: { dx: number; dy: number; dz: number; rotDeg: number; scale: number }) => void; end?: () => void } = {};
  projection: 'persp' | 'ortho' = 'persp';
  preset: 'free' | 'top' | 'front' | 'side' = 'free';

  constructor(container: HTMLElement) {
    this.dom = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(COL.bg);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.persp = new THREE.PerspectiveCamera(50, 1, 0.1, 1500);
    this.persp.position.set(14, 13, 16);
    this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 1500);
    this.camera = this.persp;
    this.scene.add(this.root, this.overlay, this.hoverGroup, this.lights);
    this.gridHelper = new THREE.GridHelper(200, 200, 0x4a4438, 0x2b2822);
    this.gridHelper.position.y = -0.01;
    this.scene.add(this.gridHelper);
    this.setDefaultLights();

    this.orbit = new OrbitControls(this.persp, this.renderer.domElement);
    this.orbit.enableDamping = false;
    this.orbit.maxPolarAngle = Math.PI * 0.499;
    this.orbit.addEventListener('change', () => this.requestRender());
    this.orbit.screenSpacePanning = true;
    this.orbit.mouseButtons = { LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };

    this.tc = new TransformControls(this.persp, this.renderer.domElement);
    this.tc.setSize(0.8);
    this.scene.add(this.tc.getHelper());
    this.scene.add(this.proxy);
    this.tc.addEventListener('dragging-changed', (e) => {
      this.dragging = !!(e as unknown as { value: boolean }).value;
      this.orbit.enabled = !this.dragging && !this.freeCam;
      if (this.dragging) { this.proxyBase = { pos: this.proxy.position.clone(), rotY: this.proxy.rotation.y, scale: (this.proxy.scale.x + this.proxy.scale.y + this.proxy.scale.z) / 3 }; this.onGizmo.start?.(); }
      else { this.onGizmo.end?.(); }
    });
    this.tc.addEventListener('objectChange', () => {
      if (!this.dragging) return;
      const p = this.proxy;
      const k = (p.scale.x + p.scale.y + p.scale.z) / 3 / (this.proxyBase.scale || 1);
      this.onGizmo.change?.({ dx: p.position.x - this.proxyBase.pos.x, dy: p.position.y - this.proxyBase.pos.y, dz: p.position.z - this.proxyBase.pos.z, rotDeg: -((p.rotation.y - this.proxyBase.rotY) * 180) / Math.PI, scale: k });
      this.requestRender();
    });
    this.tc.addEventListener('change', () => this.requestRender());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('pointermove', this.onFreeMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onFreeDown);
    window.addEventListener('pointerup', this.onFreeUp);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ ciclo
  requestRender() { this.dirty = true; }
  private resize() {
    const w = Math.max(10, this.dom.clientWidth), h = Math.max(10, this.dom.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    this.fitOrtho();
    this.requestRender();
  }
  private fitOrtho() {
    const w = Math.max(10, this.dom.clientWidth), h = Math.max(10, this.dom.clientHeight);
    const dist = this.orbit.target.distanceTo(this.persp.position) || 20;
    const half = Math.max(2, this.orthoSize ?? dist * 0.5);
    this.ortho.left = (-half * w) / h; this.ortho.right = (half * w) / h; this.ortho.top = half; this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }
  private orthoSize: number | null = null;

  private loop(t: number) {
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    if (this.freeCam) this.updateFree(dt);
    this.onFrame?.(dt);
    if (this.dirty || this.continuous) {
      this.dirty = false;
      this.renderer.render(this.scene, this.activeCamera ?? this.camera);
    }
    this.raf = requestAnimationFrame(this.loop);
  }
  /** Câmera alternativa (playtest). */
  activeCamera: THREE.Camera | null = null;

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerup', this.onFreeUp);
    this.orbit.dispose(); this.tc.dispose();
    for (const b of this.built.values()) this.disposeObj(b.obj);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
  private disposeObj(o: THREE.Object3D) {
    o.traverse((c) => { const m = c as THREE.Mesh; if (m.userData?.owned && m.geometry) m.geometry.dispose(); });
    o.parent?.remove(o);
  }

  // ------------------------------------------------------------------ luzes
  private setDefaultLights() {
    this.lights.clear();
    const hemi = new THREE.HemisphereLight(0xeee4cf, 0x3a342b, 1.55);
    const dir = new THREE.DirectionalLight(0xfff0d8, 1.25);
    dir.position.set(-12, 22, 9);
    this.lights.add(hemi, dir);
  }

  private setLitLights(s: Scene) {
    this.lights.clear();
    const a = s.atmosphere;
    this.lights.add(new THREE.AmbientLight(new THREE.Color(a.ambientColor), a.ambient));
    const sun = new THREE.DirectionalLight(0xfff0d8, a.sunIntensity * Math.max(0, Math.sin(((a.timeOfDay - 6) / 12) * Math.PI)));
    const ang = ((a.timeOfDay - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(ang) * 30, Math.max(2, Math.sin(ang) * 30), 10);
    this.lights.add(sun);
    let n = 0;
    for (const l of Object.values(s.lights)) {
      const elev = s.floors[l.floorId]?.elevation ?? 0;
      if (l.kind === 'point' && n < 24) {
        const pl = new THREE.PointLight(new THREE.Color(l.color), l.intensity, l.range, 1.6);
        pl.position.set(l.position[0], elev + l.position[1], l.position[2]);
        pl.userData.light = l; this.lights.add(pl); n++;
      } else if (l.kind === 'spot' && n < 24) {
        const sl = new THREE.SpotLight(new THREE.Color(l.color), l.intensity * 2, l.range * 2, (l.angle * DEG) / 2, 0.4, 1.4);
        sl.position.set(l.position[0], elev + l.position[1], l.position[2]);
        sl.target.position.set(l.position[0] + Math.cos(l.rot * DEG) * 4, elev, l.position[2] + Math.sin(l.rot * DEG) * 4);
        this.lights.add(sl, sl.target); n++;
      } else if (l.kind === 'directional') {
        const d = new THREE.DirectionalLight(new THREE.Color(l.color), l.intensity * 0.6);
        d.position.set(l.position[0], elev + l.position[1], l.position[2]); this.lights.add(d);
      } else if (l.kind === 'ambient') this.lights.add(new THREE.AmbientLight(new THREE.Color(l.color), l.intensity));
    }
    this.scene.fog = a.fog > 0 ? new THREE.FogExp2(new THREE.Color(a.fogColor), a.fog * 0.06) : null;
    this.renderer.setClearColor(new THREE.Color(a.sky));
  }

  /** Cintilação das luzes marcadas (chamado pelo playtest a cada frame). */
  flickerLights(time: number) {
    for (const o of this.lights.children) {
      const l = o.userData.light as { flicker: boolean; intensity: number } | undefined;
      if (l?.flicker && (o as THREE.PointLight).isPointLight) (o as THREE.PointLight).intensity = l.intensity * (0.55 + 0.45 * Math.abs(Math.sin(time * 17 + (o.id % 7)) * Math.sin(time * 5.3)));
    }
    this.requestRender();
  }

  // ------------------------------------------------------------------ sincronização
  sync(s: Scene, ui: RenderUI) {
    const lightsChanged = this.lastUI?.lit !== ui.lit || (ui.lit && (this.lastScene?.lights !== s.lights || this.lastScene?.atmosphere !== s.atmosphere));
    this.lastScene = s; this.lastUI = ui;
    const seen = new Set<string>();
    const opensByWall = new Map<ID, Opening[]>();
    for (const o of Object.values(s.openings)) { const l = opensByWall.get(o.wallId); if (l) l.push(o); else opensByWall.set(o.wallId, [o]); }

    const ensure = (key: string, deps: Deps, make: () => THREE.Object3D) => {
      seen.add(key);
      const ex = this.built.get(key);
      if (ex && ex.deps.length === deps.length && ex.deps.every((d, i) => d === deps[i])) return;
      if (ex) this.disposeObj(ex.obj);
      const obj = make();
      this.root.add(obj);
      this.built.set(key, { obj, deps });
    };

    for (const r of Object.values(s.rooms)) {
      const fl = s.floors[r.floorId];
      ensure(`room:${r.id}`, [r, fl, ui.shading === 'sector' ? s.sectors[r.sectorId ?? ''] : null], () => this.buildRoom(s, r.id));
    }
    for (const w of Object.values(s.walls)) {
      const ops = opensByWall.get(w.id) ?? [];
      ensure(`wall:${w.id}`, [w, s.floors[w.floorId], ui.shading === 'sector', ...w.sources.map((x) => s.rooms[x.roomId]), ...ops], () => this.buildWall(s, w.id, ops, ui.shading === 'sector'));
    }
    this.doorPivots.clear();
    for (const o of Object.values(s.openings)) {
      const w = s.walls[o.wallId];
      ensure(`opening:${o.id}`, [o, w, s.floors[w?.floorId ?? '']], () => this.buildOpeningLeaf(s, o));
      const b = this.built.get(`opening:${o.id}`);
      if (b && b.obj.userData.pivot) this.doorPivots.set(o.id, b.obj.userData.pivot as THREE.Object3D);
    }
    for (const st of Object.values(s.stairs)) ensure(`stair:${st.id}`, [st, s.floors[st.floorId]], () => this.buildStair(s, st.id));
    for (const sh of Object.values(s.shapes)) ensure(`shape:${sh.id}`, [sh, s.floors[sh.floorId]], () => this.buildShape(s, sh.id));
    for (const p of Object.values(s.props)) ensure(`prop:${p.id}`, [p, s.floors[p.floorId]], () => this.buildProp(s, p.id));
    for (const m of Object.values(s.markers)) ensure(`marker:${m.id}`, [m, s.floors[m.floorId]], () => this.buildMarker(s, m.id));
    for (const l of Object.values(s.lights)) ensure(`light:${l.id}`, [l, s.floors[l.floorId]], () => this.buildLightIcon(s, l.id));
    for (const sc of Object.values(s.scatter)) ensure(`scatter:${sc.id}`, [sc, s.terrain, s.floors[sc.floorId]], () => this.buildScatter(s, sc.id));
    for (const pa of Object.values(s.paths)) ensure(`path:${pa.id}`, [pa, s.terrain], () => this.buildPath(s, pa.id));

    for (const [key, b] of [...this.built]) if (!seen.has(key)) { this.disposeObj(b.obj); this.built.delete(key); }

    if (this.terrainRef !== s.terrain) {
      if (this.terrainMesh) { this.terrainMesh.geometry.dispose(); this.root.remove(this.terrainMesh); this.terrainMesh = null; }
      if (s.terrain) { this.terrainMesh = this.buildTerrain(s); this.root.add(this.terrainMesh); }
      this.terrainRef = s.terrain;
    }
    if (lightsChanged) {
      if (ui.lit) this.setLitLights(s); else { this.setDefaultLights(); this.scene.fog = null; this.renderer.setClearColor(COL.bg); }
    }
    this.gridHelper.visible = ui.editorHelpers;
    this.applyVisibility(s, ui);
    this.refreshOverlay();
    this.requestRender();
  }

  // ------------------------------------------------------------------ construção de entidades
  private tag(o: THREE.Object3D, kind: EntityRef['kind'], id: ID, floorId: ID | undefined) {
    o.userData.ref = { kind, id } as EntityRef; o.userData.floorId = floorId;
    return o;
  }

  private slabGeometry(poly: [number, number][], holes: [number, number][][], depth: number) {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1])));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    return g;
  }

  private buildRoom(s: Scene, id: ID): THREE.Object3D {
    const r = s.rooms[id];
    const fl = s.floors[r.floorId];
    const elev = fl?.elevation ?? 0;
    const g = new THREE.Group();
    const sec = r.sectorId ? s.sectors[r.sectorId] : undefined;
    const cl = new THREE.Color(COL.floor);
    const floorMat = getMat(COL.floor, false, { double: true });
    const secMat = sec ? getMat(new THREE.Color(sec.color).lerp(cl, 0.35).getStyle(), false, { double: true }) : floorMat;
    if (r.hasFloor) {
      const mesh = tagMesh(new THREE.Mesh(this.slabGeometry(r.polygon, r.holes, 0.16), floorMat), floorMat, { matSector: secMat, part: 'floor' });
      mesh.position.y = elev; g.add(mesh);
    }
    if (r.hasCeiling) {
      const ceilMat = getMat(COL.ceiling, false, { double: true });
      const mesh = tagMesh(new THREE.Mesh(this.slabGeometry(r.polygon, r.holes, 0.12), ceilMat), ceilMat, { part: 'ceiling' });
      mesh.position.y = elev + (r.height ?? fl?.height ?? 3) + 0.12; g.add(mesh);
    }
    return this.tag(g, 'room', id, r.floorId);
  }

  private buildWall(s: Scene, id: ID, _ops: Opening[], _sector: boolean): THREE.Object3D {
    const w = s.walls[id];
    const boxes = wallBoxesWorld(s, w);
    const geos: THREE.BufferGeometry[] = [];
    for (const b of boxes) {
      const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
      g.rotateY(-(b.rot * Math.PI) / 180);
      g.translate(b.center[0], b.center[1], b.center[2]);
      geos.push(g);
    }
    const grp = new THREE.Group();
    if (geos.length) {
      const merged = mergeGeometries(geos, false)!;
      geos.forEach((g) => g.dispose());
      const base = getMat(COL.wall);
      const roomSec = w.sources.map((x) => s.rooms[x.roomId]?.sectorId).find(Boolean);
      const sec = roomSec ? s.sectors[roomSec] : undefined;
      const secMat = sec ? getMat(new THREE.Color(sec.color).lerp(new THREE.Color(COL.wall), 0.45).getStyle()) : base;
      const mesh = tagMesh(new THREE.Mesh(merged, base), base, { matSector: secMat });
      grp.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(merged, 25), new THREE.LineBasicMaterial({ color: 0x2a251f, transparent: true, opacity: 0.55 }));
      edges.userData.owned = true; edges.userData.edge = true; edges.raycast = () => {};
      grp.add(edges);
    }
    void wallHeight;
    return this.tag(grp, 'wall', id, w.floorId);
  }

  private doorColor(o: Opening) {
    if (o.logic.fake) return COL.doorFake;
    if (o.logic.mode === 'locked') return COL.doorLocked;
    if (o.logic.mode === 'requires') return COL.doorReq;
    return COL.doorFree;
  }

  private buildOpeningLeaf(s: Scene, o: Opening): THREE.Object3D {
    const fr = openingFrame(s, o);
    const g = new THREE.Group();
    if (!fr) return g;
    const floorId = fr.wall.floorId;
    if (o.kind === 'door') {
      const pivot = new THREE.Group();
      const hingeSign = o.hinge === 'a' ? -1 : 1;
      const th = 0.06;
      const mat = getMat(this.doorColor(o));
      const leaf = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(o.width, o.height - 0.02, th), mat), mat);
      leaf.position.set(-hingeSign * (o.width / 2), (o.height - 0.02) / 2, 0);
      pivot.add(leaf);
      pivot.position.set(fr.center[0] + fr.dir[0] * hingeSign * (o.width / 2), fr.elev, fr.center[1] + fr.dir[1] * hingeSign * (o.width / 2));
      pivot.rotation.y = -(fr.rot * Math.PI) / 180;
      const holder = new THREE.Group();
      holder.add(pivot);
      holder.userData.pivot = pivot; holder.userData.hingeSign = hingeSign; holder.userData.baseRot = pivot.rotation.y; holder.userData.swing = o.swing;
      pivot.userData.baseRot = pivot.rotation.y; pivot.userData.hingeSign = hingeSign; pivot.userData.swing = o.swing; pivot.userData.opening = o.id;
      setDoorOpen(pivot, o.logic.startOpen ? 1.45 : 1.0);
      this.tag(holder, 'opening', o.id, floorId);
      return holder;
    }
    if (o.kind === 'window') {
      const mat = getMat('#7ea0a4', true);
      const pane = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(o.width, o.height, 0.03), mat), mat);
      pane.position.set(fr.center[0], fr.elev + o.sill + o.height / 2, fr.center[1]);
      pane.rotation.y = -(fr.rot * Math.PI) / 180;
      g.add(pane);
    }
    return this.tag(g, 'opening', o.id, floorId);
  }

  private buildStair(s: Scene, id: ID): THREE.Object3D {
    const st = s.stairs[id];
    const elev = s.floors[st.floorId]?.elevation ?? 0;
    const g = new THREE.Group();
    const mat = getMat(st.color);
    if (st.kind === 'ramp') {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(st.run, 0); sh.lineTo(st.run, st.rise); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: st.width, bevelEnabled: false });
      geo.translate(0, 0, -st.width / 2);
      const m = tagMesh(new THREE.Mesh(geo, mat), mat);
      m.position.set(st.position[0], elev, st.position[1]); m.rotation.y = -(st.rot * Math.PI) / 180; g.add(m);
    } else {
      const geos: THREE.BufferGeometry[] = [];
      for (const b of stairSteps(s, st)) {
        const bg = new THREE.BoxGeometry(b.size[0] * 0.999, b.size[1], b.size[2]);
        bg.rotateY(-(b.rot * Math.PI) / 180); bg.translate(b.center[0], b.center[1], b.center[2]); geos.push(bg);
      }
      if (geos.length) { const merged = mergeGeometries(geos, false)!; geos.forEach((x) => x.dispose()); const m = tagMesh(new THREE.Mesh(merged, mat), mat); g.add(m); const e = new THREE.LineSegments(new THREE.EdgesGeometry(merged, 30), new THREE.LineBasicMaterial({ color: 0x2a251f, transparent: true, opacity: 0.6 })); e.userData.owned = true; e.raycast = () => {}; g.add(e); }
    }
    if (st.railings && st.kind === 'stair') {
      const railMat = getMat('#44484a');
      for (const side of [-1, 1]) {
        const len = Math.hypot(st.run, st.rise);
        const rail = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), railMat), railMat);
        const lx = st.run / 2, lz = (side * st.width) / 2;
        const c = new THREE.Vector3(lx, st.rise / 2 + 0.95, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -(st.rot * Math.PI) / 180);
        rail.position.set(st.position[0] + c.x, elev + c.y, st.position[1] + c.z);
        rail.rotation.order = 'YZX'; rail.rotation.y = -(st.rot * Math.PI) / 180; rail.rotation.z = Math.atan2(st.rise, st.run);
        g.add(rail);
      }
    }
    return this.tag(g, 'stair', id, st.floorId);
  }

  private shapeGeometry(sh: Scene['shapes'][string]): THREE.BufferGeometry {
    let g: THREE.BufferGeometry;
    switch (sh.kind) {
      case 'cylinder': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 28); break;
      case 'sphere': g = new THREE.SphereGeometry(0.5, 24, 16); break;
      case 'cone': g = new THREE.ConeGeometry(0.5, 1, 28); break;
      case 'prism': g = new THREE.CylinderGeometry(0.5, 0.5, 1, Math.max(3, sh.sides ?? 6)); break;
      case 'ramp': {
        const s2 = new THREE.Shape(); s2.moveTo(-0.5, 0); s2.lineTo(0.5, 0); s2.lineTo(0.5, 1); s2.closePath();
        g = new THREE.ExtrudeGeometry(s2, { depth: 1, bevelEnabled: false }); g.translate(0, -0.5, -0.5); break;
      }
      case 'custom': {
        const pts = (sh.polygon ?? [[-1, -1], [1, -1], [1, 1], [-1, 1]]).map((p) => new THREE.Vector2(p[0], p[1]));
        const s2 = new THREE.Shape(pts);
        g = new THREE.ExtrudeGeometry(s2, { depth: 1, bevelEnabled: false });
        g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0); g.scale(1, 1, 1);
        // polígono local em metros; size escala a partir de 1 → normaliza pelo vão
        break;
      }
      default: g = new THREE.BoxGeometry(1, 1, 1);
    }
    return g;
  }

  private buildShape(s: Scene, id: ID): THREE.Object3D {
    const sh = s.shapes[id];
    const elev = s.floors[sh.floorId]?.elevation ?? 0;
    const mat = getMat(sh.color);
    const geo = this.shapeGeometry(sh);
    const mesh = tagMesh(new THREE.Mesh(geo, mat), mat);
    const sx = sh.kind === 'custom' ? sh.size[0] / 2 : sh.size[0], sz = sh.kind === 'custom' ? sh.size[2] / 2 : sh.size[2];
    mesh.scale.set(sx, sh.size[1], sz);
    const lift = sh.kind === 'ramp' || sh.kind === 'custom' ? 0.5 * sh.size[1] : 0.5 * sh.size[1];
    mesh.position.set(sh.position[0], elev + sh.position[1] + lift, sh.position[2]);
    mesh.rotation.y = -(sh.rot * Math.PI) / 180;
    if (sh.kind === 'cone' || sh.kind === 'cylinder' || sh.kind === 'prism') mesh.scale.set(sh.size[0], sh.size[1], sh.size[2]);
    const g = new THREE.Group(); g.add(mesh);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color: 0x2a251f, transparent: true, opacity: 0.5 }));
    e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); e.scale.copy(mesh.scale); e.raycast = () => {}; g.add(e);
    return this.tag(g, 'shape', id, sh.floorId);
  }

  private buildProp(s: Scene, id: ID): THREE.Object3D {
    const p = s.props[id];
    const elev = s.floors[p.floorId]?.elevation ?? 0;
    const g = new THREE.Group();
    const def = getDef(p.defId);
    const inner = new THREE.Group();
    for (const pm of propMeshes(p.defId)) {
      const mat = getMat(pm.color, pm.glass);
      const m = new THREE.Mesh(pm.geo, mat);
      m.userData.mat = mat; // geometria compartilhada: não é "owned"
      inner.add(m);
    }
    inner.scale.setScalar(p.scale);
    g.add(inner);
    g.position.set(p.position[0], elev + p.position[1], p.position[2]);
    g.rotation.y = -(p.rot * Math.PI) / 180;
    const radius = typeof p.params.radius === 'number' ? (p.params.radius as number) : 0;
    if (def?.gameplay && radius > 0 && ['enemy', 'trigger', 'checkpoint', 'objective', 'exit'].includes(def.gameplay)) {
      const ringMat = new THREE.MeshBasicMaterial({ color: def.gameplay === 'enemy' ? '#a0402e' : '#c9a14a', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.96, radius, 48), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.userData.owned = true; ring.userData.editorOnly = true; ring.raycast = () => {};
      ring.rotation.z = 0; g.add(ring);
      g.userData.ringRadius = radius;
    }
    g.userData.gameplay = def?.gameplay;
    return this.tag(g, 'prop', id, p.floorId);
  }

  private markerSprites = new Map<string, THREE.SpriteMaterial>();
  private markerSprite(kind: keyof typeof MARKER_INFO) {
    let m = this.markerSprites.get(kind);
    if (m) return m;
    const info = MARKER_INFO[kind];
    const cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const c = cv.getContext('2d')!;
    c.fillStyle = info.color; c.strokeStyle = '#17150f'; c.lineWidth = 6;
    c.beginPath();
    if (info.shape === 'circle') c.arc(48, 48, 38, 0, Math.PI * 2);
    else if (info.shape === 'diamond') { c.moveTo(48, 6); c.lineTo(90, 48); c.lineTo(48, 90); c.lineTo(6, 48); c.closePath(); }
    else if (info.shape === 'square') c.roundRect(10, 10, 76, 76, 10);
    else { c.moveTo(48, 8); c.lineTo(90, 84); c.lineTo(6, 84); c.closePath(); }
    c.fill(); c.stroke();
    c.fillStyle = '#17150f'; c.font = 'bold 44px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(info.glyph, 48, info.shape === 'tri' ? 62 : 50);
    const tex = new THREE.CanvasTexture(cv);
    m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    this.markerSprites.set(kind, m);
    return m;
  }

  private buildMarker(s: Scene, id: ID): THREE.Object3D {
    const m = s.markers[id];
    const elev = s.floors[m.floorId]?.elevation ?? 0;
    const info = MARKER_INFO[m.kind];
    const g = new THREE.Group();
    g.position.set(m.position[0], elev + m.position[1], m.position[2]);
    const poleMat = new THREE.MeshBasicMaterial({ color: info.color });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), poleMat); pole.position.y = 0.8; pole.userData.owned = true;
    const sprite = new THREE.Sprite(this.markerSprite(m.kind)); sprite.scale.set(0.7, 0.7, 1); sprite.position.y = 1.9; sprite.renderOrder = 10;
    const ringMat = new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.1, m.radius - 0.05), m.radius, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.userData.owned = true; ring.raycast = () => {};
    g.add(pole, sprite, ring);
    g.userData.marker = true; g.userData.editorOnly = true;
    if (m.kind === 'sightline' || m.kind === 'oneway') {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 8), poleMat); arrow.rotation.z = -Math.PI / 2; arrow.position.set(Math.cos(m.rot * DEG) * 0.5, 0.2, Math.sin(m.rot * DEG) * 0.5); arrow.rotation.y = -(m.rot * Math.PI) / 180; arrow.userData.owned = true; g.add(arrow);
    }
    return this.tag(g, 'marker', id, m.floorId);
  }

  private buildLightIcon(s: Scene, id: ID): THREE.Object3D {
    const l = s.lights[id];
    const elev = s.floors[l.floorId]?.elevation ?? 0;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: l.color });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat); b.userData.owned = true;
    g.add(b);
    if (l.kind === 'point' || l.kind === 'spot') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(l.range - 0.04, l.range, 48), new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -(l.position[1]) + 0.05; ring.userData.owned = true; ring.raycast = () => {}; g.add(ring);
    }
    g.position.set(l.position[0], elev + l.position[1], l.position[2]);
    g.userData.editorOnly = true;
    return this.tag(g, 'light', id, l.floorId);
  }

  private buildScatter(s: Scene, id: ID): THREE.Object3D {
    const sc = s.scatter[id];
    const g = new THREE.Group();
    const elev = s.floors[sc.floorId]?.elevation ?? 0;
    const tmp = new THREE.Object3D();
    for (const pm of propMeshes(sc.defId)) {
      const im = new THREE.InstancedMesh(pm.geo, getMat(pm.color, pm.glass), sc.items.length);
      sc.items.forEach((it, i) => {
        const h = s.terrain ? terrainHeight(s.terrain, it[0], it[1]) ?? elev : elev;
        tmp.position.set(it[0], h, it[1]); tmp.rotation.set(0, -(it[2] * Math.PI) / 180, 0); tmp.scale.setScalar(it[3]); tmp.updateMatrix();
        im.setMatrixAt(i, tmp.matrix);
      });
      im.userData.mat = im.material; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      im.userData.scatterId = id;
      g.add(im);
    }
    return this.tag(g, 'scatter', id, sc.floorId);
  }

  private buildPath(s: Scene, id: ID): THREE.Object3D {
    const pa = s.paths[id];
    const col = pa.kind === 'river' ? '#4f6d78' : pa.kind === 'road' ? '#6a665c' : '#7a6a4c';
    const pts = pa.points;
    const g = new THREE.Group();
    if (pts.length < 2) return this.tag(g, 'path', id, pa.floorId);
    const pos: number[] = [], idx: number[] = [];
    const elev = s.floors[pa.floorId]?.elevation ?? 0;
    const lift = pa.kind === 'river' ? 0.02 : 0.06;
    pts.forEach((p, i) => {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next[0] - prev[0], dz = next[1] - prev[1], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      for (const sd of [-1, 1]) {
        const x = p[0] + nx * sd * pa.width / 2, z = p[1] + nz * sd * pa.width / 2;
        const h = s.terrain ? terrainHeight(s.terrain, x, z) ?? elev : elev;
        pos.push(x, h + lift, z);
      }
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = getMat(col, pa.kind === 'river', { double: true });
    g.add(tagMesh(new THREE.Mesh(geo, mat), mat));
    return this.tag(g, 'path', id, pa.floorId);
  }

  private buildTerrain(s: Scene): THREE.Mesh {
    const t = s.terrain!;
    const n = t.res + 1;
    const [cx, cz] = cellSize(t);
    const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
    const base = new THREE.Color(t.color), rock = new THREE.Color('#6d685d'), high = new THREE.Color('#8a8a74');
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, h = t.heights[k];
      pos[k * 3] = t.origin[0] + i * cx; pos[k * 3 + 1] = h; pos[k * 3 + 2] = t.origin[1] + j * cz;
      const hl = t.heights[j * n + Math.max(0, i - 1)], hr = t.heights[j * n + Math.min(t.res, i + 1)];
      const hu = t.heights[Math.max(0, j - 1) * n + i], hd = t.heights[Math.min(t.res, j + 1) * n + i];
      const slope = Math.atan(Math.hypot((hr - hl) / (2 * cx), (hd - hu) / (2 * cz)));
      const c = base.clone().lerp(rock, Math.min(1, slope / 0.7)).lerp(high, Math.min(0.5, Math.max(0, h / 14)));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx: number[] = [];
    for (let j = 0; j < t.res; j++) for (let i = 0; i < t.res; i++) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.terrain = true; mesh.userData.mat = mat; mesh.userData.owned = true;
    return mesh;
  }

  // ------------------------------------------------------------------ visibilidade e materiais
  applyVisibility(s: Scene, ui: RenderUI) {
    const active = s.floors[ui.floorId];
    const activeElev = active?.elevation ?? 0;
    const isolate = ui.isolate ? new Set(ui.isolate.map((r) => `${r.kind}:${r.id}`)) : null;
    const hidden = new Set(ui.hidden);
    const wire = ui.shading === 'wire';
    for (const m of matCache.values()) (m as THREE.MeshLambertMaterial).wireframe = wire;
    for (const [key, b] of this.built) {
      const o = b.obj, fid = o.userData.floorId as ID | undefined;
      const fl = fid ? s.floors[fid] : undefined;
      let visible = true, ghost = false;
      if (fl && active) {
        if (ui.floorView === 'upto' && fl.elevation > activeElev + 0.01) { visible = false; }
        else if (ui.floorView === 'only' && fid !== ui.floorId) { visible = ui.ghostFloors; ghost = true; }
        else if (ui.ghostFloors && fl.elevation < activeElev - 0.01 && ui.floorView !== 'all') ghost = true;
      }
      if (hidden.has(key)) visible = false;
      if (isolate && !isolate.has(key)) visible = false;
      const entity = getEntity(s, o.userData.ref as EntityRef) as { hidden?: boolean } | undefined;
      if (entity?.hidden) visible = false;
      if (o.userData.editorOnly && !ui.editorHelpers) visible = false;
      if (o.userData.marker && !ui.markers) visible = false;
      o.visible = visible;
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (mesh.userData?.part === 'ceiling') mesh.visible = !ui.hideCeilings || ui.lit;
        if (mesh.userData?.editorOnly && !ui.editorHelpers) mesh.visible = false;
        const base = mesh.userData?.mat as THREE.Material | undefined;
        if (!base) return;
        let mat: THREE.Material = base;
        if (ui.shading === 'sector' && mesh.userData.matSector) mat = mesh.userData.matSector as THREE.Material;
        mesh.material = ghost ? ghostOf(mat) : mat;
        if (mesh.isMesh && (mesh as THREE.InstancedMesh).isInstancedMesh === undefined) mesh.renderOrder = ghost ? -1 : 0;
      });
      void key;
    }
    if (this.terrainMesh) this.terrainMesh.visible = true;
    this.requestRender();
  }

  /** Posição do pivô de porta (playtest anima a rotação). */
  getDoorPivot(id: ID) { return this.doorPivots.get(id); }
  /** Esconde/mostra a folha de uma porta (ex.: bloqueio removido). */
  getBuilt(key: string) { return this.built.get(key)?.obj; }
  setObjectVisible(key: string, v: boolean) { const o = this.built.get(key)?.obj; if (o) o.visible = v; this.requestRender(); }

  // ------------------------------------------------------------------ seleção / hover
  setSelection(refs: EntityRef[]) { this.selection = refs; this.refreshOverlay(); }
  setHover(ref: EntityRef | null) {
    if (ref?.kind === this.hoverRef?.kind && ref?.id === this.hoverRef?.id) return;
    this.hoverRef = ref; this.refreshOverlay();
  }

  private outlineFor(ref: EntityRef, color: string): THREE.Object3D | null {
    const b = this.built.get(`${ref.kind}:${ref.id}`);
    if (!b || !b.obj.visible) return null;
    const grp = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
    b.obj.updateWorldMatrix(true, true);
    b.obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.userData.editorOnly || (m as THREE.InstancedMesh).isInstancedMesh || !m.visible) return;
      if (m.geometry.attributes.position.count > 6000) return;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), mat);
      e.matrixAutoUpdate = false; e.matrix.copy(m.matrixWorld); e.renderOrder = 999; e.raycast = () => {};
      grp.add(e);
    });
    if (b.obj.userData.marker || b.obj.userData.editorOnly) {
      const box = new THREE.Box3().setFromObject(b.obj); const bh = new THREE.Box3Helper(box, new THREE.Color(color));
      (bh.material as THREE.Material).depthTest = false; bh.renderOrder = 999; grp.add(bh);
    }
    return grp;
  }

  private refreshOverlay() {
    for (const g of [this.overlay, this.hoverGroup]) { g.children.slice().forEach((c) => { g.remove(c); c.traverse((x) => { const l = x as THREE.LineSegments; if (l.isLineSegments) l.geometry.dispose(); }); }); }
    this.selection.slice(0, 60).forEach((r) => { const o = this.outlineFor(r, COL.select); if (o) this.overlay.add(o); });
    if (this.hoverRef) { const o = this.outlineFor(this.hoverRef, COL.hover); if (o) this.hoverGroup.add(o); }
    this.requestRender();
  }

  // ------------------------------------------------------------------ picking
  private ray = new THREE.Raycaster();
  private ndc(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }
  pick(clientX: number, clientY: number): PickResult | null {
    this.ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const targets: THREE.Object3D[] = [];
    for (const b of this.built.values()) if (b.obj.visible && !(b.obj.userData.ref.kind === 'room' && false)) targets.push(b.obj);
    const hits = this.ray.intersectObjects(targets, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      if (!h.object.visible || (h.object as THREE.Mesh).userData?.edge) continue;
      if ((h.object as THREE.Mesh).userData?.part === 'ceiling' && this.lastUI?.hideCeilings) continue;
      while (o && !o.userData.ref) o = o.parent;
      if (o?.userData.ref) {
        const fid = o.userData.floorId as ID | undefined;
        if (this.lastScene && this.lastUI && fid && this.lastUI.floorView === 'only' && fid !== this.lastUI.floorId) continue;
        return { ref: o.userData.ref as EntityRef, point: h.point, distance: h.distance };
      }
    }
    return null;
  }
  /** Ponto no plano horizontal y = `y` sob o cursor. */
  groundPoint(clientX: number, clientY: number, y: number): THREE.Vector3 | null {
    this.ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(plane, out) ? out : null;
  }

  // ------------------------------------------------------------------ gizmo
  attachGizmo(refs: EntityRef[], s: Scene, mode: 'translate' | 'rotate' | 'scale', snap: number) {
    this.gizmoRefs = refs;
    const movable = refs.filter((r) => ['room', 'stair', 'shape', 'prop', 'marker', 'light', 'annotation', 'wall'].includes(r.kind));
    if (!movable.length || this.freeCam) { this.tc.detach(); this.requestRender(); return; }
    const b = selectionBounds(s, movable);
    if (!b) { this.tc.detach(); return; }
    let y = 0;
    const first = getEntity(s, movable[0]) as { floorId?: ID; position?: number[]; polygon?: unknown } | undefined;
    if (first?.floorId) y = (s.floors[first.floorId]?.elevation ?? 0) + (Array.isArray(first.position) && first.position.length === 3 ? first.position[1] : 0);
    this.proxy.position.set((b.x0 + b.x1) / 2, y, (b.y0 + b.y1) / 2);
    this.proxy.rotation.set(0, 0, 0); this.proxy.scale.set(1, 1, 1);
    this.tc.setMode(mode);
    this.tc.setSpace(mode === 'translate' ? 'world' : 'local');
    this.tc.setTranslationSnap(snap > 0 ? snap : null);
    this.tc.setRotationSnap(snap > 0 ? (15 * Math.PI) / 180 : null);
    this.tc.setScaleSnap(0.05);
    this.tc.showX = mode !== 'rotate'; this.tc.showZ = mode !== 'rotate'; this.tc.showY = true;
    if (mode === 'rotate') { this.tc.showX = false; this.tc.showZ = false; }
    this.tc.camera = this.camera as THREE.PerspectiveCamera;
    this.tc.attach(this.proxy);
    this.requestRender();
  }
  detachGizmo() { if (this.tc.object) this.tc.detach(); this.requestRender(); }
  getGizmoRefs() { return this.gizmoRefs; }
  proxyPivot(): [number, number] { return [this.proxyBase.pos.x, this.proxyBase.pos.z]; }

  // ------------------------------------------------------------------ câmera
  setProjection(p: 'persp' | 'ortho', preset: 'free' | 'top' | 'front' | 'side' = this.preset) {
    const target = this.orbit.target.clone();
    const dist = Math.max(4, this.persp.position.distanceTo(target));
    this.projection = p; this.preset = preset;
    this.orbit.enableRotate = preset === 'free';
    if (preset !== 'free') {
      const d = Math.max(dist, 20);
      const off = preset === 'top' ? new THREE.Vector3(0, d, 0.001) : preset === 'front' ? new THREE.Vector3(0, 0, d) : new THREE.Vector3(d, 0, 0);
      this.persp.position.copy(target).add(off);
    }
    this.camera = p === 'ortho' ? this.ortho : this.persp;
    if (p === 'ortho') {
      this.ortho.position.copy(this.persp.position); this.ortho.quaternion.copy(this.persp.quaternion);
      this.orthoSize = null; this.fitOrtho();
    }
    this.orbit.object = this.camera as THREE.PerspectiveCamera;
    this.orbit.maxPolarAngle = preset === 'free' ? Math.PI * 0.499 : Math.PI;
    this.orbit.update();
    this.tc.camera = this.camera as THREE.PerspectiveCamera;
    this.requestRender();
  }
  setFreeCam(on: boolean) {
    this.freeCam = on;
    this.orbit.enabled = !on;
    if (on) {
      const dir = new THREE.Vector3(); this.persp.getWorldDirection(dir);
      this.freeLook.yaw = Math.atan2(dir.x, dir.z); this.freeLook.pitch = Math.asin(dir.y);
      this.tc.detach();
    } else { this.orbit.target.copy(this.persp.position).add(new THREE.Vector3(0, -3, 0).add(this.persp.getWorldDirection(new THREE.Vector3()).multiplyScalar(12))); this.orbit.update(); }
    this.requestRender();
  }
  private onKeyDown = (e: KeyboardEvent) => { if (this.freeCam && !(e.target as HTMLElement)?.matches?.('input,textarea,select')) this.keys.add(e.code); };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onFreeDown = (e: PointerEvent) => { if (this.freeCam && e.button === 2) { this.freeLook.active = true; this.renderer.domElement.setPointerCapture(e.pointerId); } };
  private onFreeUp = () => { this.freeLook.active = false; };
  private onFreeMove = (e: PointerEvent) => {
    if (!this.freeCam || !this.freeLook.active) return;
    this.freeLook.yaw -= e.movementX * 0.0036; this.freeLook.pitch = Math.max(-1.5, Math.min(1.5, this.freeLook.pitch - e.movementY * 0.0036));
    this.requestRender();
  };
  private updateFree(dt: number) {
    const f = this.freeLook;
    this.persp.rotation.order = 'YXZ'; this.persp.rotation.set(f.pitch, f.yaw + Math.PI, 0);
    const sp = (this.keys.has('ShiftLeft') ? 16 : 6) * dt;
    const fwd = new THREE.Vector3(Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), Math.cos(f.yaw) * Math.cos(f.pitch));
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-1);
    let moved = false;
    if (this.keys.has('KeyW')) { this.persp.position.addScaledVector(fwd, sp); moved = true; }
    if (this.keys.has('KeyS')) { this.persp.position.addScaledVector(fwd, -sp); moved = true; }
    if (this.keys.has('KeyA')) { this.persp.position.addScaledVector(right, sp); moved = true; }
    if (this.keys.has('KeyD')) { this.persp.position.addScaledVector(right, -sp); moved = true; }
    if (this.keys.has('KeyE')) { this.persp.position.y += sp; moved = true; }
    if (this.keys.has('KeyQ')) { this.persp.position.y -= sp; moved = true; }
    if (moved || f.active) this.requestRender();
  }

  frame(b: { x0: number; y0: number; x1: number; y1: number }, y = 0) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
    const size = Math.max(6, Math.hypot(b.x1 - b.x0, b.y1 - b.y0));
    const dir = this.persp.position.clone().sub(this.orbit.target).normalize();
    if (this.preset !== 'free') { /* mantém a direção da vista */ }
    this.orbit.target.set(cx, y, cz);
    this.persp.position.copy(this.orbit.target).addScaledVector(dir, size * 1.15);
    this.orthoSize = size * 0.55; this.fitOrtho();
    if (this.camera === this.ortho) { this.ortho.position.copy(this.persp.position); this.ortho.quaternion.copy(this.persp.quaternion); }
    this.orbit.update(); this.requestRender();
  }

  lookAt(x: number, y: number, z: number) {
    const off = this.persp.position.clone().sub(this.orbit.target);
    this.orbit.target.set(x, y, z); this.persp.position.set(x, y, z).add(off);
    this.orbit.update(); this.requestRender();
  }

  /** Para o playtest: oculta overlays de edição. */
  setEditorHelpers(on: boolean) { this.gridHelper.visible = on; this.overlay.visible = on; this.hoverGroup.visible = on; if (!on) this.tc.detach(); this.requestRender(); }

  snapshot(): string { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }

}
