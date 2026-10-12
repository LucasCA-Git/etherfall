import { inWindow, isDead } from '../combat/combat';
import { xpToNext } from '../data/curves';
import { talentPointsFree } from '../data/talents';
import type { Simulation } from '../sim/simulation';
import type { AbilitySlot, ClassId, EntityKind, StatusId } from '../sim/types';

/** Render/replication view of an entity. Everything a client needs, nothing it could abuse. */
export interface EntitySnap {
  id: number;
  kind: EntityKind;
  name: string;
  team: number;
  classId?: ClassId;
  enemyId?: string;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  radius: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  poise: number;
  maxPoise: number;
  action: string | null;
  at: number;
  adir: number;
  charge: number;
  charging: boolean;
  combo: number;
  blocking: boolean;
  iframe: boolean;
  dead: boolean;
  hitTick: number;
  cooldowns: Record<string, number>;
  statuses: StatusId[];
  /** Viewer-only progression fields. */
  xp?: number;
  xpNext?: number;
  unspent?: number;
  attrs?: Record<string, number>;
  essenceMark?: { x: number; y: number; amount: number } | null;
  talents?: Record<string, number>;
  talentPoints?: number;
  subclass?: string | null;
  loadout?: Partial<Record<AbilitySlot, string>>;
}

export interface Snapshot {
  tick: number;
  you: number;
  entities: EntitySnap[];
  zones: Array<{ id: number; kind: string; x: number; y: number; r: number; until: number; team: number }>;
}

/**
 * Interest management: a viewer only receives entities within `radius` meters.
 * The viewer itself is always included (with private fields like cooldowns).
 */
export function buildSnapshot(sim: Simulation, viewerId: number, radius = 30): Snapshot {
  const viewer = sim.entities.get(viewerId);
  const out: EntitySnap[] = [];
  const r2 = radius * radius;
  for (const e of sim.entities.values()) {
    if (viewer && e !== viewer) {
      const dx = e.pos.x - viewer.pos.x;
      const dy = e.pos.y - viewer.pos.y;
      if (dx * dx + dy * dy > r2) continue;
    }
    out.push({
      id: e.id, kind: e.kind, name: e.name, team: e.team, classId: e.classId, enemyId: e.enemyId, level: e.level,
      x: e.pos.x, y: e.pos.y, vx: e.vel.x, vy: e.vel.y, facing: e.facing, radius: e.radius,
      hp: e.hp, maxHp: e.maxHp, stamina: e.stamina, maxStamina: e.maxStamina, mana: e.mana, maxMana: e.maxMana,
      poise: e.poise, maxPoise: e.maxPoise,
      action: e.action?.id ?? null, at: e.action?.t ?? 0, adir: e.action?.dir ?? e.facing,
      charge: e.action?.charge ?? 0, charging: e.action?.charging ?? false, combo: e.action?.combo ?? 0,
      blocking: e.blocking, iframe: inWindow(e, 'iframes'), dead: isDead(e), hitTick: e.lastHitTick,
      cooldowns: e === viewer ? { ...e.cooldowns } : {},
      statuses: e.statuses.filter((s) => s.until > sim.tick).map((s) => s.id),
      ...(e === viewer
        ? { xp: e.xp, xpNext: xpToNext(e.level), unspent: e.unspent, attrs: { ...e.attrs }, essenceMark: e.essenceMark ? { ...e.essenceMark } : null, talents: { ...e.talents }, talentPoints: talentPointsFree(e), subclass: e.subclass, loadout: { ...e.loadout } }
        : {}),
    });
  }
  const zones = sim.zones
    .filter((z) => !viewer || (z.x - viewer.pos.x) ** 2 + (z.y - viewer.pos.y) ** 2 <= (radius + z.r) ** 2)
    .map((z) => ({ id: z.id, kind: z.kind, x: z.x, y: z.y, r: z.r, until: z.until, team: z.team }));
  return { tick: sim.tick, you: viewerId, entities: out, zones };
}
