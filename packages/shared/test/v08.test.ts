import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import type { WorldData } from '../src/world/worldgen';
import { TALENT_TREES } from '../src/data/talents';
import { CLASS_ORDER } from '../src/data/classes';

function flatWorld(): WorldData {
  return { seed: 1, width: 60, height: 40, tiles: new Uint8Array(2400).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}
const cmd = (buttons = 0, aim = 0): InputCommand => ({ seq: 0, mx: 0, my: 0, aim, buttons });

describe('0.9 skill-tree abilities', () => {
  it('every unlockable skill of every class starts, resolves and ends without errors', () => {
    for (const cls of CLASS_ORDER) {
      for (const node of TALENT_TREES[cls].nodes.filter((n) => n.kind === 'skill')) {
        const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
        const p = sim.addPlayer('T', cls, { x: 20, y: 20 });
        p.level = 60;
        p.mana = p.maxMana = 999;
        p.stamina = p.maxStamina = 999;
        for (const n of TALENT_TREES[cls].nodes) if (n.kind !== 'start') p.talents[n.id] = 1;
        expect(sim.equipSkill(p.id, 'q', node.skill!)).toBe(true);
        const foe = sim.spawnEnemy('hollow', 22, 20);
        foe.ai!.attackReadyAt = 1e9;
        foe.hp = foe.maxHp = 100000;
        foe.statuses.push({ id: 'root', until: 1e9, power: 1, source: 0 }); // stays on the aim line
        p.hp = 100; // so heals have something to restore
        const ev: SimEvent[] = [];
        sim.setInput(p.id, cmd(Btn.AbilQ, 0));
        ev.push(...sim.step());
        expect(p.action?.id, `${cls}/${node.skill}`).toBe(node.skill);
        sim.setInput(p.id, cmd(0, 0));
        for (let i = 0; i < 120; i++) ev.push(...sim.step());
        expect(ev.some((e) => e.type === 'fail'), `${cls}/${node.skill} failed`).toBe(false);
        // every skill must visibly do something (hit, heal, summon, zone, status, projectile...)
        const did = ev.some((e) => ['hit', 'heal', 'summon', 'zone', 'status', 'projectile', 'strikeWarn', 'seal', 'shockwave', 'spikes'].includes(e.type));
        expect(did || node.skill === 'arc_blink', `${cls}/${node.skill} had no effect`).toBe(true);
      }
    }
  });

  it('burn deals damage over time', () => {
    const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
    const p = sim.addPlayer('T', 'arcanist', { x: 20, y: 20 });
    p.mana = p.maxMana = 999;
    for (const n of TALENT_TREES.arcanist.nodes) if (n.kind !== 'start') p.talents[n.id] = 1;
    p.level = 60;
    sim.equipSkill(p.id, 'q', 'pyro_fireball');
    const foe = sim.spawnEnemy('hollow', 24, 20);
    foe.ai!.attackReadyAt = 1e9;
    foe.hp = foe.maxHp = 100000;
    foe.statuses.push({ id: 'root', until: 1e9, power: 1, source: 0 });
    sim.setInput(p.id, cmd(Btn.AbilQ, 0));
    const ev: SimEvent[] = [...sim.step()];
    sim.setInput(p.id, cmd(0, 0));
    for (let i = 0; i < 150; i++) ev.push(...sim.step());
    expect(ev.some((e) => e.type === 'hit' && e.dot === 'burn')).toBe(true);
  });
});
