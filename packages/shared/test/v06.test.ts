import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type ClassId, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import { generateWorld, type WorldData } from '../src/world/worldgen';
import { CLASSES, CLASS_ORDER } from '../src/data/classes';
import { ACTIONS, getAction } from '../src/data/actions';
import { ENEMIES } from '../src/data/enemies';
import { SUBCLASSES, TALENT_TREES } from '../src/data/talents';
import { AMBUSH_MUL } from '../src/combat/combat';
import { hasStatus } from '../src/combat/statuses';
import { Room } from '../src/net/room';
import { PROTOCOL_VERSION } from '../src/net/protocol';

function flatWorld(): WorldData {
  return { seed: 1, width: 60, height: 40, tiles: new Uint8Array(2400).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const cmd = (buttons = 0, aim = 0, mx = 0, my = 0): InputCommand => ({ seq: 0, mx, my, aim, buttons });
function run(sim: Simulation, id: number, c: InputCommand, ticks: number): SimEvent[] {
  const ev: SimEvent[] = [];
  sim.setInput(id, c);
  ev.push(...sim.step());
  sim.setInput(id, cmd(0, c.aim));
  for (let i = 1; i < ticks; i++) ev.push(...sim.step());
  return ev;
}
function dummy(sim: Simulation, x: number, y: number, enemy = 'hollow') {
  const e = sim.spawnEnemy(enemy, x, y);
  e.ai!.attackReadyAt = 1e9;
  e.ai!.nextThink = 1e9;
  e.hp = e.maxHp = 100000;
  e.maxPoise = e.poise = 100000;
  e.facing = Math.PI;
  return e;
}
const NEW: ClassId[] = ['ranger', 'rogue', 'barbarian', 'warlock'];

describe('classes 0.6', () => {
  it('seven classes, each fully wired: actions exist, 3 talent branches, 2 subclasses', () => {
    expect(CLASS_ORDER.length).toBe(7);
    for (const id of CLASS_ORDER) {
      const c = CLASSES[id];
      expect(c.id).toBe(id);
      for (const a of [c.lightAction, c.heavyAction, ...Object.values(c.abilities).map((s) => s.action)]) expect(() => getAction(a)).not.toThrow();
      expect(TALENT_TREES[id].branches.length).toBe(3);
      expect(SUBCLASSES[id].length).toBe(2);
    }
  });

  it('every new class can spawn and use all six abilities without errors', () => {
    for (const id of NEW) {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('T', id, { x: 20, y: 20 });
      p.mana = p.maxMana = 999;
      dummy(sim, 23, 20);
      for (const b of [Btn.AbilQ, Btn.AbilE, Btn.Abil1, Btn.Abil2, Btn.Abil3, Btn.Abil4]) {
        p.stamina = p.maxStamina;
        p.mana = 999;
        p.statuses = [];
        run(sim, p.id, cmd(b, 0), 70);
      }
      expect(Object.keys(p.cooldowns).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('room join accepts the new classes and rejects unknown ones', () => {
    const room = new Room({ world: flatWorld() });
    room.handle('a', { t: 'hello', version: PROTOCOL_VERSION });
    room.handle('a', { t: 'join', name: 'Ana', classId: 'warlock' });
    room.handle('b', { t: 'hello', version: PROTOCOL_VERSION });
    room.handle('b', { t: 'join', name: 'Bob', classId: 'nope' as ClassId });
    const players = [...room.sim.entities.values()].filter((e) => e.kind === 'player').map((e) => e.classId).sort();
    expect(players).toEqual(['vanguard', 'warlock']);
  });
});

describe('mechanics 0.6', () => {
  it('volley fans out five arrows', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'ranger', { x: 20, y: 20 });
    const ev = run(sim, p.id, cmd(Btn.AbilQ, 0), 12);
    const shots = ev.filter((e) => e.type === 'projectile');
    expect(shots.length).toBe(5);
    const dirs = shots.map((s) => (s.type === 'projectile' ? s.dir : 0));
    expect(Math.max(...dirs) - Math.min(...dirs)).toBeGreaterThan(0.5);
  });

  it('evasive leap moves away from the aim direction', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'ranger', { x: 20, y: 20 });
    run(sim, p.id, cmd(Btn.AbilE, 0), 10);
    expect(p.pos.x).toBeLessThan(19);
  });

  it('poison deals damage over time and credits the kill', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'rogue', { x: 20, y: 20 });
    const d = dummy(sim, 21.1, 20);
    run(sim, p.id, cmd(Btn.AbilQ, 0), 15);
    expect(hasStatus(d, 'poison', sim.tick)).toBe(true);
    const hp = d.hp;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 90; i++) ev.push(...sim.step());
    expect(d.hp).toBeLessThan(hp);
    expect(ev.some((e) => e.type === 'hit' && e.dot === 'poison')).toBe(true);
    // lethal poison kills and grants XP to the poisoner
    d.hp = 3;
    const xp0 = p.xp;
    for (let i = 0; i < 30; i++) sim.step();
    expect(d.hp).toBeLessThanOrEqual(0);
    expect(p.xp).toBeGreaterThan(xp0);
  });

  it('empower (war cry) raises damage dealt', () => {
    const dealt = (cry: boolean) => {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('T', 'barbarian', { x: 20, y: 20 });
      if (cry) run(sim, p.id, cmd(Btn.AbilQ, 0), 25);
      const d = dummy(sim, 21.5, 20);
      p.stamina = p.maxStamina;
      run(sim, p.id, cmd(Btn.Light, 0), 30);
      return 100000 - d.hp;
    };
    expect(dealt(true)).toBeGreaterThan(dealt(false) * 1.15);
  });

  it('stealth hides the player from enemies; the next attack breaks it as an ambush', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'rogue', { x: 20, y: 20 });
    p.mana = 999;
    run(sim, p.id, cmd(Btn.Abil2, 0), 15);
    expect(hasStatus(p, 'stealth', sim.tick)).toBe(true);
    const foe = sim.spawnEnemy('hollow', 24, 20);
    for (let i = 0; i < 40; i++) sim.step();
    expect(foe.ai!.targetId).toBe(-1);
    // ambush: compare a stab from stealth with a normal one
    const d = dummy(sim, 21.1, 20);
    sim.removeEntity(foe.id);
    run(sim, p.id, cmd(Btn.Light, 0), 14);
    const ambush = 100000 - d.hp;
    expect(hasStatus(p, 'stealth', sim.tick)).toBe(false);
    d.hp = 100000;
    p.stamina = p.maxStamina;
    run(sim, p.id, cmd(Btn.Light, 0), 14);
    const normal = 100000 - d.hp;
    expect(ambush).toBeGreaterThan(normal * (AMBUSH_MUL - 0.2));
  });

  it('life drain heals the warlock', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'warlock', { x: 20, y: 20 });
    dummy(sim, 23, 20);
    p.hp = 50;
    run(sim, p.id, cmd(Btn.Abil1, 0), 30);
    expect(p.hp).toBeGreaterThan(50);
  });

  it('curse from the hex seal ticks on the nearest enemy in the aim cone', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'warlock', { x: 20, y: 20 });
    const d = dummy(sim, 25, 20);
    run(sim, p.id, cmd(Btn.Abil3, 0), 12);
    expect(hasStatus(d, 'curse', sim.tick)).toBe(true);
  });
});

describe('epic giant', () => {
  it('Colosso de Ossos is huge, telegraphs every attack and roams the generated world', () => {
    const g = ENEMIES.bonegiant!;
    expect(g.radius).toBeGreaterThanOrEqual(1.1);
    expect(g.hp).toBeGreaterThan(1000);
    for (const a of g.attacks) expect(ACTIONS[a.action]?.telegraph).toBeDefined();
    const w = generateWorld(1337);
    expect(w.enemySpawns.filter((s) => s.enemyId === 'bonegiant').length).toBeGreaterThanOrEqual(2);
  });
});
