import { Rng } from '../math/rng';
import { fbm2, valueNoise2 } from '../math/noise';
import type { Vec2 } from '../math/vec2';
import { Tile, isWalkable } from './tiles';
import { buildCastle, buildDungeon, buildGoblinCamp, buildGraveyard, buildLair, buildVillage, makePortals, type BuildCtx, type SiteInfo } from './structures';

/** `chest`: size = tier (0 wood, 1 iron, 2 gold). */
export type PropKind =
  | 'tree' | 'pine' | 'rock' | 'ruinWall' | 'pillar' | 'bonfire' | 'bush' | 'castleWall' | 'tower' | 'torch' | 'chest'
  | 'deadtree' | 'house' | 'well' | 'stall' | 'tent' | 'stake' | 'grave' | 'bones' | 'ritual';

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
  /** Chests: item level of their contents (the level of the region they stand in). */
  lvl?: number;
}

export interface EnemySpawn {
  x: number;
  y: number;
  enemyId: string;
  /** Creature level (from the region); 1 when absent. */
  level?: number;
  /** Herd, village or ritual-circle center the creature keeps returning to. */
  anchor?: Vec2;
}

/** A cultist summoning circle: the leader and his acolytes chant when a player comes near, then call a demon. */
export interface RitualSite {
  id: string;
  x: number;
  y: number;
  level: number;
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
  /** Level regions of the map (absent in hand-made test worlds). */
  zones?: WorldZone[];
  /** Zone index per tile (row-major, like `tiles`). */
  zoneMap?: Uint8Array;
  /** Summoning circles of the cult (0.13). */
  rituals?: RitualSite[];
}

export type Biome = 'forest' | 'meadow' | 'swamp' | 'snow' | 'ash' | 'ruins';

/** A region of the map with its own biome and level range. */
export interface WorldZone {
  id: string;
  name: string;
  biome: Biome;
  minLevel: number;
  maxLevel: number;
  cx: number;
  cy: number;
}

export const WORLD_SIZE = 672;

/** Bonfires are sanctuaries: no creature spawns or hunts inside this radius (m). */
export const SAFE_RADIUS = 9;
const fireCache = new WeakMap<WorldData, Prop[]>();
/** The bonfire whose sanctuary covers (x, y), if any. */
export function sanctuaryAt(w: WorldData, x: number, y: number, pad = 0): Prop | null {
  let fires = fireCache.get(w);
  if (!fires) fireCache.set(w, (fires = w.props.filter((p) => p.kind === 'bonfire')));
  const r = SAFE_RADIUS + pad;
  for (const f of fires) if (Math.abs(f.x - x) < r && Math.abs(f.y - y) < r && Math.hypot(f.x - x, f.y - y) < r) return f;
  return null;
}

/** Seed of the shared world (offline play and the default server). */
export const DEFAULT_WORLD_SEED = 20261012;

/** Log seats around a bonfire (where players sit to rest), facing the fire. */
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

