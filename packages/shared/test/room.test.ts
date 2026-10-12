import { describe, expect, it } from 'vitest';
import { Room } from '../src/net/room';
import { generateWorld } from '../src/world/worldgen';
import { Btn } from '../src/sim/types';
import type { ServerMsg } from '../src/net/protocol';

const world = generateWorld(2026);

function join(room: Room, sid: string, name: string, classId: 'vanguard' | 'arcanist') {
  room.handle(sid, { t: 'hello', version: 1 });
  return room.handle(sid, { t: 'join', name, classId });
}

function snapOf(msgs: ServerMsg[] | undefined) {
  const m = msgs?.find((x) => x.t === 'snapshot');
  if (!m || m.t !== 'snapshot') throw new Error('no snapshot');
  return m.snap;
}

describe('Room (authoritative multiplayer core)', () => {
  it('lets two sessions join and see each other', () => {
    const room = new Room({ world });
    const w1 = join(room, 'a', 'Ana', 'vanguard');
    const w2 = join(room, 'b', 'Bruno', 'arcanist');
    expect(w1[0]?.t).toBe('welcome');
    expect(w2[0]?.t).toBe('welcome');
    const out = room.tick();
    const sa = snapOf(out.get('a'));
    const sb = snapOf(out.get('b'));
    const idB = w2[0]!.t === 'welcome' ? w2[0]!.playerId : -1;
    const idA = w1[0]!.t === 'welcome' ? w1[0]!.playerId : -1;
    expect(sa.entities.some((e) => e.id === idB && e.classId === 'arcanist')).toBe(true);
    expect(sb.entities.some((e) => e.id === idA && e.name === 'Ana')).toBe(true);
  });

  it('moves players only through validated inputs', () => {
    const room = new Room({ world });
    const w = join(room, 'a', 'Ana', 'vanguard')[0]!;
    const id = w.t === 'welcome' ? w.playerId : -1;
    const p = room.sim.entities.get(id)!;
    const x0 = p.pos.x;
    for (let i = 0; i < 30; i++) {
      room.handle('a', { t: 'input', cmds: [{ seq: i, mx: 100, my: 0, aim: 0, buttons: 0 }] });
      room.tick();
    }
    const moved = p.pos.x - x0;
    expect(moved).toBeGreaterThan(2);
    // clamped to class speed: ~4.1 m/s * 1s (+ small tolerance), never 100x
    expect(moved).toBeLessThan(5);
  });

  it('ignores replayed input sequence numbers', () => {
    const room = new Room({ world });
    const w = join(room, 'a', 'Ana', 'vanguard')[0]!;
    const id = w.t === 'welcome' ? w.playerId : -1;
    room.handle('a', { t: 'input', cmds: [{ seq: 5, mx: 0, my: 0, aim: 0, buttons: Btn.Light }] });
    room.tick();
    const st = room.sim.entities.get(id)!.stamina;
    // replay the same seq: must be dropped (no second attack / stamina drain from it)
    room.handle('a', { t: 'input', cmds: [{ seq: 5, mx: 0, my: 0, aim: 0, buttons: 0 }, { seq: 5, mx: 0, my: 0, aim: 0, buttons: Btn.Light }] });
    room.tick();
    expect(room.sim.entities.get(id)!.stamina).toBeLessThanOrEqual(st);
    expect(room.sim.entities.get(id)!.action?.id).toBe('longsword_light');
  });

  it('removes the player when a session leaves', () => {
    const room = new Room({ world });
    const w = join(room, 'a', 'Ana', 'vanguard')[0]!;
    const id = w.t === 'welcome' ? w.playerId : -1;
    room.leave('a');
    expect(room.sim.entities.has(id)).toBe(false);
    expect(room.sessionCount).toBe(0);
  });

  it('sanitizes player names', () => {
    const room = new Room({ world });
    const w = join(room, 'a', '<script>alert(1)</script>Muito-Longo-Nome-Aqui', 'vanguard')[0]!;
    const id = w.t === 'welcome' ? w.playerId : -1;
    const name = room.sim.entities.get(id)!.name;
    expect(name).not.toMatch(/[<>()]/);
    expect(name.length).toBeLessThanOrEqual(16);
  });

  it('rejects non-object messages without throwing', () => {
    const room = new Room({ world });
    for (const bad of [null, 5, 'x', undefined, [], { t: 42 }]) {
      expect(() => room.handle('z', bad as never)).not.toThrow();
    }
  });

  it('requires hello with the right protocol version before join', () => {
    const room = new Room({ world });
    expect(room.handle('a', { t: 'join', name: 'A', classId: 'vanguard' })[0]?.t).toBe('error');
    room.handle('b', { t: 'hello', version: 999 });
    expect(room.handle('b', { t: 'join', name: 'B', classId: 'vanguard' })[0]?.t).toBe('error');
    expect(join(room, 'c', 'C', 'vanguard')[0]?.t).toBe('welcome');
  });

  it('caps the number of players', () => {
    const room = new Room({ world, maxPlayers: 2 });
    expect(join(room, 'a', 'A', 'vanguard')[0]?.t).toBe('welcome');
    expect(join(room, 'b', 'B', 'vanguard')[0]?.t).toBe('welcome');
    const third = join(room, 'c', 'C', 'vanguard')[0]!;
    expect(third.t === 'error' && third.code).toBe('full');
  });

  it('stops replaying held input when a client goes silent, and evicts idle sessions', () => {
    const room = new Room({ world, idleTimeoutTicks: 60 });
    const w = join(room, 'a', 'A', 'vanguard')[0]!;
    const id = w.t === 'welcome' ? w.playerId : -1;
    room.handle('a', { t: 'input', cmds: [{ seq: 1, mx: 1, my: 0, aim: 0, buttons: 0 }] });
    for (let i = 0; i < 20; i++) room.tick();
    const p = room.sim.entities.get(id)!;
    const x = p.pos.x;
    for (let i = 0; i < 10; i++) room.tick();
    expect(Math.abs(p.pos.x - x)).toBeLessThan(0.05);
    for (let i = 0; i < 60; i++) room.tick();
    expect(room.sessionCount).toBe(0);
    expect(room.sim.entities.has(id)).toBe(false);
  });

  it('acks the last applied input, and keeps press edges of overflowed inputs', () => {
    const room = new Room({ world, maxQueued: 2 });
    const w = join(room, 'a', 'A', 'vanguard')[0]!;
    const id = w.t === 'welcome' ? w.playerId : -1;
    room.handle('a', { t: 'input', cmds: [
      { seq: 1, mx: 0, my: 0, aim: 0, buttons: Btn.Light },
      { seq: 2, mx: 0, my: 0, aim: 0, buttons: 0 },
      { seq: 3, mx: 0, my: 0, aim: 0, buttons: 0 },
    ] });
    const out = room.tick().get('a')!;
    const snap = out.find((m) => m.t === 'snapshot')!;
    expect(snap.t === 'snapshot' && snap.ackSeq).toBe(2);
    expect(room.sim.entities.get(id)!.action?.id).toBe('longsword_light');
  });

  it('delivers projectile impact events to nearby viewers', () => {
    const room = new Room({ world });
    const w = join(room, 'a', 'A', 'arcanist')[0]!;
    const id = w.t === 'welcome' ? w.playerId : -1;
    room.handle('a', { t: 'input', cmds: [{ seq: 1, mx: 0, my: 0, aim: 0, buttons: Btn.AbilQ }] });
    let seen = false;
    for (let i = 0; i < 60 && !seen; i++) {
      room.handle('a', { t: 'input', cmds: [{ seq: 2 + i, mx: 0, my: 0, aim: 0, buttons: 0 }] });
      const ev = room.tick().get('a')!.find((m) => m.t === 'events');
      if (ev && ev.t === 'events' && ev.events.some((e) => e.type === 'projectileEnd')) seen = true;
    }
    expect(id).toBeGreaterThan(0);
    expect(seen).toBe(true);
  });
});
