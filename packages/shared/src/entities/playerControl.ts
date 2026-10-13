import { slotAction, talentBonus } from '../data/talents';
import { canStart, forceAction, isDead, startAction } from '../combat/combat';
import { getAction } from '../data/actions';
import { CLASSES } from '../data/classes';
import {
  BLOCK_MOVE_MUL,
  INPUT_BUFFER_TICKS,
  PARRY_REARM_TICKS,
  PARRY_WINDOW_TICKS,
  SPRINT_MUL,
  SPRINT_STAMINA_PER_SEC,
  STAMINA_REGEN_DELAY_TICKS,
} from '../data/curves';
import { terrainSpeed } from '../physics/collision';
import { bonfireSeats, SIGN_RANGE, summonSignOf } from '../world/worldgen';
import { statusMoveMul } from '../combat/statuses';
import type { SimContext } from '../sim/context';
import { Btn, DT, type Entity } from '../sim/types';
import { say, villagerLine } from '../sim/living';
import { angleTo } from '../math/vec2';

const BONFIRE_RANGE = 1.9;

/**
 * Turns the latest InputCommand into intentions: action starts (with buffering and
 * dodge-cancel rules), block/parry, facing and desired velocity. Never trusts the
 * client for outcomes — costs, cooldowns and timing are all checked here.
 */
export function updatePlayer(ctx: SimContext, e: Entity): void {
  const cmd = e.input;
  const held = cmd.buttons;
  const pressed = held & ~e.prevButtons;
  e.prevButtons = held;
  if (isDead(e) || !e.classId) {
    e.vel.x = 0;
    e.vel.y = 0;
    return;
  }
  const cls = CLASSES[e.classId];

  let mx = cmd.mx;
  let my = cmd.my;
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }
  const moving = ml > 0.1;

  let want: string | null = null;
  if (pressed & Btn.Dodge) want = 'dodge';
  else if (pressed & Btn.AbilQ) want = slotAction(e.classId, e.loadout, e.talents, 'q');
  else if (pressed & Btn.AbilE) want = slotAction(e.classId, e.loadout, e.talents, 'e');
  else if (pressed & Btn.Abil1) want = slotAction(e.classId, e.loadout, e.talents, 'a1');
  else if (pressed & Btn.Abil2) want = slotAction(e.classId, e.loadout, e.talents, 'a2');
  else if (pressed & Btn.Abil3) want = slotAction(e.classId, e.loadout, e.talents, 'a3');
  else if (pressed & Btn.Abil4) want = slotAction(e.classId, e.loadout, e.talents, 'a4');
  else if (pressed & Btn.Ultimate) want = slotAction(e.classId, e.loadout, e.talents, 'r');
  else if (pressed & Btn.Heavy) want = cls.heavyAction;
  else if (pressed & Btn.Light) want = cls.lightAction;

  // Seated at a bonfire: any movement or action stands the player up.
  if (e.action?.id === 'sit' && (moving || want || pressed & Btn.Interact)) {
    e.action = null;
    if (pressed & Btn.Interact) return;
  }
  if (pressed & Btn.Interact && !e.action && !tryPortal(ctx, e) && !tryChest(ctx, e) && !tryTalk(ctx, e) && !trySign(ctx, e)) tryRest(ctx, e);

  if (e.action) {
    const def = getAction(e.action.id);
    if (e.action.charging) {
      const max = def.chargeable?.maxTicks ?? 0;
      if (!(held & Btn.Heavy) || e.action.charge >= max) e.action.charging = false;
    }
    if (want && !def.locked) {
      const cancellable =
        want === 'dodge' && def.cancelFrom !== undefined && e.action.t >= def.cancelFrom && canStart(ctx, e, getAction('dodge')) === 'ok';
      if (cancellable) {
        e.action = null;
        e.buffered = null;
      } else {
        e.buffered = { actionId: want, until: ctx.tick + INPUT_BUFFER_TICKS };
        want = null;
      }
    }
  }

  if (!e.action) {
    const candidate = want ?? (e.buffered && e.buffered.until >= ctx.tick ? e.buffered.actionId : null);
    e.buffered = null;
    if (candidate) {
      const def = getAction(candidate);
      const res = canStart(ctx, e, def);
      if (res !== 'ok') {
        ctx.emit({ type: 'fail', id: e.id, reason: res });
      } else {
        let dir = cmd.aim;
        let mul = 1;
        // movement skills (dodge, the class E dash, pure dashes like Teleporte) follow the stick
        const dash = def.lunge !== undefined && !def.hit && !def.projectile && def.lunge.speed > 0;
        if (candidate === 'dodge' || candidate === cls.abilities.e.action || dash) {
          if (moving) dir = Math.atan2(my, mx);
          else if (candidate === 'dodge') {
            dir = cmd.aim + Math.PI; // backstep
            mul = 0.62;
          }
        }
        let combo = 0;
        if (candidate === cls.lightAction) {
          combo = ctx.tick - e.lastLightTick < 30 ? (e.comboIdx + 1) % 2 : 0;
          e.comboIdx = combo;
          e.lastLightTick = ctx.tick;
        }
        startAction(ctx, e, candidate, dir, mul, combo);
      }
    }
  }

  // Block & parry: raising the guard opens a short parry window, unless it was raised very recently.
  const wantBlock = (held & Btn.Block) !== 0 && !e.action && e.stamina > 0;
  if (wantBlock && !e.blocking) {
    if (ctx.tick - e.lastBlockRaise > PARRY_REARM_TICKS) e.parryUntil = ctx.tick + PARRY_WINDOW_TICKS - 1; // inclusive
    e.lastBlockRaise = ctx.tick;
  }
  e.blocking = wantBlock;

  if (!e.action) e.facing = cmd.aim;

  // Desired velocity (lunges override this later in actionPreMove).
  let speed = cls.moveSpeed * (1 + talentBonus(e, 'moveSpeed')) * terrainSpeed(ctx.world, e.pos.x, e.pos.y) * statusMoveMul(e, ctx.tick);
  e.sprinting = false;
  if (e.action) {
    speed *= getAction(e.action.id).moveMul;
  } else if (e.blocking) {
    speed *= BLOCK_MOVE_MUL;
  } else if (held & Btn.Sprint && moving && e.stamina > 0) {
    speed *= SPRINT_MUL;
    e.sprinting = true;
    e.stamina = Math.max(0, e.stamina - SPRINT_STAMINA_PER_SEC * DT);
    e.staminaRegenAt = ctx.tick + Math.floor(STAMINA_REGEN_DELAY_TICKS / 2);
  }
  const tx = moving ? mx * speed : 0;
  const ty = moving ? my * speed : 0;
  // Snappy acceleration; knockback decays through the same blend.
  const k = 0.45;
  e.vel.x += (tx - e.vel.x) * k;
  e.vel.y += (ty - e.vel.y) * k;
}

