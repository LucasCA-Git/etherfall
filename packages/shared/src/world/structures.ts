import type { Rng } from '../math/rng';
import { Tile } from './tiles';
import type { EnemySpawn, Poi, Portal, Prop, Region } from './worldgen';

/** What the structure builders may touch while the world is being generated. */
export interface BuildCtx {
  W: number;
  H: number;
  rng: Rng;
  set(x: number, y: number, t: Tile): void;
  get(x: number, y: number): Tile;
  addProp(p: Omit<Prop, 'id'>): void;
}

export interface CastleInfo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  /** Just outside the south gate (path target). */
  gate: { x: number; y: number };
  /** Crypt entrance inside the keep. */
  crypt: { x: number; y: number };
  spawns: EnemySpawn[];
  region: Region;
  poi: Poi;
}

interface Room {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
}

export interface DungeonInfo {
  start: { x: number; y: number };
  exit: { x: number; y: number };
  spawns: EnemySpawn[];
  region: Region;
  poi: Poi;
}

const torch = (c: BuildCtx, x: number, y: number) => c.addProp({ kind: 'torch', x, y, r: 0.15, size: 0.5, solid: false, v: c.rng.next() });

/**
 * Castelo de Vaelmor: curtain wall with four towers, a south gate flanked by torches,
 * a courtyard (bonfire, pillars) and an inner keep that hides the crypt entrance.
 */
export function buildCastle(c: BuildCtx, cx: number, cy: number, id = 'castle', name = 'Castelo de Vaelmor'): CastleInfo {
  const hw = 18;
  const hh = 14;
  const x0 = Math.round(cx - hw);
  const x1 = Math.round(cx + hw);
  const y0 = Math.round(cy - hh);
  const y1 = Math.round(cy + hh);
  cx = (x0 + x1 + 1) / 2;
  cy = (y0 + y1 + 1) / 2;

  // Clear a margin of plain ground around the walls, then lay the stone floor.
  for (let y = y0 - 3; y <= y1 + 3; y++) for (let x = x0 - 3; x <= x1 + 3; x++) c.set(x, y, Tile.Grass);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.set(x, y, Tile.CastleFloor);

  const towers: Array<[number, number]> = [[x0 + 0.5, y0 + 0.5], [x1 + 0.5, y0 + 0.5], [x0 + 0.5, y1 + 0.5], [x1 + 0.5, y1 + 0.5]];
  const nearTower = (x: number, y: number) => towers.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 1.6);
  const wall = (x: number, y: number) => {
    if (!nearTower(x + 0.5, y + 0.5)) c.addProp({ kind: 'castleWall', x: x + 0.5, y: y + 0.5, r: 0.55, size: 1, solid: true, v: c.rng.next() });
  };
  for (let x = x0; x <= x1; x++) {
    wall(x, y0);
    if (Math.abs(x + 0.5 - cx) >= 2) wall(x, y1); // south gate
  }
  for (let y = y0 + 1; y < y1; y++) {
    wall(x0, y);
    wall(x1, y);
  }
  for (const [tx, ty] of towers) c.addProp({ kind: 'tower', x: tx, y: ty, r: 1.5, size: 2.2, solid: true, v: c.rng.next() });

  // Gate torches (outside and inside) and torches along the inner walls.
  torch(c, cx - 2.6, y1 + 1.4);
  torch(c, cx + 2.6, y1 + 1.4);
  torch(c, cx - 2.6, y1 - 0.8);
  torch(c, cx + 2.6, y1 - 0.8);
  for (let x = x0 + 5; x < x1 - 3; x += 7) torch(c, x + 0.5, y0 + 1.5);
  for (let y = y0 + 6; y < y1 - 3; y += 7) {
    torch(c, x0 + 1.5, y + 0.5);
    torch(c, x1 - 0.5, y + 0.5);
  }

  // Inner keep (north half) with a door facing the gate.
  const kx0 = Math.round(cx - 7.5);
  const kx1 = Math.round(cx + 6.5);
  const ky0 = y0 + 3;
  const ky1 = y0 + 12;
  for (let x = kx0; x <= kx1; x++) {
    c.addProp({ kind: 'castleWall', x: x + 0.5, y: ky0 + 0.5, r: 0.55, size: 1, solid: true, v: c.rng.next() });
    if (Math.abs(x + 0.5 - cx) >= 1.6) c.addProp({ kind: 'castleWall', x: x + 0.5, y: ky1 + 0.5, r: 0.55, size: 1, solid: true, v: c.rng.next() });
  }
  for (let y = ky0 + 1; y < ky1; y++) {
    c.addProp({ kind: 'castleWall', x: kx0 + 0.5, y: y + 0.5, r: 0.55, size: 1, solid: true, v: c.rng.next() });
    c.addProp({ kind: 'castleWall', x: kx1 + 0.5, y: y + 0.5, r: 0.55, size: 1, solid: true, v: c.rng.next() });
  }
  torch(c, kx0 + 1.6, ky0 + 1.6);
  torch(c, kx1 - 0.6, ky0 + 1.6);
  torch(c, cx - 2.2, ky1 - 0.6);
  torch(c, cx + 2.2, ky1 - 0.6);
  for (const ox of [-4, 4]) for (const oy of [4.5, 7.5]) c.addProp({ kind: 'pillar', x: cx + ox, y: ky0 + oy, r: 0.4, size: 0.8, solid: true, v: c.rng.next() });
  const crypt = { x: cx, y: ky0 + 3 };
  // treasure: a gold chest in the keep, iron chests in the bailey
  c.addProp({ kind: 'chest', x: kx1 - 1.5, y: ky0 + 2.2, r: 0.45, size: 2, solid: true, v: c.rng.next() });
  c.addProp({ kind: 'chest', x: kx0 + 2, y: ky1 + 4, r: 0.45, size: 1, solid: true, v: c.rng.next() });
  c.addProp({ kind: 'chest', x: x0 + 4.5, y: y1 - 4.5, r: 0.45, size: 1, solid: true, v: c.rng.next() });

  // Courtyard: bonfire and two rows of pillars.
  c.addProp({ kind: 'bonfire', x: cx + 9, y: y1 - 6, r: 0.45, size: 0.6, solid: true, v: 0.7 });
  for (const ox of [-12, -8, 8, 12]) c.addProp({ kind: 'pillar', x: cx + ox, y: ky1 + 3.5, r: 0.4, size: 0.8, solid: true, v: c.rng.next() });

  const spawns: EnemySpawn[] = [
    { x: cx - 6, y: y1 - 5, enemyId: 'hollow' },
    { x: cx + 3, y: y1 - 9, enemyId: 'hollow' },
    { x: cx - 14, y: ky1 + 6, enemyId: 'hollow' },
    { x: cx + 14, y: ky1 + 2, enemyId: 'ashwolf' },
    { x: cx - 3, y: ky0 + 6.5, enemyId: 'vampire' },
    { x: cx + 6, y: y1 - 6, enemyId: 'skeleton' },
    { x: cx - 10, y: ky1 + 3, enemyId: 'skeleton_archer' },
    { x: cx + 10, y: ky1 + 4, enemyId: 'skeleton_archer' },
    { x: cx + 3, y: ky0 + 6.5, enemyId: 'skeleton_mage' },
  ];
  const region: Region = { kind: 'castle', name, x0, y0, x1: x1 + 1, y1: y1 + 1 };
  const poi: Poi = { id, name, x: cx, y: cy + 4, r: 12, xp: 100 };
  return { x0, y0, x1, y1, cx, cy, gate: { x: cx, y: y1 + 3 }, crypt, spawns, region, poi };
}