/** The level region at a point (null in worlds without regions). */
export function zoneAt(w: WorldData, x: number, y: number): WorldZone | null {
  if (!w.zones || !w.zoneMap) return null;
  const ix = Math.max(0, Math.min(w.width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(w.height - 1, Math.floor(y)));
  return w.zones[w.zoneMap[iy * w.width + ix]!] ?? null;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The level regions, from the starting forest outwards. Centers are fractions of the map size.
 * Neighbouring regions are separated by mountain ridges; roads cut passes through them.
 */
const ZONE_DEFS: ReadonlyArray<Omit<WorldZone, 'cx' | 'cy'> & { fx: number; fy: number }> = [
  { id: 'crepusculo', name: 'Floresta do Crepúsculo', biome: 'forest', minLevel: 1, maxLevel: 6, fx: 0.5, fy: 0.62 },
  { id: 'pedravelha', name: 'Vale de Pedravelha', biome: 'meadow', minLevel: 4, maxLevel: 10, fx: 0.2, fy: 0.6 },
  { id: 'goblins', name: 'Colinas dos Goblins', biome: 'meadow', minLevel: 6, maxLevel: 12, fx: 0.78, fy: 0.84 },
  { id: 'vaelmor', name: 'Bosque de Vaelmor', biome: 'forest', minLevel: 9, maxLevel: 16, fx: 0.5, fy: 0.34 },
  { id: 'brejo', name: 'Brejo Sombrio', biome: 'swamp', minLevel: 14, maxLevel: 22, fx: 0.82, fy: 0.52 },
  { id: 'picos', name: 'Picos Gelados', biome: 'snow', minLevel: 20, maxLevel: 30, fx: 0.8, fy: 0.16 },
  { id: 'cinzas', name: 'Terras de Cinza', biome: 'ash', minLevel: 28, maxLevel: 40, fx: 0.24, fy: 0.87 },
  { id: 'juramento', name: 'Fortaleza do Juramento', biome: 'ruins', minLevel: 34, maxLevel: 45, fx: 0.18, fy: 0.18 },
];

/** Roads between regions (indices into ZONE_DEFS): every region is reachable from the start. */
const ROADS: ReadonlyArray<[number, number]> = [[0, 1], [0, 3], [0, 2], [0, 4], [3, 7], [3, 5], [4, 5], [1, 6], [1, 7], [2, 4]];

/** Creatures that roam each region (relative weights). */
const ZONE_FOES: Record<string, Array<[string, number]>> = {
  crepusculo: [['hollow', 4], ['ashwolf', 3], ['goblin', 2]],
  pedravelha: [['goblin', 3], ['ashwolf', 3], ['hollow', 2], ['skeleton', 1]],
  goblins: [['goblin', 5], ['goblin_chief', 0.6], ['ashwolf', 2], ['giantspider', 0.6]],
  vaelmor: [['skeleton', 3], ['skeleton_archer', 2], ['hollow', 2], ['vampire', 1], ['ashwolf', 2], ['bonegiant', 0.3]],
  brejo: [['hollow', 3], ['skeleton_mage', 2], ['giantspider', 2], ['cursed_grave', 0.8], ['skeleton', 2]],
  picos: [['ice_ant', 4], ['skeleton', 2], ['skeleton_archer', 2], ['ashwolf', 2]],
  cinzas: [['fire_ant', 4], ['skeleton', 2], ['bonegiant', 0.8], ['vampire', 1], ['skeleton_mage', 1]],
  juramento: [['skeleton', 3], ['skeleton_archer', 2], ['skeleton_mage', 2], ['vampire', 1.5], ['bonegiant', 1]],
};

/**
 * Seeded generation of the whole continent: eight level regions (forest, meadows, swamp, snow,
 * ash and the ruined north-west) split by ridges, linked by roads, with a village, goblin camps,
 * two castles, a graveyard, two beast lairs, four dungeons, chests and bonfires.
 * Everything is reproducible from the seed (server and clients build the same world).
 */
export function generateWorld(seed: number, size = WORLD_SIZE): WorldData {
  const W = size;
  const H = size;
  const S = size / 672; // distances below are tuned for the full-size map
  const rng = new Rng(seed);
  const tiles = new Uint8Array(W * H).fill(Tile.Grass);
  const zoneMap = new Uint8Array(W * H);
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t;
  };
  const get = (x: number, y: number): Tile => (x >= 0 && y >= 0 && x < W && y < H ? (tiles[y * W + x] as Tile) : Tile.Rock);
  const props: Prop[] = [];
  let pid = 1;
  const addProp = (p: Omit<Prop, 'id'>) => props.push({ id: pid++, ...p });

  // ---------------------------------------------------------------- 1) regions
  const zones: WorldZone[] = ZONE_DEFS.map((z, i) => ({
    id: z.id, name: z.name, biome: z.biome, minLevel: z.minLevel, maxLevel: z.maxLevel,
    cx: Math.round(z.fx * W + (i === 0 ? 0 : rng.range(-0.02, 0.02) * W)) + 0.5,
    cy: Math.round(z.fy * H + (i === 0 ? 0 : rng.range(-0.02, 0.02) * H)) + 0.5,
  }));
  const ridge = new Float32Array(W * H); // margin to the next region (small = border)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = x + (fbm2(x * 0.011, y * 0.011, seed + 301, 3) - 0.5) * 80 * S;
      const wy = y + (fbm2(x * 0.011, y * 0.011, seed + 307, 3) - 0.5) * 80 * S;
      let d1 = Infinity;
      let d2 = Infinity;
      let best = 0;
      for (let i = 0; i < zones.length; i++) {
        const d = Math.hypot(wx - zones[i]!.cx, wy - zones[i]!.cy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = i;
        } else if (d < d2) d2 = d;
      }
      zoneMap[y * W + x] = best;
      ridge[y * W + x] = d2 - d1;
    }
  }
  const zoneIdx = (x: number, y: number) => zoneMap[Math.max(0, Math.min(H - 1, Math.floor(y))) * W + Math.max(0, Math.min(W - 1, Math.floor(x)))]!;
  const zoneOf = (x: number, y: number) => zones[zoneIdx(x, y)]!;

  // ---------------------------------------------------------------- 2) ground per biome
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const b = zones[zoneMap[y * W + x]!]!.biome;
      const n1 = fbm2(x * 0.09, y * 0.09, seed + 5, 3);
      const n2 = fbm2(x * 0.05, y * 0.05, seed + 17, 3);
      let t: Tile = Tile.Grass;
      switch (b) {
        case 'forest':
          t = n2 > 0.76 ? Tile.Dirt : n1 > 0.6 ? Tile.TallGrass : Tile.Grass;
          break;
        case 'meadow':
          t = n2 > 0.8 ? Tile.Dirt : n1 > 0.66 ? Tile.TallGrass : Tile.Grass;
          break;
        case 'swamp': {
          const pool = fbm2(x * 0.06, y * 0.06, seed + 23, 3);
          t = pool > 0.66 ? Tile.ShallowWater : n1 > 0.58 ? Tile.TallGrass : n2 > 0.55 ? Tile.Mud : Tile.Grass;
          break;
        }
        case 'snow':
          t = n2 > 0.74 ? Tile.Ice : Tile.Snow;
          break;
        case 'ash': {
          const fis = fbm2(x * 0.07, y * 0.07, seed + 29, 3);
          t = fis > 0.71 ? Tile.Lava : n2 > 0.7 ? Tile.Dirt : Tile.Ash;
          break;
        }
        case 'ruins':
          t = n2 > 0.74 ? Tile.RuinFloor : n1 > 0.62 ? Tile.TallGrass : n2 < 0.3 ? Tile.Dirt : Tile.Grass;
          break;
      }
      tiles[y * W + x] = t;
    }
  }

  // ---------------------------------------------------------------- 3) ridges and outcrops
  const outcrop: Record<Biome, number> = { forest: 0.72, meadow: 0.76, swamp: 0.78, snow: 0.66, ash: 0.68, ruins: 0.72 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const z = zones[zoneMap[i]!]!;
      const width = (5 + fbm2(x * 0.04, y * 0.04, seed + 313, 2) * 8) * S;
      if (ridge[i]! < width) {
        tiles[i] = Tile.Rock;
        continue;
      }
      if (Math.hypot(x - z.cx, y - z.cy) < 26 * S) continue;
      if (fbm2(x * 0.07, y * 0.07, seed + 29, 4) > outcrop[z.biome]) tiles[i] = Tile.Rock;
    }
  }

  // ---------------------------------------------------------------- 4) the starting forest: lake, river, ruins
  const start = zones[0]!;
  const spawn = { x: start.cx, y: start.cy };
  const lake = { x: spawn.x + 24 + rng.range(-3, 3), y: spawn.y + rng.range(-4, 6) };
  const ruins = { x: spawn.x - 27 + rng.range(-3, 3), y: spawn.y - 20 + rng.range(-3, 3) };
  const lakeR = 10;
  const pond = (cx: number, cy: number, R: number, frozen: boolean) => {
    for (let y = Math.floor(cy - R - 8); y <= cy + R + 8; y++) {
      for (let x = Math.floor(cx - R - 8); x <= cx + R + 8; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const a = Math.atan2(dy, dx);
        const r = R + (valueNoise2(Math.cos(a) * 2 + 10, Math.sin(a) * 2 + 10, seed + 41 + Math.floor(cx)) - 0.5) * 7;
        const d = Math.hypot(dx, dy);
        if (d < r - 3) set(x, y, frozen ? Tile.Ice : Tile.DeepWater);
        else if (d < r) set(x, y, frozen ? Tile.Ice : Tile.ShallowWater);
        else if (d < r + 1.3 && get(x, y) !== Tile.Rock) set(x, y, frozen ? Tile.Snow : Tile.Sand);
      }
    }
  };
  // the start area never has rock walls closing it in
  for (let y = Math.floor(spawn.y - 30); y < spawn.y + 30; y++) for (let x = Math.floor(spawn.x - 40); x < spawn.x + 40; x++) if (get(x, y) === Tile.Rock && Math.hypot(x - spawn.x, y - spawn.y) < 38) set(x, y, Tile.Grass);
  pond(lake.x, lake.y, lakeR, false);
  // river: meanders north from the lake for a while
  {
    let x = lake.x + rng.range(-2, 2);
    let y = lake.y - lakeR + 1;
    let step = 0;
    const end = lake.y - 150 * S;
    while (y > end && y > 3) {
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
  const ruinW = 12;
  const ruinH = 9;
  const ruinX0 = Math.round(ruins.x - ruinW / 2);
  const ruinY0 = Math.round(ruins.y - ruinH / 2);
  for (let y = ruinY0 - 2; y < ruinY0 + ruinH + 2; y++) for (let x = ruinX0 - 2; x < ruinX0 + ruinW + 2; x++) set(x, y, Tile.Grass);
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
  for (const [ox, oy] of [[3, 3], [ruinW - 4, 3], [3, ruinH - 4], [ruinW - 4, ruinH - 4]] as Array<[number, number]>) {
    if (rng.chance(0.8)) addProp({ kind: 'pillar', x: ruinX0 + ox + 0.5, y: ruinY0 + oy + 0.5, r: 0.4, size: 0.8, solid: true, v: rng.next() });
  }
  // the frozen lake of the peaks
  const picos = zones[5]!;
  pond(picos.cx - 34 * S, picos.cy + 26 * S, 13, true);

  // ---------------------------------------------------------------- 5) border, dungeons (sealed rock, reached by portals)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) set(x, y, Tile.Rock);
  const bctx: BuildCtx = { W, H, rng, set, get, addProp };
  const reserved: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  const dungeonRect = (fx0: number, fy0: number, w: number, h: number) => {
    const x0 = Math.max(4, Math.round(fx0 * W));
    const y0 = Math.max(4, Math.round(fy0 * H));
    const r = { x0, y0, x1: Math.min(W - 5, x0 + Math.round(w * S)), y1: Math.min(H - 5, y0 + Math.round(h * S)) };
    reserved.push({ x0: r.x0 - 2, y0: r.y0 - 2, x1: r.x1 + 2, y1: r.y1 + 2 });
    return r;
  };
  const cryptR = dungeonRect(0.008, 0.4, 74, 52);
  const iceR = dungeonRect(0.875, 0.008, 74, 52);
  const necroR = dungeonRect(0.875, 0.42, 74, 52);
  const forgeR = dungeonRect(0.008, 0.9, 74, 52);
  const inReserved = (x: number, y: number) => reserved.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  const crypt = buildDungeon(bctx, cryptR.x0, cryptR.y0, cryptR.x1, cryptR.y1, 'crypt', 'Cripta Afundada', 'crypt');
  const iceCave = buildDungeon(bctx, iceR.x0, iceR.y0, iceR.x1, iceR.y1, 'icecave', 'Caverna de Gelo', 'ice');
  const necro = buildDungeon(bctx, necroR.x0, necroR.y0, necroR.x1, necroR.y1, 'necropolis', 'Necrópole Submersa', 'necro');
  const forge = buildDungeon(bctx, forgeR.x0, forgeR.y0, forgeR.x1, forgeR.y1, 'forge', 'Forja Afundada', 'ash');

  // ---------------------------------------------------------------- 6) roads (passes through the ridges)
  const ROAD_SKIP = new Set<Tile>([Tile.DeepWater, Tile.ShallowWater, Tile.CastleFloor, Tile.DungeonFloor, Tile.Cobble, Tile.Ice]);
  const carvePath = (from: Vec2, to: Vec2, salt: number, width = 1) => {
    const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const wob = (valueNoise2(t * 6, salt, seed + salt) - 0.5) * Math.min(18, 6 + n * 0.02) * Math.sin(t * Math.PI);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const l = Math.hypot(dx, dy) || 1;
      const px = from.x + dx * t + (-dy / l) * wob;
      const py = from.y + dy * t + (dx / l) * wob;
      for (let oy = -width; oy <= width; oy++) {
        for (let ox = -width; ox <= width; ox++) {
          const tx = Math.floor(px + ox * 0.45);
          const ty = Math.floor(py + oy * 0.45);
          if (tx < 3 || ty < 3 || tx >= W - 3 || ty >= H - 3 || inReserved(tx, ty)) continue;
          const cur = get(tx, ty);
          if (ROAD_SKIP.has(cur)) continue;
          set(tx, ty, cur === Tile.Lava ? Tile.Ash : cur === Tile.Snow && (tx + ty) % 3 !== 0 ? Tile.Snow : Tile.Dirt);
        }
      }
    }
  };
  ROADS.forEach(([a, b], k) => carvePath({ x: zones[a]!.cx, y: zones[a]!.cy }, { x: zones[b]!.cx, y: zones[b]!.cy }, 401 + k * 7, 2));
  carvePath(spawn, { x: ruinX0 + ruinW, y: ruins.y }, 71);
  carvePath(spawn, { x: lake.x - lakeR - 1, y: lake.y }, 73);

  // ---------------------------------------------------------------- 7) settlements, castles, lairs
  const sites: Array<{ x: number; y: number; r: number }> = [{ x: spawn.x, y: spawn.y, r: 9 }, { x: ruins.x, y: ruins.y, r: 9 }];
  const siteSpawns: EnemySpawn[] = [];
  const pois: Poi[] = [
    { id: 'camp', name: 'Acampamento do Crepúsculo', x: spawn.x, y: spawn.y, r: 6, xp: 0 },
    { id: 'ruins', name: 'Ruínas do Juramento', x: ruins.x, y: ruins.y, r: 7, xp: 60 },
    { id: 'lake', name: 'Lago Espelhado', x: lake.x, y: lake.y, r: lakeR + 4, xp: 40 },
  ];
  const regions: Region[] = [];
  const portals: Portal[] = [];
  const site = (info: SiteInfo, r: number, salt: number, roadFrom?: Vec2) => {
    sites.push({ x: info.poi.x, y: info.poi.y, r });
    siteSpawns.push(...info.spawns);
    pois.push(info.poi);
    const z = zoneOf(info.poi.x, info.poi.y);
    carvePath(roadFrom ?? { x: z.cx, y: z.cy }, info.door, salt);
  };
  // castles
  const vaelmor = zones[3]!;
  const castle = buildCastle(bctx, vaelmor.cx - 10, vaelmor.cy - 12, 'castle', 'Castelo de Vaelmor');
  carvePath({ x: vaelmor.cx, y: vaelmor.cy + 30 }, castle.gate, 83, 2);
  sites.push({ x: castle.cx, y: castle.cy, r: 26 });
  siteSpawns.push(...castle.spawns);
  pois.push(castle.poi);
  regions.push(castle.region);
  portals.push(...makePortals(castle.crypt, crypt, 'crypt', 'Descer à Cripta', 'Subir ao Castelo'));
  const jur = zones[7]!;
  const fortress = buildCastle(bctx, jur.cx, jur.cy - 6, 'fortress', 'Fortaleza do Juramento');
  carvePath({ x: jur.cx, y: jur.cy + 34 }, fortress.gate, 89, 2);
  sites.push({ x: fortress.cx, y: fortress.cy, r: 26 });
  const upgrade: Record<string, string> = { hollow: 'skeleton', ashwolf: 'goblin_chief' };
  siteSpawns.push(...fortress.spawns.map((sp) => ({ ...sp, enemyId: upgrade[sp.enemyId] ?? sp.enemyId })), { x: fortress.cx, y: fortress.cy + 3, enemyId: 'bonegiant' });
  pois.push(fortress.poi);
  regions.push(fortress.region);
  portals.push(...makePortals(fortress.crypt, forge, 'forge', 'Descer à Forja', 'Subir à Fortaleza'));
  // village, goblin camps, graveyard, lairs
  const ped = zones[1]!;
  site(buildVillage(bctx, ped.cx, ped.cy, 'pedravelha', 'Vila de Pedravelha'), 24, 503, { x: ped.cx, y: ped.cy + 30 });
  const gob = zones[2]!;
  site(buildGoblinCamp(bctx, gob.cx - 22 * S, gob.cy - 8 * S, 'goblincamp1', 'Acampamento Goblin'), 14, 509);
  site(buildGoblinCamp(bctx, gob.cx + 26 * S, gob.cy + 14 * S, 'goblincamp2', 'Toca do Rei Goblin'), 14, 511);
  const bre = zones[4]!;
  const grave = buildGraveyard(bctx, bre.cx, bre.cy - 10 * S, 'graveyard', 'Cemitério Amaldiçoado');
  site(grave, 16, 517);
  portals.push(...makePortals(grave.entrance!, necro, 'necropolis', 'Descer à Necrópole', 'Subir ao Cemitério'));
  site(buildLair(bctx, picos.cx + 8 * S, picos.cy - 6 * S, 'wyvernlair', 'Ninho da Serpe', 'wyvern'), 18, 521);
  // the ice cave mouth, east of the lair
  const caveMouth = { x: picos.cx + 46 * S, y: picos.cy + 20 * S };
  for (let y = Math.floor(caveMouth.y - 4); y <= caveMouth.y + 4; y++) for (let x = Math.floor(caveMouth.x - 4); x <= caveMouth.x + 4; x++) set(x, y, Tile.Snow);
  carvePath({ x: picos.cx, y: picos.cy }, caveMouth, 523);
  portals.push(...makePortals(caveMouth, iceCave, 'icecave', 'Entrar na Caverna de Gelo', 'Sair da Caverna'));
  pois.push({ id: 'icecave-mouth', name: 'Boca da Caverna de Gelo', x: caveMouth.x, y: caveMouth.y, r: 5, xp: 120 });
  sites.push({ x: caveMouth.x, y: caveMouth.y, r: 6 });
  const cin = zones[6]!;
  site(buildLair(bctx, cin.cx + 4 * S, cin.cy - 4 * S, 'dragonlair', 'Covil do Dragão das Cinzas', 'dragon'), 18, 527);
  regions.push(crypt.region, iceCave.region, necro.region, forge.region);
  pois.push(crypt.poi, iceCave.poi, necro.poi, forge.poi);
  for (const d of [crypt, iceCave, necro, forge]) siteSpawns.push(...d.spawns);
  // region discovery (XP grows with the region level)
  for (const z of zones.slice(1)) pois.push({ id: `zone-${z.id}`, name: z.name, x: z.cx, y: z.cy, r: 24 * S, xp: 30 + z.minLevel * 6 });
  // let sites breathe: no rock inside their footprint
  for (const st of sites) {
    for (let y = Math.floor(st.y - st.r); y <= st.y + st.r; y++) {
      for (let x = Math.floor(st.x - st.r); x <= st.x + st.r; x++) {
        if (get(x, y) !== Tile.Rock || Math.hypot(x - st.x, y - st.y) >= st.r * 0.8 || inReserved(x, y) || x <= 2 || y <= 2 || x >= W - 3 || y >= H - 3) continue;
        const b = zoneOf(x, y).biome;
        set(x, y, b === 'snow' ? Tile.Snow : b === 'ash' ? Tile.Ash : Tile.Grass);
      }
    }
  }

  // spawn clearing
  for (let y = Math.floor(spawn.y - 6); y <= spawn.y + 6; y++) {
    for (let x = Math.floor(spawn.x - 6); x <= spawn.x + 6; x++) {
      if (Math.hypot(x + 0.5 - spawn.x, y + 0.5 - spawn.y) < 6 && !isWalkable(get(x, y))) set(x, y, Tile.Grass);
    }
  }
  // bonfires: camp, ruins, every region, and rest stops halfway along the roads
  addProp({ kind: 'bonfire', x: spawn.x, y: spawn.y - 2.2, r: 0.45, size: 0.6, solid: true, v: 0.5 });
  addProp({ kind: 'bonfire', x: ruins.x, y: ruins.y, r: 0.45, size: 0.6, solid: true, v: 0.25 });
  const fireSpot = (x: number, y: number) => {
    for (let k = 0; k < 60; k++) {
      const a = k * 2.4;
      const r = k * 0.6;
      const fx = Math.floor(x + Math.cos(a) * r) + 0.5;
      const fy = Math.floor(y + Math.sin(a) * r) + 0.5;
      let ok = true;
      for (let oy = -2; oy <= 2 && ok; oy++) {
        for (let ox = -2; ox <= 2 && ok; ox++) {
          const t = get(Math.floor(fx) + ox, Math.floor(fy) + oy);
          if (!isWalkable(t) || t === Tile.ShallowWater) ok = false;
        }
      }
      if (ok && !props.some((p) => p.solid && Math.hypot(p.x - fx, p.y - fy) < p.r + 2.5)) {
        addProp({ kind: 'bonfire', x: fx, y: fy, r: 0.45, size: 0.6, solid: true, v: rng.next() });
        sites.push({ x: fx, y: fy, r: 4 });
        return;
      }
    }
  };
  for (const z of zones.slice(1)) if (z.id !== 'pedravelha') fireSpot(z.cx + 6, z.cy + 8);
  for (const [a, b] of ROADS) fireSpot((zones[a]!.cx + zones[b]!.cx) / 2, (zones[a]!.cy + zones[b]!.cy) / 2);

  // ---------------------------------------------------------------- 8) vegetation by biome
  const nearSite = (x: number, y: number, pad = 0) => sites.some((st) => Math.abs(st.x - x) < st.r + pad && Math.hypot(st.x - x, st.y - y) < st.r + pad);
  const inStructure = (x: number, y: number) => regions.some((r) => x > r.x0 - 4 && x < r.x1 + 4 && y > r.y0 - 4 && y < r.y1 + 4);
  const GROUND = new Set<Tile>([Tile.Grass, Tile.TallGrass, Tile.Snow, Tile.Mud, Tile.Ash]);
  const KEEP_CLEAR = new Set<Tile>([Tile.Dirt, Tile.ShallowWater, Tile.DeepWater, Tile.Sand, Tile.CastleFloor, Tile.DungeonFloor, Tile.Cobble, Tile.Lava, Tile.Ice]);
  const blocked = (x: number, y: number): boolean => {
    if (!GROUND.has(get(Math.floor(x), Math.floor(y)))) return true;
    if (Math.hypot(x - spawn.x, y - spawn.y) < 8 || nearSite(x, y, 2) || inStructure(x, y) || inReserved(x, y)) return true;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (KEEP_CLEAR.has(get(Math.floor(x) + ox, Math.floor(y) + oy))) return true;
    return false;
  };
  const treeP: Record<Biome, number> = { forest: 0.82, meadow: 0.28, swamp: 0.3, snow: 0.55, ash: 0.12, ruins: 0.5 };
  const cell = 1.9;
  for (let gy = 2; gy < H - 2; gy += cell) {
    for (let gx = 2; gx < W - 2; gx += cell) {
      const x = gx + rng.range(0.2, cell - 0.2);
      const y = gy + rng.range(0.2, cell - 0.2);
      const roll = rng.next();
      const kindRoll = rng.next();
      const v = rng.next();
      if (blocked(x, y)) continue;
      const biome = zoneOf(x, y).biome;
      const density = fbm2(x * 0.045, y * 0.045, seed + 11, 4);
      const p = smoothstep(0.36, 0.62, density) * treeP[biome] + 0.04;
      if (roll > p) {
        if (roll > 0.985) addProp({ kind: 'rock', x, y, r: 0.45 + v * 0.35, size: 0.6 + v * 0.5, solid: true, v });
        else if (roll < p + (biome === 'ash' || biome === 'snow' ? 0.02 : 0.06)) addProp({ kind: 'bush', x, y, r: 0, size: 0.6 + v * 0.4, solid: false, v });
        continue;
      }
      if (biome === 'swamp' || biome === 'ash' || (biome === 'ruins' && kindRoll < 0.3)) {
        addProp({ kind: 'deadtree', x, y, r: 0.28, size: 0.9 + v * 0.8, solid: true, v });
        continue;
      }
      const pine = biome === 'snow' || fbm2(x * 0.03, y * 0.03, seed + 97, 2) + (kindRoll - 0.5) * 0.25 > 0.55;
      addProp({ kind: pine ? 'pine' : 'tree', x, y, r: 0.32, size: 1.1 + v * 0.9, solid: true, v });
    }
  }

  // ---------------------------------------------------------------- 9) reachability, chests, creatures
  const reach = new Uint8Array(W * H);
  {
    const q: number[] = [];
    const push = (x: number, y: number) => {
      const i = Math.floor(y) * W + Math.floor(x);
      if (!reach[i] && isWalkable(tiles[i] as Tile)) {
        reach[i] = 1;
        q.push(i);
      }
    };
    push(spawn.x, spawn.y);
    const usedPortals = new Set<string>();
    while (q.length) {
      const i = q.pop()!;
      const x = i % W;
      const y = (i / W) | 0;
      for (const pt of portals) {
        if (usedPortals.has(pt.id) || Math.abs(x + 0.5 - pt.x) > pt.r || Math.hypot(x + 0.5 - pt.x, y + 0.5 - pt.y) > pt.r) continue;
        usedPortals.add(pt.id);
        push(pt.toX, pt.toY);
      }
      if (x + 1 < W) push(x + 1, y);
      if (x > 0) push(x - 1, y);
      if (y + 1 < H) push(x, y + 1);
      if (y > 0) push(x, y - 1);
    }
  }
  const reachable = (x: number, y: number) => reach[Math.floor(y) * W + Math.floor(x)] === 1;
  // solid props bucketed on a coarse grid (the props list is large)
  const bucket = new Map<number, Prop[]>();
  const bkey = (x: number, y: number) => Math.floor(y / 8) * 1024 + Math.floor(x / 8);
  for (const p of props) if (p.solid) (bucket.get(bkey(p.x, p.y)) ?? bucket.set(bkey(p.x, p.y), []).get(bkey(p.x, p.y))!).push(p);
  const solidWithin = (x: number, y: number, pad: number) => {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const p of bucket.get(bkey(x + ox * 8, y + oy * 8)) ?? []) if (Math.hypot(p.x - x, p.y - y) < p.r + pad) return true;
    return false;
  };
  const levelIn = (z: WorldZone) => z.minLevel + Math.floor(rng.next() * (z.maxLevel - z.minLevel + 1));
  // chests scattered through every region; tier and item level follow the region
  {
    const chests: Vec2[] = props.filter((p) => p.kind === 'chest');
    for (const p of props) if (p.kind === 'chest') p.lvl = zoneOf(p.x, p.y).maxLevel;
    let tries = 0;
    const want = Math.round(70 * S * S) + 2;
    let made = 0;
    while (made < want && tries++ < 12000) {
      const x = Math.floor(rng.range(6, W - 6)) + 0.5;
      const y = Math.floor(rng.range(6, H - 6)) + 0.5;
      const t = get(Math.floor(x), Math.floor(y));
      if (!reachable(x, y) || t === Tile.ShallowWater || t === Tile.Ice) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 10 || nearSite(x, y, 1) || inStructure(x, y)) continue;
      if (chests.some((c) => Math.hypot(c.x - x, c.y - y) < 22 * S) || solidWithin(x, y, 1.4)) continue;
      const z = zoneOf(x, y);
      const tier = z.minLevel >= 25 ? (rng.next() < 0.35 ? 2 : 1) : z.minLevel >= 9 ? (rng.next() < 0.12 ? 2 : 1) : rng.next() < 0.15 ? 1 : 0;
      chests.push({ x, y });
      addProp({ kind: 'chest', x, y, r: 0.45, size: tier, solid: true, v: rng.next(), lvl: levelIn(z) });
      made++;
    }
  }
  const enemySpawns: EnemySpawn[] = [];
  const dungeonLevel: Array<[Region, WorldZone]> = [[crypt.region, vaelmor], [iceCave.region, picos], [necro.region, bre], [forge.region, cin]];
  for (const sp of siteSpawns) {
    if (!reachable(sp.x, sp.y)) continue;
    let z = zoneOf(sp.x, sp.y);
    // dungeons sit in a corner of the map: their creatures follow the region their portal opens from
    for (const [r, dz] of dungeonLevel) if (sp.x >= r.x0 && sp.x < r.x1 && sp.y >= r.y0 && sp.y < r.y1) z = dz;
    enemySpawns.push({ ...sp, level: Math.max(z.minLevel, z.maxLevel - 2 + Math.floor(rng.next() * 4)) });
  }
  const fixed = enemySpawns.length;
  {
    const perZone = new Array<number>(zones.length).fill(0);
    for (let i = 0; i < W * H; i++) if (reach[i]) perZone[zoneMap[i]!]!++;
    const quota = perZone.map((n) => Math.round(n / (1500 * S * S + 300 * (1 - S))));
    const placed = new Array<number>(zones.length).fill(0);
    const total = quota.reduce((a, b) => a + b, 0);
    const grid = new Map<number, EnemySpawn[]>();
    const near = (x: number, y: number) => {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const e of grid.get(bkey(x + ox * 8, y + oy * 8)) ?? []) if (Math.hypot(e.x - x, e.y - y) < 7) return true;
      return false;
    };
    let attempts = 0;
    while (enemySpawns.length < fixed + total && attempts++ < 80000) {
      const x = rng.range(4, W - 4);
      const y = rng.range(4, H - 4);
      const zi = zoneIdx(x, y);
      if (placed[zi]! >= quota[zi]!) continue;
      const t = get(Math.floor(x), Math.floor(y));
      if (!reachable(x, y) || t === Tile.ShallowWater || t === Tile.Ice) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 16 || nearSite(x, y, 6) || inStructure(x, y) || near(x, y) || solidWithin(x, y, 0.9)) continue;
      const z = zones[zi]!;
      const table = ZONE_FOES[z.id] ?? [['hollow', 1]];
      const sum = table.reduce((a, [, w]) => a + w, 0);
      let r = rng.next() * sum;
      let enemyId = table[0]![0];
      for (const [id, w] of table) {
        r -= w;
        if (r < 0) {
          enemyId = id;
          break;
        }
      }
      const sp = { x, y, enemyId, level: levelIn(z) };
      enemySpawns.push(sp);
      (grid.get(bkey(x, y)) ?? grid.set(bkey(x, y), []).get(bkey(x, y))!).push(sp);
      placed[zi]!++;
    }
  }

  // ---------------------------------------------------------------- 10) living world (0.13): herds, villagers, cult rituals
  // placed after everything else so the earlier layout (and its random stream) stays as it was
  const rituals: RitualSite[] = [];
  {
    const life = new Rng(seed ^ 0x13a1fe);
    const clear = (x: number, y: number, pad: number) => {
      const t = get(Math.floor(x), Math.floor(y));
      return reachable(x, y) && t !== Tile.ShallowWater && t !== Tile.Ice && t !== Tile.Lava && !solidWithin(x, y, pad) && !inStructure(x, y);
    };
    // herds: deer and rabbits in the green regions, boars in forest and swamp, hares in the snow
    const HERDS: Partial<Record<Biome, Array<[string, number, number]>>> = {
      forest: [['deer', 3, 5], ['rabbit', 2, 3], ['boar', 1, 3]],
      meadow: [['deer', 3, 6], ['rabbit', 2, 4], ['boar', 1, 2]],
      ruins: [['rabbit', 2, 3], ['deer', 2, 4]],
      swamp: [['boar', 2, 3], ['rabbit', 1, 2]],
      snow: [['rabbit', 2, 3], ['deer', 2, 3]],
    };
    for (const z of zones) {
      const table = HERDS[z.biome];
      if (!table) continue;
      const want = Math.round(9 * S * S) + 1;
      let made = 0;
      for (let tries = 0; made < want && tries < 4000; tries++) {
        const x = life.range(8, W - 8);
        const y = life.range(8, H - 8);
        if (zoneOf(x, y) !== z || !clear(x, y, 1) || nearSite(x, y, 4) || Math.hypot(x - spawn.x, y - spawn.y) < 14) continue;
        const [enemyId, lo, hi] = table[made % table.length]!;
        const n = lo + Math.floor(life.next() * (hi - lo + 1));
        const anchor = { x, y };
        for (let k = 0; k < n; k++) {
          const a = life.range(0, Math.PI * 2);
          const r = life.range(0.6, 2.8);
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (!clear(px, py, 0.5)) continue;
          enemySpawns.push({ x: px, y: py, enemyId, level: Math.min(z.maxLevel, z.minLevel + Math.floor(life.next() * 3)), anchor });
        }
        made++;
      }
    }
    // villagers walking the streets of Pedravelha
    const village = pois.find((p) => p.id === 'pedravelha');
    if (village) {
      const anchor = { x: village.x, y: village.y };
      for (let k = 0, placed = 0; placed < 8 && k < 80; k++) {
        const a = life.range(0, Math.PI * 2);
        const r = life.range(2, 9);
        const x = village.x + Math.cos(a) * r;
        const y = village.y + Math.sin(a) * r;
        if (!reachable(x, y) || solidWithin(x, y, 0.6)) continue;
        enemySpawns.push({ x, y, enemyId: 'villager', level: 5, anchor });
        placed++;
      }
    }
    // bonfires are sanctuaries: no monster sleeps near one (wildlife and townsfolk may)
    const fireProps = props.filter((p) => p.kind === 'bonfire');
    const tame = new Set(['deer', 'rabbit', 'boar', 'villager']);
    for (let i = enemySpawns.length - 1; i >= 0; i--) {
      const sp = enemySpawns[i]!;
      if (!tame.has(sp.enemyId) && fireProps.some((f) => Math.hypot(f.x - sp.x, f.y - sp.y) < SAFE_RADIUS + 2)) enemySpawns.splice(i, 1);
    }
    // a fire out in the wild gets a shelter (a tent on the free side of the logs) and a few animals grazing near it
    const settled = pois.filter((p) => !p.id.startsWith('zone-') && p.id !== 'lake');
    for (const f of fireProps) {
      if (inStructure(f.x, f.y) || settled.some((p) => Math.hypot(p.x - f.x, p.y - f.y) < p.r + 6)) continue;
      const tx = f.x + Math.cos(5.4) * 2.9;
      const ty = f.y + Math.sin(5.4) * 2.9;
      if (reachable(tx, ty) && !solidWithin(tx, ty, 0.6)) addProp({ kind: 'tent', x: tx, y: ty, r: 0.6, size: 1, solid: true, v: life.next() });
      const z = zoneOf(f.x, f.y);
      const kind = z.biome === 'ash' ? null : z.biome === 'swamp' ? 'boar' : z.biome === 'snow' ? 'rabbit' : life.chance(0.5) ? 'deer' : 'rabbit';
      if (!kind) continue;
      const anchor = { x: f.x + 4.5, y: f.y + 3 };
      for (let k = 0; k < (kind === 'boar' ? 1 : 2); k++) {
        const x = anchor.x + life.range(-1.5, 1.5);
        const y = anchor.y + life.range(-1, 1.5);
        if (clear(x, y, 0.5)) enemySpawns.push({ x, y, enemyId: kind, level: z.minLevel, anchor });
      }
    }
    // summoning circles: the leader at the head of the sigil, three acolytes around it
    const fires = props.filter((p) => p.kind === 'bonfire');
    for (const zid of ['vaelmor', 'brejo', 'cinzas', 'juramento']) {
      const z = zones.find((q) => q.id === zid);
      if (!z) continue;
      for (let tries = 0; tries < 6000; tries++) {
        const x = Math.floor(life.range(10, W - 10)) + 0.5;
        const y = Math.floor(life.range(10, H - 10)) + 0.5;
        if (zoneOf(x, y) !== z || !clear(x, y, 4.5) || nearSite(x, y, 10)) continue;
        if (Math.hypot(x - z.cx, y - z.cy) > 70 * S || fires.some((f) => Math.hypot(f.x - x, f.y - y) < 18)) continue;
        let ok = true;
        for (let oy = -4; oy <= 4 && ok; oy++) for (let ox = -4; ox <= 4 && ok; ox++) if (!clear(x + ox, y + oy, 0)) ok = false;
        if (!ok) continue;
        // the circle wipes the undergrowth inside it
        for (let i = props.length - 1; i >= 0; i--) {
          const p = props[i]!;
          if (!p.solid && Math.hypot(p.x - x, p.y - y) < 4.2) props.splice(i, 1);
        }
        addProp({ kind: 'ritual', x, y, r: 0, size: 3.2, solid: false, v: life.next() });
        const level = z.maxLevel - 1;
        const anchor = { x, y };
        rituals.push({ id: `ritual-${zid}`, x, y, level });
        enemySpawns.push({ x, y: y - 3.4, enemyId: 'cult_leader', level, anchor });
        for (let k = 0; k < 3; k++) {
          const a = Math.PI / 2 + (k - 1) * 1.9;
          enemySpawns.push({ x: x + Math.cos(a) * 3.3, y: y + Math.sin(a) * 3.3, enemyId: 'cultist', level: level - 1, anchor });
        }
        pois.push({ id: `ritual-${zid}`, name: 'Círculo de Invocação', x, y, r: 7, xp: 80 + z.minLevel * 5 });
        break;
      }
    }
  }

  return { seed, width: W, height: H, tiles, props, spawn, enemySpawns, pois, portals, regions, zones, zoneMap, rituals };
}
