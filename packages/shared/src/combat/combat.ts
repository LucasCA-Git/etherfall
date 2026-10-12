import { ACTIONS, actionTotal, getAction, type ActionDef, type HitDef } from '../data/actions';
import { CLASSES } from '../data/classes';
import {
  BACKSTAB_MUL,
  POISE_REGEN_DELAY_TICKS,
  RIPOSTE_MUL,
  STAMINA_REGEN_DELAY_TICKS,
  scalingMul,
} from '../data/curves';
import { ENEMIES } from '../data/enemies';
import { angleDiff, angleTo, dist, fromAngle, turnToward, type Vec2 } from '../math/vec2';
import type { SimContext } from '../sim/context';
import type { Entity } from '../sim/types';
import { hasStatus, removeStatus, statusPower } from './statuses';

/** Damage multiplier of the first attack out of stealth. */
export const AMBUSH_MUL = 1.6;
/** Damage-over-time statuses deal power/2 every DOT_INTERVAL ticks (power = damage per second). */
export const DOT_INTERVAL = 15;
import { isWalkable } from '../world/tiles';
import { talentBonus } from '../data/talents';
import { tileAt } from '../world/worldgen';

const FRONT_ARC = (75 * Math.PI) / 180;
/** Damage multiplier of a talent critical strike. */
export const CRIT_MUL = 1.5;
const BACK_ARC = (120 * Math.PI) / 180;

export type StartResult = 'ok' | 'stamina' | 'mana' | 'cooldown' | 'requires';

export const isDead = (e: Entity): boolean => e.action?.id === 'dead';
export const isActiveFrame = (def: ActionDef, t: number): boolean => t >= def.startup && t < def.startup + def.active;

export function inWindow(e: Entity, key: 'iframes' | 'hyperArmor'): boolean {
  if (!e.action) return false;
  const w = ACTIONS[e.action.id]?.[key];
  return !!w && e.action.t >= w[0] && e.action.t <= w[1];
}

export function canStart(ctx: SimContext, e: Entity, def: ActionDef): StartResult {
  if ((e.cooldowns[def.id] ?? 0) > ctx.tick) return 'cooldown';
  if (def.requires && !hasStatus(e, def.requires, ctx.tick)) return 'requires';
  if (def.stamina && e.stamina <= 0) return 'stamina';
  if (def.mana && e.mana < def.mana) return 'mana';
  return 'ok';
}

/** Start an action, paying its costs. Callers must check `canStart` for player-initiated actions. */
export function startAction(ctx: SimContext, e: Entity, actionId: string, dir: number, mul = 1, combo = 0): void {
  const def = getAction(actionId);
  if (def.stamina) {
    e.stamina = Math.max(0, e.stamina - def.stamina);
    e.staminaRegenAt = ctx.tick + STAMINA_REGEN_DELAY_TICKS;
  }
  if (def.mana) e.mana = Math.max(0, e.mana - def.mana);
  if (def.cooldown) e.cooldowns[def.id] = ctx.tick + Math.round(def.cooldown * (1 - Math.min(0.5, Math.max(0, talentBonus(e, 'cooldown')))));
  if (def.requires) removeStatus(e, def.requires);
  // attacking breaks stealth; the first blow out of it is an ambush
  const offensive = !!(def.hit || def.projectile || def.spikes || def.strikes || def.zone || def.seal);
  let power = 1;
  if (offensive && hasStatus(e, 'stealth', ctx.tick)) {
    removeStatus(e, 'stealth');
    power = AMBUSH_MUL;
  }
  e.action = { id: actionId, t: 0, dir, charge: 0, charging: !!def.chargeable, mul, power, combo, hits: [], connected: false };
  e.facing = dir;
  e.blocking = false;
  e.sprinting = false;
  if (actionId === 'dodge') ctx.emit({ type: 'dodge', id: e.id, x: e.pos.x, y: e.pos.y, dir });
  if (def.telegraph && def.hit) {
    ctx.emit({
      type: 'telegraph', id: e.id, actionId, danger: def.telegraph === 'danger', x: e.pos.x, y: e.pos.y, dir,
      range: def.hit.range + e.radius + (def.lunge ? (def.lunge.speed * (def.lunge.to - def.lunge.from)) / 30 : 0),
      arc: def.hit.arc, ticks: def.startup,
    });
  }
}

