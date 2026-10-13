import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import { generateWorld, type WorldData } from '../src/world/worldgen';
import { Rng } from '../src/math/rng';
import {
  BAG_SIZE, LEGENDARIES, RARITIES, canEquip, gearEffects, itemEffects, makeLegendary, makeRune, rollChest, rollEnemyDrops, rollItem, sanitizeItem, type Item,
} from '../src/data/items';
import { exportCharacter, newCharacter, validateSave } from '../src/net/save';
import { buildSnapshot } from '../src/net/snapshot';

function flatWorld(extraProps: WorldData['props'] = []): WorldData {
  return { seed: 1, width: 60, height: 40, tiles: new Uint8Array(2400).fill(Tile.Grass), props: extraProps, spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const cmd = (buttons = 0): InputCommand => ({ seq: 0, mx: 0, my: 0, aim: 0, buttons });

describe('0.11 items: generation and validation', () => {
  it('rolls items of every rarity with stats inside their caps', () => {
    const rng = new Rng(7);
    for (const rarity of RARITIES) {
      for (let i = 0; i < 40; i++) {
        const it = rollItem(rng, { level: 1 + (i % 60), rarity, forClass: 'ranger' });
        expect(it.rarity).toBe(rarity);
        expect(sanitizeItem(JSON.parse(JSON.stringify(it)))).toEqual(it);
        for (const v of Object.values(itemEffects(it))) expect(v).toBeLessThan(1);
      }
    }
  });

  it('a tampered item is clamped or rejected', () => {
    const rng = new Rng(3);
    const it = rollItem(rng, { level: 10, rarity: 'rare' });
    const forged = { ...it, affixes: [{ stat: 'dmg', value: 9 }, { stat: 'lifesteal', value: 5 }, { stat: 'maxHp', value: 3 }] };
    const ok = sanitizeItem(forged)!;
    expect(ok.affixes.length).toBeLessThanOrEqual(2);
    for (const a of ok.affixes) expect(a.value).toBeLessThan(0.31);
    expect(sanitizeItem({ ...it, base: 'excalibur' })).toBeNull();
    expect(sanitizeItem({ ...it, rarity: 'mythic' })).toBeNull();
    const leg = makeLegendary(rng, 'vaelmor_oath', 20);
    const fake = sanitizeItem({ ...leg, affixes: [{ stat: 'dmg', value: 10 }] })!;
    expect(fake.affixes).toEqual(leg.affixes);
    expect(sanitizeItem({ ...leg, legend: 'wyrm_fang' })).toBeNull(); // wrong base for that legend
  });

  it('bosses always drop loot, the dragon can drop its crown, chests scale by tier', () => {
    const rng = new Rng(11);
    let crowns = 0;
    for (let i = 0; i < 200; i++) {
      const drops = rollEnemyDrops(rng, 'fire_dragon', 1400, 20, 'vanguard');
      expect(drops.length).toBeGreaterThanOrEqual(2);
      crowns += drops.filter((d) => d.legend === 'ash_crown').length;
    }
    expect(crowns).toBeGreaterThan(0);
    expect(Object.keys(LEGENDARIES).length).toBeGreaterThanOrEqual(10);
    expect(rollChest(rng, 0, 5).length).toBeGreaterThanOrEqual(1);
    expect(rollChest(rng, 2, 5).length).toBeGreaterThanOrEqual(3);
  });
});

describe('0.11 items: in the world', () => {
  it('killing a creature drops loot that only the killer may take, by walking over it', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('Caçador', 'vanguard', { x: 20, y: 20 });
    const other = sim.addPlayer('Outro', 'rogue', { x: 30, y: 30 });
    const boss = sim.spawnEnemy('fire_dragon', 26, 20);
    sim.kill(boss, p);
    sim.step();
    expect(sim.loot.length).toBeGreaterThan(0);
    expect(sim.loot.every((l) => l.owner === p.id)).toBe(true);
    // the other player can't see or take it yet
    expect(buildSnapshot(sim, other.id, 100).loot!.length).toBe(0);
    const l = sim.loot[0]!;
    other.pos.x = l.x;
    other.pos.y = l.y;
    sim.step();
    expect(other.inventory!.length).toBe(0);
    p.pos.x = l.x;
    p.pos.y = l.y;
    const ev = sim.step();
    expect(ev.some((e) => e.type === 'pickup' && e.id === p.id)).toBe(true);
    expect(p.inventory!.length).toBeGreaterThan(0);
  });

  it('equip and unequip change the character; class gear is restricted', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('Lia', 'vanguard', { x: 20, y: 20 });
    const rng = new Rng(5);
    const chest: Item = { uid: 'c1', base: 'cuirass', rarity: 'epic', level: 1, affixes: [{ stat: 'maxHp', value: 0.2 }], imbue: null, legend: null };
    const bow = { ...rollItem(rng, { level: 1, rarity: 'rare' }), base: 'longbow' };
    p.inventory!.push(chest, bow);
    const hp0 = p.maxHp;
    expect(sim.equipItem(p.id, 'c1')).toBe(true);
    expect(p.equipment!.chest?.uid).toBe('c1');
    expect(p.maxHp).toBeGreaterThan(hp0);
    expect(p.inventory!.some((i) => i.uid === 'c1')).toBe(false);
    expect(canEquip(p, bow)).toBe(false);
    expect(sim.equipItem(p.id, bow.uid)).toBe(false); // a vanguard can't use a bow
    expect(sim.unequipItem(p.id, 'chest')).toBe(true);
    expect(p.maxHp).toBe(hp0);
    expect(p.inventory!.some((i) => i.uid === 'c1')).toBe(true);
    // a full bag blocks unequipping
    sim.equipItem(p.id, 'c1');
    while (p.inventory!.length < BAG_SIZE) p.inventory!.push(makeRune(rng, 'fire', 1));
    expect(sim.unequipItem(p.id, 'chest')).toBe(false);
  });

  it('armour reduces the damage a player takes', () => {
    const hitWith = (armor: boolean) => {
      const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
      const p = sim.addPlayer('Alvo', 'barbarian', { x: 20, y: 20 });
      if (armor) {
        p.equipment!.chest = { uid: 'a', base: 'cuirass', rarity: 'legendary', level: 60, affixes: [], imbue: null, legend: null };
        p.gear = gearEffects(p.equipment!);
      }
      p.hp = p.maxHp = 5000;
      sim.spawnEnemy('skeleton', 21.2, 20);
      let lost = 0;
      for (let i = 0; i < 30 * 8 && lost === 0; i++) for (const e of sim.step()) if (e.type === 'hit' && e.target === p.id) lost = e.amount;
      return lost;
    };
    const bare = hitWith(false);
    const armored = hitWith(true);
    expect(bare).toBeGreaterThan(0);
    expect(armored).toBeLessThan(bare);
  });

  it('an imbued weapon needs a rune and a bonfire seat', () => {
    const fire = { id: 900, kind: 'bonfire' as const, x: 20, y: 18, r: 0.45, size: 0.6, solid: true, v: 0.5 };
    const sim = new Simulation({ world: flatWorld([fire]), spawnEnemies: false });
    const p = sim.addPlayer('Ana', 'vanguard', { x: 20, y: 20 });
    const rng = new Rng(9);
    const sword = { ...rollItem(rng, { level: 1, rarity: 'common' }), base: 'longsword' };
    p.inventory!.push(sword, makeRune(rng, 'fire', 1));
    expect(sim.equipItem(p.id, sword.uid)).toBe(true);
    const rune = p.inventory![0]!;
    expect(sim.imbueWeapon(p.id, rune.uid)).toBe(false); // not seated
    sim.setInput(p.id, cmd(Btn.Interact));
    sim.step();
    sim.setInput(p.id, cmd(0));
    expect(p.action?.id).toBe('sit');
    expect(sim.imbueWeapon(p.id, rune.uid)).toBe(true);
    expect(p.equipment!.weapon!.imbue?.element).toBe('fire');
    expect(p.inventory!.length).toBe(0);
  });

  it('a chest opens once per character and spills its loot', () => {
    const chest = { id: 901, kind: 'chest' as const, x: 21, y: 20, r: 0.45, size: 2, solid: true, v: 0.3 };
    const sim = new Simulation({ world: flatWorld([chest]), spawnEnemies: false });
    const p = sim.addPlayer('Rui', 'ranger', { x: 20, y: 20 });
    sim.setInput(p.id, cmd(Btn.Interact));
    const ev: SimEvent[] = sim.step();
    sim.setInput(p.id, cmd(0));
    expect(ev.some((e) => e.type === 'chest' && e.tier === 2)).toBe(true);
    expect(sim.loot.length).toBeGreaterThanOrEqual(3);
    expect(p.openedChests).toContain(901);
    expect(sim.openChest(p, 901)).toBe(false);
  });

  it('the world is full of chests (castle, crypt, ruins, wilds)', () => {
    const w = generateWorld(20240613);
    const chests = w.props.filter((p) => p.kind === 'chest');
    expect(chests.length).toBeGreaterThanOrEqual(20);
    expect(chests.some((c) => c.size === 2)).toBe(true);
  });

  it('bag, equipment and opened chests survive a save round trip', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const save0 = newCharacter('x', 'Bia', 'healer', 1, 'f');
    const p = sim.addPlayerFromSave(save0);
    const rng = new Rng(2);
    const amulet = sanitizeItem({ ...rollItem(rng, { level: 1, rarity: 'epic' }), base: 'amulet', affixes: [] })!;
    p.inventory!.push(amulet, makeRune(rng, 'holy', 1));
    expect(sim.equipItem(p.id, amulet.uid)).toBe(true);
    p.openedChests!.push(3, 9);
    const saved = validateSave(JSON.parse(JSON.stringify(exportCharacter(p, save0, 2))))!;
    expect(saved.equipment!.amulet!.uid).toBe(amulet.uid);
    expect(saved.inventory!.length).toBe(1);
    expect(saved.openedChests).toEqual([3, 9]);
    const sim2 = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p2 = sim2.addPlayerFromSave(saved);
    expect(p2.maxHp).toBe(p.maxHp);
    expect(p2.equipment!.amulet!.uid).toBe(amulet.uid);
  });
});
