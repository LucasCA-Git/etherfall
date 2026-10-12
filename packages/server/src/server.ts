import { randomInt, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  DT, PROTOCOL_VERSION, ROOM_CODE_ALPHABET, ROOM_CODE_RE, Room, TICK_RATE, generateWorld, normalizeRoomCode,
  type CharacterSave, type ClientMsg, type LobbyClientMsg, type LobbyServerMsg, type ServerMsg, type WorldData,
} from '@etherfall/shared';
import { AccountStore } from './accounts';
import { staticHandler } from './http';

export interface ServerOptions {
  port: number;
  host: string;
  /** JSON file with accounts and characters (null = in memory). */
  dataFile: string | null;
  /** Built client to serve over HTTP (null = API/WebSocket only). */
  clientDir: string | null;
  seed: number;
  maxPlayers?: number;
  /** Seconds between autosaves of every connected character. */
  autosaveSeconds?: number;
  /**
   * Behind a local tunnel / reverse proxy (Cloudflare Tunnel): take the player's address from
   * CF-Connecting-IP / X-Forwarded-For when the socket comes from this machine, so per-IP limits
   * apply per player instead of to everyone at once.
   */
  trustProxy?: boolean;
  /** Extra page origins allowed to open the socket (e.g. https://abc.trycloudflare.com). */
  publicOrigins?: string[];
  log?: (msg: string) => void;
}

export interface RunningServer {
  port: number;
  store: AccountStore;
  /** The shared open world. */
  room: Room;
  /** A private co-op room by code (null when it does not exist). */
  roomByCode(code: string): Room | null;
  /** Number of private rooms currently open. */
  readonly roomCount: number;
  close(): Promise<void>;
}

interface Conn {
  id: string;
  ws: WebSocket;
  ip: string;
  user: string | null;
  save: CharacterSave | null;
  /** Room the character is playing in ('' = open world). */
  roomCode: string;
  /** Message budget (simple token bucket against floods). */
  tokens: number;
  /** Separate, much smaller budget for account/character requests. */
  lobbyTokens: number;
  last: number;
  alive: boolean;
}

const LOBBY = new Set(['register', 'login', 'chars', 'createChar', 'deleteChar', 'play']);
const MAX_MSGS_PER_SEC = 90;
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX = 10;
const LOBBY_MSGS_PER_SEC = 4;
const MAX_CONNS_PER_IP = 8;
const HEARTBEAT_MS = 30_000;
const isLoopback = (a: string | undefined): boolean => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
/** Private rooms: how many may exist at once, players per room, and how long an empty one lingers. */
const MAX_PRIVATE_ROOMS = 24;
const PRIVATE_ROOM_PLAYERS = 8;
const EMPTY_ROOM_MS = 120_000;

/**
 * Authoritative game server: one Room (the shared simulation) driven at the fixed tick rate,
 * WebSocket sessions that log in, pick a character and play, and periodic saves.
 */
