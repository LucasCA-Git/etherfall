import type { Vec2 } from '../math/vec2';

/** Authoritative simulation rate. Rendering interpolates between ticks. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

/** Button bitmask carried by every InputCommand (held state; edges are derived by the sim). */
export const Btn = {
  Light: 1 << 0,
  Heavy: 1 << 1,
  Block: 1 << 2,
  Dodge: 1 << 3,
  Sprint: 1 << 4,
  AbilQ: 1 << 5,
  AbilE: 1 << 6,
  Abil1: 1 << 7,
  Abil2: 1 << 8,
  Abil3: 1 << 9,
  Abil4: 1 << 10,
  Ultimate: 1 << 11,
  Interact: 1 << 12,
} as const;

/**
 * The only thing a client is allowed to send for gameplay: intentions.
 * Identical shape locally and over the network (see net/protocol.ts).
 */
export interface InputCommand {
  seq: number;
  /** Movement intention, each axis in [-1,1]. */
  mx: number;
  my: number;
  /** Aim angle in radians (world space, +x = 0, +y = PI/2 — y grows downward). */
  aim: number;
  buttons: number;
}

export type EntityKind = 'player' | 'enemy' | 'projectile';
export type ClassId = 'vanguard' | 'arcanist' | 'healer' | 'ranger' | 'rogue' | 'barbarian' | 'warlock';
export type AttrKey = 'str' | 'dex' | 'vit' | 'end' | 'int' | 'wil' | 'lck';
export type Attributes = Record<AttrKey, number>;
export type DamageType = 'physical' | 'arcane';
/**
 * slow/root: crowd control · ironguard: damage reduction · counter: unlocks the counter attack
 * poison/curse: damage over time (power = damage per second) · empower: +power damage dealt
 * stealth: enemies cannot acquire you; your next attack is an ambush (x AMBUSH_MUL)
 */
export type StatusId = 'slow' | 'root' | 'ironguard' | 'counter' | 'poison' | 'curse' | 'empower' | 'stealth';

export interface StatusInst {
  id: StatusId;
  until: number;
  power: number;
  source: number;
}

/** Persistent ground effect (e.g. Campo de Ruptura). */
export interface Zone {
  id: number;
  kind: string;
  actionId: string;
  ownerId: number;
  team: number;
  x: number;
  y: number;
  r: number;
  until: number;
  nextPulse: number;
}

/** Delayed area hit (e.g. Colapso Astral lightning). */
export interface PendingStrike {
  actionId: string;
  ownerId: number;
  x: number;
  y: number;
  at: number;
}

export interface ActionState {
  id: string;
  /** Ticks elapsed since the action started (does not advance while charging). */
  t: number;
  /** Committed direction (radians). */
  dir: number;
  /** Charge ticks accumulated (chargeable actions). */
  charge: number;
  charging: boolean;
  /** Speed multiplier for lunges (e.g. backstep is shorter than a roll). */
  mul: number;
  /** Damage multiplier of this action (ambush out of stealth). */
  power: number;
  /** Alternating swing index for light-attack chains (visual). */
  combo: number;
  /** Entity ids already hit by this action (hit-once-per-swing rule). */
  hits: number[];
  /** Set when a hit-once action (e.g. charge) connected and should stop its lunge. */
  connected: boolean;
}

export type AiMode = 'idle' | 'wander' | 'chase' | 'strafe' | 'return';

export interface AiState {
  mode: AiMode;
  targetId: number;
  home: Vec2;
  wanderTo: Vec2 | null;
  nextThink: number;
  strafeDir: 1 | -1;
  attackReadyAt: number;
  avoidUntil: number;
  avoidSign: 1 | -1;
  spawnIndex: number;
  /** Desired speed last tick — used to detect being stuck on obstacles. */
  lastSpeed: number;
}

export interface ProjectileState {
  ownerId: number;
  defId: string;
  ttl: number;
  /** Damage multiplier captured at cast time (charge). */
  mul: number;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  name: string;
  team: number;
  classId?: ClassId;
  enemyId?: string;
  /** Summoned allies: the caster that owns them (XP for their kills goes to the owner). */
  ownerId?: number;
  /** Summons vanish at this tick. */
  expiresAt?: number;

  pos: Vec2;
  prevPos: Vec2;
  vel: Vec2;
  facing: number;
  radius: number;
  mass: number;

