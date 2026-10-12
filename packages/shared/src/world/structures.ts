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
export function buildCastle(c: BuildCtx, cx: number, cy: number): CastleInfo {
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

  // Courtyard: bonfire and two rows of pillars.
  c.addProp({ kind: 'bonfire', x: cx + 9, y: y1 - 6, r: 0.45, size: 0.6, solid: true, v: 0.7 });
  for (const ox of [-12, -8, 8, 12]) c.addProp({ kind: 'pillar', x: cx + ox, y: ky1 + 3.5, r: 0.4, size: 0.8, solid: true, v: c.rng.next() });

  const spawns: EnemySpawn[] = [
    { x: cx - 6, y: y1 - 5, enemyId: 'hollow' },
    { x: cx + 3, y: y1 - 9, enemyId: 'hollow' },
    { x: cx - 14, y: ky1 + 6, enemyId: 'hollow' },
    { x: cx + 14, y: ky1 + 2, enemyId: 'ashwolf' },
    { x: cx - 3, y: ky0 + 6.5, enemyId: 'vampire' },
  ];
  const region: Region = { kind: 'castle', name: 'Castelo de Vaelmor', x0, y0, x1: x1 + 1, y1: y1 + 1 };
  const poi: Poi = { id: 'castle', name: 'Castelo de Vaelmor', x: cx, y: cy + 4, r: 12, xp: 100 };
  return { x0, y0, x1, y1, cx, cy, gate: { x: cx, y: y1 + 3 }, crypt, spawns, region, poi };
}

/**
 * Cripta Afundada: rooms carved out of solid rock, linked by corridors in a snake order
 * (so every room is reachable from the entrance), lit by torches. Reached by portal.
 */
export function buildDungeon(c: BuildCtx, x0: number, y0: number, x1: number, y1: number): DungeonInfo {
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
    for (let k = 0; k < spiders; k++) place('giantspider');
    for (let k = 0; k < hollows; k++) place('hollow');
  });
  const region: Region = { kind: 'dungeon', name: 'Cripta Afundada', x0, y0, x1: x1 + 1, y1: y1 + 1 };
  const poi: Poi = { id: 'crypt', name: 'Cripta Afundada', x: s.cx, y: s.cy, r: 5, xp: 150 };
  return { start, exit, spawns, region, poi };
}

export function makePortals(castle: CastleInfo, dungeon: DungeonInfo): Portal[] {
  return [
    { id: 'crypt-down', name: 'Descer à Cripta', x: castle.crypt.x, y: castle.crypt.y, r: 1.3, toX: dungeon.start.x, toY: dungeon.start.y },
    { id: 'crypt-up', name: 'Subir ao Castelo', x: dungeon.exit.x, y: dungeon.exit.y, r: 1.3, toX: castle.crypt.x, toY: castle.crypt.y + 2.6 },
  ];
}