/**
 * Cripta Afundada: rooms carved out of solid rock, linked by corridors in a snake order
 * (so every room is reachable from the entrance), lit by torches. Reached by portal.
 */
export type DungeonTheme = 'crypt' | 'ice' | 'necro' | 'ash';
const DUNGEON_FOES: Record<DungeonTheme, { big: string; small: [string, string]; caster: string; boss: string }> = {
  crypt: { big: 'giantspider', small: ['hollow', 'skeleton'], caster: 'skeleton_mage', boss: 'cursed_grave' },
  ice: { big: 'ice_ant', small: ['skeleton', 'ice_ant'], caster: 'skeleton_mage', boss: 'frost_wyvern' },
  necro: { big: 'skeleton', small: ['hollow', 'skeleton_archer'], caster: 'skeleton_mage', boss: 'cursed_grave' },
  ash: { big: 'fire_ant', small: ['skeleton', 'fire_ant'], caster: 'skeleton_mage', boss: 'bonegiant' },
};

export function buildDungeon(c: BuildCtx, x0: number, y0: number, x1: number, y1: number, id = 'crypt', name = 'Cripta Afundada', theme: DungeonTheme = 'crypt'): DungeonInfo {
  const foes = DUNGEON_FOES[theme];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.set(x, y, Tile.Rock);
  const cols = 4;
  const rows = 2;
  const cw = (x1 - x0 - 2) / cols;
  const ch = (y1 - y0 - 2) / rows;
  const rooms: Room[] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const col = r % 2 === 0 ? k : cols - 1 - k; // snake
      const big = r === rows - 1 && k === cols - 1;
      const w = big ? Math.floor(cw - 2) : c.rng.int(9, Math.max(10, Math.floor(cw - 3)));
      const h = big ? Math.floor(ch - 2) : c.rng.int(8, Math.max(9, Math.floor(ch - 3)));
      const cx0 = x0 + 1 + col * cw;
      const cy0 = y0 + 1 + r * ch;
      const rx0 = Math.floor(cx0 + 1 + c.rng.range(0, Math.max(0, cw - w - 2)));
      const ry0 = Math.floor(cy0 + 1 + c.rng.range(0, Math.max(0, ch - h - 2)));
      rooms.push({ x0: rx0, y0: ry0, x1: rx0 + w, y1: ry0 + h, cx: rx0 + w / 2, cy: ry0 + h / 2 });
    }
  }
  const carve = (x: number, y: number) => {
    if (x > x0 && y > y0 && x < x1 && y < y1) c.set(x, y, Tile.DungeonFloor);
  };
  for (const rm of rooms) for (let y = rm.y0; y < rm.y1; y++) for (let x = rm.x0; x < rm.x1; x++) carve(x, y);
  const corridor = (a: Room, b: Room) => {
    const ax = Math.floor(a.cx);
    const ay = Math.floor(a.cy);
    const bx = Math.floor(b.cx);
    const by = Math.floor(b.cy);
    // Horizontal leg along a's row, then vertical leg along b's column.
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let o = -1; o <= 1; o++) carve(x, ay + o);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (let o = -1; o <= 1; o++) carve(bx + o, y);
  };
  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1]!, rooms[i]!);
  corridor(rooms[1]!, rooms[6]!); // a loop so fights can be kited

  // Torches in room corners, pillars in the larger rooms.
  for (const rm of rooms) {
    torch(c, rm.x0 + 0.8, rm.y0 + 0.8);
    torch(c, rm.x1 - 0.8, rm.y0 + 0.8);
    if (rm.x1 - rm.x0 >= 12 && rm.y1 - rm.y0 >= 10) {
      for (const [ox, oy] of [[-4, -3], [4, -3], [-4, 3], [4, 3]] as const) {
        c.addProp({ kind: 'pillar', x: Math.floor(rm.cx + ox) + 0.5, y: Math.floor(rm.cy + oy) + 0.5, r: 0.4, size: 0.8, solid: true, v: c.rng.next() });
      }
    }
  }
  // chests: iron in every other room, gold behind the last guardian
  rooms.forEach((rm, i) => {
    if (i === 0 || (i % 2 === 1 && i !== rooms.length - 1)) return;
    c.addProp({ kind: 'chest', x: Math.floor(rm.x1 - 1.5) + 0.5, y: Math.floor(rm.y0 + 1.5) + 0.5, r: 0.45, size: i === rooms.length - 1 ? 2 : 1, solid: true, v: c.rng.next() });
  });
  const s = rooms[0]!;
  c.addProp({ kind: 'bonfire', x: s.cx + 2.5, y: s.cy + 1, r: 0.45, size: 0.6, solid: true, v: 0.4 });
  const exit = { x: s.cx - 2.5, y: s.cy - 1.5 };
  const start = { x: s.cx - 2.5, y: s.cy + 1.5 };

  const spawns: EnemySpawn[] = [];
  rooms.forEach((rm, i) => {
    if (i === 0) return;
    const last = i === rooms.length - 1;
    const spiders = last ? 2 : i % 2 === 0 ? 1 : 0;
    const hollows = last ? 1 : i % 2 === 0 ? 1 : 2;
    let n = 0;
    const total = spiders + hollows;
    const place = (enemyId: string) => {
      const a = (n++ / total) * Math.PI * 2 + 0.4;
      spawns.push({ x: Math.floor(rm.cx + Math.cos(a) * 2) + 0.5, y: Math.floor(rm.cy + Math.sin(a) * 1.6) + 0.5, enemyId });
    };
    for (let k = 0; k < spiders; k++) place(foes.big);
    for (let k = 0; k < hollows; k++) place(foes.small[i % 3 === 1 ? 1 : 0]);
    if (last) place(foes.boss);
    else if (i % 2 === 1) place(foes.caster);
  });
  const region: Region = { kind: 'dungeon', name, x0, y0, x1: x1 + 1, y1: y1 + 1 };
  const poi: Poi = { id, name, x: s.cx, y: s.cy, r: 5, xp: 150 };
  return { start, exit, spawns, region, poi };
}