  level: number;
  attrs: Attributes;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  poise: number;
  maxPoise: number;
  staminaRegenAt: number;
  poiseRegenAt: number;

  action: ActionState | null;
  cooldowns: Record<string, number>;
  blocking: boolean;
  lastBlockRaise: number;
  parryUntil: number;
  buffered: { actionId: string; until: number } | null;
  lastLightTick: number;
  comboIdx: number;
  prevButtons: number;
  input: InputCommand;
  sprinting: boolean;
  lastHitTick: number;
  respawnPoint: Vec2;
  /** XP progress inside the current level (lost into an essence mark on death). */
  xp: number;
  /** Attribute points waiting to be spent. */
  unspent: number;
  /** Where this player's dropped essence lies (only one at a time). */
  essenceMark: { x: number; y: number; amount: number } | null;
  /** Points of interest already discovered (exploration XP is granted once). */
  discovered: string[];
  statuses: StatusInst[];
  /** Talent ranks by node id (see data/talents.ts). */
  talents: Record<string, number>;
  /** Subclass chosen at SUBCLASS_LEVEL, or null. */
  subclass: string | null;
  /** Admin/test override added on top of talent bonuses. */
  talentOverride?: Partial<Record<string, number>>;
  /** Tick at which a dead entity respawns (players) or is removed (enemies). */
  deadUntil: number;

  ai?: AiState;
  proj?: ProjectileState;
}

export type SimEvent =
  | { type: 'swing'; id: number; actionId: string; x: number; y: number; dir: number }
  | { type: 'telegraph'; id: number; actionId: string; danger: boolean; x: number; y: number; dir: number; range: number; arc: number; ticks: number }
  | { type: 'summon'; id: number; ownerId: number; enemyId: string; x: number; y: number }
  | { type: 'unsummon'; id: number; x: number; y: number }
  | { type: 'hit'; attacker: number; target: number; amount: number; crit: 'none' | 'backstab' | 'riposte' | 'critical'; x: number; y: number; dir: number; dtype: string; dot?: StatusId }
  | { type: 'block'; attacker: number; target: number; amount: number; x: number; y: number }
  | { type: 'guardBreak'; target: number; x: number; y: number }
  | { type: 'parry'; attacker: number; target: number; x: number; y: number }
  | { type: 'evade'; target: number; x: number; y: number }
  | { type: 'stagger'; target: number; x: number; y: number }
  | { type: 'dodge'; id: number; x: number; y: number; dir: number }
  | { type: 'shockwave'; id: number; x: number; y: number; radius: number }
  | { type: 'projectile'; id: number; ownerId: number; x: number; y: number; dir: number }
  | { type: 'projectileEnd'; id: number; x: number; y: number }
  | { type: 'death'; id: number; killer: number; x: number; y: number }
  | { type: 'kill'; killer: number; victim: number; xp: number }
  | { type: 'respawn'; id: number; x: number; y: number }
  | { type: 'rest'; id: number; x: number; y: number }
  | { type: 'fail'; id: number; reason: 'stamina' | 'mana' | 'cooldown' | 'requires' }
  | { type: 'xp'; id: number; amount: number; reason: string }
  | { type: 'levelUp'; id: number; level: number; x: number; y: number }
  | { type: 'discover'; id: number; poi: string; name: string; xp: number; x: number; y: number }
  | { type: 'essenceDropped'; id: number; amount: number; x: number; y: number }
  | { type: 'essenceRecovered'; id: number; amount: number; x: number; y: number }
  | { type: 'essenceLost'; id: number; amount: number }
  | { type: 'status'; target: number; status: StatusId; until: number; x: number; y: number }
  | { type: 'spikes'; id: number; x: number; y: number; dir: number; idx: number; radius: number }
  | { type: 'zone'; id: number; ownerId: number; kind: string; x: number; y: number; r: number; until: number }
  | { type: 'strikeWarn'; ownerId: number; x: number; y: number; radius: number; ticks: number }
  | { type: 'strike'; ownerId: number; x: number; y: number; radius: number }
  | { type: 'seal'; id: number; target: number; x: number; y: number }
  | { type: 'heal'; source: number; target: number; amount: number; x: number; y: number }
  | { type: 'cleanse'; source: number; target: number; x: number; y: number }
  | { type: 'portal'; id: number; portal: string; name: string; fromX: number; fromY: number; x: number; y: number };
