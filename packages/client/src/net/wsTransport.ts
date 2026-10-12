import { DT, TICK_RATE, type ClientMsg, type InputCommand, type LobbyClientMsg, type LobbyServerMsg, type ServerMsg, type SimEvent, type Snapshot, type WorldData } from '@etherfall/shared';
import type { Transport } from './localTransport';

export type AnyServerMsg = ServerMsg | LobbyServerMsg;

/** One WebSocket to the game server; every frame from the server is a JSON array of messages. */
export class Connection {
  private listeners = new Set<(msgs: AnyServerMsg[]) => void>();
  private closeListeners = new Set<(reason: string) => void>();
  closed = false;

  private constructor(private ws: WebSocket) {
    ws.addEventListener('message', (ev) => {
      let msgs: unknown;
      try {
        msgs = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!Array.isArray(msgs)) return;
      for (const l of this.listeners) l(msgs as AnyServerMsg[]);
    });
    ws.addEventListener('close', (ev) => {
      this.closed = true;
      for (const l of this.closeListeners) l(ev.reason || 'Conexão encerrada');
    });
  }

  /**
   * ws://host/ws of the server that served this page. `?server=host:port` is honored only in
   * development builds: a crafted link must never send someone's password to another host.
   */
  static url(): string {
    const q = import.meta.env.DEV ? new URLSearchParams(location.search).get('server') : null;
    if (q) return q.startsWith('ws') ? q : `ws://${q}/ws`;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  static open(url = Connection.url()): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const fail = () => reject(new Error('Servidor indisponível'));
      ws.addEventListener('error', fail, { once: true });
      ws.addEventListener('open', () => {
        ws.removeEventListener('error', fail);
        resolve(new Connection(ws));
      }, { once: true });
    });
  }

  send(msg: ClientMsg | LobbyClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  onMessages(fn: (msgs: AnyServerMsg[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onClose(fn: (reason: string) => void): void {
    this.closeListeners.add(fn);
  }

  close(): void {
    this.ws.close();
  }
}

/** Ticks the view trails the newest snapshot (smooths network jitter; ~66 ms). */
const INTERP_TICKS = 2;
/** Inputs are resent this many times (the server drops duplicates by sequence number). */
const REDUNDANCY = 3;

/**
 * Online transport: inputs go up at the tick rate, snapshots come down and are buffered so
 * the view interpolates between two real server states slightly in the past.
 */
export class WebSocketTransport implements Transport {
  readonly room = null;
  previous: Snapshot | null = null;
  latest: Snapshot | null = null;
  alpha = 0;
  /** Called for server-side refusals (talent unavailable, server full...). */
  onError: ((message: string) => void) | null = null;
  /** Called when the server ends the session (kicked, idle, connection lost). */
  onDisconnect: ((message: string) => void) | null = null;
  private buf: Snapshot[] = [];
  private renderTick = -1;
  private events: SimEvent[] = [];
  private acc = 0;
  private seq = 0;
  private recent: InputCommand[] = [];

  constructor(
    private conn: Connection,
    readonly world: WorldData,
    readonly playerId: number,
  ) {
    conn.onMessages((msgs) => this.receive(msgs));
    conn.onClose((reason) => this.onDisconnect?.(`Conexão com o servidor perdida (${reason}).`));
  }

  private receive(msgs: AnyServerMsg[]): void {
    for (const m of msgs) {
      if (m.t === 'snapshot') {
        const last = this.buf[this.buf.length - 1];
        if (!last || m.snap.tick > last.tick) this.buf.push(m.snap);
        if (this.buf.length > 40) this.buf.splice(0, this.buf.length - 40);
      } else if (m.t === 'events') {
        this.events.push(...m.events);
      } else if (m.t === 'error') {
        this.onError?.(m.message);
      } else if (m.t === 'kicked') {
        this.onDisconnect?.(m.message);
      }
    }
  }

  send(msg: ClientMsg): ServerMsg[] {
    this.conn.send(msg);
    return []; // replies arrive asynchronously (errors through onError)
  }

  update(dt: number, sample: () => InputCommand): SimEvent[] {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      const cmd = { ...sample(), seq: this.seq++ };
      this.recent.push(cmd);
      if (this.recent.length > REDUNDANCY) this.recent.shift();
      this.conn.send({ t: 'input', cmds: this.recent });
    }
    const n = this.buf.length;
    if (n) {
      const newest = this.buf[n - 1]!.tick;
      const target = newest - INTERP_TICKS;
      if (this.renderTick < 0 || Math.abs(this.renderTick - target) > 8) this.renderTick = target;
      else this.renderTick += dt * TICK_RATE + (target - this.renderTick) * Math.min(1, dt * 3);
      let i = n - 2;
      while (i > 0 && this.buf[i]!.tick > this.renderTick) i--;
      const a = this.buf[Math.max(0, i)]!;
      const b = this.buf[Math.min(n - 1, Math.max(0, i) + 1)]!;
      this.previous = a;
      this.latest = b;
      this.alpha = b.tick > a.tick ? Math.max(0, Math.min(1, (this.renderTick - a.tick) / (b.tick - a.tick))) : 1;
      if (i > 2) this.buf.splice(0, i - 1);
    }
    const out = this.events;
    this.events = [];
    return out;
  }
}
