import type { ItemSlot } from '../data/items';
import { Btn, type AbilitySlot, type ClassId, type Gender, type InputCommand, type SimEvent } from '../sim/types';
import type { Snapshot } from './snapshot';

/**
 * Wire protocol (JSON over WebSocket in Etapa 5; binary encoding later if profiling demands).
 * The client only ever sends intentions; the server answers with authoritative snapshots.
 * Local play uses the very same messages through LocalTransport, so the client code path
 * is identical online and offline.
 */
export const PROTOCOL_VERSION = 1;

export type ClientMsg =
  | { t: 'hello'; version: number }
  | { t: 'join'; name: string; classId: ClassId; gender?: Gender }
  /** Inputs are batched and the last few are resent for packet-loss tolerance. */
  | { t: 'input'; cmds: InputCommand[] }
  | { t: 'ping'; time: number }
  /** Spend one attribute point (validated by the server). */
  | { t: 'allocate'; attr: 'str' | 'dex' | 'vit' | 'end' | 'int' | 'wil' | 'lck' }
  /** Spend one talent point on a node (validated by the server). */
  | { t: 'talent'; node: string }
  /** Put an unlocked skill in an ability slot (`action` null = class default). */
  | { t: 'equip'; slot: AbilitySlot; action: string | null }
  /** Items: equip from the bag, unequip a slot, drop a bag item, imbue the weapon with a rune (seated at a bonfire). */
  | { t: 'item'; op: 'equip' | 'drop' | 'imbue'; uid: string }
  | { t: 'item'; op: 'unequip'; slot: ItemSlot }
  /** Refund all attribute and talent points (only while seated at a bonfire). */
  | { t: 'respec' };

export type ServerMsg =
  | { t: 'welcome'; playerId: number; tick: number; seed: number; tickRate: number; version: number }
  | { t: 'snapshot'; snap: Snapshot; ackSeq: number }
  | { t: 'events'; tick: number; events: SimEvent[] }
  | { t: 'pong'; time: number }
  | { t: 'error'; code: string; message: string };

const ALL_BUTTONS = Object.values(Btn).reduce((a, b) => a | b, 0);

/**
 * Server-side sanitation of an untrusted input. Returns null if the message is malformed
 * or replayed. Clamps movement, normalizes aim and strips unknown button bits.
 */
export function sanitizeInput(raw: unknown, lastSeq: number): InputCommand | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const seq = num(r.seq);
  const mx = num(r.mx);
  const my = num(r.my);
  const aim = num(r.aim);
  const buttons = num(r.buttons);
  if ([seq, mx, my, aim, buttons].some(Number.isNaN)) return null;
  if (!Number.isInteger(seq) || seq <= lastSeq) return null;
  const l = Math.hypot(mx, my);
  const s = l > 1 ? 1 / l : 1;
  return {
    seq,
    mx: mx * s,
    my: my * s,
    aim: Math.atan2(Math.sin(aim), Math.cos(aim)),
    buttons: (buttons | 0) & ALL_BUTTONS,
  };
}
