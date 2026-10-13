import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import type { SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import { generateWorld, type WorldData } from '../src/world/worldgen';
import { CREATURE_ENEMIES } from '../src/data/creatures';
import { ENEMIES } from '../src/data/enemies';
import { ACTIONS } from '../src/data/actions';
import { newCharacter, validateSave } from '../src/net/save';
import { Room } from '../src/net/room';
import { PROTOCOL_VERSION } from '../src/net/protocol';

function flatWorld(): WorldData {
  return { seed: 1, width: 60, height: 40, tiles: new Uint8Array(2400).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}

describe('0.10 Flare creatures', () => {
  it('every creature is registered and every attack it can choose exists', () => {
    for (const [id, def] of Object.entries(CREATURE_ENEMIES)) {
      expect(ENEMIES[id]).toBe(def);
      for (const a of def.attacks) expect(ACTIONS[a.action], `${id}/${a.action}`).toBeDefined();
    }
  });

  it('each creature fights a player: attacks start, resolve and do something', () => {
    for (const id of Object.keys(CREATURE_ENEMIES)) {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('Alvo', 'vanguard', { x: 20, y: 20 });
      p.hp = p.maxHp = 1e6;
      const foe = sim.spawnEnemy(id, 22.2, 20);
      const ev: SimEvent[] = [];
      const used = new Set<string>();
      for (let i = 0; i < 30 * 20; i++) {
        ev.push(...sim.step());
        if (foe.action) used.add(foe.action.id);
      }
      expect(used.size, `${id} never attacked`).toBeGreaterThan(0);
      expect(ev.some((e) => ['hit', 'summon', 'projectile', 'strikeWarn'].includes(e.type)), `${id} did nothing`).toBe(true);
    }
  });

  it('the cursed grave raises skeletons and goblin chiefs call their band', () => {
    for (const [id, minion] of [['cursed_grave', 'skeleton'], ['goblin_chief', 'goblin']] as const) {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('Alvo', 'vanguard', { x: 20, y: 20 });
      p.hp = p.maxHp = 1e6;
      const boss = sim.spawnEnemy(id, 24, 20);
      let raised = 0;
      for (let i = 0; i < 30 * 60 && !raised; i++) for (const e of sim.step()) if (e.type === 'summon' && e.enemyId === minion && e.ownerId === boss.id) raised++;
      expect(raised, id).toBeGreaterThan(0);
    }
  });

  it('the generated world has the Ash Dragon, goblin camps, skeletons and graves', () => {
    const w = generateWorld(20240613);
    const ids = new Set(w.enemySpawns.map((s) => s.enemyId));
    for (const id of ['fire_dragon', 'goblin_chief', 'goblin', 'skeleton_archer', 'skeleton_mage', 'cursed_grave']) expect(ids.has(id), id).toBe(true);
    expect(w.enemySpawns.filter((s) => s.enemyId === 'fire_dragon')).toHaveLength(1);
  });
});

describe('0.10 herói / heroína', () => {
  it('gender lives in the save and reaches the entity', () => {
    const save = newCharacter('c1', 'Lia', 'ranger', 1, 'f');
    const ok = validateSave(JSON.parse(JSON.stringify(save)))!;
    expect(ok.gender).toBe('f');
    expect(validateSave({ ...save, gender: 'x' })!.gender).toBe('m');
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    expect(sim.addPlayerFromSave(ok).gender).toBe('f');
  });

  it('joining a room with a gender keeps it on the player', () => {
    const room = new Room({ world: flatWorld() });
    room.handle('s', { t: 'hello', version: PROTOCOL_VERSION });
    const [w] = room.handle('s', { t: 'join', name: 'Ana', classId: 'healer', gender: 'f' });
    expect(w!.t).toBe('welcome');
    const me = [...room.sim.entities.values()].find((e) => e.kind === 'player')!;
    expect(me.gender).toBe('f');
  });
});
