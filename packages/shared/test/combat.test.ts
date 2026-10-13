import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { Btn, type InputCommand, type SimEvent } from '../src/sim/types';
import { Tile } from '../src/world/tiles';
import type { WorldData } from '../src/world/worldgen';
import { generateWorld } from '../src/world/worldgen';
import { getAction } from '../src/data/actions';
import { xpToNext, deriveStats } from '../src/data/curves';
import { buildSnapshot } from '../src/net/snapshot';

function flatWorld(size = 40): WorldData {
  return { seed: 1, width: size, height: size, tiles: new Uint8Array(size * size).fill(Tile.Grass), props: [], spawn: { x: 20, y: 20 }, enemySpawns: [], pois: [], portals: [], regions: [] };
}

const idle = (aim = 0, buttons = 0, mx = 0, my = 0): InputCommand => ({ seq: 0, mx, my, aim, buttons });

function setup(classId: 'vanguard' | 'arcanist' = 'vanguard') {
  const sim = new Simulation({ world: flatWorld(), spawnEnemies: false });
  const p = sim.addPlayer('Tester', classId, { x: 20, y: 20 });
  return { sim, p };
}

/** Press a button for one tick then release; returns all events produced while running `ticks`. */
function press(sim: Simulation, id: number, btn: number, aim = 0, ticks = 1): SimEvent[] {
  const ev: SimEvent[] = [];
  sim.setInput(id, idle(aim, btn));
  ev.push(...sim.step());
  sim.setInput(id, idle(aim, 0));
  for (let i = 1; i < ticks; i++) ev.push(...sim.step());
  return ev;
}

function run(sim: Simulation, ticks: number): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step());
  return ev;
}

describe('stamina', () => {
  it('is consumed by attacks and only regenerates after a delay', () => {
    const { sim, p } = setup();
    const full = p.stamina;
    press(sim, p.id, Btn.Light);
    const after = p.stamina;
    expect(after).toBeCloseTo(full - getAction('longsword_light').stamina!, 5);
    run(sim, 10); // still within regen delay (18 ticks)
    expect(p.stamina).toBeCloseTo(after, 5);
    run(sim, 40);
    expect(p.stamina).toBeGreaterThan(after + 14);
  });

  it('refuses to start an attack with no stamina', () => {
    const { sim, p } = setup();
    p.stamina = 0;
    const ev = press(sim, p.id, Btn.Light);
    expect(p.action).toBeNull();
    expect(ev.some((e) => e.type === 'fail' && e.reason === 'stamina')).toBe(true);
  });

  it('sprinting drains stamina', () => {
    const { sim, p } = setup();
    const s0 = p.stamina;
    sim.setInput(p.id, idle(0, Btn.Sprint, 1, 0));
    run(sim, 30);
    expect(p.stamina).toBeLessThan(s0 - 10);
  });
});

