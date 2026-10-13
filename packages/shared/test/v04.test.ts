import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile, isWalkable } from '../src/world/tiles';
import { generateWorld, tileAt, WORLD_SIZE, type WorldData } from '../src/world/worldgen';
import { getAction } from '../src/data/actions';
import { CLASSES } from '../src/data/classes';
import { ENEMIES } from '../src/data/enemies';
import { hasStatus } from '../src/combat/statuses';
import { Room } from '../src/net/room';
import { PROTOCOL_VERSION } from '../src/net/protocol';

function flatWorld(): WorldData {
  return { seed: 1, width: 60, height: 40, tiles: new Uint8Array(2400).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const cmd = (buttons = 0, aim = 0, mx = 0, my = 0): InputCommand => ({ seq: 0, mx, my, aim, buttons });
function cast(sim: Simulation, id: number, btn: number, ticks: number, aim = 0): SimEvent[] {
  const ev: SimEvent[] = [];
  sim.setInput(id, cmd(btn, aim));
  ev.push(...sim.step());
  sim.setInput(id, cmd(0, aim));
  for (let i = 1; i < ticks; i++) ev.push(...sim.step());
  return ev;
}
function healerSetup() {
  const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
  const h = sim.addPlayer('Cura', 'healer', { x: 20, y: 20 });
  h.mana = h.maxMana = 999;
  const ally = sim.addPlayer('Ana', 'vanguard', { x: 22, y: 20 });
  return { sim, h, ally };
}
function dummy(sim: Simulation, id: string, x: number, y: number) {
  const e = sim.spawnEnemy(id, x, y);
  e.ai!.attackReadyAt = 1e9;
  e.ai!.nextThink = 1e9;
  e.hp = e.maxHp = 5000;
  return e;
}

describe('world 0.4: bigger, castle and dungeon', () => {
  const world = generateWorld(20261012);
  const count = (t: Tile) => world.tiles.filter((x) => x === t).length;

  it('is 224 m and contains a castle and a dungeon', () => {
    expect(WORLD_SIZE).toBe(224);
    expect(world.width).toBe(224);
    expect(count(Tile.CastleFloor)).toBeGreaterThan(400);
    expect(count(Tile.DungeonFloor)).toBeGreaterThan(300);
    expect(world.props.filter((p) => p.kind === 'castleWall').length).toBeGreaterThan(60);
    expect(world.props.filter((p) => p.kind === 'tower').length).toBeGreaterThanOrEqual(4);
    expect(world.props.filter((p) => p.kind === 'torch').length).toBeGreaterThan(6);
    expect(world.pois.map((p) => p.id)).toEqual(expect.arrayContaining(['castle', 'crypt']));
    expect(world.regions.some((r) => r.kind === 'dungeon')).toBe(true);
  });

  it('never grows trees on castle or dungeon floors', () => {
    for (const p of world.props) {
      if (p.kind !== 'tree' && p.kind !== 'pine') continue;
      const t = tileAt(world, p.x, p.y);
      expect(t === Tile.CastleFloor || t === Tile.DungeonFloor).toBe(false);
    }
  });

  it('has paired portals landing on walkable ground', () => {
    expect(world.portals.length).toBeGreaterThanOrEqual(2);
    for (const pt of world.portals) {
      expect(isWalkable(tileAt(world, pt.x, pt.y))).toBe(true);
      expect(isWalkable(tileAt(world, pt.toX, pt.toY))).toBe(true);
    }
  });

  it('places giant spiders in the dungeon', () => {
    const d = world.regions.find((r) => r.kind === 'dungeon')!;
    const inDungeon = world.enemySpawns.filter((e) => e.x >= d.x0 && e.x <= d.x1 && e.y >= d.y0 && e.y <= d.y1);
    expect(inDungeon.length).toBeGreaterThanOrEqual(4);
    expect(inDungeon.some((e) => e.enemyId === 'giantspider')).toBe(true);
  });
});

describe('portals', () => {
  it('interact near a portal teleports the player and emits a portal event', () => {
    const w = flatWorld();
    w.portals.push({ id: 'a', name: 'Cripta', x: 10, y: 10, r: 1.2, toX: 40, toY: 30 });
    const sim = new Simulation({ world: w, spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 10.5, y: 10 });
    const ev = cast(sim, p.id, Btn.Interact, 3);
    expect(Math.hypot(p.pos.x - 40, p.pos.y - 30)).toBeLessThan(0.6);
    expect(ev.some((e) => e.type === 'portal' && e.id === p.id)).toBe(true);
  });
  it('refuses to teleport a player who was just hit', () => {
    const w = flatWorld();
    w.portals.push({ id: 'a', name: 'Cripta', x: 10, y: 10, r: 1.2, toX: 40, toY: 30 });
    const sim = new Simulation({ world: w, spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 10.5, y: 10 });
    for (let i = 0; i < 100; i++) sim.step();
    p.lastHitTick = sim.tick - 10;
    cast(sim, p.id, Btn.Interact, 3);
    expect(p.pos.x).toBeLessThan(15);
  });
  it('does nothing far from a portal', () => {
    const w = flatWorld();
    w.portals.push({ id: 'a', name: 'Cripta', x: 10, y: 10, r: 1.2, toX: 40, toY: 30 });
    const sim = new Simulation({ world: w, spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 20, y: 20 });
    cast(sim, p.id, Btn.Interact, 3);
    expect(p.pos.x).toBeLessThan(25);
  });
});

describe('healer (Curandeira)', () => {
  it('exists with six abilities and joins through the room', () => {
    const c = CLASSES.healer;
    expect(c.name).toBe('Curandeira');
    for (const k of ['q', 'e', 'a1', 'a2', 'a3', 'a4'] as const) expect(() => getAction(c.abilities[k].action)).not.toThrow();
    const room = new Room({ world: flatWorld() });
    room.handle('s', { t: 'hello', version: PROTOCOL_VERSION });
    room.handle('s', { t: 'join', name: 'Lia', classId: 'healer' });
    const p = [...room.sim.entities.values()].find((e) => e.kind === 'player')!;
    expect(p.classId).toBe('healer');
  });

  it('Q heals nearby allies (capped at max) but never enemies', () => {
    const { sim, h, ally } = healerSetup();
    const foe = dummy(sim, 'hollow', 19, 21);
    ally.hp = 100;
    h.hp = h.maxHp - 50;
    foe.hp = 1000;
    const ev = cast(sim, h.id, Btn.AbilQ, 30);
    expect(ally.hp).toBeGreaterThan(100);
    expect(h.hp).toBe(h.maxHp);
    expect(foe.hp).toBe(1000);
    expect(ev.some((e) => e.type === 'heal' && e.target === ally.id)).toBe(true);
  });

  it('Égide grants ironguard to allies', () => {
    const { sim, h, ally } = healerSetup();
    cast(sim, h.id, Btn.AbilE, 20);
    expect(hasStatus(ally, 'ironguard', sim.tick)).toBe(true);
    expect(hasStatus(h, 'ironguard', sim.tick)).toBe(true);
  });

  it('Sentença Radiante fires a holy projectile that damages', () => {
    const { sim, h } = healerSetup();
    const foe = dummy(sim, 'hollow', 26, 20);
    const ev = cast(sim, h.id, Btn.Abil1, 40, 0);
    expect(ev.some((e) => e.type === 'projectile' && e.ownerId === h.id)).toBe(true);
    expect(foe.hp).toBeLessThan(5000);
  });

  it('Santuário heals allies inside and harms enemies inside', () => {
    const { sim, h, ally } = healerSetup();
    ally.pos = { x: 23, y: 20 };
    ally.hp = 100;
    const foe = dummy(sim, 'hollow', 24, 21);
    cast(sim, h.id, Btn.Abil2, 90, 0);
    expect(ally.hp).toBeGreaterThan(130);
    expect(foe.hp).toBeLessThan(5000);
  });

  it('Purificar removes slow and root from allies', () => {
    const { sim, h, ally } = healerSetup();
    sim.applyStatus(ally, 'slow', 300, 0.5, -1);
    sim.applyStatus(ally, 'root', 300, 1, -1);
    cast(sim, h.id, Btn.Abil3, 20);
    expect(hasStatus(ally, 'slow', sim.tick)).toBe(false);
    expect(hasStatus(ally, 'root', sim.tick)).toBe(false);
  });

  it('Bênção da Aurora heals a lot and armors allies', () => {
    const { sim, h, ally } = healerSetup();
    ally.hp = 50;
    cast(sim, h.id, Btn.Abil4, 60);
    expect(ally.hp).toBeGreaterThan(200);
    expect(hasStatus(ally, 'ironguard', sim.tick)).toBe(true);
  });
});

describe('giant spider', () => {
  it('has telegraphed melee and a web that slows', () => {
    const d = ENEMIES.giantspider!;
    expect(d.name).toBe('Formiga-Leão Gigante');
    expect(getAction('spider_leap').telegraph).toBe('danger');
    expect(getAction('spider_bite').telegraph).toBe('normal');
    expect(getAction('spider_web').projectile?.hit.status?.id).toBe('slow');
  });

  it('web projectile slows the player', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'vanguard', { x: 26, y: 20 });
    const s = dummy(sim, 'giantspider', 20, 20);
    sim.startAction(s, 'spider_web', 0);
    let slowed = false;
    for (let i = 0; i < 40 && !slowed; i++) {
      sim.step();
      slowed = hasStatus(p, 'slow', sim.tick);
    }
    expect(slowed).toBe(true);
  });
});
