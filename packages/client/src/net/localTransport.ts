import { DT, PROTOCOL_VERSION, Room, type CharacterSave, type ClassId, type ClientMsg, type InputCommand, type ServerMsg, type SimEvent, type Snapshot, type WorldData } from '@etherfall/shared';

/**
 * Client <-> authority boundary. The game only talks to this interface; the local
 * implementation runs the authoritative Room in-process using the exact network
 * messages. Etapa 5 adds a WebSocketTransport with the same surface plus
 * prediction/reconciliation.
 */
export interface Transport {
  readonly world: WorldData;
  readonly playerId: number;
  readonly previous: Snapshot | null;
  readonly latest: Snapshot | null;
  /** Interpolation factor between previous and latest snapshot, in [0,1]. */
  readonly alpha: number;
  /** Advance by real time; `sample` is called once per authoritative tick. Returns the events received. */
  update(dt: number, sample: () => InputCommand): SimEvent[];
  /** Send a non-input message (e.g. allocate). Returns immediate replies (errors). */
  send(msg: ClientMsg): ServerMsg[];
  /** Debug/inspection access when running locally. */
  readonly room: Room | null;
}

export const LOCAL_SESSION = 'local';
const SESSION = LOCAL_SESSION;

export class LocalTransport implements Transport {
  readonly room: Room;
  readonly playerId: number;
  previous: Snapshot | null = null;
  latest: Snapshot | null = null;
  private acc = 0;
  private seq = 0;

  constructor(
    readonly world: WorldData,
    name: string,
    classId: ClassId,
    save?: CharacterSave,
  ) {
    this.room = new Room({ world });
    this.room.handle(SESSION, { t: 'hello', version: PROTOCOL_VERSION });
    const replies = save ? this.room.joinCharacter(SESSION, save) : this.room.handle(SESSION, { t: 'join', name, classId });
    const welcome = replies.find((m) => m.t === 'welcome');
    if (!welcome || welcome.t !== 'welcome') throw new Error('Falha ao entrar na sala local');
    this.playerId = welcome.playerId;
  }

  send(msg: ClientMsg): ServerMsg[] {
    return this.room.handle(SESSION, msg);
  }

  get alpha(): number {
    return Math.min(1, this.acc / DT);
  }

  update(dt: number, sample: () => InputCommand): SimEvent[] {
    const events: SimEvent[] = [];
    this.acc += Math.min(dt, 0.25);
    let guard = 0;
    while (this.acc >= DT && guard++ < 8) {
      const cmd = { ...sample(), seq: this.seq++ };
      this.room.handle(SESSION, { t: 'input', cmds: [cmd] });
      const out = this.room.tick().get(SESSION) ?? [];
      this.receive(out, events);
      this.acc -= DT;
    }
    if (guard >= 8) this.acc = 0; // tab was suspended: drop backlog rather than spiral
    return events;
  }

  private receive(msgs: ServerMsg[], events: SimEvent[]): void {
    for (const m of msgs) {
      if (m.t === 'snapshot') {
        this.previous = this.latest;
        this.latest = m.snap;
      } else if (m.t === 'events') {
        events.push(...m.events);
      }
    }
  }
}