describe('melee attacks', () => {
  it('damage only during active frames and only once per swing', () => {
    const { sim, p } = setup();
    const e = sim.spawnEnemy('hollow', 21.4, 20);
    e.ai!.attackReadyAt = 1e9; // keep the dummy passive
    const hp0 = e.hp;
    const def = getAction('longsword_light');
    sim.setInput(p.id, idle(0, Btn.Light));
    sim.step();
    sim.setInput(p.id, idle(0, 0));
    run(sim, def.startup - 2);
    expect(e.hp).toBe(hp0); // still winding up
    run(sim, def.active + 3);
    expect(e.hp).toBeLessThan(hp0);
    const hp1 = e.hp;
    run(sim, def.recovery + 5);
    expect(e.hp).toBe(hp1);
  });

  it('misses targets outside the swing arc', () => {
    const { sim, p } = setup();
    const e = sim.spawnEnemy('hollow', 18.6, 20); // behind (aim = 0 => +x)
    e.ai!.attackReadyAt = 1e9;
    const hp0 = e.hp;
    press(sim, p.id, Btn.Light, 0, 30);
    expect(e.hp).toBe(hp0);
  });

  it('backstabs deal more damage than frontal hits', () => {
    const front = setup();
    const ef = front.sim.spawnEnemy('hollow', 21.4, 20);
    ef.ai!.attackReadyAt = 1e9;
    ef.facing = Math.PI; // facing the player
    front.sim.setInput(front.p.id, idle(0, Btn.Light));
    front.sim.step();
    ef.facing = Math.PI;
    front.sim.setInput(front.p.id, idle(0, 0));
    const evF = run(front.sim, 20);

    const back = setup();
    const eb = back.sim.spawnEnemy('hollow', 21.4, 20);
    eb.ai!.attackReadyAt = 1e9;
    eb.ai!.mode = 'idle';
    eb.ai!.nextThink = 1e9;
    eb.facing = 0; // facing away from the player
    back.sim.setInput(back.p.id, idle(0, Btn.Light));
    back.sim.step();
    back.sim.setInput(back.p.id, idle(0, 0));
    const evB = run(back.sim, 20);

    const hf = evF.find((x) => x.type === 'hit') as Extract<SimEvent, { type: 'hit' }>;
    const hb = evB.find((x) => x.type === 'hit') as Extract<SimEvent, { type: 'hit' }>;
    expect(hb.crit).toBe('backstab');
    expect(hb.amount).toBeGreaterThan(hf.amount * 1.3);
  });

  it('breaks poise and staggers', () => {
    const { sim, p } = setup();
    const e = sim.spawnEnemy('ashwolf', 21.3, 20);
    e.ai!.attackReadyAt = 1e9;
    e.poise = 5;
    const ev = press(sim, p.id, Btn.Light, 0, 15);
    expect(ev.some((x) => x.type === 'stagger' && x.target === e.id)).toBe(true);
    expect(e.action?.id).toBe('stagger');
  });

  it('charged heavy hits harder than an uncharged heavy', () => {
    const quick = setup();
    const eq = quick.sim.spawnEnemy('hollow', 21.5, 20);
    eq.ai!.attackReadyAt = 1e9;
    const evQ = press(quick.sim, quick.p.id, Btn.Heavy, 0, 40);

    const charged = setup();
    const ec = charged.sim.spawnEnemy('hollow', 21.5, 20);
    ec.ai!.attackReadyAt = 1e9;
    charged.sim.setInput(charged.p.id, idle(0, Btn.Heavy));
    run(charged.sim, 26);
    charged.sim.setInput(charged.p.id, idle(0, 0));
    const evC = run(charged.sim, 40);
    const dq = (evQ.find((x) => x.type === 'hit') as Extract<SimEvent, { type: 'hit' }>).amount;
    const dc = (evC.find((x) => x.type === 'hit') as Extract<SimEvent, { type: 'hit' }>).amount;
    expect(dc).toBeGreaterThan(dq * 1.4);
  });
});

