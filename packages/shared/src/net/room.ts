import { CLASSES } from '../data/classes';
import type { ClassId, InputCommand, SimEvent } from '../sim/types';
import { TICK_RATE } from '../sim/types';
import { Simulation } from '../sim/simulation';
import type { WorldData } from '../world/worldgen';
import { PROTOCOL_VERSION, sanitizeInput, type ClientMsg, type ServerMsg } from './protocol';
import { buildSnapshot } from './snapshot';
import { exportCharacter, type CharacterSave } from './save';

interface Session {
  id: string;
  playerId: number;
  /** Highest seq accepted into the queue (replay protection). */
  lastSeq: number;
  /** Highest seq actually applied to the simulation (what we ack). */
  appliedSeq: number;
  queue: InputCommand[];
  last: InputCommand | null;
  lastInputTick: number;
}

export interface RoomOptions {
  world: WorldData;
  interestRadius?: number;
  maxQueued?: number;
  maxPlayers?: number;
  /** After this many ticks without inputs the session is evicted (disconnect detection). */
  idleTimeoutTicks?: number;
  /** Accept the anonymous `join` message (local play). Servers with accounts turn it off. */
  allowAnonymousJoin?: boolean;
}

const MAX_NAME = 16;
/** Without fresh input for this long, held buttons/movement are released. */
const STALE_INPUT_TICKS = 15;
const NEUTRAL = { mx: 0, my: 0, buttons: 0 };

/**
 * Authoritative room: owns a Simulation and the sessions connected to it.
 * Transport-agnostic — LocalTransport calls it in-process today; the WebSocket
 * server (Etapa 5) will call exactly these methods.
 */
export class Room {
  readonly sim: Simulation;
  private sessions = new Map<string, Session>();
  private greeted = new Set<string>();
  private readonly interest: number;
  private readonly maxQueued: number;
  private readonly maxPlayers: number;
  private readonly idleTimeout: number;
  private readonly allowJoin: boolean;

  constructor(opts: RoomOptions) {
    this.sim = new Simulation({ world: opts.world });
    this.interest = opts.interestRadius ?? 36;
    this.maxQueued = opts.maxQueued ?? 8;
    this.maxPlayers = opts.maxPlayers ?? 16;
    this.idleTimeout = opts.idleTimeoutTicks ?? TICK_RATE * 120;
    this.allowJoin = opts.allowAnonymousJoin ?? true;
  }

  /** Trusted entry for authenticated servers / offline saves: spawn a saved character for a session. */
  joinCharacter(sessionId: string, save: CharacterSave): ServerMsg[] {
    if (this.sessions.has(sessionId)) return [{ t: 'error', code: 'joined', message: 'Session already joined' }];
    if (this.sessions.size >= this.maxPlayers) return [{ t: 'error', code: 'full', message: 'Servidor cheio' }];
    this.greeted.add(sessionId);
    const p = this.sim.addPlayerFromSave(save);
    this.sessions.set(sessionId, { id: sessionId, playerId: p.id, lastSeq: -1, appliedSeq: -1, queue: [], last: null, lastInputTick: this.sim.tick });
    return [{ t: 'welcome', playerId: p.id, tick: this.sim.tick, seed: this.sim.world.seed, tickRate: TICK_RATE, version: PROTOCOL_VERSION }];
  }

  /** Current state of a session's character, merged into its previous save record. */
  exportCharacter(sessionId: string, prev: CharacterSave, now: number): CharacterSave | null {
    const s = this.sessions.get(sessionId);
    const e = s ? this.sim.entities.get(s.playerId) : undefined;
    return e ? exportCharacter(e, prev, now) : null;
  }

