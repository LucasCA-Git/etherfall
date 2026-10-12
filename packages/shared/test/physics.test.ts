import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../src/physics/spatialHash';
import { resolveCircleVsTiles, resolveCircleVsCircle, moveWithCollisions } from '../src/physics/collision';
import { Tile } from '../src/world/tiles';
import type { WorldData } from '../src/world/worldgen';

function flatWorld(w = 20, h = 20): WorldData {
  const tiles = new Uint8Array(w * h).fill(Tile.Grass);
  return { seed: 0, width: w, height: h, tiles, props: [], spawn: { x: 10, y: 10 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}

describe('SpatialHash', () => {
  it('returns items overlapping a query circle', () => {
    const h = new SpatialHash<{ id: number; x: number; y: number; r: number }>(4);
    h.insert({ id: 1, x: 1, y: 1, r: 0.5 });
    h.insert({ id: 2, x: 10, y: 10, r: 0.5 });
    h.insert({ id: 3, x: 3.9, y: 1, r: 0.5 });
    const ids = h.query(1, 1, 1).map((i) => i.id).sort();
    expect(ids).toContain(1);
    expect(ids).not.toContain(2);
  });
});

describe('collision', () => {
  it('pushes a circle out of a solid tile', () => {
    const w = flatWorld();
    w.tiles[10 * w.width + 11] = Tile.Rock; // tile (11,10)
    const pos = { x: 10.8, y: 10.5 };
    resolveCircleVsTiles(pos, 0.4, w);
    expect(pos.x).toBeLessThanOrEqual(11 - 0.4 + 1e-6);
  });

  it('separates overlapping circles by inverse mass', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0.5, y: 0 };
    resolveCircleVsCircle(a, 0.4, 1, b, 0.4, 3);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    expect(d).toBeCloseTo(0.8, 5);
    // heavier body (b) moves less
    expect(Math.abs(a.x - 0)).toBeGreaterThan(Math.abs(b.x - 0.5));
  });

  it('does not tunnel through a thin static obstacle at high speed', () => {
    const w = flatWorld();
    const statics = new SpatialHash<{ x: number; y: number; r: number }>(4);
    statics.insert({ x: 12, y: 10, r: 0.35 });
    const pos = { x: 10, y: 10 };
    // 30 m/s for one tick (1/30s) = 1m per tick; repeat 4 ticks
    for (let i = 0; i < 4; i++) moveWithCollisions(pos, { x: 30, y: 0 }, 0.4, 1 / 30, w, statics);
    expect(pos.x).toBeLessThan(12 - 0.35 - 0.4 + 0.01);
  });

  it('blocks deep water but allows shallow water', () => {
    const w = flatWorld();
    for (let y = 0; y < 20; y++) w.tiles[y * w.width + 12] = Tile.DeepWater;
    for (let y = 0; y < 20; y++) w.tiles[y * w.width + 8] = Tile.ShallowWater;
    const statics = new SpatialHash<{ x: number; y: number; r: number }>(4);
    const p = { x: 10, y: 10 };
    for (let i = 0; i < 60; i++) moveWithCollisions(p, { x: 5, y: 0 }, 0.4, 1 / 30, w, statics);
    expect(p.x).toBeLessThan(12);
    const q = { x: 10, y: 10 };
    for (let i = 0; i < 30; i++) moveWithCollisions(q, { x: -5, y: 0 }, 0.4, 1 / 30, w, statics);
    expect(q.x).toBeLessThan(8);
  });
});
