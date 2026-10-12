import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import type { WorldData } from '../src/world/worldgen';
import { TALENT_TREES, TITLE_POINTS, talentBonus, talentPointsFree, unlockedSkills } from '../src/data/talents';
import { ACTIONS } from '../src/data/actions';
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

describe('skill trees (free graph)', () => {
  it('every class: 3 archetypes, a big connected graph, 2 skill nodes per archetype that exist', () => {
    for (const cls of ['vanguard', 'arcanist', 'healer', 'ranger', 'rogue', 'barbarian', 'warlock'] as const) {
      const t = TALENT_TREES[cls];
      expect(t.archetypes.length).toBe(3);
      expect(t.nodes.length).toBeGreaterThanOrEqual(60);
      const byId = new Map(t.nodes.map((n) => [n.id, n]));
      for (const n of t.nodes) for (const l of n.links) expect(byId.get(l)?.links).toContain(n.id); // symmetric
      const seen = new Set([t.start]);
      const q = [t.start];
      while (q.length) for (const l of byId.get(q.shift()!)!.links) if (!seen.has(l)) { seen.add(l); q.push(l); }
      expect(seen.size).toBe(t.nodes.length); // connected
      for (const a of t.archetypes) {
        const skills = t.nodes.filter((n) => n.path === a.id && n.kind === 'skill');
        expect(skills.length).toBe(2);
        for (const s of skills) expect(ACTIONS[s.skill!]).toBeTruthy();
        expect(t.nodes.filter((n) => n.path === a.id && n.kind === 'keystone').length).toBe(1);
      }
    }
  });

  it('one point per level; a node must touch the owned area', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    expect(talentPointsFree(p)).toBe(0);
    expect(sim.allocateTalent(p.id, 'vg.r0')).toBe(false); // no points
    levelTo(sim, p.id, 4);
    expect(talentPointsFree(p)).toBe(3);
    expect(sim.allocateTalent(p.id, 'vg.paladin.0')).toBe(false); // not connected yet
    expect(sim.allocateTalent(p.id, 'ar.r0')).toBe(false); // other class
    expect(sim.allocateTalent(p.id, 'nope')).toBe(false);
    expect(sim.allocateTalent(p.id, 'vg.start')).toBe(false);
    expect(sim.allocateTalent(p.id, 'vg.r0')).toBe(true);
    expect(sim.allocateTalent(p.id, 'vg.r0')).toBe(false); // already owned
    expect(sim.allocateTalent(p.id, 'vg.paladin.0')).toBe(true);
    expect(talentPointsFree(p)).toBe(1);
  });

  it('max-HP node raises max HP', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    levelTo(sim, p.id, 3);
    const before = p.maxHp;
    sim.allocateTalent(p.id, 'vg.r0');
    expect(p.maxHp).toBeGreaterThan(before);
    expect(talentBonus(p, 'maxHp')).toBeGreaterThan(0);
  });

  it('damage node raises damage dealt', () => {
    const hit = (withTalent: boolean) => {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
      levelTo(sim, p.id, 4);
      if (withTalent) {
        sim.allocateTalent(p.id, 'vg.r4'); // crit
        sim.allocateTalent(p.id, 'vg.gladiator.0'); // physical damage
      }
      p.talentOverride = { critChance: -1 }; // no random crits in this comparison
      const d = dummy(sim, 21.3, 20);
      run(sim, p.id, cmd(Btn.Light, 0), 25);
      return 100000 - d.hp;
    };
    expect(hit(true)).toBeGreaterThan(hit(false));
  });

  it('cooldown node shortens ability cooldowns', () => {
    const cd = (owned: boolean) => {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
      levelTo(sim, p.id, 8);
      if (owned) {
        sim.allocateTalent(p.id, 'vg.r4');
        sim.allocateTalent(p.id, 'vg.r5'); // -2% cooldown
      }
      const t0 = sim.tick;
      run(sim, p.id, cmd(Btn.AbilQ, 0), 2);
      return p.cooldowns['vanguard_seismic']! - t0;
    };
    expect(cd(true)).toBeLessThan(cd(false));
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

  it('lifesteal heals the attacker on hit', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    p.talentOverride = { lifesteal: 0.1 };
    p.hp = 100;
    dummy(sim, 21.3, 20);
    run(sim, p.id, cmd(Btn.Light, 0), 25);
    expect(p.hp).toBeGreaterThan(100);
  });
});

describe('skill nodes, loadout and titles', () => {
  const toPaladinLight = ['vg.r0', 'vg.paladin.0', 'vg.paladin.1a', 'vg.paladin.2'];

  it('a skill node unlocks a new ability that can be equipped and used (Paladino: Luz Sagrada)', () => {
    const room = new Room({ world: flatWorld() });
    room.handle('s', { t: 'hello', version: PROTOCOL_VERSION });
    room.handle('s', { t: 'join', name: 'Lia', classId: 'vanguard' });
    const p = [...room.sim.entities.values()].find((e) => e.kind === 'player')!;
    levelTo(room.sim, p.id, 6);
    expect(room.handle('s', { t: 'equip', slot: 'a1', action: 'pal_light' })[0]?.t).toBe('error'); // locked
    for (const n of toPaladinLight) expect(room.handle('s', { t: 'talent', node: n })).toEqual([]);
    expect(unlockedSkills('vanguard', p.talents)).toContain('pal_light');
    expect(room.handle('s', { t: 'equip', slot: 'a1', action: 'pal_light' })).toEqual([]);
    expect(p.loadout.a1).toBe('pal_light');
    expect(room.handle('s', { t: 'equip', slot: 'a1', action: 'arcanist_bolt' })[0]?.t).toBe('error'); // other class
    p.hp = 100;
    run(room.sim, p.id, cmd(Btn.Abil1, 0), 2);
    expect(p.action?.id).toBe('pal_light');
    run(room.sim, p.id, cmd(0, 0), 20);
    expect(p.hp).toBeGreaterThan(100);
    // moving a skill to another slot frees the first one
    expect(room.handle('s', { t: 'equip', slot: 'r', action: 'pal_light' })).toEqual([]);
    expect(p.loadout.a1).toBeUndefined();
    expect(p.loadout.r).toBe('pal_light');
  });

  it('the archetype with most points becomes the title (needs TITLE_POINTS)', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    levelTo(sim, p.id, 12);
    const path = ['vg.r0', 'vg.paladin.0', 'vg.paladin.1a', 'vg.paladin.2', 'vg.paladin.3a', 'vg.paladin.4'];
    for (const n of path) expect(sim.allocateTalent(p.id, n)).toBe(true);
    expect(TITLE_POINTS).toBeLessThanOrEqual(5);
    expect(p.subclass).toBe('paladin');
  });

  it('respec at a bonfire refunds nodes and clears the loadout', () => {
    const w = flatWorld();
    w.props.push({ id: 1, kind: 'bonfire', x: 20, y: 22, r: 0.45, size: 0.6, solid: true, v: 0.5 });
    const sim = new Simulation({ world: w, spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20.6 });
    levelTo(sim, p.id, 6);
    for (const n of toPaladinLight) sim.allocateTalent(p.id, n);
    expect(sim.equipSkill(p.id, 'q', 'pal_light')).toBe(true);
    run(sim, p.id, cmd(Btn.Interact, 0), 2);
    expect(p.action?.id).toBe('sit');
    expect(sim.respec(p.id)).toBe(true);
    expect(Object.keys(p.talents).length).toBe(0);
    expect(p.loadout).toEqual({});
    expect(talentPointsFree(p)).toBe(5);
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