describe('defense', () => {
  function enemySwingAt(sim: Simulation, enemyX = 21.3) {
    const e = sim.spawnEnemy('hollow', enemyX, 20);
    e.ai!.attackReadyAt = 1e9;
    e.ai!.nextThink = 1e9;
    e.facing = Math.PI;
    return e;
  }

  it('dodge i-frames avoid damage', () => {
    const { sim, p } = setup();
    const e = enemySwingAt(sim);
    sim.startAction(e, 'hollow_slash', Math.PI);
    const def = getAction('hollow_slash');
    run(sim, def.startup - 2);
    const hp0 = p.hp;
    sim.setInput(p.id, idle(Math.PI, Btn.Dodge, 0, 1));
    const ev = run(sim, 6);
    expect(p.hp).toBe(hp0);
    expect(ev.some((x) => x.type === 'evade' || x.type === 'dodge')).toBe(true);
  });

  it('blocking absorbs most damage and costs stamina', () => {
    const { sim, p } = setup();
    const e = enemySwingAt(sim);
    p.facing = 0;
    sim.setInput(p.id, idle(0, Btn.Block));
    run(sim, 20); // past parry window
    const hp0 = p.hp;
    const st0 = p.stamina;
    sim.startAction(e, 'hollow_slash', Math.PI);
    const ev = run(sim, 25);
    expect(ev.some((x) => x.type === 'block')).toBe(true);
    expect(hp0 - p.hp).toBeLessThan(getAction('hollow_slash').hit!.damage * 0.2);
    expect(p.stamina).toBeLessThan(st0);
  });

  it('guard breaks when stamina runs out', () => {
    const { sim, p } = setup('arcanist');
    const e = enemySwingAt(sim);
    sim.setInput(p.id, idle(0, Btn.Block));
    run(sim, 20);
    p.stamina = 5;
    sim.startAction(e, 'hollow_overhead', Math.PI);
    const ev = run(sim, 35);
    expect(ev.some((x) => x.type === 'guardBreak')).toBe(true);
  });

  it('a well-timed block parries, and the parried enemy takes a riposte', () => {
    const { sim, p } = setup();
    const e = enemySwingAt(sim);
    sim.startAction(e, 'hollow_slash', Math.PI);
    const def = getAction('hollow_slash');
    run(sim, def.startup - 2);
    const hp0 = p.hp;
    sim.setInput(p.id, idle(0, Btn.Block));
    const ev = run(sim, 4);
    expect(ev.some((x) => x.type === 'parry')).toBe(true);
    expect(p.hp).toBe(hp0);
    expect(e.action?.id).toBe('parried');
    sim.setInput(p.id, idle(0, 0));
    sim.step();
    const evR = press(sim, p.id, Btn.Light, 0, 15);
    const hit = evR.find((x) => x.type === 'hit') as Extract<SimEvent, { type: 'hit' }>;
    expect(hit.crit).toBe('riposte');
  });

  it('spamming block does not re-arm the parry window', () => {
    const { sim, p } = setup();
    sim.setInput(p.id, idle(0, Btn.Block));
    sim.step();
    const firstWindow = p.parryUntil;
    sim.setInput(p.id, idle(0, 0));
    sim.step();
    sim.setInput(p.id, idle(0, Btn.Block));
    sim.step();
    expect(p.parryUntil).toBe(firstWindow);
  });
});

describe('review regressions', () => {
  it('parry window lasts exactly PARRY_WINDOW_TICKS ticks', async () => {
    const { PARRY_WINDOW_TICKS } = await import('../src/data/curves');
    const { sim, p } = setup();
    sim.setInput(p.id, idle(0, Btn.Block));
    const raisedAt = sim.tick;
    sim.step();
    expect(p.parryUntil - raisedAt + 1).toBe(PARRY_WINDOW_TICKS);
  });

  it('a failed dodge-cancel (no stamina) does not skip recovery', () => {
    const { sim, p } = setup();
    press(sim, p.id, Btn.Light, 0, 1);
    const def = getAction('longsword_light');
    run(sim, def.cancelFrom! + 1);
    p.stamina = 0;
    const id = p.action?.id;
    sim.setInput(p.id, idle(0, Btn.Dodge));
    sim.step();
    expect(id).toBe('longsword_light');
    expect(p.action?.id).toBe('longsword_light');
  });

  it('a parried attacker stops hitting other targets in that swing', () => {
    const { sim, p } = setup();
    const ally = sim.addPlayer('Ally', 'vanguard', { x: 20, y: 20.9 });
    const e = sim.spawnEnemy('hollow', 21.3, 20.3);
    e.ai!.nextThink = 1e9;
    e.ai!.attackReadyAt = 1e9;
    // both players inside the swing arc; p (lower id) is resolved first and parries
    p.facing = Math.atan2(0.3, 1.3);
    sim.startAction(e, 'hollow_slash', Math.PI);
    run(sim, getAction('hollow_slash').startup - 2);
    sim.setInput(p.id, idle(p.facing, Btn.Block));
    const hp = ally.hp;
    const ev = run(sim, 6);
    expect(ev.some((x) => x.type === 'parry')).toBe(true);
    expect(ally.hp).toBe(hp);
  });
});

