import { describe, expect, it } from 'vitest';
import { setAutoFreeze } from 'immer';
import { TEMPLATES } from '../src/templates';
import { validateProject } from '../src/core/schema';
import { PlaySim } from '../src/playtest/runtime';
import type { Project } from '../src/core/types';

setAutoFreeze(false);
const IN = { fwd: 0, strafe: 0, run: false, jump: false, crouch: false, up: 0 };
const tpl = (id: string): Project => TEMPLATES.find((t) => t.id === id)!.build();

/** Piloto automático: anda até (x,z) abrindo portas destrancadas que estejam no caminho. Retorna false se travar. */
function walkTo(sim: PlaySim, x: number, z: number, tol = 0.35): boolean {
  let stuck = 0, last = [sim.p.x, sim.p.z];
  for (let i = 0; i < 2400; i++) {
    const dx = x - sim.p.x, dz = z - sim.p.z;
    if (Math.hypot(dx, dz) < tol) return true;
    sim.p.yaw = Math.atan2(-dx, -dz);
    const f = sim.focus();
    if (f?.kind === 'door' && sim.doors.get(f.id)!.target === 0 && sim.doorUnlocked(f.id) && Math.hypot(f.pos[0] - sim.p.x, f.pos[2] - sim.p.z) < 1.7) sim.interact();
    sim.update(1 / 30, { ...IN, fwd: 1, run: true });
    if (i % 30 === 0) { if (Math.hypot(sim.p.x - last[0], sim.p.z - last[1]) < 0.05) stuck++; else stuck = 0; last = [sim.p.x, sim.p.z]; if (stuck >= 3) return false; }
  }
  return false;
}
function use(sim: PlaySim, id: string, from: [number, number]) {
  expect(walkTo(sim, from[0], from[1], 0.3), `chegar perto de ${sim.scene.props[id]?.name ?? id}`).toBe(true);
  const p = sim.scene.props[id];
  sim.p.yaw = Math.atan2(-(p.position[0] - sim.p.x), -(p.position[2] - sim.p.z));
  expect(sim.focus()?.id, `foco em ${p.name}`).toBe(id);
  sim.interact();
}
const byName = (p: Project, n: string) => Object.values(p.scene.props).find((x) => x.name === n)!.id;

