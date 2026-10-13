import { Rng } from '../math/rng';
import { fbm2, valueNoise2 } from '../math/noise';
import type { Vec2 } from '../math/vec2';
import { Tile, isWalkable } from './tiles';
import { buildCastle, buildDungeon, makePortals, type BuildCtx } from './structures';

/** `chest`: size = tier (0 wood, 1 iron, 2 gold). */
export type PropKind = 'tree' | 'pine' | 'rock' | 'ruinWall' | 'pillar' | 'bonfire' | 'bush' | 'castleWall' | 'tower' | 'torch' | 'chest';

/** A static world object. `r` is the physical collider radius (may be smaller than the visual). */
export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  r: number;
  /** Visual size (canopy radius for trees, block size for walls). */
  size: number;
  solid: boolean;
  /** Per-prop variation in [0,1) used by visuals (sway phase, tint). */
  v: number;
}

export interface EnemySpawn {
  x: number;
  y: number;
  enemyId: string;
}

/** Named places that grant exploration XP the first time a player reaches them. */
export interface Poi {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  xp: number;
}

/** Interact (F) inside `r` to be moved to (toX, toY). */
export interface Portal {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  toX: number;
  toY: number;
}

/** Named rectangular areas (the client darkens dungeons; the minimap labels them). */
export interface Region {
  kind: 'castle' | 'dungeon';
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WorldData {
  seed: number;
  width: number;
  height: number;
  /** Row-major tile grid, 1 tile = 1 meter. */
  tiles: Uint8Array;
  props: Prop[];
  spawn: Vec2;
  enemySpawns: EnemySpawn[];
  pois: Poi[];
  portals: Portal[];
  regions: Region[];
}

export const WORLD_SIZE = 224;

/** Log seats around a bonfire (where players sit to rest), facing the fire. */
/** Seed of the shared world (offline play and the default server). */
export const DEFAULT_WORLD_SEED = 20261012;

export function bonfireSeats(b: { x: number; y: number }): Array<{ x: number; y: number; facing: number }> {
  return [0.4, 2.5, 4.4].map((a) => {
    const x = b.x + Math.cos(a) * 1.55;
    const y = b.y + Math.sin(a) * 1.55;
    return { x, y, facing: Math.atan2(b.y - y, b.x - x) };
  });
}

export function tileAt(w: WorldData, x: number, y: number): Tile {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= w.width || iy >= w.height) return Tile.Rock;
  return w.tiles[iy * w.width + ix] as Tile;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Controlled procedural generation of the "Floresta do Crepúsculo" starting region.
 * Layout is seeded and reproducible; key POIs (spawn clearing, lake, river, ruins)
 * are placed by rules so they always exist and stay reachable.
 */
export function generateWorld(seed: number, size = WORLD_SIZE): WorldData {
  const W = size;
  const H = size;
  const rng = new Rng(seed);
  const tiles = new Uint8Array(W * H).fill(Tile.Grass);
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t;
  };
  const get = (x: number, y: number): Tile => (x >= 0 && y >= 0 && x < W && y < H ? (tiles[y * W + x] as Tile) : Tile.Rock);

  const spawn = { x: W * 0.5 + 0.5, y: H * 0.58 + 0.5 };
  const lake = { x: spawn.x + 24 + rng.range(-3, 3), y: spawn.y + rng.range(-4, 6) };
  const ruins = { x: spawn.x - 27 + rng.range(-3, 3), y: spawn.y - 20 + rng.range(-3, 3) };
  const ruinW = 12;
  const ruinH = 9;
  const ruinX0 = Math.round(ruins.x - ruinW / 2);
  const ruinY0 = Math.round(ruins.y - ruinH / 2);

