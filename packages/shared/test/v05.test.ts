import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import type { WorldData } from '../src/world/worldgen';
import { SUBCLASS_LEVEL, SUBCLASSES, TALENT_TREES, talentBonus, talentPointsFree } from '../src/data/talents';
import { ENEMIES } from '../src/data/enemies';
import { getAction } from '../src/data/actions';
import { bonfireSeats } from '../src/world/worldgen';
import { Room } from '../src/net/room';
import { xpToNext } from '../src/data/curves';
import { PROTOCOL_VERSION } from '../src/net/protocol';

function flatWorld(): WorldData {
  return { seed: 1, width: 60, height: 40, tiles: new Uint8Array(2400).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const cmd = (buttons = 0, aim = 0, mx = 0, my = 0): InputCommand => ({ seq: 0, mx, my, aim, buttons });
function run(sim: Simulation, id: number, c: InputCommand, ticks: number): SimEvent[] {
  const ev: SimEvent[] = [];
  sim.setInput(id, c);
  ev.push(...sim.step());
  sim.setInput(id, cmd(0, c.aim));
  for (let i = 1; i < ticks; i++) ev.push(...sim.step());
  return ev;
}
function levelTo(sim: Simulation, id: number, level: number) {
  const p = sim.entities.get(id)!;
  while (p.level < level) sim.grantXp(p, xpToNext(p.level) - p.xp, 'test');
  return p;
}
function dummy(sim: Simulation, x: number, y: number) {
  const e = sim.spawnEnemy('hollow', x, y);
  e.ai!.attackReadyAt = 1e9;
  e.ai!.nextThink = 1e9;
  e.hp = e.maxHp = 100000;
  e.maxPoise = e.poise = 100000;
  e.facing = Math.PI; // facing the player (no backstab)
  return e;
}

describe('talent trees', () => {
  it('every class has 3 branches with nodes, and 2 subclasses', () => {
    for (const cls of ['vanguard', 'arcanist', 'healer'] as const) {
      expect(TALENT_TREES[cls].branches.length).toBe(3);
      for (const b of TALENT_TREES[cls].branches) expect(b.nodes.length).toBeGreaterThanOrEqual(4);
      expect(SUBCLASSES[cls].length).toBe(2);
    }
  });

  it('grants one talent point per level after the first and validates allocation', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    expect(talentPointsFree(p)).toBe(0);
    expect(sim.allocateTalent(p.id, 'vg.b1')).toBe(false); // no points
    levelTo(sim, p.id, 4);
    expect(talentPointsFree(p)).toBe(3);
    expect(sim.allocateTalent(p.id, 'vg.b2')).toBe(false); // requires vg.b1
    expect(sim.allocateTalent(p.id, 'ar.g1')).toBe(false); // other class
    expect(sim.allocateTalent(p.id, 'nope')).toBe(false);
    expect(sim.allocateTalent(p.id, 'vg.b1')).toBe(true);
    expect(sim.allocateTalent(p.id, 'vg.b2')).toBe(true);
    expect(p.talents['vg.b1']).toBe(1);
    expect(talentPointsFree(p)).toBe(1);
  });

  it('respects max rank', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    levelTo(sim, p.id, 10);
    const max = TALENT_TREES.vanguard.branches[0]!.nodes[0]!.maxRank;
    for (let i = 0; i < max; i++) expect(sim.allocateTalent(p.id, 'vg.b1')).toBe(true);
    expect(sim.allocateTalent(p.id, 'vg.b1')).toBe(false);
  });

  it('max-HP talent raises max HP', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    levelTo(sim, p.id, 3);
    const before = p.maxHp;
    sim.allocateTalent(p.id, 'vg.b1');
    expect(p.maxHp).toBeGreaterThan(before);
    expect(talentBonus(p, 'maxHp')).toBeGreaterThan(0);
  });

  it('damage talent raises damage dealt', () => {
    const hit = (withTalent: boolean) => {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
      levelTo(sim, p.id, 4);
      if (withTalent) for (let i = 0; i < 3; i++) sim.allocateTalent(p.id, 'vg.l1');
      const d = dummy(sim, 21.3, 20);
      run(sim, p.id, cmd(Btn.Light, 0), 25);
      return 100000 - d.hp;
    };
    expect(hit(true)).toBeGreaterThan(hit(false));
  });

  it('cooldown talent shortens ability cooldowns', () => {
    const cd = (ranks: number) => {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
      levelTo(sim, p.id, 8);
      sim.allocateTalent(p.id, 'vg.l1');
      sim.allocateTalent(p.id, 'vg.l2');
      for (let i = 0; i < ranks; i++) sim.allocateTalent(p.id, 'vg.l3');
      const t0 = sim.tick;
      run(sim, p.id, cmd(Btn.AbilQ, 0), 2);
      return p.cooldowns['vanguard_seismic']! - t0;
    };
    expect(cd(3)).toBeLessThan(cd(0));
  });

  it('critical hits show up as crit "critical" and deal more', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    p.talentOverride = { critChance: 1 };
    const d = dummy(sim, 21.3, 20);
    const ev = run(sim, p.id, cmd(Btn.Light, 0), 25);
    const h = ev.find((e) => e.type === 'hit');
    expect(h && h.type === 'hit' && h.crit).toBe('critical');
    expect(100000 - d.hp).toBeGreaterThan(28);
  });
});