  /** Player entity id of a session (or -1). */
  playerOf(sessionId: string): number {
    return this.sessions.get(sessionId)?.playerId ?? -1;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Handle one untrusted client message. Never throws on malformed input. */
  handle(sessionId: string, raw: ClientMsg): ServerMsg[] {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [{ t: 'error', code: 'malformed', message: 'Message must be an object' }];
    const msg = raw as ClientMsg;
    switch (msg.t) {
      case 'hello':
        if (msg.version !== PROTOCOL_VERSION) return [{ t: 'error', code: 'version', message: `Protocol ${PROTOCOL_VERSION} required` }];
        this.greeted.add(sessionId);
        return [];
      case 'join': {
        if (!this.greeted.has(sessionId)) return [{ t: 'error', code: 'hello', message: 'Send hello first' }];
        if (!this.allowJoin) return [{ t: 'error', code: 'auth', message: 'Faça login para jogar' }];
        if (this.sessions.has(sessionId)) return [{ t: 'error', code: 'joined', message: 'Session already joined' }];
        if (this.sessions.size >= this.maxPlayers) return [{ t: 'error', code: 'full', message: 'Room is full' }];
        const classId: ClassId = Object.prototype.hasOwnProperty.call(CLASSES, msg.classId) ? msg.classId : 'vanguard';
        const rawName = typeof msg.name === 'string' ? msg.name : '';
        const name = rawName.replace(/[^\p{L}\p{N}_ -]/gu, '').trim().slice(0, MAX_NAME) || 'Errante';
        const p = this.sim.addPlayer(name, classId);
        this.sessions.set(sessionId, { id: sessionId, playerId: p.id, lastSeq: -1, appliedSeq: -1, queue: [], last: null, lastInputTick: this.sim.tick });
        return [{ t: 'welcome', playerId: p.id, tick: this.sim.tick, seed: this.sim.world.seed, tickRate: TICK_RATE, version: PROTOCOL_VERSION }];
      }
      case 'input': {
        const s = this.sessions.get(sessionId);
        if (!s || !Array.isArray(msg.cmds)) return [];
        for (const rawCmd of msg.cmds.slice(0, this.maxQueued * 2)) {
          const cmd = sanitizeInput(rawCmd, s.lastSeq);
          if (!cmd) continue;
          s.lastSeq = cmd.seq;
          s.queue.push(cmd);
          s.lastInputTick = this.sim.tick;
        }
        // Overflow: drop the oldest commands but keep their button presses so no press edge is lost.
        while (s.queue.length > this.maxQueued) {
          const dropped = s.queue.shift()!;
          s.queue[0]!.buttons |= dropped.buttons;
        }
        return [];
      }
      case 'allocate': {
        const s = this.sessions.get(sessionId);
        if (!s) return [{ t: 'error', code: 'join', message: 'Join first' }];
        return this.sim.allocate(s.playerId, msg.attr) ? [] : [{ t: 'error', code: 'allocate', message: 'Invalid attribute or no points' }];
      }
      case 'talent': {
        const s = this.sessions.get(sessionId);
        if (!s) return [{ t: 'error', code: 'join', message: 'Join first' }];
        return typeof msg.node === 'string' && this.sim.allocateTalent(s.playerId, msg.node) ? [] : [{ t: 'error', code: 'talent', message: 'Talento indisponível' }];
      }
      case 'subclass': {
        const s = this.sessions.get(sessionId);
        if (!s) return [{ t: 'error', code: 'join', message: 'Join first' }];
        return typeof msg.id === 'string' && this.sim.chooseSubclass(s.playerId, msg.id) ? [] : [{ t: 'error', code: 'subclass', message: 'Subclasse indisponível' }];
      }
      case 'respec': {
        const s = this.sessions.get(sessionId);
        if (!s) return [{ t: 'error', code: 'join', message: 'Join first' }];
        return this.sim.respec(s.playerId) ? [] : [{ t: 'error', code: 'respec', message: 'Sente-se numa fogueira para redistribuir os pontos' }];
      }
      case 'ping':
        return typeof msg.time === 'number' ? [{ t: 'pong', time: msg.time }] : [];
      default:
        return [{ t: 'error', code: 'unknown', message: 'Unknown message' }];
    }
  }

  leave(sessionId: string): void {
    this.greeted.delete(sessionId);
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sim.removeEntity(s.playerId);
    this.sessions.delete(sessionId);
  }

  /** Advance one authoritative tick and produce per-session outbound messages. */
  tick(): Map<string, ServerMsg[]> {
    for (const s of [...this.sessions.values()]) {
      if (this.sim.tick - s.lastInputTick > this.idleTimeout) {
        this.leave(s.id);
        continue;
      }
      let cmd = s.queue.shift();
      if (cmd) s.appliedSeq = cmd.seq;
      else if (s.last) cmd = this.sim.tick - s.lastInputTick > STALE_INPUT_TICKS ? { ...s.last, ...NEUTRAL } : s.last;
      if (cmd) {
        this.sim.setInput(s.playerId, cmd);
        s.last = cmd;
      }
    }
    const events = this.sim.step();
    const out = new Map<string, ServerMsg[]>();
    for (const s of this.sessions.values()) {
      const snap = buildSnapshot(this.sim, s.playerId, this.interest);
      const me = this.sim.entities.get(s.playerId);
      const evs = me ? events.filter((e) => relevant(e, me.id, me.pos.x, me.pos.y, this.interest)) : [];
      out.set(s.id, [
        { t: 'snapshot', snap, ackSeq: s.appliedSeq },
        { t: 'events', tick: this.sim.tick, events: evs },
      ]);
    }
    return out;
  }
}

/** Interest filter for events: anything that involves the viewer or happens within its radius. */
function relevant(e: SimEvent, me: number, x: number, y: number, radius: number): boolean {
  const r = e as unknown as Record<string, unknown>;
  for (const k of ['id', 'attacker', 'target', 'killer', 'victim', 'ownerId']) if (r[k] === me) return true;
  if (typeof r.x === 'number' && typeof r.y === 'number') return (r.x - x) ** 2 + (r.y - y) ** 2 <= radius * radius;
  return false;
}