/** Force a locked reaction (stagger, parried, guard break, dead) regardless of current action. */
export function forceAction(e: Entity, actionId: string): void {
  e.action = { id: actionId, t: 0, dir: e.facing, charge: 0, charging: false, mul: 1, power: 1, combo: 0, hits: [], connected: false };
  e.blocking = false;
  e.sprinting = false;
}

export function chargeMul(e: Entity): number {
  const a = e.action;
  if (!a) return 1;
  const def = ACTIONS[a.id];
  if (!def?.chargeable) return 1;
  return 1 + (def.chargeable.maxMul - 1) * Math.min(1, a.charge / def.chargeable.maxTicks);
}

/** Per-tick action logic that runs BEFORE movement integration (tracking, lunges, spawns). */
export function actionPreMove(ctx: SimContext, e: Entity): void {
  const a = e.action;
  if (!a || a.charging) return;
  const def = getAction(a.id);

  if (e.kind === 'enemy' && def.trackUntil !== undefined && a.t < def.trackUntil && e.ai) {
    const tgt = ctx.entities.get(e.ai.targetId);
    if (tgt && !isDead(tgt)) {
      a.dir = turnToward(a.dir, angleTo(e.pos, tgt.pos), def.turnRate ?? 0.2);
      e.facing = a.dir;
    }
  }

  const rooted = hasStatus(e, 'root', ctx.tick);
  if (def.lunge) {
    if (rooted) {
      e.vel.x = 0;
      e.vel.y = 0;
    } else if (a.t >= def.lunge.from && a.t < def.lunge.to && !a.connected) {
      const v = fromAngle(a.dir, def.lunge.speed * a.mul);
      e.vel.x = v.x;
      e.vel.y = v.y;
    } else if (a.t === def.lunge.to || a.connected) {
      e.vel.x *= 0.35;
      e.vel.y *= 0.35;
    }
  }

  if (a.t === def.startup) {
    if (def.hit || def.projectile) ctx.emit({ type: 'swing', id: e.id, actionId: a.id, x: e.pos.x, y: e.pos.y, dir: a.dir });
    if (def.projectile) {
      const n = def.projectile.count ?? 1;
      const spread = def.projectile.spread ?? 0;
      for (let i = 0; i < n; i++) ctx.spawnProjectile(e, a.id, a.dir + (i - (n - 1) / 2) * spread, chargeMul(e) * a.power);
    }
    if (def.shockwave) ctx.emit({ type: 'shockwave', id: e.id, x: e.pos.x, y: e.pos.y, radius: def.shockwave });
    if (def.selfStatus) ctx.applyStatus(e, def.selfStatus.id, def.selfStatus.ticks, def.selfStatus.power, e.id);
    if (def.zone) ctx.addZone(e, def, e.pos.x + Math.cos(a.dir) * def.zone.dist, e.pos.y + Math.sin(a.dir) * def.zone.dist);
    if (def.strikes) {
      const s = def.strikes;
      const cx = e.pos.x + Math.cos(a.dir) * s.dist;
      const cy = e.pos.y + Math.sin(a.dir) * s.dist;
      for (let i = 0; i < s.count; i++) {
        const ang = ctx.rng.range(0, Math.PI * 2);
        const rr = i === 0 ? 0 : ctx.rng.range(0.4, s.spread);
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        const at = ctx.tick + s.delay + i * s.interval;
        ctx.scheduleStrike(e, a.id, x, y, at);
        ctx.emit({ type: 'strikeWarn', ownerId: e.id, actionId: a.id, x, y, radius: s.radius, ticks: at - ctx.tick });
      }
    }
    if (def.seal) castSeal(ctx, e, def, a.dir);
    if (def.summon) ctx.summon(e, def.summon.enemyId, def.summon.count, def.summon.ticks, def.summon.max, a.dir);
    if (def.heal) castHeal(ctx, e, def);
  }

  // Ice spikes: one segment per active tick, marching away from the caster; stops at walls.
  if (def.spikes && !a.connected) {
    const k = a.t - def.startup;
    const sp = def.spikes;
    if (k >= 0 && k < sp.count) {
      const d = sp.startDist + k * sp.spacing;
      const x = e.pos.x + Math.cos(a.dir) * d;
      const y = e.pos.y + Math.sin(a.dir) * d;
      if (!isWalkable(tileAt(ctx.world, x, y)) && tileAt(ctx.world, x, y) !== 5) {
        a.connected = true; // blocked by rock: the rest of the line fizzles
        return;
      }
      ctx.emit({ type: 'spikes', id: e.id, x, y, dir: a.dir, idx: k, radius: sp.radius });
      for (const c of ctx.dynamics.query(x, y, sp.radius)) {
        const t = c.e;
        if (t.team === e.team || isDead(t) || a.hits.includes(t.id)) continue;
        a.hits.push(t.id);
        resolveHit(ctx, e, t, sp.hit, { x: e.pos.x, y: e.pos.y }, 1, false);
      }
    }
  }
}

