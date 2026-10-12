import type { Attributes } from '../sim/types';

/**
 * Configurable progression curves (levels 1–60 for v1). All derived numbers flow
 * through here so balance can be tuned in one place.
 */
export const MAX_LEVEL = 60;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(90 * Math.pow(level, 1.6) + 60 * level);
}

/** Soft-capped attribute contribution: linear to 20, half to 40, quarter after. */
export function softCap(v: number): number {
  if (v <= 20) return v;
  if (v <= 40) return 20 + (v - 20) * 0.5;
  return 30 + (v - 40) * 0.25;
}

export interface DerivedStats {
  maxHp: number;
  maxStamina: number;
  maxMana: number;
  maxPoise: number;
}

export function deriveStats(a: Attributes, level: number, poiseBonus = 0): DerivedStats {
  return {
    maxHp: Math.round(300 + softCap(a.vit) * 14 + (level - 1) * 5),
    maxStamina: Math.round(70 + softCap(a.end) * 2.5),
    maxMana: Math.round(20 + softCap(a.int) * 3 + softCap(a.wil) * 1.5),
    maxPoise: Math.round(20 + softCap(a.vit) + poiseBonus),
  };
}

/** Multiplier from attribute scaling coefficients (coef 1.0 => +1% per soft-capped point). */
export function scalingMul(a: Attributes, scaling: Partial<Record<keyof Attributes, number>>): number {
  let m = 1;
  for (const k of Object.keys(scaling) as (keyof Attributes)[]) m += ((scaling[k] ?? 0) * softCap(a[k])) / 100;
  return m;
}

export const STAMINA_REGEN_PER_SEC = 48;
export const STAMINA_REGEN_DELAY_TICKS = 18;
export const POISE_REGEN_DELAY_TICKS = 60;
export const PARRY_WINDOW_TICKS = 5;
export const PARRY_REARM_TICKS = 15;
export const INPUT_BUFFER_TICKS = 8;
export const PLAYER_RESPAWN_TICKS = 90;
export const BACKSTAB_MUL = 1.5;
export const RIPOSTE_MUL = 2.5;
export const SPRINT_MUL = 1.55;
export const SPRINT_STAMINA_PER_SEC = 14;
export const BLOCK_MOVE_MUL = 0.45;
export const ATTR_POINTS_PER_LEVEL = 3;
export const ATTR_MAX = 99;
/** Distance at which a player picks up their own essence mark. */
export const ESSENCE_PICKUP_RANGE = 1.3;