/** A two-way portal pair between an entrance in the open world and a dungeon's first room. */
export function makePortals(entrance: { x: number; y: number }, dungeon: DungeonInfo, id: string, downName: string, upName: string): Portal[] {
  return [
    { id: `${id}-down`, name: downName, x: entrance.x, y: entrance.y, r: 1.3, toX: dungeon.start.x, toY: dungeon.start.y },
    { id: `${id}-up`, name: upName, x: dungeon.exit.x, y: dungeon.exit.y, r: 1.3, toX: entrance.x, toY: entrance.y + 2.6 },
  ];
}

// ------------------------------------------------------------------ 0.12: settlements and lairs
export interface SiteInfo {
  poi: Poi;
  spawns: EnemySpawn[];
  /** Where a road should arrive. */
  door: { x: number; y: number };
  /** Optional dungeon entrance (portal) inside the site. */
  entrance?: { x: number; y: number };
}

const disc = (c: BuildCtx, cx: number, cy: number, r: number, t: Tile, ragged = 0) => {
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) {
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + (ragged ? (c.rng.next() - 0.5) * ragged : 0);
      if (d < r) c.set(x, y, t);
    }
  }
};

/** A village: cobbled plaza with a well, houses in a ring, market stalls, a bonfire and torches. Safe ground. */
export function buildVillage(c: BuildCtx, cx: number, cy: number, id: string, name: string): SiteInfo {
  disc(c, cx, cy, 20, Tile.Grass);
  disc(c, cx, cy, 7.5, Tile.Cobble);
  // cobbled lanes to the four winds
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    for (let k = 0; k < 19; k++) for (let o = -1; o <= 1; o++) c.set(Math.floor(cx + dx * k + (dy ? o : 0)), Math.floor(cy + dy * k + (dx ? o : 0)), Tile.Cobble);
  }
  c.addProp({ kind: 'well', x: cx, y: cy, r: 0.9, size: 1, solid: true, v: c.rng.next() });
  const angles = [0.4, 1.15, 1.95, 2.75, 3.55, 4.35, 5.1, 5.85];
  for (const a of angles) {
    const R = 12.5 + c.rng.range(-1, 1.5);
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R * 0.85;
    c.addProp({ kind: 'house', x, y, r: 2.3, size: 0.9 + c.rng.next() * 0.45, solid: true, v: c.rng.next() });
  }
  for (const [ox, oy] of [[-4.5, 3.5], [4.5, 3.5], [-4.5, -3.8]] as const) c.addProp({ kind: 'stall', x: cx + ox, y: cy + oy, r: 0.8, size: 1, solid: true, v: c.rng.next() });
  c.addProp({ kind: 'bonfire', x: cx + 4.2, y: cy - 3.6, r: 0.45, size: 0.6, solid: true, v: 0.6 });
  for (const [ox, oy] of [[-7, -7], [7, -7], [-7, 7], [7, 7]] as const) torch(c, cx + ox, cy + oy);
  c.addProp({ kind: 'chest', x: cx - 9, y: cy - 2, r: 0.45, size: 0, solid: true, v: c.rng.next() });
  return { poi: { id, name, x: cx, y: cy, r: 14, xp: 80 }, spawns: [], door: { x: cx, y: cy + 18 } };
}

