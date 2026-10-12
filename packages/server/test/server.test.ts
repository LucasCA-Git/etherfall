import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { validateSave, newCharacter, DT } from '@etherfall/shared';
import { AccountStore } from '../src/accounts';
import { startServer, type RunningServer } from '../src/server';

type Msg = { t: string; [k: string]: unknown };

/** Minimal test client: collects every message the server sends. */
class Client {
  ws: WebSocket;
  inbox: Msg[] = [];
  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on('message', (d) => this.inbox.push(...(JSON.parse(String(d)) as Msg[])));
  }
  open(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
  }
  send(m: object): void {
    this.ws.send(JSON.stringify(m));
  }
  async wait(t: string, ms = 4000): Promise<Msg> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = this.inbox.findIndex((m) => m.t === t);
      if (i >= 0) return this.inbox.splice(i, 1)[0]!;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`timeout waiting for ${t}; got ${this.inbox.map((m) => m.t).join(',')}`);
  }
  close(): Promise<void> {
    return new Promise((res) => {
      this.ws.once('close', () => res());
      this.ws.close();
    });
  }
}

describe('AccountStore', () => {
  it('registers, rejects duplicates and wrong passwords, never stores the password', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ef-'));
    const file = join(dir, 'acc.json');
    const s = await AccountStore.open(file);
    expect((await s.register('lucas', 'segredo123')).ok).toBe(true);
    expect((await s.register('LUCAS', 'outra-senha')).ok).toBe(false);
    expect((await s.register('x', 'segredo123')).ok).toBe(false);
    expect((await s.register('ana', '123')).ok).toBe(false);
    expect((await s.login('lucas', 'segredo123')).ok).toBe(true);
    expect((await s.login('Lucas', 'segredo123')).ok).toBe(true);
    expect((await s.login('lucas', 'errada')).ok).toBe(false);
    expect((await s.login('ninguem', 'segredo123')).ok).toBe(false);
    await s.flush();
    const raw = await readFile(file, 'utf8');
    expect(raw).not.toContain('segredo123');
    const again = await AccountStore.open(file);
    expect((await again.login('lucas', 'segredo123')).ok).toBe(true);
    await rm(dir, { recursive: true });
  });

  it('usernames that look like object internals are ordinary accounts', async () => {
    const s = await AccountStore.open(null);
    expect((await s.login('__proto__', 'segredo123')).ok).toBe(false);
    expect((await s.register('__proto__', 'segredo123')).ok).toBe(true);
    expect((await s.login('__proto__', 'segredo123')).ok).toBe(true);
    expect((await s.register('constructor', 'segredo123')).ok).toBe(true);
    expect(s.accountCount).toBe(2);
  });

  it('characters: create with validation, unique names, per-account cap, delete', async () => {
    const s = await AccountStore.open(null);
    await s.register('lucas', 'segredo123');
    await s.register('ana', 'segredo123');
    expect(s.createChar('lucas', 'Arthas', 'vanguard').ok).toBe(true);
    expect(s.createChar('ana', 'arthas', 'rogue').ok).toBe(false); // name taken (case-insensitive)
    expect(s.createChar('lucas', 'Zed', 'necromancer').ok).toBe(false); // unknown class
    for (let i = 0; i < 5; i++) expect(s.createChar('lucas', `Heroi ${i}`, 'warlock').ok).toBe(true);
    expect(s.createChar('lucas', 'Excesso', 'healer').ok).toBe(false);
    const id = s.listChars('lucas')[0]!.id;
    expect(s.deleteChar('ana', id).ok).toBe(false); // not yours
    expect(s.deleteChar('lucas', id).ok).toBe(true);
    expect(s.listChars('lucas').length).toBe(5);
  });
});

