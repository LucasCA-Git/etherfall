import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import type { WorldData } from '../src/world/worldgen';
import { getAction } from '../src/data/actions';
import { hasStatus } from '../src/combat/statuses';

function flatWorld(): WorldData {
  return { seed: 1, width: 60, height: 40, tiles: new Uint8Array(2400).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const cmd = (buttons = 0, aim = 0, mx = 0, my = 0): InputCommand => ({ seq: 0, mx, my, aim, buttons });
function setup(cls: 'vanguard' | 'arcanist') {
  const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
  const p = sim.addPlayer('T', cls, { x: 20, y: 20 });
  p.mana = p.maxMana = 999;
  return { sim, p };
}
function dummy(sim: Simulation, id: string, x: number, y: number) {
  const e = sim.spawnEnemy(id, x, y);
  e.ai!.attackReadyAt = 1e9;
  e.ai!.nextThink = 1e9;
  e.hp = e.maxHp = 5000;
  return e;
}
function cast(sim: Simulation, id: number, btn: number, ticks: number, aim = 0): SimEvent[] {
  const ev: SimEvent[] = [];
  sim.setInput(id, cmd(btn, aim));
  ev.push(...sim.step());
  sim.setInput(id, cmd(0, aim));
  for (let i = 1; i < ticks; i++) ev.push(...sim.step());
  return ev;
}

describe('statuses', () => {
  it('slow reduces and root stops enemy movement', () => {
    const { sim } = setup('vanguard');
    const a = sim.spawnEnemy('hollow', 26, 20);
    const b = sim.spawnEnemy('hollow', 26, 24);
    for (const e of [a, b]) e.ai!.attackReadyAt = 1e9;
    sim.applyStatus(a, 'root', 200, 1, -1);
    sim.applyStatus(b, 'slow', 200, 0.6, -1);
    const a0 = { ...a.pos };
    const b0 = { ...b.pos };
    for (let i = 0; i < 40; i++) sim.step();
    expect(Math.hypot(a.pos.x - a0.x, a.pos.y - a0.y)).toBeLessThan(0.05);
    const moved = Math.hypot(b.pos.x - b0.x, b.pos.y - b0.y);
    expect(moved).toBeGreaterThan(0.2);
    expect(moved).toBeLessThan(3.0 * (40 / 30) * 0.55);
  });

  it('statuses expire', () => {
    const { sim, p } = setup('vanguard');
    sim.applyStatus(p, 'slow', 10, 0.5, -1);
    expect(hasStatus(p, 'slow', sim.tick)).toBe(true);
    for (let i = 0; i < 12; i++) sim.step();
    expect(hasStatus(p, 'slow', sim.tick)).toBe(false);
    expect(p.statuses.length).toBe(0);
  });
});

describe('Arcanist 1–4', () => {
  it('1 Lança de Gelo: spikes travel along a line, hit everything on it once and slow', () => {
    const { sim, p } = setup('arcanist');
    const near = dummy(sim, 'hollow', 22, 20);
    const far = dummy(sim, 'hollow', 26.5, 20);
    const behind = dummy(sim, 'hollow', 17, 20);
    const ev = cast(sim, p.id, Btn.Abil1, 40);
    expect(ev.filter((x) => x.type === 'spikes').length).toBe(getAction('arcanist_icelance').spikes!.count);
    expect(near.hp).toBeLessThan(5000);
    expect(far.hp).toBeLessThan(5000);
    expect(behind.hp).toBe(5000);
    expect(ev.filter((x) => x.type === 'hit' && x.target === near.id).length).toBe(1);
    expect(near.statuses.some((s) => s.id === 'slow')).toBe(true);
  });

  it('2 Campo de Ruptura: a ground zone pulses damage + slow, then expires', () => {
    const { sim, p } = setup('arcanist');
    const def = getAction('arcanist_rupture').zone!;
    const e = dummy(sim, 'hollow', 20 + def.dist, 20);
    const ev = cast(sim, p.id, Btn.Abil2, 60);
    expect(ev.some((x) => x.type === 'zone')).toBe(true);
    expect(ev.filter((x) => x.type === 'hit' && x.target === e.id).length).toBeGreaterThanOrEqual(2);
    expect(hasStatus(e, 'slow', sim.tick)).toBe(true);
    for (let i = 0; i < def.ticks + 10; i++) sim.step();
    expect(sim.zones.length).toBe(0);
  });

  it('3 Selo de Contenção: roots the nearest enemy inside the aim cone', () => {
    const { sim, p } = setup('arcanist');
    const target = dummy(sim, 'ashwolf', 25, 20.5);
    const side = dummy(sim, 'ashwolf', 20, 26);
    cast(sim, p.id, Btn.Abil3, 20);
    expect(hasStatus(target, 'root', sim.tick)).toBe(true);
    expect(hasStatus(side, 'root', sim.tick)).toBe(false);
  });

  it('4 Colapso Astral: warned lightning strikes land later and hit around the target point', () => {
    const { sim, p } = setup('arcanist');
    const def = getAction('arcanist_collapse');
    const e = dummy(sim, 'hollow', 20 + def.strikes!.dist, 20);
    e.hp = e.maxHp = 50000;
    const ev = cast(sim, p.id, Btn.Abil4, 120);
    const warnIdx = ev.findIndex((x) => x.type === 'strikeWarn');
    const strikeIdx = ev.findIndex((x) => x.type === 'strike');
    expect(warnIdx).toBeGreaterThanOrEqual(0);
    expect(strikeIdx).toBeGreaterThan(warnIdx);
    expect(ev.filter((x) => x.type === 'strike').length).toBe(def.strikes!.count);
    expect(e.hp).toBeLessThan(50000);
  });

  it('abilities have distinct costs, cooldowns and roles', () => {
    const ids = ['arcanist_icelance', 'arcanist_rupture', 'arcanist_seal', 'arcanist_collapse'].map(getAction);
    expect(new Set(ids.map((d) => d.cooldown)).size).toBe(4);
    expect(new Set(ids.map((d) => d.mana)).size).toBe(4);
  });
});

describe('Vanguard 1–4', () => {
  it('1 Corte Ascendente staggers a fresh enemy (high poise damage)', () => {
    const { sim, p } = setup('vanguard');
    const e = dummy(sim, 'hollow', 21.4, 20);
    const ev = cast(sim, p.id, Btn.Abil1, 20);
    expect(ev.some((x) => x.type === 'stagger' && x.target === e.id)).toBe(true);
  });

  it('2 Guarda de Ferro cuts incoming damage and prevents stagger', () => {
    const a = setup('vanguard');
    const ea = dummy(a.sim, 'hollow', 21.3, 20);
    ea.facing = Math.PI;
    cast(a.sim, a.p.id, Btn.Abil2, 15);
    expect(hasStatus(a.p, 'ironguard', a.sim.tick)).toBe(true);
    const hp0 = a.p.hp;
    a.sim.startAction(ea, 'hollow_overhead', Math.PI);
    const evA = [] as SimEvent[];
    for (let i = 0; i < 40; i++) evA.push(...a.sim.step());
    const taken = hp0 - a.p.hp;
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThan(getAction('hollow_overhead').hit!.damage * 0.6);
    expect(evA.some((x) => x.type === 'stagger' && x.target === a.p.id)).toBe(false);
  });

  it('3 Contra-ataque only works right after a parry or a perfect dodge', () => {
    const { sim, p } = setup('vanguard');
    const e = dummy(sim, 'hollow', 21.3, 20);
    e.facing = Math.PI;
    const ev0 = cast(sim, p.id, Btn.Abil3, 3);
    expect(ev0.some((x) => x.type === 'fail')).toBe(true);
    sim.startAction(e, 'hollow_slash', Math.PI);
    for (let i = 0; i < getAction('hollow_slash').startup - 2; i++) sim.step();
    sim.setInput(p.id, cmd(Btn.Block));
    for (let i = 0; i < 5; i++) sim.step();
    expect(hasStatus(p, 'counter', sim.tick)).toBe(true);
    sim.setInput(p.id, cmd(0));
    sim.step();
    const hp = e.hp;
    cast(sim, p.id, Btn.Abil3, 15);
    expect(e.hp).toBeLessThan(hp);
    expect(hasStatus(p, 'counter', sim.tick)).toBe(false);
  });

  it('4 Fúria do Bastião hits the same target repeatedly', () => {
    const { sim, p } = setup('vanguard');
    const e = dummy(sim, 'hollow', 21.5, 20);
    const ev = cast(sim, p.id, Btn.Abil4, 70);
    expect(ev.filter((x) => x.type === 'hit' && x.target === e.id).length).toBeGreaterThanOrEqual(3);
  });
});