/** A goblin camp: trampled ground, a palisade of stakes, tents around a fire pit, a chief and his band. */
export function buildGoblinCamp(c: BuildCtx, cx: number, cy: number, id: string, name: string): SiteInfo {
  disc(c, cx, cy, 9, Tile.Dirt, 1.5);
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    if (Math.abs(Math.sin(a) - 1) < 0.08) continue; // gap facing south
    c.addProp({ kind: 'stake', x: cx + Math.cos(a) * 9.5, y: cy + Math.sin(a) * 8, r: 0.3, size: 0.8 + c.rng.next() * 0.4, solid: true, v: c.rng.next() });
  }
  for (const a of [0.5, 2.0, 3.6, 5.0]) c.addProp({ kind: 'tent', x: cx + Math.cos(a) * 5.2, y: cy + Math.sin(a) * 4.4, r: 1.2, size: 1, solid: true, v: c.rng.next() });
  torch(c, cx, cy);
  torch(c, cx + 0.6, cy + 0.3);
  c.addProp({ kind: 'chest', x: cx - 1.5, y: cy - 6, r: 0.45, size: 1, solid: true, v: c.rng.next() });
  const spawns: EnemySpawn[] = [{ x: cx + 2, y: cy + 1.5, enemyId: 'goblin_chief' }];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.8;
    spawns.push({ x: cx + Math.cos(a) * 3, y: cy + Math.sin(a) * 2.5, enemyId: 'goblin' });
  }
  return { poi: { id, name, x: cx, y: cy, r: 10, xp: 90 }, spawns, door: { x: cx, y: cy + 11 } };
}

