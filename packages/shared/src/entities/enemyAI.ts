import { isDead, startAction } from '../combat/combat';
import { getEnemy } from '../data/enemies';
import { hasStatus, statusMoveMul } from '../combat/statuses';
import { angleTo, dist, turnToward } from '../math/vec2';
import type { SimContext } from '../sim/context';
import { DT, type Entity } from '../sim/types';

const THINK_INTERVAL = 8;


/**
 * Enemy brain (server-side). Finite state machine:
 *   idle/wander -> chase -> strafe <-> attack (telegraphed) -> recover -> ...
 *   any -> return (leash) -> idle (full heal)
 * Attacks are chosen by weighted random among those whose range window fits,
 * gated by a per-enemy cooldown so the player always gets punish windows.
 */
export function updateEnemy(ctx: SimContext, e: Entity): void {
  const ai = e.ai;
  if (!ai || !e.enemyId || isDead(e)) return;
  const def = getEnemy(e.enemyId);

  // grazing (or a cultist's chant) breaks off the moment something hits or spooks the creature
  if (e.action?.id === 'ritual_chant' && ctx.tick - e.lastHitTick < 3) e.action = null;
  if (e.action?.id === 'graze' && (ctx.tick - e.lastHitTick < 3 || (ctx.tick % THINK_INTERVAL === e.id % THINK_INTERVAL && spooked(ctx, e)))) e.action = null;
  if (e.action) {
    // Actions drive movement themselves (lunges); otherwise decelerate.
    e.vel.x *= 0.6;
    e.vel.y *= 0.6;
    ai.lastSpeed = 0;
    return;
  }

  // summons treat their caster as home and never stray far from them
  const owner = e.ownerId !== undefined ? ctx.entities.get(e.ownerId) : undefined;
  if (owner) {
    ai.home.x = owner.pos.x;
    ai.home.y = owner.pos.y;
  }
  const behavior = def.behavior ?? 'hunter';
  // provoked: whoever hit us in the last 8 s becomes the target even out of aggro range
  const attacker = e.lastHitBy !== undefined && ctx.tick - e.lastHitTick < 240 ? ctx.entities.get(e.lastHitBy) : undefined;
  const fights = def.attacks.length > 0;
  if (behavior === 'passive' || behavior === 'villager') {
    if (!(fights && attacker && !isDead(attacker))) {
      calmBrain(ctx, e, behavior, attacker);
      return;
    }
  }
  // monsters leave the wildlife alone; everyone else is fair game
  const hostile = (p: Entity) =>
    p.team !== e.team && p.kind !== 'projectile' && !isDead(p) && !hasStatus(p, 'stealth', ctx.tick) && (p.team !== 2 || p === attacker);
  let target = ai.targetId >= 0 ? ctx.entities.get(ai.targetId) : undefined;
  if (target && !hostile(target)) target = undefined;
  if (!target && attacker && hostile(attacker) && ai.mode !== 'return') {
    target = attacker;
    ai.mode = 'chase';
  }
  const chaseRange = Math.max(def.aggroRange, attacker ? 14 : 0);

  if (ctx.tick >= ai.nextThink) {
    ai.nextThink = ctx.tick + THINK_INTERVAL;
    if (!target && ai.mode !== 'return') {
      let best: Entity | undefined;
      let bestD = def.aggroRange;
      for (const p of ctx.entities.values()) {
        if (!hostile(p)) continue;
        const d = dist(p.pos, e.pos);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) {
        target = best;
        ai.mode = 'chase';
      }
    }
    if (target && (dist(e.pos, ai.home) > def.leashRange || dist(e.pos, target.pos) > chaseRange * 2.2)) {
      target = undefined;
      ai.mode = 'return';
    }
    if (ctx.rng.chance(0.15)) ai.strafeDir = ai.strafeDir === 1 ? -1 : 1;
  }
  ai.targetId = target ? target.id : -1;

  let dirAngle = e.facing;
  let speed = 0;

  if (ai.mode === 'return') {
    const d = dist(e.pos, ai.home);
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1 * DT); // 10%/s while leashing back
    if (d < 0.8) {
      ai.mode = 'idle';
      e.hp = e.maxHp;
    } else {
      dirAngle = angleTo(e.pos, ai.home);
      speed = def.speed;
    }
  } else if (!target && owner) {
    // heel: trot back to the caster's side
    ai.mode = 'idle';
    const d = dist(e.pos, owner.pos);
    if (d > 2.4) {
      dirAngle = angleTo(e.pos, owner.pos);
      speed = def.speed * (d > 6 ? 1.2 : 0.8);
    }
  } else if (!target && behavior === 'cultist') {
    // hold the post around the circle, facing the sigil
    ai.mode = 'idle';
    const d = dist(e.pos, ai.home);
    if (d > 0.6) {
      dirAngle = angleTo(e.pos, ai.home);
      speed = def.speed * 0.5;
    } else if (ai.anchor) {
      e.facing = turnToward(e.facing, angleTo(e.pos, ai.anchor), 0.1);
      e.vel.x *= 0.5;
      e.vel.y *= 0.5;
      return;
    }
  } else if (!target) {
    ai.mode = 'wander';
    if (!ai.wanderTo || dist(e.pos, ai.wanderTo) < 0.5) {
      if (ctx.tick % 90 === e.id % 90) {
        const a = ctx.rng.range(0, Math.PI * 2);
        const r = ctx.rng.range(1, 4);
        ai.wanderTo = { x: ai.home.x + Math.cos(a) * r, y: ai.home.y + Math.sin(a) * r };
      }
    } else {
      dirAngle = angleTo(e.pos, ai.wanderTo);
      speed = def.speed * 0.35;
    }
  } else {
    const gap = dist(e.pos, target.pos) - e.radius - target.radius;
    const toT = angleTo(e.pos, target.pos);
    if (ctx.tick >= ai.attackReadyAt) {
      const options = def.attacks.filter((a) => gap >= a.minRange && gap <= a.maxRange);
      if (options.length) {
        const total = options.reduce((s, o) => s + o.weight, 0);
        let roll = ctx.rng.next() * total;
        let pick = options[0]!;
        for (const o of options) {
          roll -= o.weight;
          if (roll <= 0) {
            pick = o;
            break;
          }
        }
        startAction(ctx, e, pick.action, toT);
        ai.lastSpeed = 0;
        return;
      }
    }
    if (gap > def.preferredDist) {
      ai.mode = 'chase';
      dirAngle = toT;
      speed = def.speed;
    } else {
      ai.mode = 'strafe';
      dirAngle = toT + (Math.PI / 2) * ai.strafeDir + (gap < def.preferredDist * 0.5 ? ai.strafeDir * 0.6 : 0);
      speed = def.speed * 0.45;
    }
  }

  // Obstacle avoidance: if we barely moved while wanting to, sidestep for a moment.
  const moved = dist(e.pos, e.prevPos);
  if (ai.lastSpeed > 0.5 && moved < ai.lastSpeed * DT * 0.25 && ctx.tick > ai.avoidUntil) {
    ai.avoidUntil = ctx.tick + 15;
    ai.avoidSign = ctx.rng.chance(0.5) ? 1 : -1;
  }
  if (ctx.tick < ai.avoidUntil && speed > 0) dirAngle += ai.avoidSign * 1.2;
  ai.lastSpeed = speed;

  const faceTo = target ? angleTo(e.pos, target.pos) : dirAngle;
  e.facing = turnToward(e.facing, faceTo, 0.22);
  speed *= statusMoveMul(e, ctx.tick);
  const tx = Math.cos(dirAngle) * speed;
  const ty = Math.sin(dirAngle) * speed;
  e.vel.x += (tx - e.vel.x) * 0.3;
  e.vel.y += (ty - e.vel.y) * 0.3;
}

