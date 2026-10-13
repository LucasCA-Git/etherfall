import type { ClassId, Gender } from '../sim/types';
import type { CharacterSummary } from './save';

/**
 * Account / character-select messages exchanged before (and around) joining the Room.
 * Once `play` succeeds the socket carries the normal Room protocol (net/protocol.ts).
 */
export type LobbyClientMsg =
  | { t: 'register'; user: string; pass: string }
  | { t: 'login'; user: string; pass: string }
  | { t: 'chars' }
  | { t: 'createChar'; name: string; classId: ClassId; gender?: Gender }
  | { t: 'deleteChar'; id: string }
  /**
   * Enter the world with a character. `room` = code of a private room to join; `create` opens a
   * new private room (co-op group). Neither = the shared open world.
   */
  | { t: 'play'; id: string; room?: string; create?: boolean };

export type LobbyServerMsg =
  | { t: 'auth'; user: string; chars: CharacterSummary[] }
  | { t: 'chars'; chars: CharacterSummary[] }
  | { t: 'lobbyError'; message: string }
  /** The room the character entered: '' = open world, otherwise the code friends use to join. */
  | { t: 'room'; code: string; players: number }
  /** The server closed this session (logged in elsewhere, shutting down...). */
  | { t: 'kicked'; message: string };

export const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
export const MIN_PASS = 6;
export const MAX_PASS = 72;
export const MAX_CHARS_PER_ACCOUNT = 6;
/** Private room codes: 5 characters, no look-alikes (0/O, 1/I). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
export const normalizeRoomCode = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