/** Support burst: heal / cleanse / buff the caster and every living ally in range. */
function castHeal(ctx: SimContext, e: Entity, def: ActionDef): void {
  const h = def.heal!;
  const amount = h.amount * scalingMul(e.attrs, h.scaling) * (1 + talentBonus(e, 'healPower'));
  const allies = [...ctx.entities.values()].filter((t) => t.team === e.team && t.kind !== 'projectile' && !isDead(t) && dist(e.pos, t.pos) <= h.radius + t.radius);
  allies.sort((p, q) => p.id - q.id);
  for (const t of allies) {
    if (h.cleanse && (hasStatus(t, 'slow', ctx.tick) || hasStatus(t, 'root', ctx.tick))) {
      removeStatus(t, 'slow');
      removeStatus(t, 'root');
      ctx.emit({ type: 'cleanse', source: e.id, target: t.id, x: t.pos.x, y: t.pos.y });
    }
    if (amount > 0) ctx.heal(e, t, amount);
    if (h.status) ctx.applyStatus(t, h.status.id, h.status.ticks, h.status.power, e.id);
  }
}

function castSeal(ctx: SimContext, e: Entity, def: ActionDef, dir: number): void {
  const sl = def.seal!;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const t of ctx.entities.values()) {
    if (t.team === e.team || t.kind === 'projectile' || isDead(t)) continue;
    const d = dist(e.pos, t.pos) - t.radius;
    if (d > sl.range || d >= bestD) continue;
    if (Math.abs(angleDiff(dir, angleTo(e.pos, t.pos))) > sl.arc) continue;
    best = t;
    bestD = d;
  }
  if (!best) return;
  ctx.applyStatus(best, sl.status.id, sl.status.ticks, sl.status.power, e.id);
  ctx.emit({ type: 'seal', id: e.id, target: best.id, x: best.pos.x, y: best.pos.y });
}

