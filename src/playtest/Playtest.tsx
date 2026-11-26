import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneRenderer, setDoorOpen, type RenderUI } from '../render/Renderer3D';
import { useScene } from '../editor/store';
import { useUI } from '../editor/ui';
import { PlaySim, type PlayInput } from './runtime';
import { stopPlaytest } from './control';
import { getDef, gameplayLabel } from '../assets/props';
import { Icon } from '../ui/Icon';
import { setPlaytestHook } from './hook';

interface Hud {
  prompt: string; message: string; inv: { id: string; name: string; kind: string }[]; room: string; time: number; third: boolean; noclip: boolean;
  completed: boolean; floor: string; locked: boolean;
}
const EMPTY: Hud = { prompt: '', message: '', inv: [], room: '', time: 0, third: false, noclip: false, completed: false, floor: '', locked: false };

export function Playtest() {
  const host = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>(EMPTY);
  const [started, setStarted] = useState(false);
  const [targets, setTargets] = useState<{ v: string; l: string }[]>([]);
  const api = useRef<{ sim: PlaySim; r: SceneRenderer; third: boolean; lock: () => void; teleport: (v: string) => void; restart: () => void; toggleView: () => void; toggleNoclip: () => void } | null>(null);

  useEffect(() => {
    const st = useScene.getState();
    const scene = st.project.scene;
    const cfg = st.project.settings.character;
    const ui0 = useUI.getState();
    const from = ui0.playtestFrom;
    const sim = new PlaySim(scene, cfg, from);
    const r = new SceneRenderer(host.current!);
    r.orbit.enabled = false;
    r.continuous = true;
    const startFloor = sim.floorIdAt();
    const rui: RenderUI = { floorId: startFloor, floorView: 'all', ghostFloors: false, shading: 'grey', hideCeilings: false, hidden: [], isolate: null, markers: false, lit: sim.scene.atmosphere.preset !== 'greybox' || Object.keys(sim.scene.lights).length > 0 || sim.scene.atmosphere.flashlight, editorHelpers: false };
    r.sync(sim.scene, rui);
    r.applyVisibility(sim.scene, rui);

    const cam = r.persp;
    cam.fov = cfg.fov; cam.near = 0.05; cam.updateProjectionMatrix();
    r.scene.add(cam);
    r.activeCamera = cam;

    // avatar para 3ª pessoa
    const avatar = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8a7f66 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(cfg.radius * 0.8, cfg.radius * 0.8, cfg.height - cfg.radius * 2, 14), bodyMat);
    body.position.y = (cfg.height - cfg.radius * 2) / 2 + cfg.radius * 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius * 0.75, 14, 10), new THREE.MeshLambertMaterial({ color: 0xb59c80 }));
    head.position.y = cfg.height - cfg.radius * 0.8;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.18), new THREE.MeshLambertMaterial({ color: 0x4a4438 }));
    nose.position.set(0, cfg.height - cfg.radius * 0.8, -cfg.radius * 0.9);
    avatar.add(body, head, nose);
    avatar.visible = false;
    r.scene.add(avatar);

    // lanterna
    const atm = sim.scene.atmosphere;
    let flash: THREE.SpotLight | null = null;
    if (atm.flashlight) {
      flash = new THREE.SpotLight(0xfff0d0, 6, 22, 0.42, 0.55, 1.2);
      flash.position.set(0, 0, 0.1); flash.target.position.set(0, 0, -1);
      cam.add(flash, flash.target);
    }

    sim.onDoor = (id, amt) => { const pv = r.getDoorPivot(id); if (pv) { setDoorOpen(pv, amt * Math.PI * 0.47); r.requestRender(); } };
    sim.onHide = (_k, id, v) => r.setObjectVisible(`prop:${id}`, v);
    for (const [id, d] of sim.doors) sim.onDoor(id, d.amt);

    // lista de destinos de depuração
    const dest: { v: string; l: string }[] = [];
    for (const rm of Object.values(sim.scene.rooms)) dest.push({ v: `room:${rm.id}`, l: `Sala · ${rm.name}` });
    for (const m of Object.values(sim.scene.markers)) dest.push({ v: `marker:${m.id}`, l: `Marcador · ${m.name}` });
    setTargets(dest);

    // ---------------- entrada
    const keys = new Set<string>();
    let third = false;
    let jumpQueued = false;
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.matches?.('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.repeat) return;
      keys.add(k);
      if (k === ' ') jumpQueued = true;
      if (k === 'e' || k === 'enter') sim.interact();
      else if (k === 'v') api.current!.toggleView();
      else if (k === 'r' && !e.ctrlKey && !e.metaKey) api.current!.restart();
      else if (k === 'n') api.current!.toggleNoclip();
      else if (k === 'escape' && !document.pointerLockElement) stopPlaytest();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    const canvas = r.renderer.domElement;
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas && !(e.buttons & 1)) return;
      sim.p.yaw -= e.movementX * 0.0024;
      sim.p.pitch = Math.max(-1.45, Math.min(1.45, sim.p.pitch - e.movementY * 0.0024));
    };
    canvas.addEventListener('mousemove', onMove);
    const onClick = () => { setStarted(true); try { void canvas.requestPointerLock?.(); } catch { /* sem pointer lock: arrastar para olhar */ } };
    canvas.addEventListener('click', () => { if (document.pointerLockElement !== canvas) onClick(); else sim.interact(); });
    const onLock = () => { if (document.pointerLockElement !== canvas) setHud((h) => ({ ...h, locked: false })); else setHud((h) => ({ ...h, locked: true })); };
    document.addEventListener('pointerlockchange', onLock);

    api.current = {
      sim, r, third,
      lock: onClick,
      teleport: (v) => {
        const [kind, id] = v.split(':');
        if (kind === 'room') { const rm = sim.scene.rooms[id]; if (!rm) return; let cx = 0, cz = 0; for (const p of rm.polygon) { cx += p[0]; cz += p[1]; } sim.teleport(cx / rm.polygon.length, cz / rm.polygon.length, rm.floorId); }
        else { const m = sim.scene.markers[id]; if (m) sim.teleport(m.position[0], m.position[2], m.floorId); }
      },
      restart: () => { sim.restart(); sim.say('Teste reiniciado.'); },
      toggleView: () => { third = !third; api.current!.third = third; },
      toggleNoclip: () => { sim.noclip = !sim.noclip; sim.say(sim.noclip ? 'Voo livre ligado (N desliga).' : 'Voo livre desligado.'); },
    };

    // ---------------- loop
    let hudT = 0;
    const tmp = new THREE.Vector3();
    r.onFrame = (dt) => {
      const inp: PlayInput = {
        fwd: (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0),
        strafe: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
        run: keys.has('shift'), jump: jumpQueued, crouch: keys.has('c') || keys.has('control'),
        up: (keys.has(' ') ? 1 : 0) - (keys.has('control') || keys.has('c') ? 1 : 0),
      };
      jumpQueued = false;
      if (keys.has('arrowleft') || keys.has('q')) sim.p.yaw += 1.9 * dt;
      if (keys.has('arrowright')) sim.p.yaw -= 1.9 * dt;
      const n = Math.max(1, Math.ceil(dt / 0.03));
      for (let i = 0; i < n; i++) sim.update(dt / n, inp);
      const p = sim.p;
      const look = new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ');
      if (!third) {
        cam.position.set(p.x, sim.eyeY, p.z);
        cam.quaternion.setFromEuler(look);
        avatar.visible = false;
      } else {
        const dir = tmp.set(0, 0, 1).applyEuler(look); // para trás da câmera
        const want = cfg.cameraDistance;
        const d = sim.cameraBoom([dir.x, dir.y, dir.z], want);
        cam.position.set(p.x + dir.x * d, sim.eyeY + dir.y * d + 0.15, p.z + dir.z * d);
        cam.quaternion.setFromEuler(look);
        avatar.visible = true; avatar.position.set(p.x, p.y, p.z); avatar.rotation.y = p.yaw; avatar.scale.y = p.crouch ? 0.68 : 1;
      }
      r.flickerLights(performance.now() / 1000);
      hudT += dt;
      if (hudT > 0.08) {
        hudT = 0;
        const f = sim.focus();
        const inv = [...sim.collected].map((id) => { const pr = sim.scene.props[id]; return { id, name: pr?.name ?? '?', kind: gameplayLabel(getDef(pr?.defId ?? '')?.gameplay ?? 'pickup') }; });
        const room = sim.roomAt();
        setHud((h) => ({ ...h, prompt: f ? `[E] ${f.prompt}` : '', message: sim.message?.text ?? '', inv, room: room ? sim.scene.rooms[room].name : '—', time: sim.time, third, noclip: sim.noclip, completed: sim.completed, floor: sim.scene.floors[sim.floorIdAt()]?.name ?? '' }));
      }
    };
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__forgePlay = { sim, r };
    setPlaytestHook({ restart: () => api.current?.restart() });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onLock);
      if (document.pointerLockElement) document.exitPointerLock();
      const rec = sim.toRecord();
      r.onFrame = null;
      r.dispose();
      setPlaytestHook(null);
      if (rec.durationSec >= 3) useScene.getState().patchProject((p) => { p.playtests = [...p.playtests.slice(-19), rec]; });
      useUI.getState().set({ playtestFrom: null });
      api.current = null;
    };
  }, []);

  const mm = Math.floor(hud.time / 60), ss = Math.floor(hud.time % 60);
  return (
    <div className="playtest" ref={host}>
      <div className="pt-vignette" />
      <div className="pt-hud">
        <div className="pt-top">
          <div className="pt-box"><b>Playtest</b> · {hud.room} {hud.floor && <>· {hud.floor}</>} · {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}{hud.noclip && <> · <b style={{ color: 'var(--brass-2)' }}>voo livre</b></>}</div>
          <div className="pt-inv">
            {hud.inv.map((i) => <div key={i.id} className="pt-box" title={i.kind}><b>{i.name}</b></div>)}
          </div>
        </div>
        {!hud.third && <div className="pt-cross" />}
        {hud.message && <div className="pt-msg">{hud.message}</div>}
        {hud.prompt && !hud.message && <div className="pt-prompt">{hud.prompt}</div>}
        <div className="pt-help">WASD mover · Shift correr · Espaço pular · C agachar · E interagir · V câmera · R reiniciar · N voo · Esc sair</div>
        {hud.completed && <div className="pt-click" style={{ pointerEvents: 'auto' }}><div>Saída alcançada<br /><span style={{ fontSize: 13, letterSpacing: '.04em', color: 'var(--text-2)' }}>{mm}m{String(ss).padStart(2, '0')}s · R reinicia · Esc volta ao editor</span></div></div>}
        {!started && !hud.completed && <div className="pt-click" onClick={() => api.current?.lock()}><div>Clique para jogar<br /><span style={{ fontSize: 13, letterSpacing: '.04em', color: 'var(--text-2)' }}>Mouse olha · WASD anda · Esc volta ao editor</span></div></div>}
      </div>
      <div style={{ position: 'absolute', top: 44, right: 12, display: 'flex', gap: 6, alignItems: 'center', zIndex: 3 }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <select className="in" aria-label="Ir para" style={{ width: 190 }} value="" onChange={(e) => { if (e.target.value) api.current?.teleport(e.target.value); e.target.value = ''; }}>
          <option value="">Teletransportar para…</option>
          {targets.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <button className="btn sm" onClick={() => api.current?.restart()}><Icon name="rotate" size={13} />Reiniciar</button>
        <button className="btn sm" onClick={() => api.current?.toggleView()}>{hud.third ? '3ª pessoa' : '1ª pessoa'}</button>
        <button className="btn sm primary" onClick={() => stopPlaytest()}><Icon name="stop" size={13} />Voltar ao editor</button>
      </div>
    </div>
  );
}