export async function startServer(o: ServerOptions): Promise<RunningServer> {
  const log = o.log ?? ((m: string) => console.log(m));
  const store = await AccountStore.open(o.dataFile);
  const world = generateWorld(o.seed);
  // dead sockets are found by the heartbeat; a live player is never evicted (eviction would skip the save)
  const makeRoom = (w: WorldData, maxPlayers: number) => new Room({ world: w, allowAnonymousJoin: false, maxPlayers, idleTimeoutTicks: TICK_RATE * 60 * 60 * 24 });
  const room = makeRoom(world, o.maxPlayers ?? 32);
  /** Private co-op rooms: each is its own simulation of the same map (same seed). */
  const rooms = new Map<string, { room: Room; emptySince: number }>();
  const roomOf = (code: string): Room | null => (code ? rooms.get(code)?.room ?? null : room);
  const newCode = (): string => {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  };
  const serveStatic = o.clientDir ? staticHandler(o.clientDir) : null;
  const publicOrigins = new Set((o.publicOrigins ?? []).map((x) => { try { return new URL(x).origin; } catch { return ''; } }).filter(Boolean));
  const clientIp = (req: import('node:http').IncomingMessage): string => {
    const remote = req.socket.remoteAddress ?? '?';
    if (!o.trustProxy || !isLoopback(remote)) return remote;
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf.trim();
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) return xff.split(',')[0]!.trim();
    return remote;
  };
  const conns = new Map<string, Conn>();
  const loginAttempts = new Map<string, { count: number; reset: number }>();

  const http: Server = createServer(async (req, res) => {
    if (req.url?.startsWith('/api/info')) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      const players = room.sessionCount + [...rooms.values()].reduce((a, r) => a + r.room.sessionCount, 0);
      res.end(JSON.stringify({ game: 'ETHERFALL', online: true, version: PROTOCOL_VERSION, players, rooms: rooms.size, seed: o.seed }));
      return;
    }
    if (serveStatic && (await serveStatic(req, res))) return;
    res.writeHead(404).end();
  });
  // only pages served by this host may open the socket (blocks other sites probing passwords from a LAN browser)
  const wss = new WebSocketServer({
    server: http,
    path: '/ws',
    maxPayload: 32 * 1024,
    verifyClient: ({ req }: { req: import('node:http').IncomingMessage }) => {
      const origin = req.headers.origin;
      if (!origin) return true; // non-browser clients
      try {
        const u = new URL(origin);
        if (u.host === req.headers.host) return true;
        if (publicOrigins.has(u.origin)) return true;
        const fwd = req.headers['x-forwarded-host'];
        return !!o.trustProxy && isLoopback(req.socket.remoteAddress) && typeof fwd === 'string' && u.host === fwd.split(',')[0]!.trim();
      } catch {
        return false;
      }
    },
  });

  const send = (c: Conn, msgs: Array<ServerMsg | LobbyServerMsg>) => {
    if (msgs.length && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msgs));
  };

  const persist = (c: Conn) => {
    if (!c.user || !c.save) return;
    const next = roomOf(c.roomCode)?.exportCharacter(c.id, c.save, Date.now());
    if (next) {
      c.save = next;
      store.saveChar(c.user, next);
    }
  };

  const leaveGame = (c: Conn) => {
    persist(c);
    roomOf(c.roomCode)?.leave(c.id);
    c.save = null;
  };

  const loginAllowed = (ip: string): boolean => {
    const now = Date.now();
    const a = loginAttempts.get(ip);
    if (!a || now > a.reset) {
      loginAttempts.set(ip, { count: 1, reset: now + LOGIN_WINDOW_MS });
      return true;
    }
    a.count++;
    return a.count <= LOGIN_MAX;
  };

  async function lobby(c: Conn, m: LobbyClientMsg): Promise<void> {
    switch (m.t) {
      case 'register':
      case 'login': {
        if (!loginAllowed(c.ip)) return send(c, [{ t: 'lobbyError', message: 'Muitas tentativas. Espere um minuto.' }]);
        const r = m.t === 'register' ? await store.register(m.user, m.pass) : await store.login(m.user, m.pass);
        if (!r.ok) return send(c, [{ t: 'lobbyError', message: r.error }]);
        if (m.t === 'register') void store.flush().catch((e) => log(`save failed: ${String(e)}`)); // rate-limited per IP
        // one live session per account: the older one is closed (and saved)
        for (const other of conns.values()) {
          if (other !== c && other.user?.toLowerCase() === r.value.toLowerCase()) {
            send(other, [{ t: 'kicked', message: 'Sua conta entrou em outro lugar.' }]);
            leaveGame(other);
            other.user = null;
            other.ws.close(4001, 'logged in elsewhere');
          }
        }
        if (c.save) leaveGame(c);
        c.user = r.value;
        return send(c, [{ t: 'auth', user: r.value, chars: store.listChars(r.value) }]);
      }
      case 'chars':
        if (!c.user) return send(c, [{ t: 'lobbyError', message: 'Faça login primeiro' }]);
        return send(c, [{ t: 'chars', chars: store.listChars(c.user) }]);
      case 'createChar': {
        if (!c.user) return send(c, [{ t: 'lobbyError', message: 'Faça login primeiro' }]);
        const r = store.createChar(c.user, m.name, m.classId);
        if (!r.ok) return send(c, [{ t: 'lobbyError', message: r.error }]);
        return send(c, [{ t: 'chars', chars: r.value }]); // written by the autosave
      }
      case 'deleteChar': {
        if (!c.user) return send(c, [{ t: 'lobbyError', message: 'Faça login primeiro' }]);
        if (c.save?.id === m.id) return send(c, [{ t: 'lobbyError', message: 'Saia do jogo antes de excluir esse personagem' }]);
        const r = store.deleteChar(c.user, String(m.id));
        if (!r.ok) return send(c, [{ t: 'lobbyError', message: r.error }]);
        return send(c, [{ t: 'chars', chars: r.value }]); // written by the autosave
      }
      case 'play': {
        if (!c.user) return send(c, [{ t: 'lobbyError', message: 'Faça login primeiro' }]);
        if (c.save) return send(c, [{ t: 'lobbyError', message: 'Você já está no jogo' }]);
        const save = store.getChar(c.user, String(m.id));
        if (!save) return send(c, [{ t: 'lobbyError', message: 'Personagem não encontrado' }]);
        let code = '';
        let target = room;
        if (m.create === true) {
          if (rooms.size >= MAX_PRIVATE_ROOMS) return send(c, [{ t: 'lobbyError', message: 'O servidor atingiu o limite de salas. Tente mais tarde.' }]);
          code = newCode();
          target = makeRoom(world, PRIVATE_ROOM_PLAYERS);
          rooms.set(code, { room: target, emptySince: Date.now() });
          log(`${c.user} criou a sala ${code}`);
        } else if (m.room !== undefined && m.room !== '') {
          code = normalizeRoomCode(m.room);
          const found = ROOM_CODE_RE.test(code) ? rooms.get(code) : undefined;
          if (!found) return send(c, [{ t: 'lobbyError', message: 'Sala não encontrada. Confira o código.' }]);
          target = found.room;
        }
        const out = target.joinCharacter(c.id, save);
        if (out.some((x) => x.t === 'welcome')) {
          c.save = save;
          c.roomCode = code;
          log(`${c.user} entrou com ${save.name} (${save.classId} nv ${save.level})${code ? ` na sala ${code}` : ''}`);
          return send(c, [...out, { t: 'room', code, players: target.sessionCount }]);
        }
        return send(c, out);
      }
    }
  }

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    if ([...conns.values()].filter((x) => x.ip === ip).length >= MAX_CONNS_PER_IP) {
      ws.close(1013, 'too many connections');
      return;
    }
    const c: Conn = { id: randomUUID(), ws, ip, user: null, save: null, roomCode: '', tokens: MAX_MSGS_PER_SEC, lobbyTokens: LOBBY_MSGS_PER_SEC, last: Date.now(), alive: true };
    conns.set(c.id, c);
    ws.on('pong', () => (c.alive = true));
    ws.on('message', (data, isBinary) => {
      // token bucket: refill per second, drop the excess
      const now = Date.now();
      c.tokens = Math.min(MAX_MSGS_PER_SEC, c.tokens + ((now - c.last) / 1000) * MAX_MSGS_PER_SEC);
      c.lobbyTokens = Math.min(LOBBY_MSGS_PER_SEC, c.lobbyTokens + ((now - c.last) / 1000) * LOBBY_MSGS_PER_SEC);
      c.last = now;
      if (c.tokens < 1) return;
      c.tokens -= 1;
      if (isBinary) return;
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return send(c, [{ t: 'error', code: 'malformed', message: 'JSON inválido' }]);
      }
      if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return;
      const t = (msg as { t?: unknown }).t;
      if (typeof t === 'string' && LOBBY.has(t)) {
        if (c.lobbyTokens < 1) return send(c, [{ t: 'lobbyError', message: 'Devagar: muitas solicitações.' }]);
        c.lobbyTokens -= 1;
        lobby(c, msg as LobbyClientMsg).catch((e) => log(`lobby error: ${String(e)}`));
        return;
      }
      if (!c.save) return send(c, [{ t: 'error', code: 'auth', message: 'Entre com um personagem primeiro' }]);
      const r = roomOf(c.roomCode);
      if (r) send(c, r.handle(c.id, msg as ClientMsg));
    });
    ws.on('close', () => {
      if (c.save) leaveGame(c);
      else room.leave(c.id); // also forgets a bare 'hello'
      conns.delete(c.id);
      void store.flush().catch((e) => log(`save failed: ${String(e)}`));
    });
    ws.on('error', () => ws.close());
  });

  // fixed-rate authoritative loop (catches up after hiccups, never spirals)
  let acc = 0;
  let last = performance.now();
  let lastSave = last;
  const autosave = (o.autosaveSeconds ?? 10) * 1000;
  const loop = setInterval(() => {
    const now = performance.now();
    acc = Math.min(acc + (now - last) / 1000, DT * 5);
    last = now;
    while (acc >= DT) {
      acc -= DT;
      for (const r of [room, ...[...rooms.values()].map((x) => x.room)]) {
        for (const [id, msgs] of r.tick()) {
          const c = conns.get(id);
          if (c) send(c, msgs);
        }
      }
    }
    // private rooms that stayed empty for a while are closed
    const wallNow = Date.now();
    for (const [code, r] of rooms) {
      if (r.room.sessionCount > 0) r.emptySince = wallNow;
      else if (wallNow - r.emptySince > EMPTY_ROOM_MS) {
        rooms.delete(code);
        log(`sala ${code} fechada (vazia)`);
      }
    }
    if (now - lastSave >= autosave) {
      lastSave = now;
      const wall = Date.now();
      for (const [ip, a] of loginAttempts) if (wall > a.reset) loginAttempts.delete(ip);
      for (const c of conns.values()) persist(c);
      void store.flush().catch((e) => log(`save failed: ${String(e)}`));
    }
  }, 1000 / 60);

  // heartbeat: drop half-open sockets (their character is saved on close)
  const heartbeat = setInterval(() => {
    for (const c of conns.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, HEARTBEAT_MS);

  await new Promise<void>((res) => http.listen(o.port, o.host, res));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    store,
    room,
    roomByCode: (code: string) => rooms.get(code)?.room ?? null,
    get roomCount() {
      return rooms.size;
    },
    async close() {
      clearInterval(loop);
      clearInterval(heartbeat);
      for (const c of conns.values()) {
        if (c.save) leaveGame(c);
        c.ws.close(1001, 'server shutting down');
      }
      await store.flush();
      wss.close();
      await new Promise<void>((res) => http.close(() => res()));
    },
  };
}