/** A cursed graveyard: rows of tombstones on muddy ground, cursed graves that raise the dead, a crypt door. */
export function buildGraveyard(c: BuildCtx, cx: number, cy: number, id: string, name: string): SiteInfo {
  for (let y = Math.floor(cy - 8); y <= cy + 8; y++) for (let x = Math.floor(cx - 11); x <= cx + 11; x++) c.set(x, y, Tile.Mud);
  for (let gy = -6; gy <= 5; gy += 2.5) {
    for (let gx = -9; gx <= 9; gx += 2.2) {
      if (Math.abs(gx) < 2 || c.rng.next() < 0.2) continue;
      c.addProp({ kind: 'grave', x: cx + gx + c.rng.range(-0.3, 0.3), y: cy + gy, r: 0.32, size: 0.8 + c.rng.next() * 0.5, solid: true, v: c.rng.next() });
    }
  }
  for (let x = Math.floor(cx - 11); x <= cx + 11; x++) {
    if (Math.abs(x + 0.5 - cx) > 2) c.addProp({ kind: 'ruinWall', x: x + 0.5, y: cy - 8.5, r: 0.55, size: 1, solid: true, v: c.rng.next() });
  }
  torch(c, cx - 2.4, cy - 7.5);
  torch(c, cx + 2.4, cy - 7.5);
  c.addProp({ kind: 'chest', x: cx + 9, y: cy + 6, r: 0.45, size: 1, solid: true, v: c.rng.next() });
  const spawns: EnemySpawn[] = [
    { x: cx - 6, y: cy - 2, enemyId: 'cursed_grave' },
    { x: cx + 6, y: cy + 1, enemyId: 'cursed_grave' },
    { x: cx, y: cy + 3, enemyId: 'skeleton_mage' },
    { x: cx - 3, y: cy + 5, enemyId: 'skeleton' },
    { x: cx + 3, y: cy - 4, enemyId: 'hollow' },
  ];
  return { poi: { id, name, x: cx, y: cy, r: 12, xp: 140 }, spawns, door: { x: cx, y: cy + 10 }, entrance: { x: cx, y: cy - 6.5 } };
}

/** A beast's lair: a scorched (or frozen) arena ringed by boulders, bones and a gilded chest. */
export function buildLair(c: BuildCtx, cx: number, cy: number, id: string, name: string, kind: 'dragon' | 'wyvern'): SiteInfo {
  const floor = kind === 'dragon' ? Tile.Ash : Tile.Ice;
  disc(c, cx, cy, 13, floor, 2);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + c.rng.range(-0.08, 0.08);
    if (Math.abs(Math.sin(a) - 1) < 0.16) continue; // way in from the south
    const R = 13.5 + c.rng.range(0, 1.5);
    c.addProp({ kind: 'rock', x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R * 0.85, r: 0.9, size: 1.2 + c.rng.next() * 0.8, solid: true, v: c.rng.next() });
  }
  for (let i = 0; i < 9; i++) c.addProp({ kind: 'bones', x: cx + c.rng.range(-8, 8), y: cy + c.rng.range(-7, 7), r: 0, size: 0.5, solid: false, v: c.rng.next() });
  if (kind === 'dragon') {
    for (let i = 0; i < 4; i++) {
      const a = c.rng.range(0, Math.PI * 2);
      disc(c, cx + Math.cos(a) * 7, cy + Math.sin(a) * 6, 1.6 + c.rng.next(), Tile.Lava, 1);
    }
  }
  c.addProp({ kind: 'chest', x: cx, y: cy - 9, r: 0.45, size: 2, solid: true, v: c.rng.next() });
  const boss = kind === 'dragon' ? 'fire_dragon' : 'frost_wyvern';
  const guard = kind === 'dragon' ? 'fire_ant' : 'ice_ant';
  return {
    poi: { id, name, x: cx, y: cy, r: 13, xp: 250 },
    spawns: [{ x: cx, y: cy - 2, enemyId: boss }, { x: cx - 8, y: cy + 4, enemyId: guard }, { x: cx + 8, y: cy + 4, enemyId: guard }],
    door: { x: cx, y: cy + 15 },
  };
}
