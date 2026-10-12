import { describe, expect, it } from 'vitest';
import { Rng } from '../src/math/rng';
import { fbm2, valueNoise2 } from '../src/math/noise';
import { generateWorld, tileAt } from '../src/world/worldgen';
import { Tile, isWalkable } from '../src/world/tiles';

describe('Rng', () => {
  it('is reproducible for the same seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('produces values in [0,1) and differs per seed', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 50; i++) {
      const x = a.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === b.next()) same++;
    }
    expect(same).toBeLessThan(3);
  });
  it('can save and restore state', () => {
    const a = new Rng(99);
    a.next();
    const s = a.state;
    const v1 = a.next();
    a.state = s;
    expect(a.next()).toBe(v1);
  });
});

describe('noise', () => {
  it('is deterministic and bounded', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.11;
      const n = valueNoise2(x, y, 7);
      expect(n).toBe(valueNoise2(x, y, 7));
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      const f = fbm2(x, y, 7, 4);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe('worldgen', () => {
  const world = generateWorld(1337);

  it('is reproducible from a seed', () => {
    const again = generateWorld(1337);
    expect(Array.from(again.tiles)).toEqual(Array.from(world.tiles));
    expect(again.props.length).toBe(world.props.length);
    expect(again.props[10]).toEqual(world.props[10]);
  });

  it('differs between seeds', () => {
    const other = generateWorld(4242);
    let diff = 0;
    for (let i = 0; i < world.tiles.length; i++) if (world.tiles[i] !== other.tiles[i]) diff++;
    expect(diff).toBeGreaterThan(100);
  });

  it('contains a forest, a lake, a river and ruins', () => {
    const count = (t: Tile) => world.tiles.filter((x) => x === t).length;
    expect(world.props.filter((p) => p.kind === 'tree' || p.kind === 'pine').length).toBeGreaterThan(300);
    expect(count(Tile.DeepWater)).toBeGreaterThan(40);
    expect(count(Tile.ShallowWater)).toBeGreaterThan(80);
    expect(count(Tile.RuinFloor)).toBeGreaterThan(30);
    expect(world.props.some((p) => p.kind === 'bonfire')).toBe(true);
  });

  it('keeps the spawn clearing free of solid props and walkable', () => {
    const { spawn } = world;
    expect(isWalkable(tileAt(world, spawn.x, spawn.y))).toBe(true);
    for (const p of world.props) {
      if (!p.solid || p.kind === 'bonfire') continue;
      expect(Math.hypot(p.x - spawn.x, p.y - spawn.y)).toBeGreaterThan(4);
    }
  });

  it('never places trees in water', () => {
    for (const p of world.props) {
      if (p.kind !== 'tree' && p.kind !== 'pine') continue;
      const t = tileAt(world, p.x, p.y);
      expect(t === Tile.DeepWater || t === Tile.ShallowWater).toBe(false);
    }
  });

  it('makes every enemy spawn and bonfire reachable from spawn (BFS on walkable tiles + portals)', () => {
    const { width, height } = world;
    const seen = new Uint8Array(width * height);
    const q: number[] = [];
    const idx = (x: number, y: number) => Math.floor(y) * width + Math.floor(x);
    const s = idx(world.spawn.x, world.spawn.y);
    seen[s] = 1;
    q.push(s);
    const used = new Set<string>();
    while (q.length) {
      const i = q.pop()!;
      const x = i % width;
      const y = (i / width) | 0;
      for (const pt of world.portals) {
        if (used.has(pt.id) || Math.hypot(x + 0.5 - pt.x, y + 0.5 - pt.y) > pt.r) continue;
        used.add(pt.id);
        const d = idx(pt.toX, pt.toY);
        if (!seen[d]) {
          seen[d] = 1;
          q.push(d);
        }
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (seen[ni] || !isWalkable(world.tiles[ni] as Tile)) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    const reach = (x: number, y: number) => seen[Math.floor(y) * width + Math.floor(x)] === 1;
    expect(world.enemySpawns.length).toBeGreaterThan(8);
    for (const e of world.enemySpawns) expect(reach(e.x, e.y)).toBe(true);
    for (const b of world.props.filter((p) => p.kind === 'bonfire')) expect(reach(b.x + 1, b.y)).toBe(true);
  });

  it('has an impassable border', () => {
    expect(isWalkable(tileAt(world, 0.5, 0.5))).toBe(false);
    expect(isWalkable(tileAt(world, world.width - 0.5, world.height / 2))).toBe(false);
  });
});
