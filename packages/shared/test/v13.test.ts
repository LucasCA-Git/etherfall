import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type Entity, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import { DEFAULT_WORLD_SEED, generateWorld, zoneAt, type EnemySpawn, type WorldData } from '../src/world/worldgen';
import { CHANT, DEMON_LINE, SUMMON_LINE, VILLAGER_LINES } from '../src/sim/living';

const world = generateWorld(DEFAULT_WORLD_SEED);

function flatWorld(extra: Partial<WorldData> = {}): WorldData {
  return { seed: 1, width: 80, height: 60, tiles: new Uint8Array(4800).fill(Tile.Grass), props: [], spawn: { x: 10, y: 30 }, enemySpawns: [], pois: [], portals: [], regions: [], ...extra };
}
const cmd = (buttons: number, mx = 0, my = 0) => ({ seq: 0, mx, my, aim: 0, buttons });
const speeches = (ev: SimEvent[]) => ev.filter((e): e is Extract<SimEvent, { type: 'speech' }> => e.type === 'speech');

describe('0.13 living world', () => {
  it('fills the regions with herds, a village with people and four summoning circles', () => {
    const kinds = (id: string) => world.enemySpawns.filter((s) => s.enemyId === id);
    for (const id of ['deer', 'rabbit', 'boar']) {
      expect(kinds(id).length, id).toBeGreaterThan(15);
      for (const s of kinds(id)) expect(s.anchor, id).toBeDefined();
    }
    expect(kinds('villager')).toHaveLength(8);
    for (const v of kinds('villager')) expect(zoneAt(world, v.x, v.y)!.id).toBe('pedravelha');
    expect(world.rituals!.map((r) => r.id)).toEqual(['ritual-vaelmor', 'ritual-brejo', 'ritual-cinzas', 'ritual-juramento']);
    for (const r of world.rituals!) {
      expect(world.props.some((p) => p.kind === 'ritual' && p.x === r.x && p.y === r.y)).toBe(true);
      const cult = world.enemySpawns.filter((s) => s.anchor && s.anchor.x === r.x && s.anchor.y === r.y);
      expect(cult.map((s) => s.enemyId).sort()).toEqual(['cult_leader', 'cultist', 'cultist', 'cultist']);
    }
    // no herd in the ash wastes
    expect(world.enemySpawns.some((s) => s.enemyId === 'deer' && zoneAt(world, s.x, s.y)!.biome === 'ash')).toBe(false);
  });

  it('a deer grazes when left alone and bolts from a running player', () => {
    const sp: EnemySpawn = { x: 40, y: 30, enemyId: 'deer', anchor: { x: 40, y: 30 } };
    const sim = new Simulation({ world: flatWorld({ enemySpawns: [sp] }) });
    const deer = [...sim.entities.values()].find((e) => e.enemyId === 'deer')!;
    const seen = new Set<string>();
    for (let i = 0; i < 30 * 30; i++) {
      sim.step();
      if (deer.action) seen.add(deer.action.id);
    }
    expect(seen.has('graze')).toBe(true);
    expect(Math.hypot(deer.pos.x - 40, deer.pos.y - 30)).toBeLessThan(9);
    const p = sim.addPlayer('Caçador', 'ranger', { x: deer.pos.x - 6, y: deer.pos.y });
    const before = Math.hypot(deer.pos.x - p.pos.x, deer.pos.y - p.pos.y);
    for (let i = 0; i < 45; i++) sim.step();
    expect(deer.ai!.mode).toBe('flee');
    expect(Math.hypot(deer.pos.x - p.pos.x, deer.pos.y - p.pos.y)).toBeGreaterThan(before + 2);
  });

  it('a boar gores back when hit; monsters leave the wildlife alone', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const boar = sim.spawnEnemy('boar', 40, 30);
    const skel = sim.spawnEnemy('skeleton', 42, 30);
    for (let i = 0; i < 90; i++) sim.step();
    expect(skel.ai!.targetId).toBe(-1);
    const p = sim.addPlayer('Caçador', 'vanguard', { x: boar.pos.x - 1.6, y: boar.pos.y });
    p.hp = p.maxHp = 1e6;
    boar.lastHitTick = sim.tick;
    boar.lastHitBy = p.id;
    const used = new Set<string>();
    for (let i = 0; i < 30 * 6; i++) {
      sim.step();
      if (boar.action) used.add(boar.action.id);
    }
    expect([...used].some((a) => a.startsWith('boar_'))).toBe(true);
  });

  it('villagers answer when spoken to and run from monsters', () => {
    const sp: EnemySpawn = { x: 40, y: 30, enemyId: 'villager', anchor: { x: 40, y: 30 } };
    const sim = new Simulation({ world: flatWorld({ enemySpawns: [sp] }) });
    const v = [...sim.entities.values()].find((e) => e.enemyId === 'villager')!;
    const p = sim.addPlayer('Viajante', 'vanguard', { x: v.pos.x - 1.5, y: v.pos.y });
    sim.setInput(p.id, cmd(Btn.Interact));
    const ev = sim.step();
    sim.setInput(p.id, cmd(0));
    const said = speeches(ev);
    expect(said).toHaveLength(1);
    expect(said[0]!.id).toBe(v.id);
    expect(VILLAGER_LINES).toContain(said[0]!.text);
    expect(p.action?.id).not.toBe('sit');
    // a hollow walks into the square: the villager runs
    const foe = sim.spawnEnemy('hollow', v.pos.x + 4, v.pos.y);
    foe.ai!.targetId = -1;
    for (let i = 0; i < 30; i++) sim.step();
    expect(v.ai!.mode).toBe('flee');
    expect(p.team).toBe(v.team);
  });

  function ritualSim(): { sim: Simulation; leader: Entity; cultists: Entity[] } {
    const c = { x: 50, y: 30 };
    const spawns: EnemySpawn[] = [
      { x: c.x, y: c.y - 3.4, enemyId: 'cult_leader', level: 20, anchor: c },
      ...[0, 1, 2].map((k) => ({ x: c.x + Math.cos(Math.PI / 2 + (k - 1) * 1.9) * 3.3, y: c.y + Math.sin(Math.PI / 2 + (k - 1) * 1.9) * 3.3, enemyId: 'cultist', level: 19, anchor: c })),
    ];
    const sim = new Simulation({ world: flatWorld({ enemySpawns: spawns, rituals: [{ id: 'ritual-test', x: c.x, y: c.y, level: 20 }] }) });
    const all = [...sim.entities.values()];
    return { sim, leader: all.find((e) => e.enemyId === 'cult_leader')!, cultists: all.filter((e) => e.enemyId === 'cultist') };
  }

  it('cultists chant when a player comes near, then summon the demon', () => {
    const { sim } = ritualSim();
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.living.phases()[0]!.phase).toBe('idle');
    const p = sim.addPlayer('Testemunha', 'vanguard', { x: 39, y: 30 }); // 11 m: close enough to be noticed, outside aggro
    p.hp = p.maxHp = 1e6;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 30 * 20; i++) ev.push(...sim.step());
    const lines = speeches(ev).map((s) => s.text);
    for (const [, text] of CHANT) expect(lines).toContain(text);
    expect(lines).toContain(SUMMON_LINE);
    expect(lines).toContain(DEMON_LINE);
    expect(lines.indexOf(CHANT[0]![1])).toBeLessThan(lines.indexOf(SUMMON_LINE));
    expect(ev.some((e) => e.type === 'ritual' && e.phase === 'chant')).toBe(true);
    const demon = [...sim.entities.values()].find((e) => e.enemyId === 'demon')!;
    expect(demon).toBeDefined();
    expect(demon.level).toBe(22);
    expect(sim.living.phases()[0]!.phase).toBe('summoned');
    sim.kill(demon, p);
    for (let i = 0; i < 30 * 5; i++) sim.step();
    expect(sim.living.phases()[0]!.phase).toBe('broken');
    expect([...sim.entities.values()].some((e) => e.enemyId === 'demon')).toBe(false);
  });

  it('killing the herald mid-chant breaks the circle: no demon', () => {
    const { sim, leader } = ritualSim();
    const p = sim.addPlayer('Caçador', 'vanguard', { x: 39, y: 30 });
    p.hp = p.maxHp = 1e6;
    for (let i = 0; i < 30 * 4; i++) sim.step();
    expect(sim.living.phases()[0]!.phase).toBe('chant');
    sim.kill(leader, p);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 30 * 25; i++) ev.push(...sim.step());
    expect(sim.living.phases()[0]!.phase).toBe('broken');
    expect([...sim.entities.values()].some((e) => e.enemyId === 'demon')).toBe(false);
  });
});
