import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import type { WorldData } from '../src/world/worldgen';

function flatWorld(): WorldData {
  return { seed: 1, width: 60, height: 40, tiles: new Uint8Array(2400).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const cmd = (buttons = 0, aim = 0): InputCommand => ({ seq: 0, mx: 0, my: 0, aim, buttons });
function run(sim: Simulation, id: number, c: InputCommand, ticks: number): SimEvent[] {
  const ev: SimEvent[] = [];
  sim.setInput(id, c);
  ev.push(...sim.step());
  sim.setInput(id, cmd(0, c.aim));
  for (let i = 1; i < ticks; i++) ev.push(...sim.step());
  return ev;
}
const summonsOf = (sim: Simulation, ownerId: number) => [...sim.entities.values()].filter((e) => e.ownerId === ownerId);

describe('warlock summons', () => {
  it('Invocar Diabretes calls two allied imps on the caster team', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('W', 'warlock', { x: 20, y: 20 });
    const ev = run(sim, p.id, cmd(Btn.Abil2, 0), 20);
    const imps = summonsOf(sim, p.id);
    expect(imps.length).toBe(2);
    for (const i of imps) {
      expect(i.team).toBe(p.team);
      expect(i.enemyId).toBe('imp');
    }
    expect(ev.filter((e) => e.type === 'summon').length).toBe(2);
  });

  it('imps attack hostile enemies, and their kills give XP to the warlock', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('W', 'warlock', { x: 20, y: 20 });
    run(sim, p.id, cmd(Btn.Abil2, 0), 20);
    const foe = sim.spawnEnemy('hollow', 26, 20);
    foe.ai!.attackReadyAt = 1e9; // a passive target
    foe.hp = 30;
    const xp0 = p.xp + p.level * 1e6;
    for (let i = 0; i < 30 * 12 && foe.hp > 0; i++) sim.step();
    expect(foe.hp).toBeLessThanOrEqual(0);
    expect(p.xp + p.level * 1e6).toBeGreaterThan(xp0);
  });

  it('wild enemies fight summons too', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('W', 'warlock', { x: 20, y: 20 });
    run(sim, p.id, cmd(Btn.Abil2, 0), 20);
    p.statuses.push({ id: 'stealth', until: 1e9, power: 1, source: p.id }); // only the imps are visible
    const foe = sim.spawnEnemy('hollow', 23, 20);
    for (let i = 0; i < 30; i++) sim.step();
    const target = sim.entities.get(foe.ai!.targetId);
    expect(target?.ownerId).toBe(p.id);
  });

  it('summons follow their caster, expire, and never exceed the cap', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('W', 'warlock', { x: 20, y: 20 });
    p.mana = p.maxMana = 999;
    run(sim, p.id, cmd(Btn.Abil2, 0), 20);
    p.cooldowns = {};
    p.mana = 999;
    run(sim, p.id, cmd(Btn.Abil2, 0), 20);
    expect(summonsOf(sim, p.id).length).toBe(2);
    // the caster walks away; imps keep up
    p.pos.x = 40;
    for (let i = 0; i < 30 * 6; i++) sim.step();
    for (const s of summonsOf(sim, p.id)) expect(Math.hypot(s.pos.x - p.pos.x, s.pos.y - p.pos.y)).toBeLessThan(6);
    for (let i = 0; i < 30 * 25; i++) sim.step();
    expect(summonsOf(sim, p.id).length).toBe(0);
  });

  it('the R ultimate calls the Abyssal Guardian; summons vanish when the caster dies', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('W', 'warlock', { x: 20, y: 20 });
    p.mana = p.maxMana = 999;
    run(sim, p.id, cmd(Btn.Ultimate, 0), 30);
    expect(summonsOf(sim, p.id).map((s) => s.enemyId)).toEqual(['voidguard']);
    sim.kill(p, null);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 3; i++) ev.push(...sim.step());
    expect(summonsOf(sim, p.id).length).toBe(0);
    expect(ev.some((e) => e.type === 'unsummon')).toBe(true);
  });

  it('classes without an R ability ignore the ultimate button', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('V', 'vanguard', { x: 20, y: 20 });
    run(sim, p.id, cmd(Btn.Ultimate, 0), 3);
    expect(p.action).toBeNull();
  });
});
