import type { DamageType } from '../sim/types';
import { CREATURE_ENEMIES } from './creatures';

export interface EnemyAttackChoice {
  action: string;
  weight: number;
  /** Distance window (center to center minus radii) in which the attack is chosen. */
  minRange: number;
  maxRange: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  poise: number;
  radius: number;
  mass: number;
  speed: number;
  aggroRange: number;
  leashRange: number;
  preferredDist: number;
  xp: number;
  absorb: Record<DamageType, number>;
  attacks: EnemyAttackChoice[];
  /** Ticks between attacks (min,max) — gives the player windows to punish. */
  attackCooldown: [number, number];
  respawnTicks: number;
  /**
   * Brain: 'hunter' (default monster), 'passive' wildlife that grazes and flees (and may fight back
   * when hurt if it has attacks), 'villager' (wanders its village, flees monsters), 'cultist'
   * (keeps to its ritual post until someone comes close or hits it).
   */
  behavior?: 'hunter' | 'passive' | 'villager' | 'cultist';
  /** Team (default 1 = monsters; 0 = the players' side; 2 = wildlife, hunted by everyone). */
  team?: number;
  /** Passive creatures run from anything hostile closer than this. */
  fleeRange?: number;
}

export const ENEMIES: Readonly<Record<string, EnemyDef>> = {
  hollow: {
    id: 'hollow',
    name: 'Errante Oco',
    hp: 170,
    poise: 40,
    radius: 0.42,
    mass: 1.3,
    speed: 3.0,
    aggroRange: 9,
    leashRange: 24,
    preferredDist: 1.6,
    xp: 45,
    absorb: { physical: 0.1, arcane: 0.0 },
    attacks: [
      { action: 'hollow_slash', weight: 3, minRange: 0, maxRange: 1.6 },
      { action: 'hollow_overhead', weight: 1.4, minRange: 0, maxRange: 1.9 },
    ],
    attackCooldown: [24, 54],
    respawnTicks: 30 * 40,
  },
  ashwolf: {
    id: 'ashwolf',
    name: 'Lobo de Cinza',
    hp: 105,
    poise: 20,
    radius: 0.38,
    mass: 0.9,
    speed: 5.2,
    aggroRange: 11,
    leashRange: 28,
    preferredDist: 3.2,
    xp: 30,
    absorb: { physical: 0.0, arcane: 0.1 },
    attacks: [
      { action: 'wolf_bite', weight: 3, minRange: 0, maxRange: 1.1 },
      { action: 'wolf_lunge', weight: 2, minRange: 1.6, maxRange: 4.6 },
    ],
    attackCooldown: [20, 45],
    respawnTicks: 30 * 35,
  },
  giantspider: {
    id: 'giantspider',
    name: 'Formiga-Leão Gigante',
    hp: 420,
    poise: 70,
    radius: 1.4,
    mass: 5,
    speed: 4.0,
    aggroRange: 10,
    leashRange: 26,
    preferredDist: 2.6,
    xp: 140,
    absorb: { physical: 0.15, arcane: 0.0 },
    attacks: [
      { action: 'spider_bite', weight: 3, minRange: 0, maxRange: 1.5 },
      { action: 'spider_leap', weight: 1.6, minRange: 2, maxRange: 6 },
      { action: 'spider_web', weight: 1.4, minRange: 3, maxRange: 9 },
    ],
    attackCooldown: [30, 60],
    respawnTicks: 30 * 60,
  },
  vampire: {
    id: 'vampire',
    name: 'Nobre Vampírico',
    hp: 360,
    poise: 55,
    radius: 0.42,
    mass: 1.3,
    speed: 4.6,
    aggroRange: 11,
    leashRange: 26,
    preferredDist: 2.4,
    xp: 120,
    absorb: { physical: 0.1, arcane: 0.15 },
    attacks: [
      { action: 'vampire_claw', weight: 3, minRange: 0, maxRange: 1.4 },
      { action: 'vampire_dash', weight: 1.4, minRange: 2.2, maxRange: 7 },
      { action: 'vampire_bolt', weight: 1.2, minRange: 3, maxRange: 10 },
    ],
    attackCooldown: [24, 50],
    respawnTicks: 30 * 60,
  },
  // ---------- warlock summons (allied; never spawn in the wild, give no XP) ----------
  imp: {
    id: 'imp',
    name: 'Diabrete',
    hp: 110,
    poise: 20,
    radius: 0.3,
    mass: 0.6,
    speed: 5.2,
    aggroRange: 11,
    leashRange: 14,
    preferredDist: 4,
    xp: 0,
    absorb: { physical: 0, arcane: 0.3 },
    attacks: [
      { action: 'imp_claw', weight: 1, minRange: 0, maxRange: 0.9 },
      { action: 'imp_bolt', weight: 3, minRange: 1.5, maxRange: 9 },
    ],
    attackCooldown: [20, 40],
    respawnTicks: 0,
  },
  voidguard: {
    id: 'voidguard',
    name: 'Guardião Abissal',
    hp: 620,
    poise: 140,
    radius: 0.75,
    mass: 6,
    speed: 4.6,
    aggroRange: 11,
    leashRange: 15,
    preferredDist: 1.0,
    xp: 0,
    absorb: { physical: 0.25, arcane: 0.25 },
    attacks: [
      { action: 'guard_cleave', weight: 3, minRange: 0, maxRange: 1.8 },
      { action: 'guard_slam', weight: 1.2, minRange: 0, maxRange: 2.2 },
    ],
    attackCooldown: [18, 36],
    respawnTicks: 0,
  },
  // ---------- skill-tree summons (allied, temporary, no XP) ----------
  phantom: {
    id: 'phantom', name: 'Imagem Ilusória', hp: 60, poise: 10, radius: 0.36, mass: 0.6, speed: 5.4,
    aggroRange: 10, leashRange: 12, preferredDist: 1.0, xp: 0, absorb: { physical: 0, arcane: 0 },
    attacks: [{ action: 'phantom_slash', weight: 1, minRange: 0, maxRange: 1.1 }], attackCooldown: [14, 28], respawnTicks: 0,
  },
  spiritwolf: {
    id: 'spiritwolf', name: 'Lobo Espiritual', hp: 180, poise: 25, radius: 0.38, mass: 0.9, speed: 5.6,
    aggroRange: 11, leashRange: 14, preferredDist: 1.0, xp: 0, absorb: { physical: 0.1, arcane: 0.1 },
    attacks: [{ action: 'spirit_bite', weight: 1, minRange: 0, maxRange: 1.1 }], attackCooldown: [16, 32], respawnTicks: 0,
  },
  felhound: {
    id: 'felhound', name: 'Cão Infernal', hp: 220, poise: 30, radius: 0.4, mass: 1, speed: 5.4,
    aggroRange: 11, leashRange: 14, preferredDist: 1.0, xp: 0, absorb: { physical: 0.1, arcane: 0.3 },
    attacks: [{ action: 'fel_bite', weight: 1, minRange: 0, maxRange: 1.1 }], attackCooldown: [16, 32], respawnTicks: 0,
  },
  ancestor: {
    id: 'ancestor', name: 'Guerreiro Ancestral', hp: 260, poise: 60, radius: 0.42, mass: 1.4, speed: 4.4,
    aggroRange: 11, leashRange: 14, preferredDist: 1.4, xp: 0, absorb: { physical: 0.2, arcane: 0.2 },
    attacks: [{ action: 'ancestor_cleave', weight: 1, minRange: 0, maxRange: 1.6 }], attackCooldown: [18, 34], respawnTicks: 0,
  },
  bonegiant: {
    id: 'bonegiant',
    name: 'Minotauro Colosso',
    hp: 1400,
    poise: 220,
    radius: 1.2,
    mass: 12,
    speed: 3.1,
    aggroRange: 12,
    leashRange: 30,
    preferredDist: 2.2,
    xp: 420,
    absorb: { physical: 0.2, arcane: 0.05 },
    attacks: [
      { action: 'giant_sweep', weight: 3, minRange: 0, maxRange: 2.4 },
      { action: 'giant_stomp', weight: 1.6, minRange: 0, maxRange: 1.6 },
      { action: 'giant_slam', weight: 1.5, minRange: 0.5, maxRange: 3.2 },
    ],
    attackCooldown: [40, 75],
    respawnTicks: 30 * 120,
  },
  ...CREATURE_ENEMIES,
};

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES[id];
  if (!e) throw new Error(`Unknown enemy: ${id}`);
  return e;
}