describe('validateSave', () => {
  it('clamps tampered saves: impossible attributes, foreign talents, early subclass', () => {
    const c = newCharacter('x', 'Trapaça', 'vanguard', 0);
    const evil = { ...c, level: 3, attrs: { ...c.attrs, str: 99 }, talents: { 'vg.b1': 3, 'ar.g1': 1, 'vg.l2': 1 }, subclass: 'paladin' };
    const v = validateSave(evil)!;
    expect(v.attrs.str).toBe(c.attrs.str); // refunded
    expect(v.unspent).toBe(6);
    expect(Object.values(v.talents).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2);
    expect(v.talents['ar.g1']).toBeUndefined();
    expect(v.talents['vg.l2']).toBeUndefined(); // requires vg.l1
    expect(v.subclass).toBeNull();
  });
});

describe('online server', () => {
  let srv: RunningServer | null = null;
  afterEach(async () => {
    await srv?.close();
    srv = null;
  });

  it('login → create character → play → move → reconnect resumes where you left', async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', dataFile: null, clientDir: null, seed: 20261012, autosaveSeconds: 1, log: () => {} });
    const a = new Client(srv.port);
    await a.open();
    a.send({ t: 'play', id: 'nope' });
    expect((await a.wait('lobbyError')).message).toMatch(/login/i);
    a.send({ t: 'input', cmds: [] });
    expect((await a.wait('error')).code).toBe('auth');
    a.send({ t: 'register', user: 'lucas', pass: 'segredo123' });
    await a.wait('auth');
    a.send({ t: 'createChar', name: 'Morgana', classId: 'warlock' });
    const chars = (await a.wait('chars')).chars as Array<{ id: string; name: string }>;
    expect(chars.map((c) => c.name)).toEqual(['Morgana']);
    a.send({ t: 'play', id: chars[0]!.id });
    const welcome = await a.wait('welcome');
    const snap0 = (await a.wait('snapshot')).snap as { entities: Array<{ id: number; x: number; classId?: string }> };
    const me0 = snap0.entities.find((e) => e.id === welcome.playerId)!;
    expect(me0.classId).toBe('warlock');
    // walk right for ~1 s of game time
    for (let i = 0; i < 30; i++) {
      a.send({ t: 'input', cmds: [{ seq: i, mx: 1, my: 0, aim: 0, buttons: 0 }] });
      await new Promise((r) => setTimeout(r, DT * 1000));
    }
    await new Promise((r) => setTimeout(r, 200));
    const me1 = (srv.room.sim.entities.get(welcome.playerId as number))!;
    expect(me1.pos.x).toBeGreaterThan(me0.x + 1.5);
    const xBefore = me1.pos.x;
    await a.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(srv.room.sessionCount).toBe(0);

    const b = new Client(srv.port);
    await b.open();
    b.send({ t: 'login', user: 'lucas', pass: 'errada' });
    await b.wait('lobbyError');
    b.send({ t: 'login', user: 'lucas', pass: 'segredo123' });
    const auth = await b.wait('auth');
    const id = (auth.chars as Array<{ id: string }>)[0]!.id;
    b.send({ t: 'play', id });
    const w2 = await b.wait('welcome');
    const me2 = srv.room.sim.entities.get(w2.playerId as number)!;
    expect(Math.abs(me2.pos.x - xBefore)).toBeLessThan(0.6);
    await b.close();
  });

  it('a second login to the same account kicks the first session', async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', dataFile: null, clientDir: null, seed: 20261012, log: () => {} });
    const a = new Client(srv.port);
    await a.open();
    a.send({ t: 'register', user: 'duplo', pass: 'segredo123' });
    await a.wait('auth');
    const b = new Client(srv.port);
    await b.open();
    b.send({ t: 'login', user: 'duplo', pass: 'segredo123' });
    await b.wait('auth');
    expect((await a.wait('kicked')).message).toMatch(/outro lugar/);
    await b.close();
  });

  it('co-op rooms: create a private room, a friend joins by code, the open world is separate', async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', dataFile: null, clientDir: null, seed: 20261012, log: () => {} });
    const host = new Client(srv.port);
    await host.open();
    host.send({ t: 'register', user: 'anfitriao', pass: 'segredo123' });
    await host.wait('auth');
    host.send({ t: 'createChar', name: 'Ayla', classId: 'healer' });
    const hc = (await host.wait('chars')).chars as Array<{ id: string }>;
    host.send({ t: 'play', id: hc[0]!.id, create: true });
    const hw = await host.wait('welcome');
    const code = (await host.wait('room')).code as string;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(srv.roomCount).toBe(1);
    expect(srv.room.sessionCount).toBe(0); // not in the open world

    const friend = new Client(srv.port);
    await friend.open();
    friend.send({ t: 'register', user: 'amigo', pass: 'segredo123' });
    await friend.wait('auth');
    friend.send({ t: 'createChar', name: 'Borin', classId: 'barbarian' });
    const fc = (await friend.wait('chars')).chars as Array<{ id: string }>;
    friend.send({ t: 'play', id: fc[0]!.id, room: 'ZZZZZ' });
    expect((await friend.wait('lobbyError')).message).toMatch(/Sala não encontrada/);
    friend.send({ t: 'play', id: fc[0]!.id, room: ` ${code.toLowerCase()} ` });
    const fw = await friend.wait('welcome');
    expect((await friend.wait('room')).code).toBe(code);
    const r = srv.roomByCode(code)!;
    expect(r.sessionCount).toBe(2);
    // both players exist in the same simulation, so each sees the other
    expect(r.sim.entities.get(hw.playerId as number)).toBeTruthy();
    expect(r.sim.entities.get(fw.playerId as number)).toBeTruthy();
    const snap = (await friend.wait('snapshot')).snap as { entities: Array<{ id: number }> };
    expect(snap.entities.some((e) => e.id === hw.playerId)).toBe(true);
    await host.close();
    await friend.close();
  });

  it('behind a tunnel: public origin allowed, foreign origin refused, limits per real client IP', async () => {
    srv = await startServer({
      port: 0, host: '127.0.0.1', dataFile: null, clientDir: null, seed: 20261012, log: () => {},
      trustProxy: true, publicOrigins: ['https://abc-def.trycloudflare.com'],
    });
    const port = srv.port;
    const open = (headers: Record<string, string>) =>
      new Promise<WebSocket | null>((res) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
        ws.once('open', () => res(ws));
        ws.once('error', () => res(null));
        ws.once('close', () => res(null));
      });
    const ok = await open({ origin: 'https://abc-def.trycloudflare.com', 'cf-connecting-ip': '203.0.113.1' });
    expect(ok).not.toBeNull();
    ok!.close();
    expect(await open({ origin: 'https://evil.example', 'cf-connecting-ip': '203.0.113.2' })).toBeNull();
    // 10 players through the same tunnel (all from 127.0.0.1) are not capped as one IP
    const many: WebSocket[] = [];
    for (let i = 0; i < 10; i++) {
      const ws = await open({ origin: 'https://abc-def.trycloudflare.com', 'cf-connecting-ip': `198.51.100.${i + 1}` });
      expect(ws).not.toBeNull();
      many.push(ws!);
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(many.every((ws) => ws.readyState === WebSocket.OPEN)).toBe(true);
    for (const ws of many) ws.close();
  });

  it('without trustProxy, connections through one local address are capped (control for the test above)', async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', dataFile: null, clientDir: null, seed: 20261012, log: () => {} });
    const many: WebSocket[] = [];
    for (let i = 0; i < 10; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, { headers: { 'cf-connecting-ip': `198.51.100.${i + 1}` } });
      ws.on('error', () => {});
      many.push(ws);
    }
    await new Promise((r) => setTimeout(r, 300));
    expect(many.filter((ws) => ws.readyState === WebSocket.OPEN).length).toBe(8);
    for (const ws of many) ws.close();
  });
});
