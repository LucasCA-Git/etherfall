import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_SEED, generateWorld, zoneAt } from '../src/world/worldgen';
import { Tile } from '../src/world/tiles';
import { Simulation } from '../src/sim/simulation';
import { createEnemy, enemyHpMul } from '../src/entities/factory';
import { ENEMIES } from '../src/data/enemies';

const world = generateWorld(DEFAULT_WORLD_SEED);
const inDungeon = (x: number, y: number) => world.regions.some((r) => r.kind === 'dungeon' && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);

describe('0.12 regions by level', () => {
  it('has eight regions, from the starting forest (1–6) to the ruined fortress (34–45)', () => {
    expect(world.zones!.map((z) => z.id)).toEqual(['crepusculo', 'pedravelha', 'goblins', 'vaelmor', 'brejo', 'picos', 'cinzas', 'juramento']);
    expect(zoneAt(world, world.spawn.x, world.spawn.y)!.id).toBe('crepusculo');
    for (const z of world.zones!) {
      expect(z.minLevel).toBeLessThan(z.maxLevel);
      expect(zoneAt(world, z.cx, z.cy)!.id).toBe(z.id);
    }
  });

  it('every region has its biome ground, a bonfire and creatures of its level', () => {
    const count = (t: Tile) => world.tiles.filter((x) => x === t).length;
    expect(count(Tile.Snow)).toBeGreaterThan(5000);
    expect(count(Tile.Ash)).toBeGreaterThan(5000);
    expect(count(Tile.Mud)).toBeGreaterThan(1000);
    expect(count(Tile.Cobble)).toBeGreaterThan(50);
    expect(count(Tile.Lava)).toBeGreaterThan(20);
    for (const z of world.zones!) {
      const fires = world.props.filter((p) => p.kind === 'bonfire' && zoneAt(world, p.x, p.y)?.id === z.id);
      expect(fires.length, z.id).toBeGreaterThan(0);
      const foes = world.enemySpawns.filter((s) => zoneAt(world, s.x, s.y)?.id === z.id && !inDungeon(s.x, s.y));
      expect(foes.length, z.id).toBeGreaterThan(8);
      for (const f of foes) {
        expect(f.level!, `${z.id}/${f.enemyId}`).toBeGreaterThanOrEqual(z.minLevel);
        expect(f.level!, `${z.id}/${f.enemyId}`).toBeLessThanOrEqual(z.maxLevel + 3);
      }
    }
  });

  it('has a village, goblin camps, two castles, a graveyard, two lairs and four dungeons with portals', () => {
    const ids = new Set(world.pois.map((p) => p.id));
    for (const id of ['pedravelha', 'goblincamp1', 'goblincamp2', 'castle', 'fortress', 'graveyard', 'wyvernlair', 'dragonlair', 'crypt', 'icecave', 'necropolis', 'forge']) expect(ids.has(id), id).toBe(true);
    expect(world.regions.filter((r) => r.kind === 'dungeon')).toHaveLength(4);
    expect(world.portals).toHaveLength(8);
    expect(world.portals[0]!.id).toBe('crypt-down');
    for (const k of ['house', 'well', 'stall', 'tent', 'stake', 'grave', 'deadtree'] as const) expect(world.props.some((p) => p.kind === k), k).toBe(true);
    expect(world.enemySpawns.filter((s) => s.enemyId === 'fire_dragon')).toHaveLength(1);
  });

  it('chests carry the level of their region', () => {
    const chests = world.props.filter((p) => p.kind === 'chest');
    expect(chests.length).toBeGreaterThan(60);
    for (const c of chests) {
      expect(c.lvl, `${c.x},${c.y}`).toBeDefined();
      expect(c.lvl!).toBeLessThanOrEqual(45);
      if (!inDungeon(c.x, c.y)) expect(c.lvl!).toBeGreaterThanOrEqual(zoneAt(world, c.x, c.y)!.minLevel);
    }
  });

  it('creatures scale with their level (health, damage, XP)', () => {
    const lo = createEnemy(1, 'skeleton', { x: 0, y: 0 }, 0, -1, 1);
    const hi = createEnemy(2, 'skeleton', { x: 0, y: 0 }, 0, -1, 30);
    expect(lo.maxHp).toBe(ENEMIES.skeleton!.hp);
    expect(hi.maxHp).toBe(Math.round(ENEMIES.skeleton!.hp * enemyHpMul(30)));
    expect(hi.level).toBe(30);
    const sim = new Simulation({ world, spawnEnemies: true });
    const ice = [...sim.entities.values()].find((e) => e.enemyId === 'ice_ant')!;
    expect(ice.level).toBeGreaterThanOrEqual(20);
    const p = sim.addPlayer('Caçador', 'vanguard');
    const xp: number[] = [];
    for (const lvl of [1, 30]) {
      const foe = sim.spawnEnemy('skeleton', p.pos.x + 30, p.pos.y, -1, lvl);
      sim.kill(foe, p);
      const ev = sim.step();
      xp.push((ev.find((e) => e.type === 'kill') as { xp: number }).xp);
    }
    expect(xp[1]!).toBeGreaterThan(xp[0]! * 3);
  });
});