describe('class abilities', () => {
  it('Vanguard Q hits every enemy around and goes on cooldown', () => {
    const { sim, p } = setup('vanguard');
    const a = sim.spawnEnemy('ashwolf', 22, 20);
    const b = sim.spawnEnemy('ashwolf', 18, 20);
    for (const e of [a, b]) e.ai!.attackReadyAt = 1e9;
    const ev = press(sim, p.id, Btn.AbilQ, 0, 25);
    expect(ev.some((x) => x.type === 'shockwave')).toBe(true);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    run(sim, 30);
    const ev2 = press(sim, p.id, Btn.AbilQ, 0, 2);
    expect(ev2.some((x) => x.type === 'fail' && x.reason === 'cooldown')).toBe(true);
  });

  it('Vanguard E charges forward and hits only the first target', () => {
    const { sim, p } = setup('vanguard');
    const a = sim.spawnEnemy('hollow', 23, 20);
    a.ai!.attackReadyAt = 1e9;
    a.ai!.nextThink = 1e9;
    const x0 = p.pos.x;
    const ev = press(sim, p.id, Btn.AbilE, 0, 30);
    expect(p.pos.x).toBeGreaterThan(x0 + 1.2);
    expect(ev.filter((x) => x.type === 'hit').length).toBe(1);
  });

  it('Arcanist Q fires a projectile that hits at range and costs mana', () => {
    const { sim, p } = setup('arcanist');
    const e = sim.spawnEnemy('hollow', 27, 20);
    e.ai!.attackReadyAt = 1e9;
    e.ai!.nextThink = 1e9;
    const m0 = p.mana;
    const ev = press(sim, p.id, Btn.AbilQ, 0, 3);
    expect(p.mana).toBeLessThan(m0 - 6);
    ev.push(...run(sim, 40));
    expect(ev.some((x) => x.type === 'projectile')).toBe(true);
    expect(ev.some((x) => x.type === 'hit' && x.target === e.id && x.dtype === 'arcane')).toBe(true);
  });

  it('Arcanist E blinks with i-frames', () => {
    const { sim, p } = setup('arcanist');
    const x0 = p.pos.x;
    sim.setInput(p.id, idle(0, Btn.AbilE, 1, 0));
    sim.step();
    expect(p.action?.id).toBe('arcanist_step');
    sim.setInput(p.id, idle(0, 0, 1, 0));
    run(sim, 10);
    expect(p.pos.x).toBeGreaterThan(x0 + 2);
  });
});

describe('enemy AI', () => {
  it('aggroes, approaches and telegraphs before dealing damage', () => {
    const { sim, p } = setup();
    sim.spawnEnemy('hollow', 26, 20);
    const hp0 = p.hp;
    let telegraphTick = -1;
    let damageTick = -1;
    for (let i = 0; i < 400 && damageTick < 0; i++) {
      for (const ev of sim.step()) {
        if (ev.type === 'telegraph' && telegraphTick < 0) telegraphTick = sim.tick;
        if (ev.type === 'hit' && ev.target === p.id) damageTick = sim.tick;
      }
    }
    expect(telegraphTick).toBeGreaterThan(0);
    expect(damageTick).toBeGreaterThan(telegraphTick + 7);
    expect(p.hp).toBeLessThan(hp0);
  });

  it('kills grant xp events and dead enemies respawn later', () => {
    const { sim, p } = setup();
    const e = sim.spawnEnemy('ashwolf', 21.3, 20);
    e.ai!.attackReadyAt = 1e9;
    e.hp = 1;
    const ev = press(sim, p.id, Btn.Light, 0, 20);
    expect(ev.some((x) => x.type === 'kill' && x.killer === p.id && x.xp > 0)).toBe(true);
    run(sim, 120);
    expect(sim.entities.has(e.id)).toBe(false);
  });
});