/** Portals refuse anyone who was hit in the last 3 s (no escaping mid-fight). */
export const PORTAL_COMBAT_LOCK_TICKS = 90;

function tryPortal(ctx: SimContext, e: Entity): boolean {
  if (ctx.tick - e.lastHitTick < PORTAL_COMBAT_LOCK_TICKS) return false;
  for (const p of ctx.world.portals ?? []) {
    if (Math.hypot(p.x - e.pos.x, p.y - e.pos.y) > p.r + e.radius) continue;
    const fromX = e.pos.x;
    const fromY = e.pos.y;
    e.pos.x = e.prevPos.x = p.toX;
    e.pos.y = e.prevPos.y = p.toY;
    e.vel.x = e.vel.y = 0;
    ctx.emit({ type: 'portal', id: e.id, portal: p.id, name: p.name, fromX, fromY, x: p.toX, y: p.toY });
    return true;
  }
  return false;
}

/** Open the nearest unopened chest in reach. */
function tryChest(ctx: SimContext, e: Entity): boolean {
  let best: { id: number; d: number } | null = null;
  for (const p of ctx.world.props) {
    if (p.kind !== 'chest' || e.openedChests?.includes(p.id)) continue;
    const d = Math.hypot(p.x - e.pos.x, p.y - e.pos.y);
    if (d <= CHEST_RANGE + p.r && (!best || d < best.d)) best = { id: p.id, d };
  }
  if (!best) return false;
  // a bonfire nearer than the chest wins (sit first, loot after)
  const fire = ctx.world.props.some((p) => p.kind === 'bonfire' && Math.hypot(p.x - e.pos.x, p.y - e.pos.y) < best!.d);
  return fire ? false : ctx.openChest(e, best.id);
}
export const CHEST_RANGE = 1.6;
export const TALK_RANGE = 2.4;

/** Touch the summon sign next to a bonfire: a phantom hero joins you. */
function trySign(ctx: SimContext, e: Entity): boolean {
  for (const p of ctx.world.props) {
    if (p.kind !== 'bonfire' || Math.abs(p.x - e.pos.x) > 4 || Math.abs(p.y - e.pos.y) > 4) continue;
    const s = summonSignOf(p);
    if (Math.hypot(s.x - e.pos.x, s.y - e.pos.y) <= SIGN_RANGE) return ctx.summonPhantom(e, p);
  }
  return false;
}

/** Speak to the nearest villager in reach: they stop, turn and answer. */
function tryTalk(ctx: SimContext, e: Entity): boolean {
  let best: Entity | null = null;
  let bd = TALK_RANGE;
  for (const o of ctx.entities.values()) {
    if (o.enemyId !== 'villager' || isDead(o)) continue;
    const d = Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  if (!best) return false;
  const bonfire = ctx.world.props.some((p) => p.kind === 'bonfire' && Math.hypot(p.x - e.pos.x, p.y - e.pos.y) < bd);
  if (bonfire) return false;
  best.facing = angleTo(best.pos, e.pos);
  best.vel.x = best.vel.y = 0;
  if (best.ai) {
    best.ai.wanderTo = null;
    best.ai.pauseUntil = ctx.tick + 150;
  }
  say(ctx, best, villagerLine(best, ctx.tick), 150);
  return true;
}

function tryRest(ctx: SimContext, e: Entity): void {
  for (const p of ctx.world.props) {
    if (p.kind !== 'bonfire') continue;
    if (Math.hypot(p.x - e.pos.x, p.y - e.pos.y) > BONFIRE_RANGE + p.r) continue;
    e.hp = e.maxHp;
    e.stamina = e.maxStamina;
    e.mana = e.maxMana;
    e.respawnPoint = { x: e.pos.x, y: e.pos.y };
    // sit on the nearest free log, facing the fire
    const seats = bonfireSeats(p);
    seats.sort((a, b) => Math.hypot(a.x - e.pos.x, a.y - e.pos.y) - Math.hypot(b.x - e.pos.x, b.y - e.pos.y));
    const seat = seats.find((s) => ![...ctx.entities.values()].some((o) => o !== e && o.action?.id === 'sit' && Math.hypot(o.pos.x - s.x, o.pos.y - s.y) < 0.3)) ?? seats[0]!;
    e.pos.x = e.prevPos.x = seat.x;
    e.pos.y = e.prevPos.y = seat.y;
    e.vel.x = e.vel.y = 0;
    forceAction(e, 'sit');
    e.facing = seat.facing;
    e.action!.dir = seat.facing;
    ctx.emit({ type: 'rest', id: e.id, x: p.x, y: p.y });
    return;
  }
}
