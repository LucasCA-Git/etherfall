import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import { summonSignOf, type Prop, type WorldData } from '../src/world/worldgen';
import { CLASSES } from '../src/data/classes';
import { itemSlot, starterKit } from '../src/data/items';
import { newCharacter, validateSave } from '../src/net/save';

function flatWorld(props: Prop[] = []): WorldData {
  return { seed: 1, width: 80, height: 60, tiles: new Uint8Array(4800).fill(Tile.Grass), props, spawn: { x: 10, y: 30 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const cmd = (buttons: number) => ({ seq: 0, mx: 0, my: 0, aim: 0, buttons });

describe('0.14 starter kit and summon signs', () => {
  it('every class starts with its weapon, off-hand and a full set of armour on', () => {
    for (const cls of Object.keys(CLASSES) as Array<keyof typeof CLASSES>) {
      const kit = starterKit(cls);
      expect(Object.keys(kit).sort(), cls).toEqual(['chest', 'feet', 'hands', 'head', 'legs', 'offhand', 'weapon']);
      for (const [slot, it] of Object.entries(kit)) expect(itemSlot(it!), `${cls}/${slot}`).toBe(slot);
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('Novo', cls, { x: 20, y: 20 });
      expect(p.equipment!.weapon!.base).toBe(kit.weapon!.base);
      expect(p.gear!.armor!).toBeGreaterThan(0);
    }
    // an old save with nothing equipped gets the kit; a new save too
    const save = validateSave(newCharacter('c1', 'Antigo', 'ranger', 0))!;
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayerFromSave(save);
    expect(p.equipment!.weapon!.base).toBe('longbow');
  });

  it('F on the sign beside a bonfire calls a phantom hero of the region level that fights with you', () => {
    const fire: Prop = { id: 1, kind: 'bonfire', x: 30.5, y: 20.5, r: 0.45, size: 0.6, solid: true, v: 0 };
    const sim = new Simulation({ world: flatWorld([fire]), spawnEnemies: false });
    const sign = summonSignOf(fire);
    const p = sim.addPlayer('Invocador', 'vanguard', { x: sign.x + 0.3, y: sign.y });
    p.hp = p.maxHp = 1e6;
    sim.setInput(p.id, cmd(Btn.Interact));
    const ev: SimEvent[] = sim.step();
    sim.setInput(p.id, cmd(0));
    expect(p.action?.id).not.toBe('sit');
    const ph = [...sim.entities.values()].find((e) => e.enemyId?.startsWith('phantom_'))!;
    expect(ph).toBeDefined();
    expect(ev.some((e) => e.type === 'summon' && e.id === ph.id)).toBe(true);
    expect(ph.team).toBe(p.team);
    expect(ph.ownerId).toBe(p.id);
    expect(ph.name.startsWith('Fantasma de ')).toBe(true);
    // a monster far from the fire: the phantom goes for it
    const foe = sim.spawnEnemy('skeleton', 30.5, 40);
    foe.hp = foe.maxHp = 1e5;
    p.pos.x = p.prevPos.x = 30.5;
    p.pos.y = p.prevPos.y = 36;
    const out: SimEvent[] = [];
    for (let i = 0; i < 30 * 15; i++) out.push(...sim.step());
    expect(out.some((e) => (e.type === 'hit' && e.attacker === ph.id) || (e.type === 'projectile' && e.ownerId === ph.id) || (e.type === 'heal' && e.source === ph.id))).toBe(true);
    // a second touch replaces it
    p.pos.x = p.prevPos.x = sign.x;
    p.pos.y = p.prevPos.y = sign.y;
    sim.setInput(p.id, cmd(Btn.Interact));
    sim.step();
    sim.setInput(p.id, cmd(0));
    expect([...sim.entities.values()].filter((e) => e.enemyId?.startsWith('phantom_') && e.ownerId === p.id)).toHaveLength(1);
  });
});