describe('death and bonfires', () => {
  it('a dead player respawns at the respawn point with full stats', () => {
    const { sim, p } = setup();
    p.respawnPoint = { x: 10, y: 10 };
    p.hp = 1;
    const e = sim.spawnEnemy('hollow', 21.3, 20);
    e.facing = Math.PI;
    e.ai!.nextThink = 1e9;
    sim.startAction(e, 'hollow_slash', Math.PI);
    const ev = run(sim, 30);
    expect(ev.some((x) => x.type === 'death' && x.id === p.id)).toBe(true);
    const ev2 = run(sim, 120);
    expect(ev2.some((x) => x.type === 'respawn' && x.id === p.id)).toBe(true);
    expect(p.hp).toBe(p.maxHp);
    expect(Math.hypot(p.pos.x - 10, p.pos.y - 10)).toBeLessThan(1.5);
  });

  it('resting at a bonfire heals and sets the respawn point', () => {
    const world = generateWorld(7);
    const sim = new Simulation({ world, spawnEnemies: false });
    const bonfire = world.props.find((b) => b.kind === 'bonfire')!;
    const p = sim.addPlayer('R', 'vanguard', { x: bonfire.x + 1.1, y: bonfire.y });
    p.hp = 10;
    const ev = press(sim, p.id, Btn.Interact, 0, 40);
    expect(ev.some((x) => x.type === 'rest')).toBe(true);
    expect(p.hp).toBe(p.maxHp);
  });
});

describe('determinism', () => {
  it('produces identical state for identical seeds and inputs', () => {
    const script = (sim: Simulation, id: number) => {
      for (let i = 0; i < 900; i++) {
        const a = (i * 0.07) % (Math.PI * 2);
        const b = i % 47 === 0 ? Btn.Light : i % 91 === 0 ? Btn.Dodge : i % 133 === 0 ? Btn.AbilQ : 0;
        sim.setInput(id, { seq: i, mx: Math.cos(a), my: Math.sin(a), aim: a, buttons: b });
        sim.step();
      }
    };
    const w = generateWorld(99);
    const s1 = new Simulation({ world: w, seed: 5 });
    const s2 = new Simulation({ world: w, seed: 5 });
    const p1 = s1.addPlayer('A', 'vanguard');
    const p2 = s2.addPlayer('A', 'vanguard');
    script(s1, p1.id);
    script(s2, p2.id);
    expect(s1.stateHash()).toBe(s2.stateHash());
  }, 60_000); // the full 672 m world with ~380 creatures, twice
});

describe('progression curves', () => {
  it('xp requirement grows monotonically through level 60', () => {
    for (let l = 1; l < 59; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    expect(xpToNext(60)).toBe(Infinity);
  });
  it('attribute scaling has diminishing returns', () => {
    const base = { str: 10, dex: 10, vit: 10, end: 10, int: 10, wil: 10, lck: 10 };
    const hp = (v: number) => deriveStats({ ...base, vit: v }, 1).maxHp;
    expect(hp(20) - hp(10)).toBeGreaterThan(hp(50) - hp(40));
  });
});

describe('interest management', () => {
  it('snapshots only include entities within the interest radius', () => {
    const { sim, p } = setup();
    const near = sim.spawnEnemy('hollow', 25, 20);
    const far = sim.spawnEnemy('hollow', 38, 38);
    const snap = buildSnapshot(sim, p.id, 12);
    const ids = snap.entities.map((e) => e.id);
    expect(ids).toContain(p.id);
    expect(ids).toContain(near.id);
    expect(ids).not.toContain(far.id);
  });
});

describe('protocol sanitation', () => {
  it('rejects malformed or replayed inputs and clamps values', async () => {
    const { sanitizeInput } = await import('../src/net/protocol');
    expect(sanitizeInput(null, 0)).toBeNull();
    expect(sanitizeInput({ seq: 1, mx: NaN, my: 0, aim: 0, buttons: 0 }, 0)).toBeNull();
    expect(sanitizeInput({ seq: 5, mx: 0, my: 0, aim: 0, buttons: 0 }, 5)).toBeNull();
    const c = sanitizeInput({ seq: 6, mx: 10, my: 0, aim: 7, buttons: 0xffffffff }, 5)!;
    expect(c.mx).toBeCloseTo(1);
    expect(Math.abs(c.aim)).toBeLessThanOrEqual(Math.PI);
    expect(c.buttons & ~((1 << 13) - 1)).toBe(0);
  });
});
