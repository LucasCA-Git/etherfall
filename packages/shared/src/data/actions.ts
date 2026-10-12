import type { AttrKey, DamageType, StatusId } from '../sim/types';
import { TREE_SKILLS } from './treeskills';

/** Visual theme of a skill (colours of its projectiles, zones, strikes and icon). */
export type Element = 'physical' | 'holy' | 'fire' | 'frost' | 'arcane' | 'shadow' | 'nature' | 'poison' | 'blood' | 'lightning' | 'illusion' | 'spirit';
/** Body animation family used by the client for skills that are not hand-mapped. */
export type AnimKind = 'slash' | 'heavy' | 'thrust' | 'throw' | 'shout' | 'spin' | 'trap' | 'guard' | 'cast' | 'castSky' | 'castRaise' | 'castPlant' | 'bow';

/**
 * Data-driven action definitions. Every attack, ability, dodge and stagger in the game
 * is one of these; adding a class or weapon means adding data, not combat code.
 * All times are in simulation ticks (30/s).
 */
export interface HitDef {
  /** Reach measured from the attacker's edge. */
  range: number;
  /** Half-angle of the swing cone in radians (PI = full circle). */
  arc: number;
  damage: number;
  poise: number;
  knockback: number;
  scaling: Partial<Record<AttrKey, number>>;
  type: DamageType;
  parryable: boolean;
  /** Stop after the first target (charges, thrusts). */
  once?: boolean;
  /** Status applied on a clean hit. */
  status?: { id: StatusId; ticks: number; power: number };
  /** Fraction of the damage dealt that heals the attacker (life drain). */
  drain?: number;
}

export interface ProjectileDef {
  id: string;
  speed: number;
  radius: number;
  ttl: number;
  hit: HitDef;
  /** Volley: number of projectiles fanned out `spread` radians apart (default 1). */
  count?: number;
  spread?: number;
}

export interface ActionDef {
  id: string;
  name: string;
  /** Tooltip text (skills from the trees). */
  desc?: string;
  element?: Element;
  /** Icon motif key (client/hud/icons.ts). */
  icon?: string;
  anim?: AnimKind;
  startup: number;
  active: number;
  recovery: number;
  stamina?: number;
  mana?: number;
  cooldown?: number;
  /** Movement multiplier while performing the action (0 = rooted). */
  moveMul: number;
  /** Velocity forced along `dir` during ticks [from, to). */
  lunge?: { speed: number; from: number; to: number };
  iframes?: [number, number];
  hyperArmor?: [number, number];
  hit?: HitDef;
  projectile?: ProjectileDef;
  /** From this tick on, the action can be cancelled into a dodge. */
  cancelFrom?: number;
  /** Enemies keep rotating toward their target until this tick (then commit). */
  trackUntil?: number;
  turnRate?: number;
  chargeable?: { maxTicks: number; maxMul: number };
  shockwave?: number;
  /** Telegraph strength for the client (danger = big readable warning). */
  telegraph?: 'normal' | 'danger';
  /** Locked actions ignore all input (staggers, death). */
  locked?: boolean;
  /** Only usable while the caster has this status (consumed on use). */
  requires?: StatusId;
  /** Status the caster gains when the action fires (at startup end). */
  selfStatus?: { id: StatusId; ticks: number; power: number };
  /** Multi-hit: the same target may be hit again every N active ticks. */
  rehitEvery?: number;
  /** Ice spikes erupting along the aim line, one segment per active tick. */
  spikes?: { count: number; spacing: number; startDist: number; radius: number; hit: HitDef };
  /** Persistent ground zone placed `dist` meters ahead. */
  zone?: { kind: string; dist: number; radius: number; ticks: number; pulseEvery: number; hit: HitDef; heal?: { amount: number; scaling: Partial<Record<AttrKey, number>> } };
  /** Delayed strikes around a point `dist` ahead (warned before they land). */
  strikes?: { count: number; dist: number; spread: number; radius: number; delay: number; interval: number; hit: HitDef };
  /** Support burst at startup end: affects the caster and allies within `radius`. */
  heal?: { radius: number; amount: number; scaling: Partial<Record<AttrKey, number>>; cleanse?: boolean; status?: { id: StatusId; ticks: number; power: number } };
  /** Call allied creatures around the caster (older ones of the same kind beyond `max` vanish). */
  summon?: { enemyId: string; count: number; ticks: number; max: number };
  /** Targeted control on the nearest enemy inside a cone. */
  seal?: { range: number; arc: number; status: { id: StatusId; ticks: number; power: number } };
}

const deg = (d: number) => (d * Math.PI) / 180;