/**
 * Wildlife and villagers: wander around their herd / village, graze now and then and run from danger.
 * Wildlife runs from anyone (players and monsters); villagers only from monsters.
 */
function calmBrain(ctx: SimContext, e: Entity, behavior: 'passive' | 'villager', attacker: Entity | undefined): void {
  const ai = e.ai!;
  const def = getEnemy(e.enemyId!);
  const anchor = ai.anchor ?? ai.home;
  const scary = (p: Entity) =>
    p.kind !== 'projectile' && !isDead(p) && p.team !== e.team && (behavior === 'passive' ? p.team !== 2 : p.team === 1) && !hasStatus(p, 'stealth', ctx.tick);
  let threat = ai.targetId >= 0 ? ctx.entities.get(ai.targetId) : undefined;
  if (threat && (!scary(threat) || (ctx.tick > (ai.fleeUntil ?? 0) && dist(threat.pos, e.pos) > (def.fleeRange ?? 8) * 1.6))) threat = undefined;
  if (attacker && !isDead(attacker) && attacker !== threat) {
    threat = attacker;
    ai.fleeUntil = ctx.tick + 120;
  }
  if (ctx.tick >= ai.nextThink) {
    ai.nextThink = ctx.tick + THINK_INTERVAL;
    if (!threat) {
      let bestD = def.fleeRange ?? 8;
      for (const { e: p } of ctx.dynamics.query(e.pos.x, e.pos.y, bestD)) {
        if (!scary(p)) continue;
        // a sneaking (walking) player gets closer before the herd bolts
        const d = dist(p.pos, e.pos) * (p.kind === 'player' && !p.sprinting ? 1.35 : 1);
        if (d < bestD) {
          bestD = d;
          threat = p;
        }
      }
      if (threat) ai.fleeUntil = ctx.tick + 60;
    }
  }
  ai.targetId = threat ? threat.id : -1;

  let dirAngle = e.facing;
  let speed = 0;
  if (threat) {
    ai.mode = 'flee';
    ai.wanderTo = null;
    dirAngle = angleTo(threat.pos, e.pos);
    // don't flee forever: bend back toward home when far from it
    const far = dist(e.pos, anchor);
    if (far > 22) dirAngle = turnToward(dirAngle, angleTo(e.pos, anchor), Math.min(1.2, (far - 22) * 0.1));
    speed = def.speed * (behavior === 'villager' ? 1.05 : 1.15);
  } else if (ctx.tick < (ai.pauseUntil ?? 0)) {
    ai.mode = 'idle';
  } else {
    ai.mode = 'wander';
    if (!ai.wanderTo || dist(e.pos, ai.wanderTo) < 0.6) {
      ai.wanderTo = null;
      if (ctx.tick % 75 === e.id % 75) {
        if (behavior === 'passive' && ctx.rng.chance(0.45)) {
          startAction(ctx, e, 'graze', e.facing);
          return;
        }
        const a = ctx.rng.range(0, Math.PI * 2);
        const r = ctx.rng.range(1, behavior === 'villager' ? 11 : 6);
        ai.wanderTo = { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r };
      }
    } else {
      dirAngle = angleTo(e.pos, ai.wanderTo);
      speed = def.speed * (behavior === 'villager' ? 0.32 : 0.3);
    }
  }
  const moved = dist(e.pos, e.prevPos);
  if (ai.lastSpeed > 0.5 && moved < ai.lastSpeed * DT * 0.25 && ctx.tick > ai.avoidUntil) {
    ai.avoidUntil = ctx.tick + 15;
    ai.avoidSign = ctx.rng.chance(0.5) ? 1 : -1;
    if (!threat) ai.wanderTo = null;
  }
  if (ctx.tick < ai.avoidUntil && speed > 0) dirAngle += ai.avoidSign * 1.2;
  ai.lastSpeed = speed;
  if (speed > 0) e.facing = turnToward(e.facing, dirAngle, 0.25);
  speed *= statusMoveMul(e, ctx.tick);
  e.vel.x += (Math.cos(dirAngle) * speed - e.vel.x) * 0.3;
  e.vel.y += (Math.sin(dirAngle) * speed - e.vel.y) * 0.3;
}

function spooked(ctx: SimContext, e: Entity): boolean {
  const r = getEnemy(e.enemyId!).fleeRange ?? 8;
  for (const { e: p } of ctx.dynamics.query(e.pos.x, e.pos.y, r)) {
    if (p.kind === 'projectile' || isDead(p) || p.team === e.team || p.team === 2) continue;
    if (dist(p.pos, e.pos) < r) return true;
  }
  return false;
}