/** Resolve melee hits for an action in its active frames (runs AFTER movement). */
export function actionHits(ctx: SimContext, e: Entity): void {
  const a = e.action;
  if (!a || a.charging) return;
  const def = getAction(a.id);
  if (!def.hit || !isActiveFrame(def, a.t) || (def.hit.once && a.connected)) return;
  if (def.rehitEvery && (a.t - def.startup) % def.rehitEvery === 0) a.hits = [];
  const hit = def.hit;
  const reach = e.radius + hit.range;
  const cands = ctx.dynamics.query(e.pos.x, e.pos.y, reach);
  // Deterministic order: by entity id.
  cands.sort((p, q) => p.e.id - q.e.id);
  for (const c of cands) {
    if (e.action !== a) break; // interrupted mid-swing (e.g. parried)
    const t = c.e;
    if (t === e || t.team === e.team || isDead(t) || a.hits.includes(t.id)) continue;
    const d = dist(e.pos, t.pos) - t.radius - e.radius;
    if (d > hit.range) continue;
    const off = Math.abs(angleDiff(a.dir, angleTo(e.pos, t.pos)));
    const tolerance = d < 0.15 ? 0.35 : 0;
    if (hit.arc < Math.PI && off > hit.arc + tolerance) continue;
    a.hits.push(t.id);
    const res = resolveHit(ctx, e, t, hit, e.pos, chargeMul(e) * a.power, true);
    if (res === 'parried') break;
    if (hit.once) {
      a.connected = true;
      break;
    }
  }
}

/** Advance the action clock and finish it when its frames are exhausted. */
export function actionPostTick(ctx: SimContext, e: Entity): void {
  const a = e.action;
  if (!a) return;
  if (a.charging) {
    a.charge++;
    return;
  }
  a.t++;
  const def = getAction(a.id);
  if (a.t >= actionTotal(def) && a.id !== 'dead') {
    e.action = null;
    if (e.kind === 'enemy' && e.ai && e.enemyId) {
      const ed = ENEMIES[e.enemyId];
      if (ed && (def.hit || def.projectile)) e.ai.attackReadyAt = ctx.tick + ctx.rng.int(ed.attackCooldown[0], ed.attackCooldown[1]);
    }
  }
}

/**
 * Apply one hit. Order of checks follows the soulslike contract:
 * i-frames > parry > block/guard break > damage (crit, absorb) > poise > knockback > death.
 */