describe('subclasses', () => {
  it('can only be chosen once, at the subclass level, from the class list', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    expect(sim.chooseSubclass(p.id, 'paladin')).toBe(false);
    levelTo(sim, p.id, SUBCLASS_LEVEL);
    expect(sim.chooseSubclass(p.id, 'cryomancer')).toBe(false);
    expect(sim.chooseSubclass(p.id, 'paladin')).toBe(true);
    expect(p.subclass).toBe('paladin');
    expect(sim.chooseSubclass(p.id, 'berserker')).toBe(false);
  });

  it('lifesteal subclass heals the attacker on hit', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    levelTo(sim, p.id, SUBCLASS_LEVEL);
    sim.chooseSubclass(p.id, 'paladin');
    p.hp = 100;
    dummy(sim, 21.3, 20);
    run(sim, p.id, cmd(Btn.Light, 0), 25);
    expect(p.hp).toBeGreaterThan(100);
  });

  it('is exposed through the room protocol', () => {
    const room = new Room({ world: flatWorld() });
    room.handle('s', { t: 'hello', version: PROTOCOL_VERSION });
    room.handle('s', { t: 'join', name: 'Lia', classId: 'healer' });
    const p = [...room.sim.entities.values()].find((e) => e.kind === 'player')!;
    levelTo(room.sim, p.id, SUBCLASS_LEVEL);
    expect(room.handle('s', { t: 'talent', node: 'he.l1' })).toEqual([]);
    expect(room.handle('s', { t: 'subclass', id: 'dawnpriest' })).toEqual([]);
    expect(room.handle('s', { t: 'subclass', id: 'inquisitor' })[0]?.t).toBe('error');
    expect(p.subclass).toBe('dawnpriest');
  });
});

describe('bonfire seats', () => {
  it('interacting sits the player on a log facing the fire until they move', () => {
    const w = flatWorld();
    w.props.push({ id: 1, kind: 'bonfire', x: 20, y: 20, r: 0.45, size: 0.6, solid: true, v: 0.5 });
    const sim = new Simulation({ world: w, spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 21.6, y: 20.4 });
    run(sim, p.id, cmd(Btn.Interact, 0), 3);
    expect(p.action?.id).toBe('sit');
    const seats = bonfireSeats(w.props[0]!);
    expect(seats.some((s) => Math.hypot(s.x - p.pos.x, s.y - p.pos.y) < 0.05)).toBe(true);
    const toFire = Math.atan2(20 - p.pos.y, 20 - p.pos.x);
    expect(Math.abs(Math.atan2(Math.sin(p.facing - toFire), Math.cos(p.facing - toFire)))).toBeLessThan(0.05);
    for (let i = 0; i < 120; i++) sim.step();
    expect(p.action?.id).toBe('sit');
    run(sim, p.id, cmd(0, 0, 1, 0), 3);
    expect(p.action?.id ?? null).not.toBe('sit');
  });
});

describe('creatures 0.5', () => {
  it('giant spider is genuinely big, vampire noble exists with telegraphed attacks', () => {
    expect(ENEMIES.giantspider!.radius).toBeGreaterThanOrEqual(1.3);
    const v = ENEMIES.vampire!;
    expect(v.name).toBe('Nobre Vampírico');
    for (const a of v.attacks) expect(getAction(a.action).telegraph).toBeDefined();
  });
});