const defs: ActionDef[] = [
  // ---------- generic ----------
  { id: 'dodge', name: 'Esquiva', startup: 0, active: 9, recovery: 5, stamina: 20, moveMul: 0, lunge: { speed: 9.5, from: 0, to: 8 }, iframes: [1, 7] },
  { id: 'stagger', name: 'Atordoado', startup: 0, active: 0, recovery: 13, moveMul: 0, locked: true },
  { id: 'guardbreak', name: 'Guarda quebrada', startup: 0, active: 0, recovery: 30, moveMul: 0, locked: true },
  { id: 'parried', name: 'Aparado', startup: 0, active: 0, recovery: 45, moveMul: 0, locked: true },
  { id: 'dead', name: 'Morto', startup: 0, active: 0, recovery: 1_000_000, moveMul: 0, locked: true },
  { id: 'rest', name: 'Descansando', startup: 0, active: 0, recovery: 30, moveMul: 0, locked: true },
  /** Seated on a bonfire log; lasts until the player moves or acts. */
  { id: 'sit', name: 'Sentado', startup: 0, active: 0, recovery: 1_000_000, moveMul: 0 },

  // ---------- Vanguard: longsword + shield ----------
  {
    id: 'longsword_light', name: 'Corte', startup: 7, active: 3, recovery: 10, stamina: 16, moveMul: 0.25,
    lunge: { speed: 3.2, from: 4, to: 8 }, cancelFrom: 13,
    hit: { range: 1.55, arc: deg(65), damage: 28, poise: 22, knockback: 2.2, scaling: { str: 1.1, dex: 0.7 }, type: 'physical', parryable: true },
  },
  {
    id: 'longsword_heavy', name: 'Golpe pesado', startup: 14, active: 3, recovery: 16, stamina: 30, moveMul: 0.1,
    lunge: { speed: 4.2, from: 10, to: 15 }, cancelFrom: 24, hyperArmor: [6, 17], chargeable: { maxTicks: 24, maxMul: 1.7 },
    hit: { range: 1.8, arc: deg(50), damage: 52, poise: 55, knockback: 5, scaling: { str: 1.6, dex: 0.3 }, type: 'physical', parryable: true },
  },
  {
    id: 'vanguard_seismic', name: 'Impacto Sísmico', startup: 15, active: 2, recovery: 20, stamina: 32, cooldown: 180, moveMul: 0,
    hyperArmor: [4, 17], shockwave: 2.8, cancelFrom: 30,
    hit: { range: 2.6, arc: Math.PI, damage: 34, poise: 70, knockback: 7, scaling: { str: 1.3 }, type: 'physical', parryable: false },
  },
  {
    id: 'vanguard_charge', name: 'Investida', startup: 4, active: 9, recovery: 12, stamina: 24, cooldown: 120, moveMul: 0,
    lunge: { speed: 13, from: 4, to: 13 }, hyperArmor: [4, 13],
    hit: { range: 0.7, arc: deg(55), damage: 30, poise: 45, knockback: 8, scaling: { str: 1.0, dex: 0.5 }, type: 'physical', parryable: false, once: true },
  },

  // ---------- Arcanist: staff ----------
  {
    id: 'staff_light', name: 'Golpe de cajado', startup: 6, active: 3, recovery: 9, stamina: 13, moveMul: 0.3,
    lunge: { speed: 2.4, from: 3, to: 7 }, cancelFrom: 11,
    hit: { range: 1.45, arc: deg(60), damage: 18, poise: 14, knockback: 2, scaling: { dex: 0.6, int: 0.6 }, type: 'physical', parryable: true },
  },
  {
    id: 'staff_heavy', name: 'Pulso arcano', startup: 13, active: 3, recovery: 15, stamina: 20, mana: 6, moveMul: 0.1,
    cancelFrom: 22, chargeable: { maxTicks: 24, maxMul: 1.8 },
    hit: { range: 2.1, arc: deg(40), damage: 36, poise: 30, knockback: 4.5, scaling: { int: 1.4 }, type: 'arcane', parryable: false },
  },
  {
    id: 'arcanist_bolt', name: 'Projétil Etéreo', startup: 7, active: 1, recovery: 9, stamina: 6, mana: 8, cooldown: 14, moveMul: 0.35, cancelFrom: 10,
    projectile: { id: 'ether_bolt', speed: 15, radius: 0.22, ttl: 36, hit: { range: 0, arc: Math.PI, damage: 24, poise: 12, knockback: 2.5, scaling: { int: 1.5, wil: 0.4 }, type: 'arcane', parryable: false } },
  },
  {
    id: 'arcanist_step', name: 'Passo Espectral', startup: 1, active: 5, recovery: 10, stamina: 10, mana: 14, cooldown: 90, moveMul: 0,
    lunge: { speed: 17, from: 1, to: 6 }, iframes: [0, 6],
  },

  // ---------- Vanguard 1–4 ----------
  {
    id: 'vanguard_rising', name: 'Corte Ascendente', startup: 9, active: 3, recovery: 15, stamina: 26, cooldown: 120, moveMul: 0.1,
    lunge: { speed: 3, from: 6, to: 10 }, cancelFrom: 20,
    hit: { range: 1.7, arc: deg(50), damage: 38, poise: 95, knockback: 6, scaling: { str: 1.3, dex: 0.4 }, type: 'physical', parryable: true },
  },
  { id: 'vanguard_ironguard', name: 'Guarda de Ferro', startup: 4, active: 1, recovery: 8, stamina: 15, cooldown: 450, moveMul: 0.3, selfStatus: { id: 'ironguard', ticks: 105, power: 0.6 } },
  {
    id: 'vanguard_counter', name: 'Contra-ataque', startup: 4, active: 3, recovery: 10, stamina: 12, cooldown: 30, moveMul: 0, requires: 'counter',
    lunge: { speed: 7, from: 1, to: 5 },
    hit: { range: 1.7, arc: deg(70), damage: 62, poise: 70, knockback: 5, scaling: { str: 1.4, dex: 0.6 }, type: 'physical', parryable: false },
  },
  {
    id: 'vanguard_fury', name: 'Fúria do Bastião', startup: 12, active: 24, recovery: 20, stamina: 55, cooldown: 900, moveMul: 0.3,
    hyperArmor: [0, 36], rehitEvery: 8, shockwave: 2.2,
    hit: { range: 1.9, arc: Math.PI, damage: 30, poise: 40, knockback: 3.5, scaling: { str: 1.2 }, type: 'physical', parryable: false },
  },

  // ---------- Arcanist 1–4 ----------
  {
    id: 'arcanist_icelance', name: 'Lança de Gelo', startup: 10, active: 8, recovery: 14, stamina: 10, mana: 18, cooldown: 150, moveMul: 0,
    spikes: {
      count: 8, spacing: 0.9, startDist: 1.0, radius: 0.75,
      hit: { range: 0, arc: Math.PI, damage: 26, poise: 25, knockback: 1.5, scaling: { int: 1.4, wil: 0.3 }, type: 'arcane', parryable: false, status: { id: 'slow', ticks: 60, power: 0.45 } },
    },
  },
  {
    id: 'arcanist_rupture', name: 'Campo de Ruptura', startup: 12, active: 1, recovery: 12, stamina: 8, mana: 22, cooldown: 360, moveMul: 0.2,
    zone: {
      kind: 'rupture', dist: 4, radius: 2.6, ticks: 150, pulseEvery: 15,
      hit: { range: 0, arc: Math.PI, damage: 8, poise: 4, knockback: 0, scaling: { int: 0.8 }, type: 'arcane', parryable: false, status: { id: 'slow', ticks: 22, power: 0.5 } },
    },
  },
  {
    id: 'arcanist_seal', name: 'Selo de Contenção', startup: 8, active: 1, recovery: 10, stamina: 6, mana: 16, cooldown: 300, moveMul: 0.3,
    seal: { range: 9, arc: deg(35), status: { id: 'root', ticks: 75, power: 1 } },
  },
  {
    id: 'arcanist_collapse', name: 'Colapso Astral', startup: 30, active: 1, recovery: 24, stamina: 20, mana: 45, cooldown: 600, moveMul: 0,
    strikes: {
      count: 6, dist: 5, spread: 2.2, radius: 1.5, delay: 12, interval: 5,
      hit: { range: 0, arc: Math.PI, damage: 52, poise: 60, knockback: 5, scaling: { int: 1.6, wil: 0.5 }, type: 'arcane', parryable: false },
    },
  },

  // ---------- Healer (Curandeira) ----------
  {
    id: 'healer_light', name: 'Luz Curativa', startup: 10, active: 1, recovery: 12, stamina: 6, mana: 14, cooldown: 150, moveMul: 0.3,
    heal: { radius: 6, amount: 70, scaling: { wil: 1.6, int: 0.6 } },
  },
  {
    id: 'healer_aegis', name: 'Égide', startup: 6, active: 1, recovery: 10, stamina: 6, mana: 16, cooldown: 480, moveMul: 0.3,
    heal: { radius: 6, amount: 0, scaling: {}, status: { id: 'ironguard', ticks: 120, power: 0.35 } },
  },
  {
    id: 'healer_smite', name: 'Sentença Radiante', startup: 9, active: 1, recovery: 10, stamina: 6, mana: 12, cooldown: 45, moveMul: 0.35, cancelFrom: 12,
    projectile: { id: 'holy_bolt', speed: 13, radius: 0.25, ttl: 40, hit: { range: 0, arc: Math.PI, damage: 34, poise: 16, knockback: 3, scaling: { wil: 1.4, int: 0.4 }, type: 'arcane', parryable: false } },
  },
  {
    id: 'healer_sanctuary', name: 'Santuário', startup: 12, active: 1, recovery: 12, stamina: 8, mana: 28, cooldown: 540, moveMul: 0.2,
    zone: {
      kind: 'sanctuary', dist: 3, radius: 3, ticks: 180, pulseEvery: 15,
      hit: { range: 0, arc: Math.PI, damage: 7, poise: 3, knockback: 0, scaling: { wil: 0.8 }, type: 'arcane', parryable: false },
      heal: { amount: 14, scaling: { wil: 1.0 } },
    },
  },
  {
    id: 'healer_purify', name: 'Purificar', startup: 6, active: 1, recovery: 10, stamina: 6, mana: 12, cooldown: 240, moveMul: 0.4,
    heal: { radius: 6, amount: 25, scaling: { wil: 0.8 }, cleanse: true },
  },
  {
    id: 'healer_dawn', name: 'Bênção da Aurora', startup: 30, active: 1, recovery: 20, stamina: 15, mana: 50, cooldown: 900, moveMul: 0, hyperArmor: [0, 30],
    heal: { radius: 7, amount: 220, scaling: { wil: 1.5, int: 0.5 }, status: { id: 'ironguard', ticks: 90, power: 0.35 } },
  },

  // ---------- Patrulheiro (ranger): longbow ----------
  {
    id: 'bow_shot', name: 'Flecha', startup: 8, active: 1, recovery: 8, stamina: 10, moveMul: 0.4, cancelFrom: 10,
    projectile: { id: 'arrow', speed: 21, radius: 0.15, ttl: 30, hit: { range: 0, arc: Math.PI, damage: 22, poise: 12, knockback: 1.5, scaling: { dex: 1.3, str: 0.2 }, type: 'physical', parryable: false } },
  },
  {
    id: 'bow_power', name: 'Disparo Carregado', startup: 14, active: 1, recovery: 12, stamina: 22, moveMul: 0.1, cancelFrom: 18, chargeable: { maxTicks: 30, maxMul: 2.0 },
    projectile: { id: 'arrow_heavy', speed: 27, radius: 0.18, ttl: 30, hit: { range: 0, arc: Math.PI, damage: 40, poise: 40, knockback: 4, scaling: { dex: 1.5 }, type: 'physical', parryable: false } },
  },
  {
    id: 'ranger_volley', name: 'Rajada', startup: 9, active: 1, recovery: 12, stamina: 18, cooldown: 150, moveMul: 0.2,
    projectile: { id: 'arrow', speed: 20, radius: 0.15, ttl: 26, count: 5, spread: deg(9), hit: { range: 0, arc: Math.PI, damage: 16, poise: 10, knockback: 1.5, scaling: { dex: 1.2 }, type: 'physical', parryable: false } },
  },
  { id: 'ranger_leap', name: 'Salto Evasivo', startup: 1, active: 6, recovery: 8, stamina: 14, cooldown: 120, moveMul: 0, lunge: { speed: -14, from: 1, to: 7 }, iframes: [0, 6] },
  {
    id: 'ranger_poison', name: 'Flecha Envenenada', startup: 10, active: 1, recovery: 10, stamina: 8, mana: 8, cooldown: 240, moveMul: 0.3,
    projectile: { id: 'arrow_poison', speed: 19, radius: 0.16, ttl: 30, hit: { range: 0, arc: Math.PI, damage: 14, poise: 8, knockback: 1, scaling: { dex: 1.0 }, type: 'physical', parryable: false, status: { id: 'poison', ticks: 150, power: 12 } } },
  },
  {
    id: 'ranger_trap', name: 'Armadilha de Espinhos', startup: 8, active: 1, recovery: 10, stamina: 6, mana: 10, cooldown: 360, moveMul: 0.2,
    zone: { kind: 'trap', dist: 1.6, radius: 1.2, ticks: 450, pulseEvery: 10, hit: { range: 0, arc: Math.PI, damage: 10, poise: 6, knockback: 0, scaling: { dex: 0.6 }, type: 'physical', parryable: false, status: { id: 'root', ticks: 45, power: 1 } } },
  },
  {
    id: 'ranger_rain', name: 'Chuva de Flechas', startup: 16, active: 1, recovery: 14, stamina: 10, mana: 22, cooldown: 480, moveMul: 0,
    strikes: { count: 10, dist: 6, spread: 2.5, radius: 1.0, delay: 10, interval: 2, hit: { range: 0, arc: Math.PI, damage: 24, poise: 18, knockback: 1, scaling: { dex: 1.2 }, type: 'physical', parryable: false } },
  },
  { id: 'ranger_hawkeye', name: 'Olho do Falcão', startup: 6, active: 1, recovery: 8, mana: 20, cooldown: 900, moveMul: 0.4, selfStatus: { id: 'empower', ticks: 240, power: 0.35 } },

  // ---------- Ladina (rogue): twin daggers ----------
  {
    id: 'dagger_light', name: 'Estocada', startup: 4, active: 2, recovery: 6, stamina: 9, moveMul: 0.4, cancelFrom: 7,
    lunge: { speed: 3, from: 2, to: 5 },
    hit: { range: 1.15, arc: deg(55), damage: 14, poise: 8, knockback: 1, scaling: { dex: 1.2 }, type: 'physical', parryable: true },
  },
  {
    id: 'dagger_heavy', name: 'Perfuração', startup: 11, active: 3, recovery: 12, stamina: 22, moveMul: 0.1, cancelFrom: 18,
    lunge: { speed: 6, from: 7, to: 11 }, chargeable: { maxTicks: 18, maxMul: 1.6 },
    hit: { range: 1.25, arc: deg(35), damage: 38, poise: 26, knockback: 2.5, scaling: { dex: 1.5 }, type: 'physical', parryable: true },
  },
  {
    id: 'rogue_venom', name: 'Lâmina Venenosa', startup: 6, active: 2, recovery: 9, stamina: 14, cooldown: 120, moveMul: 0.2, lunge: { speed: 5, from: 3, to: 7 },
    hit: { range: 1.2, arc: deg(55), damage: 18, poise: 10, knockback: 1, scaling: { dex: 1.1 }, type: 'physical', parryable: true, status: { id: 'poison', ticks: 180, power: 14 } },
  },
  { id: 'rogue_shadowstep', name: 'Passo Sombrio', startup: 1, active: 6, recovery: 6, stamina: 12, cooldown: 90, moveMul: 0, lunge: { speed: 18, from: 1, to: 6 }, iframes: [0, 6] },
  {
    id: 'rogue_knives', name: 'Leque de Facas', startup: 7, active: 1, recovery: 9, stamina: 14, cooldown: 150, moveMul: 0.3,
    projectile: { id: 'knife', speed: 18, radius: 0.14, ttl: 22, count: 3, spread: deg(14), hit: { range: 0, arc: Math.PI, damage: 18, poise: 8, knockback: 1, scaling: { dex: 1.2 }, type: 'physical', parryable: false } },
  },
  {
    id: 'rogue_smoke', name: 'Bomba de Fumaça', startup: 5, active: 1, recovery: 8, stamina: 10, mana: 12, cooldown: 600, moveMul: 0.3,
    selfStatus: { id: 'stealth', ticks: 150, power: 1 },
    zone: { kind: 'smoke', dist: 0, radius: 2.6, ticks: 120, pulseEvery: 15, hit: { range: 0, arc: Math.PI, damage: 1, poise: 0, knockback: 0, scaling: {}, type: 'physical', parryable: false, status: { id: 'slow', ticks: 30, power: 0.4 } } },
  },
  {
    id: 'rogue_assassinate', name: 'Golpe Fatal', startup: 10, active: 3, recovery: 14, stamina: 24, cooldown: 300, moveMul: 0, lunge: { speed: 9, from: 6, to: 10 },
    hit: { range: 1.2, arc: deg(40), damage: 70, poise: 50, knockback: 3, scaling: { dex: 1.6 }, type: 'physical', parryable: true, once: true },
  },
  {
    id: 'rogue_dance', name: 'Dança das Lâminas', startup: 6, active: 30, recovery: 14, stamina: 40, cooldown: 720, moveMul: 0.5, rehitEvery: 6, iframes: [6, 20],
    hit: { range: 1.6, arc: Math.PI, damage: 16, poise: 10, knockback: 1.5, scaling: { dex: 1.1 }, type: 'physical', parryable: false },
  },

  // ---------- Bárbaro (barbarian): great axe ----------
  {
    id: 'axe_light', name: 'Talho Largo', startup: 9, active: 3, recovery: 12, stamina: 18, moveMul: 0.2, cancelFrom: 16, lunge: { speed: 3.5, from: 5, to: 9 },
    hit: { range: 1.7, arc: deg(80), damage: 34, poise: 30, knockback: 3, scaling: { str: 1.3 }, type: 'physical', parryable: true },
  },
  {
    id: 'axe_heavy', name: 'Machadada', startup: 18, active: 3, recovery: 20, stamina: 34, moveMul: 0.05, cancelFrom: 30, hyperArmor: [6, 21], chargeable: { maxTicks: 28, maxMul: 1.9 },
    lunge: { speed: 4, from: 13, to: 18 },
    hit: { range: 1.9, arc: deg(45), damage: 64, poise: 70, knockback: 6, scaling: { str: 1.7 }, type: 'physical', parryable: true },
  },
  {
    id: 'barb_warcry', name: 'Grito de Guerra', startup: 8, active: 1, recovery: 10, stamina: 10, cooldown: 600, moveMul: 0.2,
    heal: { radius: 6, amount: 30, scaling: { vit: 0.6 }, status: { id: 'empower', ticks: 300, power: 0.25 } },
  },
  {
    id: 'barb_leap', name: 'Salto Brutal', startup: 6, active: 10, recovery: 16, stamina: 26, cooldown: 240, moveMul: 0, lunge: { speed: 12, from: 6, to: 14 },
    hyperArmor: [0, 16], shockwave: 2.4,
    hit: { range: 1.4, arc: Math.PI, damage: 36, poise: 60, knockback: 5, scaling: { str: 1.3 }, type: 'physical', parryable: false },
  },
  {
    id: 'barb_whirl', name: 'Redemoinho', startup: 8, active: 24, recovery: 16, stamina: 45, cooldown: 420, moveMul: 0.45, rehitEvery: 8, hyperArmor: [0, 32],
    hit: { range: 2.0, arc: Math.PI, damage: 26, poise: 30, knockback: 3, scaling: { str: 1.2 }, type: 'physical', parryable: false },
  },
  {
    id: 'barb_stun', name: 'Pancada Atordoante', startup: 12, active: 3, recovery: 16, stamina: 24, cooldown: 240, moveMul: 0.1, lunge: { speed: 3, from: 9, to: 12 },
    hit: { range: 1.6, arc: deg(50), damage: 30, poise: 120, knockback: 4, scaling: { str: 1.2 }, type: 'physical', parryable: true, status: { id: 'root', ticks: 40, power: 1 } },
  },
  {
    id: 'barb_throw', name: 'Machado Arremessado', startup: 10, active: 1, recovery: 12, stamina: 16, cooldown: 180, moveMul: 0.2,
    projectile: { id: 'axe', speed: 15, radius: 0.3, ttl: 30, hit: { range: 0, arc: Math.PI, damage: 44, poise: 40, knockback: 4, scaling: { str: 1.3 }, type: 'physical', parryable: false } },
  },
  {
    id: 'barb_rage', name: 'Fúria Ancestral', startup: 10, active: 1, recovery: 10, cooldown: 900, moveMul: 0, hyperArmor: [0, 20],
    selfStatus: { id: 'empower', ticks: 360, power: 0.5 },
    heal: { radius: 0.1, amount: 60, scaling: { vit: 1.0 }, status: { id: 'ironguard', ticks: 360, power: 0.25 } },
  },

  // ---------- Bruxo (warlock): grimoire + bone staff ----------
  {
    id: 'warlock_heavy', name: 'Pulso Sombrio', startup: 13, active: 3, recovery: 15, stamina: 20, mana: 6, moveMul: 0.1, cancelFrom: 22, chargeable: { maxTicks: 24, maxMul: 1.8 },
    hit: { range: 2.1, arc: deg(40), damage: 30, poise: 26, knockback: 4, scaling: { int: 1.3 }, type: 'arcane', parryable: false, status: { id: 'curse', ticks: 90, power: 8 } },
  },
  {
    id: 'warlock_bolt', name: 'Raio Sombrio', startup: 8, active: 1, recovery: 9, stamina: 6, mana: 9, cooldown: 18, moveMul: 0.35, cancelFrom: 11,
    projectile: { id: 'shadow_bolt', speed: 14, radius: 0.24, ttl: 36, hit: { range: 0, arc: Math.PI, damage: 22, poise: 10, knockback: 2, scaling: { int: 1.4, wil: 0.3 }, type: 'arcane', parryable: false, status: { id: 'curse', ticks: 120, power: 8 } } },
  },
  { id: 'warlock_step', name: 'Passo do Vazio', startup: 1, active: 5, recovery: 10, stamina: 10, mana: 14, cooldown: 90, moveMul: 0, lunge: { speed: 17, from: 1, to: 6 }, iframes: [0, 6] },
  {
    id: 'warlock_drain', name: 'Dreno de Vida', startup: 10, active: 1, recovery: 10, stamina: 6, mana: 16, cooldown: 180, moveMul: 0.3,
    projectile: { id: 'drain_bolt', speed: 12, radius: 0.26, ttl: 40, hit: { range: 0, arc: Math.PI, damage: 34, poise: 12, knockback: 1.5, scaling: { int: 1.4 }, type: 'arcane', parryable: false, drain: 0.6 } },
  },
  {
    id: 'warlock_well', name: 'Poço de Almas', startup: 12, active: 1, recovery: 12, stamina: 8, mana: 22, cooldown: 360, moveMul: 0.2,
    zone: { kind: 'soulwell', dist: 4, radius: 2.4, ticks: 180, pulseEvery: 15, hit: { range: 0, arc: Math.PI, damage: 10, poise: 4, knockback: 0, scaling: { int: 0.9 }, type: 'arcane', parryable: false, status: { id: 'curse', ticks: 30, power: 6 } } },
  },
  {
    id: 'warlock_hex', name: 'Maldição', startup: 8, active: 1, recovery: 10, stamina: 6, mana: 18, cooldown: 300, moveMul: 0.3,
    seal: { range: 9, arc: deg(35), status: { id: 'curse', ticks: 240, power: 30 } },
  },
  {
    id: 'warlock_abyss', name: 'Chamado do Abismo', startup: 28, active: 1, recovery: 22, stamina: 18, mana: 45, cooldown: 600, moveMul: 0,
    strikes: { count: 5, dist: 5, spread: 2, radius: 1.7, delay: 14, interval: 6, hit: { range: 0, arc: Math.PI, damage: 58, poise: 60, knockback: 5, scaling: { int: 1.5, wil: 0.4 }, type: 'arcane', parryable: false, drain: 0.15 } },
  },

  // ---------- Enemies ----------
  {
    id: 'hollow_slash', name: 'Talho', startup: 13, active: 3, recovery: 16, moveMul: 0.1, lunge: { speed: 3.5, from: 10, to: 15 },
    trackUntil: 9, turnRate: deg(14), telegraph: 'normal',
    hit: { range: 1.5, arc: deg(60), damage: 58, poise: 30, knockback: 3, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'hollow_overhead', name: 'Golpe descendente', startup: 24, active: 3, recovery: 26, moveMul: 0, lunge: { speed: 3, from: 20, to: 26 },
    trackUntil: 16, turnRate: deg(8), hyperArmor: [10, 27], telegraph: 'danger',
    hit: { range: 1.9, arc: deg(35), damage: 118, poise: 80, knockback: 7, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'wolf_bite', name: 'Mordida', startup: 9, active: 2, recovery: 12, moveMul: 0.2, lunge: { speed: 4, from: 7, to: 11 },
    trackUntil: 6, turnRate: deg(20), telegraph: 'normal',
    hit: { range: 1.1, arc: deg(55), damage: 38, poise: 18, knockback: 2, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'wolf_lunge', name: 'Salto', startup: 16, active: 7, recovery: 20, moveMul: 0, lunge: { speed: 11, from: 16, to: 23 },
    trackUntil: 13, turnRate: deg(12), telegraph: 'danger',
    hit: { range: 0.8, arc: deg(50), damage: 66, poise: 45, knockback: 5, scaling: {}, type: 'physical', parryable: true, once: true },
  },
  // ---------- Nobre Vampírico ----------
  {
    id: 'vampire_claw', name: 'Garras', startup: 10, active: 3, recovery: 12, moveMul: 0.15, lunge: { speed: 4.5, from: 7, to: 11 },
    trackUntil: 8, turnRate: deg(18), telegraph: 'normal',
    hit: { range: 1.3, arc: deg(70), damage: 48, poise: 22, knockback: 2.5, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'vampire_dash', name: 'Investida Sangrenta', startup: 18, active: 6, recovery: 22, moveMul: 0, lunge: { speed: 14, from: 18, to: 24 },
    trackUntil: 14, turnRate: deg(12), hyperArmor: [6, 24], telegraph: 'danger',
    hit: { range: 0.9, arc: deg(55), damage: 92, poise: 60, knockback: 6, scaling: {}, type: 'physical', parryable: false, once: true },
  },
  {
    id: 'vampire_bolt', name: 'Seta de Sangue', startup: 16, active: 1, recovery: 16, moveMul: 0, trackUntil: 13, turnRate: deg(14), telegraph: 'normal',
    projectile: { id: 'blood_bolt', speed: 13, radius: 0.28, ttl: 40, hit: { range: 0, arc: Math.PI, damage: 40, poise: 14, knockback: 2, scaling: {}, type: 'arcane', parryable: false } },
  },
  // ---------- Bruxo: invocações ----------
  {
    id: 'warlock_imps', name: 'Invocar Diabretes', startup: 14, active: 1, recovery: 12, stamina: 8, mana: 26, cooldown: 720, moveMul: 0.2,
    summon: { enemyId: 'imp', count: 2, ticks: 30 * 25, max: 2 },
  },
  {
    id: 'warlock_guardian', name: 'Guardião Abissal', startup: 26, active: 1, recovery: 18, stamina: 12, mana: 50, cooldown: 1800, moveMul: 0, hyperArmor: [0, 26],
    summon: { enemyId: 'voidguard', count: 1, ticks: 30 * 30, max: 1 },
  },
  {
    id: 'imp_claw', name: 'Garra Ígnea', startup: 7, active: 2, recovery: 10, moveMul: 0.2, lunge: { speed: 4, from: 4, to: 8 }, trackUntil: 5, turnRate: deg(20), telegraph: 'normal',
    hit: { range: 0.9, arc: deg(60), damage: 12, poise: 8, knockback: 1, scaling: { int: 0.8 }, type: 'arcane', parryable: true },
  },
  {
    id: 'imp_bolt', name: 'Bola de Fogo', startup: 12, active: 1, recovery: 14, moveMul: 0, trackUntil: 10, turnRate: deg(18), telegraph: 'normal',
    projectile: { id: 'imp_fire', speed: 13, radius: 0.22, ttl: 34, hit: { range: 0, arc: Math.PI, damage: 16, poise: 8, knockback: 1.5, scaling: { int: 0.9 }, type: 'arcane', parryable: false } },
  },
  {
    id: 'guard_cleave', name: 'Talho Abissal', startup: 14, active: 4, recovery: 16, moveMul: 0.1, lunge: { speed: 4, from: 10, to: 14 }, trackUntil: 10, turnRate: deg(14), telegraph: 'normal', hyperArmor: [0, 18],
    hit: { range: 1.8, arc: deg(85), damage: 40, poise: 50, knockback: 4, scaling: { int: 1.0 }, type: 'physical', parryable: true },
  },
  {
    id: 'guard_slam', name: 'Pisão do Vazio', startup: 20, active: 2, recovery: 22, moveMul: 0, telegraph: 'danger', hyperArmor: [0, 22], shockwave: 2.8,
    hit: { range: 2.6, arc: Math.PI, damage: 52, poise: 80, knockback: 6, scaling: { int: 1.1 }, type: 'arcane', parryable: false, status: { id: 'slow', ticks: 45, power: 0.4 } },
  },

  // ---------- Colosso de Ossos (epic giant) ----------
  {
    id: 'giant_sweep', name: 'Varrida', startup: 22, active: 4, recovery: 24, moveMul: 0, trackUntil: 16, turnRate: deg(8), telegraph: 'normal', hyperArmor: [0, 26],
    hit: { range: 2.6, arc: deg(100), damage: 95, poise: 70, knockback: 8, scaling: {}, type: 'physical', parryable: false },
  },
  {
    id: 'giant_stomp', name: 'Pisão', startup: 18, active: 2, recovery: 26, moveMul: 0, telegraph: 'normal', hyperArmor: [0, 20], shockwave: 2.4,
    hit: { range: 2.2, arc: Math.PI, damage: 60, poise: 60, knockback: 7, scaling: {}, type: 'physical', parryable: false },
  },
  {
    id: 'giant_slam', name: 'Esmagamento', startup: 34, active: 3, recovery: 34, moveMul: 0, trackUntil: 24, turnRate: deg(6), telegraph: 'danger', hyperArmor: [0, 37],
    lunge: { speed: 2.5, from: 28, to: 34 }, shockwave: 3.6,
    hit: { range: 3.2, arc: deg(60), damage: 150, poise: 120, knockback: 9, scaling: {}, type: 'physical', parryable: false },
  },
  {
    id: 'spider_bite', name: 'Picada', startup: 12, active: 3, recovery: 14, moveMul: 0.1, lunge: { speed: 4, from: 9, to: 13 },
    trackUntil: 9, turnRate: deg(14), telegraph: 'normal',
    hit: { range: 1.3, arc: deg(50), damage: 62, poise: 30, knockback: 3, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'spider_leap', name: 'Bote', startup: 22, active: 8, recovery: 24, moveMul: 0, lunge: { speed: 12, from: 22, to: 30 },
    trackUntil: 18, turnRate: deg(10), hyperArmor: [8, 30], telegraph: 'danger',
    hit: { range: 1.0, arc: deg(60), damage: 110, poise: 70, knockback: 7, scaling: {}, type: 'physical', parryable: false, once: true },
  },
  {
    id: 'spider_web', name: 'Teia', startup: 14, active: 1, recovery: 18, moveMul: 0, trackUntil: 12, turnRate: deg(12), telegraph: 'normal',
    projectile: { id: 'web', speed: 11, radius: 0.35, ttl: 40, hit: { range: 0, arc: Math.PI, damage: 18, poise: 10, knockback: 1, scaling: {}, type: 'physical', parryable: false, status: { id: 'slow', ticks: 75, power: 0.55 } } },
  },
  ...TREE_SKILLS,
];

export const ACTIONS: Readonly<Record<string, ActionDef>> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function getAction(id: string): ActionDef {
  const a = ACTIONS[id];
  if (!a) throw new Error(`Unknown action: ${id}`);
  return a;
}

export const actionTotal = (a: ActionDef): number => a.startup + a.active + a.recovery;