export function resolveHit(
  ctx: SimContext,
  attacker: Entity,
  target: Entity,
  hit: HitDef,
  from: Vec2,
  mul: number,
  melee: boolean,
): 'evaded' | 'parried' | 'blocked' | 'hit' | 'ignored' {
  if (isDead(target) || target.kind === 'projectile') return 'ignored';
  if (inWindow(target, 'iframes')) {
    ctx.emit({ type: 'evade', target: target.id, x: target.pos.x, y: target.pos.y });
    if (target.kind === 'player' && melee) ctx.applyStatus(target, 'counter', 45, 1, attacker.id);
    return 'evaded';
  }

  const toSource = angleTo(target.pos, from);
  const rel = Math.abs(angleDiff(target.facing, toSource));
  const frontal = rel < FRONT_ARC;

  if (hit.parryable && melee && target.blocking && frontal && target.parryUntil >= ctx.tick) {
    forceAction(attacker, 'parried');
    ctx.emit({ type: 'parry', attacker: attacker.id, target: target.id, x: target.pos.x, y: target.pos.y });
    if (target.kind === 'player') ctx.applyStatus(target, 'counter', 60, 1, attacker.id);
    return 'parried';
  }

  let raw = hit.damage * scalingMul(attacker.attrs, hit.scaling) * mul;
  let crit: 'none' | 'backstab' | 'riposte' | 'critical' = 'none';
  if (attacker.kind === 'player') {
    const typed = hit.type === 'physical' ? talentBonus(attacker, 'dmgPhysical') : talentBonus(attacker, 'dmgArcane');
    const missing = attacker.maxHp > 0 ? 1 - attacker.hp / attacker.maxHp : 0;
    raw *= Math.max(0.1, 1 + talentBonus(attacker, 'dmg') + typed + talentBonus(attacker, 'berserk') * missing);
  }
  raw *= 1 + statusPower(attacker, 'empower', ctx.tick);
  if (melee && target.action && (target.action.id === 'parried' || target.action.id === 'guardbreak')) {
    raw *= RIPOSTE_MUL;
    crit = 'riposte';
  } else if (melee && rel > BACK_ARC && !target.blocking) {
    raw *= BACKSTAB_MUL;
    crit = 'backstab';
  }
  if (crit === 'none' && attacker.kind === 'player') {
    const chance = talentBonus(attacker, 'critChance');
    if (chance > 0 && ctx.rng.next() < chance) {
      raw *= CRIT_MUL;
      crit = 'critical';
    }
  }

  const guard = statusPower(target, 'ironguard', ctx.tick);
  if (guard > 0) raw *= 1 - guard;
  let kb = hit.knockback * (guard > 0 ? 0.3 : 1);
  let result: 'blocked' | 'hit' = 'hit';
  if (target.blocking && frontal && target.classId) {
    const cls = CLASSES[target.classId];
    const absorbG = Math.min(0.95, Math.max(0, cls.guardAbsorb + talentBonus(target, 'blockAbsorb')));
    const cost = raw * cls.guardStaminaMul;
    target.staminaRegenAt = ctx.tick + STAMINA_REGEN_DELAY_TICKS;
    if (target.stamina < cost) {
      target.stamina = 0;
      raw *= 1 - absorbG * 0.5;
      forceAction(target, 'guardbreak');
      ctx.emit({ type: 'guardBreak', target: target.id, x: target.pos.x, y: target.pos.y });
    } else {
      target.stamina -= cost;
      raw *= 1 - absorbG;
      kb *= 0.4;
      result = 'blocked';
      ctx.emit({ type: 'block', attacker: attacker.id, target: target.id, amount: Math.round(raw), x: target.pos.x, y: target.pos.y });
    }
  }

  const absorb = target.enemyId ? ENEMIES[target.enemyId]?.absorb[hit.type] ?? 0 : 0;
  const dmg = Math.max(1, Math.round(raw * (1 - absorb)));
  target.hp -= dmg;
  target.lastHitTick = ctx.tick;
  const dir = angleTo(from, target.pos);
  if (result === 'hit') {
    ctx.emit({ type: 'hit', attacker: attacker.id, target: target.id, amount: dmg, crit, x: target.pos.x, y: target.pos.y, dir, dtype: hit.type });
  }

  // Poise: hyper armor frames ignore poise damage entirely.
  if (result === 'hit' && hit.status && target.hp > 0) {
    const st = hit.status.id;
    const power = st === 'slow' ? hit.status.power * (1 + talentBonus(attacker, 'slowPower')) : st === 'poison' || st === 'curse' || st === 'burn' ? hit.status.power * (1 + talentBonus(attacker, 'dotPower')) : hit.status.power;
    ctx.applyStatus(target, hit.status.id, hit.status.ticks, power, attacker.id);
  }
  const steal = talentBonus(attacker, 'lifesteal') + (hit.drain ?? 0);
  if (steal > 0 && !isDead(attacker)) ctx.heal(attacker, attacker, dmg * steal);
  if (result === 'hit' && guard <= 0 && !inWindow(target, 'hyperArmor') && target.action?.id !== 'guardbreak') {
    target.poise -= hit.poise * mul;
    target.poiseRegenAt = ctx.tick + POISE_REGEN_DELAY_TICKS;
    if (target.poise <= 0 && target.hp > 0) {
      target.poise = target.maxPoise;
      forceAction(target, 'stagger');
      ctx.emit({ type: 'stagger', target: target.id, x: target.pos.x, y: target.pos.y });
    }
  }

  const k = fromAngle(dir, kb / Math.max(0.3, target.mass));
  target.vel.x += k.x;
  target.vel.y += k.y;

  if (target.hp <= 0) ctx.kill(target, attacker);
  return result;
}