describe('modelos de projeto', () => {
  it('todos os modelos constroem e sobrevivem a ida e volta pelo esquema', () => {
    for (const t of TEMPLATES) {
      const p = t.build();
      const r = validateProject(JSON.parse(JSON.stringify(p)));
      expect(r.ok, `${t.name}: ${r.errors.join('; ')}`).toBe(true);
      expect(r.warnings, `${t.name}`).toEqual([]);
      expect(Object.keys(p.scene.rooms).length, t.name).toBeGreaterThanOrEqual(t.id === 'blank' ? 0 : t.id === 'forest' ? 1 : 3);
    }
  });

  it('Núcleo do bunker: tem as peças do cenário de validação', () => {
    const p = tpl('bunker'), s = p.scene;
    expect(s.floorOrder.length).toBe(2);
    expect(Object.keys(s.rooms).length).toBeGreaterThanOrEqual(8);
    expect(Object.values(s.openings).filter((o) => o.kind === 'door').length).toBeGreaterThanOrEqual(7);
    expect(Object.values(s.openings).some((o) => o.logic.mode === 'requires')).toBe(true);
    expect(Object.values(s.openings).some((o) => o.logic.fake)).toBe(true);
    expect(Object.keys(s.markers).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(s.stairs)).toHaveLength(1);
  });

  it('Núcleo do bunker é resolvível andando: chave → fusível → gerador → atalho → cartão → saída', () => {
    const p = tpl('bunker');
    const sim = new PlaySim(p.scene, p.settings.character);
    const chave = byName(p, 'Chave do almoxarifado'), fus = byName(p, 'Fusível principal'), ger = byName(p, 'Gerador de emergência'), cartao = byName(p, 'Cartão de acesso Nível 2'), ex = byName(p, 'Elevador de serviço');
    const sc = sim.scene;

    // a porta do almoxarifado está trancada antes da chave
    const dAlmox = Object.values(sc.openings).find((o) => o.name === 'Porta do almoxarifado')!.id;
    expect(sim.doorUnlocked(dAlmox)).toBe(false);

    expect(walkTo(sim, 7.0, 3)).toBe(true);
    expect(walkTo(sim, 11, 3)).toBe(true);                // atravessou a porta do hall
    expect(walkTo(sim, 14, 2.2)).toBe(true);
    expect(walkTo(sim, 14, 0.2)).toBe(true);              // atravessou a porta do escritório
    use(sim, chave, [16.0, -3.4]);
    expect(sim.collected.has(chave)).toBe(true);
    expect(sim.doorUnlocked(dAlmox)).toBe(true);

    expect(walkTo(sim, 14, 0.2)).toBe(true);
    expect(walkTo(sim, 14, 2.4)).toBe(true);
    expect(walkTo(sim, 13, 3)).toBe(true);
    expect(walkTo(sim, 13, 6.2)).toBe(true);              // atravessou o almoxarifado
    use(sim, fus, [14.2, 8.3]);
    expect(sim.collected.has(fus)).toBe(true);

    expect(walkTo(sim, 13, 3)).toBe(true);
    expect(walkTo(sim, 21, 3)).toBe(true);
    expect(walkTo(sim, 24, 3)).toBe(true);                // atravessou a porta dos geradores
    use(sim, ger, [28.6, 3.9]);
    expect(sim.activated.has(ger)).toBe(true);

    // atalho: hall → arquivo (barricada)
    const barr = byName(p, 'Barricada do arquivo');
    expect(walkTo(sim, 24, 3)).toBe(true);
    expect(walkTo(sim, 13, 3)).toBe(true);
    expect(walkTo(sim, 9, 3)).toBe(true);
    expect(walkTo(sim, 4, 3)).toBe(true);
    use(sim, barr, [4, 1.2]);
    expect(sim.removed.has(barr)).toBe(true);
    expect(walkTo(sim, 4, -1.5)).toBe(true);              // passou pelo atalho
    use(sim, cartao, [8.9, -3.9]);
    expect(sim.collected.has(cartao)).toBe(true);

    // volta pelo escritório e desce a escada até a contenção
    expect(walkTo(sim, 9, -3)).toBe(true);
    expect(walkTo(sim, 11.5, -3)).toBe(true);
    expect(walkTo(sim, 14, 0.2)).toBe(true);
    expect(walkTo(sim, 14, 2.4)).toBe(true);
    expect(walkTo(sim, 21, 3)).toBe(true);
    expect(walkTo(sim, 25, 3.5)).toBe(true);
    expect(walkTo(sim, 29.3, 6)).toBe(true);              // beira do poço da escada
    expect(walkTo(sim, 24.6, 6, 0.5)).toBe(true);
    expect(sim.p.y).toBeLessThan(-2.5);                   // desceu de fato
    expect(walkTo(sim, 25.5, 3.2)).toBe(true);
    expect(walkTo(sim, 28.5, 3)).toBe(true);
    expect(walkTo(sim, 30.8, 3)).toBe(true);              // porta da contenção abriu com o cartão
    use(sim, ex, [32.0, 3]);
    expect(sim.completed).toBe(true);
    expect(sim.visited.size).toBeGreaterThanOrEqual(7);
  });

  it('Núcleo do bunker: a porta externa é falsa e nunca abre', () => {
    const p = tpl('bunker');
    const sim = new PlaySim(p.scene, p.settings.character);
    const d = Object.values(sim.scene.openings).find((o) => o.name.includes('externa'))!;
    expect(sim.doorUnlocked(d.id)).toBe(false);
  });

  it('Instalação subterrânea: três pavimentos e escadas entre eles', () => {
    const p = tpl('facility');
    expect(p.scene.floorOrder).toHaveLength(3);
    expect(Object.keys(p.scene.stairs)).toHaveLength(2);
  });

  it('Floresta: terreno, trilhas e instâncias, e o jogador começa no chão', () => {
    const p = tpl('forest');
    expect(p.scene.terrain).toBeTruthy();
    expect(Object.keys(p.scene.paths).length).toBeGreaterThanOrEqual(2);
    const n = Object.values(p.scene.scatter).reduce((a, g) => a + g.items.length, 0);
    expect(n).toBeGreaterThan(400);
    const sim = new PlaySim(p.scene, p.settings.character);
    for (let i = 0; i < 60; i++) sim.update(1 / 60, IN);
    expect(sim.p.grounded).toBe(true);
    expect(Math.abs(sim.p.y)).toBeLessThan(2);
  });
});
