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
  const hostile = (p: Entity) => p.team !== e.team && p.kind !== 'projectile' && !isDead(p) && !hasStatus(p, 'stealth', ctx.tick);
  let target = ai.targetId >= 0 ? ctx.entities.get(ai.targetId) : undefined;
  if (target && !hostile(target)) target = undefined;

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
    if (target && (dist(e.pos, ai.home) > def.leashRange || dist(e.pos, target.pos) > def.aggroRange * 2.2)) {
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