  // 1) Base ground: grass / tall grass / dirt patches.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tg = fbm2(x * 0.09, y * 0.09, seed + 5, 3);
      const dn = fbm2(x * 0.05, y * 0.05, seed + 17, 3);
      let t = Tile.Grass;
      if (tg > 0.6) t = Tile.TallGrass;
      if (dn > 0.76) t = Tile.Dirt;
      tiles[y * W + x] = t;
    }
  }

  // 2) Rock outcrops away from the start area.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (Math.hypot(x - spawn.x, y - spawn.y) < 20) continue;
      if (Math.hypot(x - ruins.x, y - ruins.y) < 12) continue;
      if (Math.hypot(x - lake.x, y - lake.y) < 16) continue;
      if (fbm2(x * 0.07, y * 0.07, seed + 29, 4) > 0.71) set(x, y, Tile.Rock);
    }
  }

  // 3) Lake with sandy shore and deep core (irregular radius from angular noise).
  const lakeR = 10;
  for (let y = Math.floor(lake.y - 18); y <= lake.y + 18; y++) {
    for (let x = Math.floor(lake.x - 18); x <= lake.x + 18; x++) {
      const dx = x + 0.5 - lake.x;
      const dy = y + 0.5 - lake.y;
      const a = Math.atan2(dy, dx);
      const r = lakeR + (valueNoise2(Math.cos(a) * 2 + 10, Math.sin(a) * 2 + 10, seed + 41) - 0.5) * 7;
      const d = Math.hypot(dx, dy);
      if (d < r - 3) set(x, y, Tile.DeepWater);
      else if (d < r) set(x, y, Tile.ShallowWater);
      else if (d < r + 1.3 && get(x, y) !== Tile.Rock) set(x, y, Tile.Sand);
    }
  }

  // 4) River: meandering walk from the lake's north shore to the map edge. Shallow (fordable).
  {
    let x = lake.x + rng.range(-2, 2);
    let y = lake.y - lakeR + 1;
    let step = 0;
    while (y > 1) {
      const w = 1.4 + valueNoise2(step * 0.08, 3, seed + 53) * 1.4;
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -4; ox <= 4; ox++) {
          const tx = Math.floor(x + ox);
          const ty = Math.floor(y + oy);
          const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
          if (d < w) {
            if (get(tx, ty) !== Tile.DeepWater) set(tx, ty, Tile.ShallowWater);
          } else if (d < w + 0.9 && get(tx, ty) !== Tile.ShallowWater && get(tx, ty) !== Tile.DeepWater) set(tx, ty, Tile.Sand);
        }
      }
      x += (valueNoise2(step * 0.05, 7, seed + 61) - 0.5) * 1.6;
      y -= 0.5;
      step++;
    }
  }

  // 5) Dirt paths from spawn to POIs (also carve through rock to guarantee access).
  const carvePath = (from: Vec2, to: Vec2, salt: number) => {
    const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const wob = (valueNoise2(t * 6, salt, seed + salt) - 0.5) * 6 * Math.sin(t * Math.PI);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const l = Math.hypot(dx, dy) || 1;
      const px = from.x + dx * t + (-dy / l) * wob;
      const py = from.y + dy * t + (dx / l) * wob;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const tx = Math.floor(px + ox * 0.45);
          const ty = Math.floor(py + oy * 0.45);
          const cur = get(tx, ty);
          if (cur === Tile.DeepWater || cur === Tile.ShallowWater || cur === Tile.CastleFloor || cur === Tile.DungeonFloor) continue;
          set(tx, ty, Tile.Dirt);
        }
      }
    }
  };
  carvePath(spawn, { x: ruinX0 + ruinW, y: ruins.y }, 71);
  carvePath(spawn, { x: lake.x - lakeR - 1, y: lake.y }, 73);
  carvePath(spawn, { x: spawn.x - 6, y: H - 6 }, 79);

  // 6) Ruins: floor + broken walls with a doorway facing east (toward the spawn path).
  const props: Prop[] = [];
  let pid = 1;
  const addProp = (p: Omit<Prop, 'id'>) => props.push({ id: pid++, ...p });
  for (let y = ruinY0; y < ruinY0 + ruinH; y++) for (let x = ruinX0; x < ruinX0 + ruinW; x++) set(x, y, Tile.RuinFloor);
  for (let y = ruinY0; y < ruinY0 + ruinH; y++) {
    for (let x = ruinX0; x < ruinX0 + ruinW; x++) {
      const edge = x === ruinX0 || y === ruinY0 || x === ruinX0 + ruinW - 1 || y === ruinY0 + ruinH - 1;
      if (!edge) continue;
      const door = x === ruinX0 + ruinW - 1 && Math.abs(y + 0.5 - ruins.y) < 2;
      if (door || rng.chance(0.28)) continue;
      addProp({ kind: 'ruinWall', x: x + 0.5, y: y + 0.5, r: 0.55, size: 1, solid: true, v: rng.next() });
    }
  }
  const pillarSpots: Array<[number, number]> = [[3, 3], [ruinW - 4, 3], [3, ruinH - 4], [ruinW - 4, ruinH - 4]];
  for (const [ox, oy] of pillarSpots) {
    if (rng.chance(0.8)) addProp({ kind: 'pillar', x: ruinX0 + ox + 0.5, y: ruinY0 + oy + 0.5, r: 0.4, size: 0.8, solid: true, v: rng.next() });
  }

  // 7) Border.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) set(x, y, Tile.Rock);

  // 8) Spawn clearing: guaranteed walkable ground.
  for (let y = Math.floor(spawn.y - 6); y <= spawn.y + 6; y++) {
    for (let x = Math.floor(spawn.x - 6); x <= spawn.x + 6; x++) {
      if (Math.hypot(x + 0.5 - spawn.x, y + 0.5 - spawn.y) < 6 && !isWalkable(get(x, y))) set(x, y, Tile.Grass);
    }
  }

  // 8b) Castle (north) and the crypt dungeon (south-west, sealed in rock, reached by portal).
  const bctx: BuildCtx = { W, H, rng, set, get, addProp };
  const castle = buildCastle(bctx, spawn.x - 10, spawn.y - 62);
  carvePath(spawn, castle.gate, 83);
  const dungeon = buildDungeon(bctx, 6, Math.round(H * 0.77), Math.round(W * 0.33), H - 6);
  const portals = makePortals(castle, dungeon);
  const nearCastle = (x: number, y: number) => x > castle.x0 - 4 && x < castle.x1 + 5 && y > castle.y0 - 4 && y < castle.y1 + 5;

  // Bonfires: spawn camp + ruins center.
  addProp({ kind: 'bonfire', x: spawn.x, y: spawn.y - 2.2, r: 0.45, size: 0.6, solid: true, v: 0.5 });
  addProp({ kind: 'bonfire', x: ruins.x, y: ruins.y, r: 0.45, size: 0.6, solid: true, v: 0.25 });

  // 9) Vegetation: jittered grid sampling weighted by a forest density field.
  const isBlockedForTree = (x: number, y: number): boolean => {
    const t = get(Math.floor(x), Math.floor(y));
    if (t !== Tile.Grass && t !== Tile.TallGrass) return true;
    if (Math.hypot(x - spawn.x, y - spawn.y) < 8) return true;
    if (x > ruinX0 - 2 && x < ruinX0 + ruinW + 2 && y > ruinY0 - 2 && y < ruinY0 + ruinH + 2) return true;
    if (nearCastle(x, y)) return true;
    // keep clear of paths/water in the 3x3 neighbourhood so trunks never block routes
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const n = get(Math.floor(x) + ox, Math.floor(y) + oy);
        if (n === Tile.Dirt || n === Tile.ShallowWater || n === Tile.DeepWater || n === Tile.Sand || n === Tile.CastleFloor || n === Tile.DungeonFloor) return true;
      }
    }
    return false;
  };
  const cell = 1.9;
  for (let gy = 2; gy < H - 2; gy += cell) {
    for (let gx = 2; gx < W - 2; gx += cell) {
      const x = gx + rng.range(0.2, cell - 0.2);
      const y = gy + rng.range(0.2, cell - 0.2);
      const density = fbm2(x * 0.045, y * 0.045, seed + 11, 4);
      const p = smoothstep(0.36, 0.62, density) * 0.82 + 0.05;
      const roll = rng.next();
      const kindRoll = rng.next();
      const v = rng.next();
      if (roll > p || isBlockedForTree(x, y)) {
        if (isBlockedForTree(x, y)) continue;
        // sparse boulders and bushes where no tree went
        if (roll > 0.985) addProp({ kind: 'rock', x, y, r: 0.45 + v * 0.35, size: 0.6 + v * 0.5, solid: true, v });
        else if (roll < p + 0.06) addProp({ kind: 'bush', x, y, r: 0, size: 0.6 + v * 0.4, solid: false, v });
        continue;
      }
      const pine = fbm2(x * 0.03, y * 0.03, seed + 97, 2) + (kindRoll - 0.5) * 0.25 > 0.55;
      addProp({ kind: pine ? 'pine' : 'tree', x, y, r: 0.32, size: 1.1 + v * 0.9, solid: true, v });
    }
  }

  // 10) Enemy spawns, only on tiles reachable from spawn (BFS) and away from the camp.
  const reach = new Uint8Array(W * H);
  {
    const q: number[] = [];
    const s = Math.floor(spawn.y) * W + Math.floor(spawn.x);
    reach[s] = 1;
    q.push(s);
    while (q.length) {
      const i = q.pop()!;
      const x = i % W;
      const y = (i / W) | 0;
      const nb = [i + 1, i - 1, i + W, i - W];
      const ok = [x + 1 < W, x > 0, y + 1 < H, y > 0];
      for (let k = 0; k < 4; k++) {
        const ni = nb[k]!;
        if (!ok[k] || reach[ni] || !isWalkable(tiles[ni] as Tile)) continue;
        reach[ni] = 1;
        q.push(ni);
      }
    }
  }
  // chests scattered through the wilds: wood near camp, iron farther out, one in the ruins
  {
    const chests: Array<{ x: number; y: number }> = [];
    addProp({ kind: 'chest', x: ruins.x - 3, y: ruins.y + 2, r: 0.45, size: 1, solid: true, v: rng.next() });
    let tries = 0;
    while (chests.length < 22 && tries++ < 4000) {
      const x = Math.floor(rng.range(6, W - 6)) + 0.5;
      const y = Math.floor(rng.range(6, H - 6)) + 0.5;
      const t = get(Math.floor(x), Math.floor(y));
      if (!reach[Math.floor(y) * W + Math.floor(x)] || t === Tile.ShallowWater) continue;
      const d = Math.hypot(x - spawn.x, y - spawn.y);
      if (d < 10 || nearCastle(x, y) || chests.some((c) => Math.hypot(c.x - x, c.y - y) < 14)) continue;
      if (props.some((p) => p.solid && Math.hypot(p.x - x, p.y - y) < p.r + 1.4)) continue;
      chests.push({ x, y });
      addProp({ kind: 'chest', x, y, r: 0.45, size: d > 70 && rng.next() < 0.5 ? 1 : d > 90 && rng.next() < 0.25 ? 2 : 0, solid: true, v: rng.next() });
    }
  }
  const enemySpawns: EnemySpawn[] = [];
  const solidNear = (x: number, y: number) => props.some((p) => p.solid && Math.hypot(p.x - x, p.y - y) < p.r + 0.9);
  // Guaranteed ruin guardians.
  const guardSpots: Array<[number, number]> = [[-2, -1.5], [2, 1.5]];
  for (const [ox, oy] of guardSpots) {
    const x = ruins.x + ox;
    const y = ruins.y + oy;
    if (reach[Math.floor(y) * W + Math.floor(x)] && !solidNear(x, y)) enemySpawns.push({ x, y, enemyId: 'hollow' });
  }
  let attempts = 0;
  for (const s of [...castle.spawns, ...dungeon.spawns]) enemySpawns.push(s);
  const fixed = enemySpawns.length;
  while (enemySpawns.length < fixed + 30 && attempts++ < 6000) {
    const x = rng.range(4, W - 4);
    const y = rng.range(4, H - 4);
    const t = get(Math.floor(x), Math.floor(y));
    if (!reach[Math.floor(y) * W + Math.floor(x)] || t === Tile.ShallowWater) continue;
    if (Math.hypot(x - spawn.x, y - spawn.y) < 16) continue;
    if (enemySpawns.some((e) => Math.hypot(e.x - x, e.y - y) < 7)) continue;
    if (solidNear(x, y) || nearCastle(x, y)) continue;
    const far = Math.hypot(x - spawn.x, y - spawn.y) > 50;
    const roll = rng.next();
    const enemyId = far
      ? roll < 0.05 ? 'bonegiant' : roll < 0.11 ? 'giantspider' : roll < 0.17 ? 'vampire' : roll < 0.27 ? 'fire_ant' : roll < 0.36 ? 'ice_ant'
        : roll < 0.45 ? 'skeleton_archer' : roll < 0.52 ? 'cursed_grave' : roll < 0.62 ? 'skeleton' : roll < 0.8 ? 'ashwolf' : 'hollow'
      : roll < 0.35 ? 'ashwolf' : roll < 0.6 ? 'goblin' : 'hollow';
    enemySpawns.push({ x, y, enemyId });
  }
  // goblin camps: a chief with his band, in the middle distance
  const camps = enemySpawns.slice(fixed).filter((e) => {
    const d = Math.hypot(e.x - spawn.x, e.y - spawn.y);
    return d > 28 && d < 70;
  }).slice(0, 3);
  for (const c of camps) {
    c.enemyId = 'goblin_chief';
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const x = c.x + Math.cos(a) * 2.2;
      const y = c.y + Math.sin(a) * 1.8;
      if (reach[Math.floor(y) * W + Math.floor(x)] && !solidNear(x, y)) enemySpawns.push({ x, y, enemyId: 'goblin' });
    }
  }
  // dragons: the Ash Dragon in the farthest open ground, a frost wyvern by the lake
  {
    const open = enemySpawns.slice(fixed).filter((e) => e.enemyId !== 'goblin' && e.enemyId !== 'goblin_chief');
    const farthest = open.sort((a, b) => Math.hypot(b.x - spawn.x, b.y - spawn.y) - Math.hypot(a.x - spawn.x, a.y - spawn.y))[0];
    if (farthest) farthest.enemyId = 'fire_dragon';
    const byLake = open.filter((e) => e !== farthest && e.enemyId !== 'bonegiant').sort((a, b) => Math.hypot(a.x - lake.x, a.y - lake.y) - Math.hypot(b.x - lake.x, b.y - lake.y))[0];
    if (byLake && Math.hypot(byLake.x - spawn.x, byLake.y - spawn.y) > 30) byLake.enemyId = 'frost_wyvern';
  }
  // epic giants: at least two roam the far wilds (the farthest open spawns from camp)
  const giants = enemySpawns.filter((e) => e.enemyId === 'bonegiant').length;
  if (giants < 2) {
    enemySpawns
      .slice(fixed)
      .filter((e) => !['bonegiant', 'fire_dragon', 'frost_wyvern', 'goblin_chief', 'goblin'].includes(e.enemyId))
      .sort((a, b) => Math.hypot(b.x - spawn.x, b.y - spawn.y) - Math.hypot(a.x - spawn.x, a.y - spawn.y))
      .slice(0, 2 - giants)
      .forEach((e) => (e.enemyId = 'bonegiant'));
  }

  const pois: Poi[] = [
    { id: 'camp', name: 'Acampamento do Crepúsculo', x: spawn.x, y: spawn.y, r: 6, xp: 0 },
    { id: 'ruins', name: 'Ruínas do Juramento', x: ruins.x, y: ruins.y, r: 7, xp: 60 },
    { id: 'lake', name: 'Lago Espelhado', x: lake.x, y: lake.y, r: lakeR + 4, xp: 40 },
    castle.poi,
    dungeon.poi,
  ];
  return { seed, width: W, height: H, tiles, props, spawn, enemySpawns, pois, portals, regions: [castle.region, dungeon.region] };
}
