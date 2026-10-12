import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import type { WorldData } from '../src/world/worldgen';
import { generateWorld } from '../src/world/worldgen';
import { xpToNext, MAX_LEVEL } from '../src/data/curves';
import { Room } from '../src/net/room';
import { buildSnapshot } from '../src/net/snapshot';

function flatWorld(): WorldData {
  return { seed: 1, width: 40, height: 40, tiles: new Uint8Array(1600).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const run = (sim: Simulation, n: number) => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) ev.push(...sim.step());
  return ev;
};

describe('XP and levels', () => {
  it('killing an enemy grants its XP to the killer (server-side)', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('A', 'vanguard', { x: 20, y: 20 });
    const e = sim.spawnEnemy('ashwolf', 21.3, 20);
    e.ai!.attackReadyAt = 1e9;
    e.hp = 1;
    sim.setInput(p.id, { seq: 0, mx: 0, my: 0, aim: 0, buttons: Btn.Light });
    run(sim, 1);
    sim.setInput(p.id, { seq: 1, mx: 0, my: 0, aim: 0, buttons: 0 });
    run(sim, 20);
    expect(p.xp).toBe(30);
  });

  it('levels up, grants attribute points and refreshes derived stats', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('A', 'vanguard');
    const hp0 = p.maxHp;
    const ev: SimEvent[] = [];
    sim.grantXp(p, xpToNext(1) + 5, 'test');
    ev.push(...run(sim, 1));
    expect(p.level).toBe(2);
    expect(p.xp).toBe(5);
    expect(p.unspent).toBe(3);
    expect(p.maxHp).toBeGreaterThan(hp0);
    expect(ev.some((x) => x.type === 'levelUp' && x.level === 2)).toBe(true);
  });

  it('can gain several levels at once and stops at the level cap', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('A', 'arcanist');
    sim.grantXp(p, 1e12, 'test');
    expect(p.level).toBe(MAX_LEVEL);
    expect(p.xp).toBe(0);
  });

  it('allocating points requires unspent points and a valid attribute', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('A', 'vanguard');
    expect(sim.allocate(p.id, 'str')).toBe(false);
    sim.grantXp(p, xpToNext(1), 'test');
    const str = p.attrs.str;
    const hp = p.maxHp;
    expect(sim.allocate(p.id, 'hack' as never)).toBe(false);
    expect(sim.allocate(p.id, 'str')).toBe(true);
    expect(p.attrs.str).toBe(str + 1);
    expect(p.unspent).toBe(2);
    expect(sim.allocate(p.id, 'vit')).toBe(true);
    expect(p.maxHp).toBeGreaterThan(hp);
  });

  it('allocate goes through the Room protocol', () => {
    const room = new Room({ world: generateWorld(3) });
    room.handle('a', { t: 'hello', version: 1 });
    const w = room.handle('a', { t: 'join', name: 'A', classId: 'vanguard' })[0]!;
    const id = w.t === 'welcome' ? w.playerId : -1;
    const p = room.sim.entities.get(id)!;
    room.sim.grantXp(p, xpToNext(1), 'test');
    expect(room.handle('a', { t: 'allocate', attr: 'dex' })).toEqual([]);
    expect(p.unspent).toBe(2);
    expect(room.handle('a', { t: 'allocate', attr: 'nope' as never })[0]?.t).toBe('error');
  });

  it('discovering a point of interest grants XP once', () => {
    const world = generateWorld(11);
    const sim = new Simulation({ world, spawnEnemies: false });
    const poi = world.pois.find((x) => x.id === 'ruins')!;
    const p = sim.addPlayer('A', 'vanguard', { x: poi.x + 1, y: poi.y + 2 });
    const ev = run(sim, 15);
    expect(ev.filter((x) => x.type === 'discover' && x.poi === 'ruins').length).toBe(1);
    const xp = p.xp + (p.level - 1) * 1000;
    run(sim, 30);
    expect(p.xp + (p.level - 1) * 1000).toBe(xp);
  });

  it('snapshots expose XP progress only to the viewer', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const a = sim.addPlayer('A', 'vanguard', { x: 20, y: 20 });
    const b = sim.addPlayer('B', 'vanguard', { x: 22, y: 20 });
    sim.grantXp(a, 10, 'test');
    const snap = buildSnapshot(sim, a.id, 30);
    const sa = snap.entities.find((e) => e.id === a.id)!;
    const sb = snap.entities.find((e) => e.id === b.id)!;
    expect(sa.xp).toBe(10);
    expect(sa.xpNext).toBe(xpToNext(1));
    expect(sb.xp).toBeUndefined();
  });
});

describe('essence mark', () => {
  function killPlayer(sim: Simulation, id: number) {
    const p = sim.entities.get(id)!;
    sim.kill(p, null);
    run(sim, 100); // respawn
  }

  it('dying drops the current level progress as a mark at the death spot', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('A', 'vanguard', { x: 20, y: 20 });
    p.respawnPoint = { x: 10, y: 10 };
    sim.grantXp(p, 40, 'test');
    const ev = sim.kill(p, null);
    void ev;
    expect(p.xp).toBe(0);
    expect(p.essenceMark).toEqual({ x: 20, y: 20, amount: 40 });
  });

  it('touching the mark recovers the essence', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('A', 'vanguard', { x: 20, y: 20 });
    p.respawnPoint = { x: 17, y: 20 };
    sim.grantXp(p, 40, 'test');
    killPlayer(sim, p.id);
    expect(p.pos.x).toBeCloseTo(17);
    let got = false;
    for (let i = 0; i < 60 && !got; i++) {
      sim.setInput(p.id, { seq: i, mx: 1, my: 0, aim: 0, buttons: 0 });
      got = sim.step().some((x) => x.type === 'essenceRecovered');
    }
    expect(got).toBe(true);
    expect(p.xp).toBe(40);
    expect(p.essenceMark).toBeNull();
  });

  it('dying again before recovering loses the old mark', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('A', 'vanguard', { x: 20, y: 20 });
    p.respawnPoint = { x: 5, y: 5 };
    sim.grantXp(p, 40, 'test');
    killPlayer(sim, p.id);
    const evs = sim.kill(p, null);
    void evs;
    const ev = run(sim, 1);
    void ev;
    expect(p.essenceMark).toBeNull();
    expect(p.xp).toBe(0);
  });
});
