import { ACTIONS, type EntitySnap } from '@etherfall/shared';
import { ELEMENT_RGB } from './elements';
import { InstanceBatch, Shape, type RGB } from './instances';
import { Mat } from './materials';
import { drawHumanoid, drawSpider, drawWolf, type AnimState } from './rig';

/** Decal depth: below every object but above the ground. */
const DECAL_DEPTH = -1e6;

const lerpC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [1.6, 1.6, 1.6];

interface Pose {
  angle: number;
  extend: number;
  glow: number;
  phase: 'idle' | 'windup' | 'active' | 'recovery' | 'charge';
}

/** Look of each projectile, by the action that fired it. */
export type ProjKind = 'bolt' | 'arrow' | 'knife' | 'axe' | 'web';
export interface ProjStyle {
  kind: ProjKind;
  core: RGB;
  tail: RGB;
  /** Point light for glowing projectiles (null for physical ones). */
  light: RGB | null;
}
const ARROWS = new Set(['skel_arrow', 'skel_volley', 'bow_shot', 'bow_power', 'ranger_volley', 'ranger_poison', 'snp_pierce', 'snp_multishot']);
export function projectileStyle(name: string): ProjStyle {
  const def = ACTIONS[name];
  if (def?.element && def.projectile && !ARROWS.has(name)) {
    // skill-tree projectiles: shape from the projectile kind, colours from the element
    const c = ELEMENT_RGB[def.element];
    if (def.projectile.id === 'knife') return { kind: 'knife', core: name === 'psn_fan' ? [0.5, 1, 0.35] : [0.9, 0.92, 0.98], tail: [0.3, 0.3, 0.32], light: null };
    return { kind: 'bolt', core: [Math.min(1, c[0] * 1.1), Math.min(1, c[1] * 1.1), Math.min(1, c[2] * 1.1)], tail: [c[0] * 0.7, c[1] * 0.6, c[2] * 0.6], light: c };
  }
  if (ARROWS.has(name)) return { kind: 'arrow', core: name === 'ranger_poison' ? [0.45, 1.0, 0.35] : [0.82, 0.8, 0.75], tail: [0.55, 0.38, 0.2], light: null };
  if (name === 'rogue_knives') return { kind: 'knife', core: [0.9, 0.92, 0.98], tail: [0.3, 0.3, 0.32], light: null };
  if (name === 'barb_throw') return { kind: 'axe', core: [0.6, 0.6, 0.62], tail: [0.4, 0.28, 0.16], light: null };
  if (name === 'spider_web') return { kind: 'web', core: [0.85, 0.85, 0.8], tail: [0.6, 0.6, 0.58], light: null };
  if (name === 'healer_smite') return { kind: 'bolt', core: [1.0, 0.88, 0.5], tail: [1.0, 0.65, 0.25], light: [1, 0.8, 0.45] };
  if (name === 'warlock_bolt') return { kind: 'bolt', core: [0.55, 1.0, 0.5], tail: [0.45, 0.2, 0.7], light: [0.4, 1, 0.45] };
  if (name === 'warlock_drain') return { kind: 'bolt', core: [1.0, 0.25, 0.3], tail: [0.35, 0.9, 0.4], light: [1, 0.3, 0.3] };
  if (name === 'imp_bolt') return { kind: 'bolt', core: [1.0, 0.65, 0.2], tail: [1.0, 0.3, 0.05], light: [1, 0.55, 0.2] };
  if (name === 'vampire_bolt') return { kind: 'bolt', core: [1.0, 0.18, 0.15], tail: [0.5, 0.05, 0.05], light: [1, 0.2, 0.15] };
  return { kind: 'bolt', core: [0.55, 0.8, 1.0], tail: [0.35, 0.5, 1.0], light: [0.45, 0.65, 1] };
}

/** Weapon pose derived from frame data — the same data the server uses to resolve hits. */
export function weaponPose(e: EntitySnap): Pose {
  const side = e.combo % 2 === 0 ? 1 : -1;
  if (!e.action || e.dead) return { angle: e.facing + 0.55, extend: 0.7, glow: 0, phase: 'idle' };
  const def = ACTIONS[e.action];
  if (!def || !def.hit || def.id === 'vanguard_seismic') {
    if (def?.id === 'vanguard_seismic') {
      const k = Math.min(1, e.at / def.startup);
      return e.at < def.startup ? { angle: e.adir, extend: 0.85 - 0.55 * k, glow: k, phase: 'windup' } : { angle: e.adir, extend: 1.1, glow: 0.4, phase: 'active' };
    }
    return { angle: e.facing + 0.9, extend: 0.85, glow: def?.projectile ? 0.8 : 0, phase: 'idle' };
  }
  if (e.charging) return { angle: e.adir, extend: 0.32, glow: 0.4 + Math.min(1, e.charge / 24) * 0.6, phase: 'charge' };
  const t = e.at;
  const sweep = def.hit.arc > 0.75;
  if (t < def.startup) {
    const k = t / Math.max(1, def.startup);
    return sweep ? { angle: e.adir - side * (0.7 + 1.0 * k), extend: 0.95, glow: 0, phase: 'windup' } : { angle: e.adir, extend: 0.9 - 0.55 * k, glow: k * 0.3, phase: 'windup' };
  }
  if (t < def.startup + def.active) {
    const k = (t - def.startup + 0.5) / Math.max(1, def.active);
    return sweep ? { angle: e.adir - side * 1.6 + side * 3.2 * k, extend: 1.08, glow: 0.3, phase: 'active' } : { angle: e.adir, extend: 1.15, glow: 0.3, phase: 'active' };
  }
  const k = (t - def.startup - def.active) / Math.max(1, def.recovery);
  return sweep ? { angle: e.adir + side * 1.6 * (1 - k * 0.55), extend: 1.0, glow: 0, phase: 'recovery' } : { angle: e.adir, extend: 1.1 - 0.2 * k, glow: 0, phase: 'recovery' };
}

export interface ActorContext {
  tick: number;
  time: number;
  out: InstanceBatch;
  shadows: InstanceBatch;
  reflect: InstanceBatch;
  /** Whether the entity stands near water (draw a reflection). */
  nearWater: (x: number, y: number) => boolean;
  /** Per-entity locomotion state tracked by the client (walk phase, facing side, speed). */
  anim: (e: EntitySnap) => AnimState;
  /** False when the 3D actor layer draws the bodies: only ground decals (telegraphs, arcs, statuses) stay ASCII. */
  bodies?: boolean;
}

function blade(ctx: ActorContext, hx: number, hy: number, angle: number, len: number, w: number, color: RGB, depthY: number, emis: number): void {
  const cx = hx + Math.cos(angle) * len * 0.5;
  const cy = hy + Math.sin(angle) * len * 0.5;
  ctx.out.push(Shape.Blade, cx, cy, len * 0.5, w, color, Mat.Blade, { rot: angle, depthY: depthY + 0.02, emis });
}

function swingTrail(ctx: ActorContext, e: EntitySnap, pose: Pose, color: RGB): void {
  if (pose.phase !== 'active' || !e.action) return;
  const def = ACTIONS[e.action];
  if (!def?.hit) return;
  const r = e.radius + def.hit.range;
  ctx.out.push(Shape.Sector, e.x, e.y, r, r, color, Mat.Spark, { rot: e.adir, depthY: e.y - 0.01, param: 0.25, emis: 0.45, extra: Math.min(Math.PI, def.hit.arc) });
}

/** Ground telegraph for dangerous wind-ups (enemies) and big area abilities (players). */
function telegraph(ctx: ActorContext, e: EntitySnap): void {
  if (!e.action || e.dead) return;
  const def = ACTIONS[e.action];
  if (!def?.hit) return;
  const isEnemy = e.team !== 0;
  if (!isEnemy && !def.shockwave) return;
  if (e.at >= def.startup + def.active) return;
  const lunge = def.lunge ? (def.lunge.speed * (def.lunge.to - def.lunge.from)) / 30 : 0;
  const r = def.shockwave ?? e.radius + def.hit.range + lunge;
  const danger = def.telegraph === 'danger' || !!def.shockwave;
  const prog = Math.min(1, e.at / Math.max(1, def.startup));
  const pulse = 0.5 + 0.5 * Math.sin(ctx.time * 18);
  const col: RGB = e.team === 0 ? [0.35, 1.0, 0.5] : danger ? [1.0, 0.18 + pulse * 0.1, 0.08] : [1.0, 0.55, 0.12];
  const arc = def.hit.arc >= Math.PI - 1e-3 || def.shockwave ? Math.PI : def.hit.arc;
  // Reach must be legible: offset sector origin along lunge direction is implicit in r.
  ctx.out.push(Shape.Sector, e.x, e.y, r, r, col, Mat.Telegraph, { rot: e.adir, depthY: DECAL_DEPTH, param: prog, emis: danger ? 0.75 : 0.45, extra: arc });
}

function eyes(ctx: ActorContext, e: EntitySnap, dist: number, spread: number, color: RGB, emis: number): void {
  const fx = Math.cos(e.facing);
  const fy = Math.sin(e.facing);
  for (const s of [-1, 1]) {
    ctx.out.push(Shape.Circle, e.x + fx * dist - fy * spread * s, e.y + fy * dist + fx * spread * s - 0.15, 0.07, 0.07, color, Mat.Eyes, { depthY: e.y + 0.05, emis });
  }
}

function drawActorBody(ctx: ActorContext, e: EntitySnap): void {
  const flash = ctx.tick - e.hitTick < 4 && !e.dead;
  const pick = (c: RGB): RGB => (flash ? WHITE : c);
  const r = e.radius;
  const fx = Math.cos(e.facing);
  const fy = Math.sin(e.facing);
  const px = -fy;
  const py = fx;
  const D = e.y;

  if (e.kind === 'projectile') {
    const st = projectileStyle(e.name);
    const h = st.kind === 'web' ? 0.6 : 0.5;
    const cy = e.y - h;
    if (st.kind === 'arrow' || st.kind === 'knife') {
      // shaft + glinting head along the flight direction
      const len = st.kind === 'arrow' ? 0.75 : 0.35;
      ctx.out.push(Shape.Blade, e.x - fx * len * 0.5, cy - fy * len * 0.5, len / 2, 0.035, st.tail, Mat.Blade, { rot: e.facing, depthY: D + 0.5 });
      ctx.out.push(Shape.Blade, e.x, cy, 0.09, 0.05, st.core, Mat.Blade, { rot: e.facing, depthY: D + 0.51, emis: st.core[1] > 0.95 ? 0.6 : 0.2 });
    } else if (st.kind === 'axe') {
      const spin = ctx.time * 22;
      ctx.out.push(Shape.Blade, e.x, cy, 0.38, 0.05, st.tail, Mat.Blade, { rot: spin, depthY: D + 0.5 });
      ctx.out.push(Shape.Circle, e.x + Math.cos(spin) * 0.3, cy + Math.sin(spin) * 0.3, 0.17, 0.12, st.core, Mat.Blade, { rot: spin, depthY: D + 0.51, emis: 0.2 });
    } else {
      const web = st.kind === 'web';
      ctx.out.push(Shape.Circle, e.x, cy, 0.3, 0.3, st.core, web ? Mat.Spark : Mat.Magic, { depthY: D + 0.5, emis: web ? 0.2 : 1, param: -1 });
      ctx.out.push(Shape.Circle, e.x - fx * 0.35, cy - fy * 0.35, 0.18, 0.18, st.tail, Mat.Magic, { depthY: D + 0.49, emis: web ? 0.1 : 0.7 });
    }
    ctx.shadows.shadow(e.x, e.y + 0.1, 0.25, 0.14, 0.3, 0.3);
    return;
  }

  if (e.dead) {
    const col: RGB = e.team === 0 ? [0.3, 0.12, 0.1] : [0.22, 0.2, 0.18];
    ctx.out.push(Shape.Circle, e.x, e.y, r * 1.5, r * 0.6, col, e.team === 0 ? Mat.PlayerBody : Mat.EnemyBody, { rot: e.facing, depthY: D - 0.3, param: 2.5 / 16 });
    return;
  }

  ctx.shadows.shadow(e.x, e.y + 0.08, r * 1.15, r * 0.6, 0.55, 1.3);
  const pose = weaponPose(e);
  const dodging = e.iframe;

  if (e.classId === 'vanguard') {
    const armor = pick(dodging ? [0.35, 0.37, 0.42] : [0.58, 0.6, 0.66]);
    ctx.out.push(Shape.Rect, e.x - fx * 0.28, e.y - fy * 0.28 - 0.1, 0.32, 0.22, pick([0.38, 0.06, 0.07]), Mat.Cloth, { rot: e.facing + Math.PI / 2, depthY: D - 0.05 });
    ctx.out.push(Shape.Circle, e.x, e.y - 0.12, r, r * 0.92, armor, Mat.PlayerBody, { depthY: D, param: 6.5 / 16 });
    // pauldrons
    for (const sgn of [-1, 1]) ctx.out.push(Shape.Circle, e.x + px * 0.3 * sgn, e.y + py * 0.3 * sgn - 0.18, r * 0.36, r * 0.32, pick([0.72, 0.74, 0.8]), Mat.PlayerBody, { depthY: D + 0.005, param: 9.5 / 16 });
    ctx.out.push(Shape.Circle, e.x + fx * 0.06, e.y - 0.32 + fy * 0.06, r * 0.5, r * 0.5, pick([0.78, 0.78, 0.82]), Mat.PlayerBody, { depthY: D + 0.01, param: 0.5 / 16 });
    // helmet plume
    ctx.out.push(Shape.Rect, e.x - fx * 0.12, e.y - 0.44 - fy * 0.12, 0.16, 0.06, pick([0.75, 0.12, 0.1]), Mat.Cloth, { rot: e.facing, depthY: D + 0.015, param: 2.5 / 16 });
    // shield: side-carried, or squared in front when guarding
    const sx = e.blocking ? e.x + fx * 0.48 : e.x - px * 0.44 + fx * 0.12;
    const sy = (e.blocking ? e.y + fy * 0.48 : e.y - py * 0.44 + fy * 0.12) - 0.12;
    ctx.out.push(Shape.Rect, sx, sy, e.blocking ? 0.36 : 0.26, 0.11, pick([0.5, 0.42, 0.22]), Mat.Shield, { rot: e.facing + Math.PI / 2, depthY: D + (e.blocking ? 0.06 : -0.02), param: 0.5 / 16, emis: e.blocking ? 0.15 : 0 });
    const hx = e.x + px * 0.36;
    const hy = e.y + py * 0.36 - 0.12;
    blade(ctx, hx, hy, pose.angle, 1.25 * pose.extend, 0.06, pick([0.86, 0.88, 0.95]), D, pose.glow * 0.6);
    swingTrail(ctx, e, pose, [0.9, 0.92, 1.0]);
  } else if (e.classId === 'arcanist') {
    const robe = pick(dodging ? [0.18, 0.1, 0.26] : [0.3, 0.13, 0.42]);
    ctx.out.push(Shape.Circle, e.x - fx * 0.12, e.y - fy * 0.12 - 0.06, r * 1.12, r, robe, Mat.Cloth, { depthY: D - 0.02, param: -1 });
    ctx.out.push(Shape.Circle, e.x, e.y - 0.15, r * 0.82, r * 0.78, pick([0.42, 0.22, 0.55]), Mat.PlayerBody, { depthY: D, param: 4.5 / 16 });
    ctx.out.push(Shape.Circle, e.x + fx * 0.05, e.y - 0.36 + fy * 0.05, r * 0.48, r * 0.48, pick([0.22, 0.12, 0.3]), Mat.PlayerBody, { depthY: D + 0.01, param: 0.5 / 16 });
    // pointed hood and a rune band that glows with the staff
    ctx.out.push(Shape.Tri, e.x - fx * 0.08, e.y - 0.58 - fy * 0.08, 0.16, 0.16, pick([0.3, 0.14, 0.42]), Mat.Cloth, { depthY: D + 0.012, param: 2.5 / 16 });
    ctx.out.push(Shape.Rect, e.x, e.y - 0.08, r * 0.8, 0.05, [0.45, 0.65, 1.0], Mat.Magic, { rot: e.facing + Math.PI / 2, depthY: D + 0.006, emis: 0.35 + pose.glow * 0.5 });
    const hx = e.x + px * 0.34;
    const hy = e.y + py * 0.34 - 0.14;
    const len = 1.15 * pose.extend;
    blade(ctx, hx, hy, pose.angle, len, 0.05, pick([0.45, 0.32, 0.18]), D, 0);
    const ox = hx + Math.cos(pose.angle) * len;
    const oy = hy + Math.sin(pose.angle) * len;
    const orb = 0.13 + pose.glow * 0.12;
    ctx.out.push(Shape.Circle, ox, oy, orb, orb, [0.55, 0.78, 1.0], Mat.Magic, { depthY: D + 0.04, emis: 0.7 + pose.glow * 0.3 });
    swingTrail(ctx, e, pose, [0.5, 0.7, 1.0]);
  } else if (e.enemyId === 'hollow') {
    const def = e.action ? ACTIONS[e.action] : undefined;
    const wind = def?.telegraph && e.at < def.startup ? e.at / def.startup : 0;
    const danger = def?.telegraph === 'danger';
    const body = pick(lerpC([0.52, 0.5, 0.4], [0.85, 0.25, 0.12], danger ? wind * 0.8 : wind * 0.3));
    ctx.out.push(Shape.Rect, e.x - fx * 0.25, e.y - fy * 0.25 - 0.06, 0.3, 0.24, pick([0.16, 0.14, 0.11]), Mat.Cloth, { rot: e.facing + Math.PI / 2, depthY: D - 0.05 });
    ctx.out.push(Shape.Circle, e.x, e.y - 0.12, r * 0.95, r * 0.88, body, Mat.EnemyBody, { depthY: D, param: -1 });
    ctx.out.push(Shape.Circle, e.x + fx * 0.08, e.y - 0.34 + fy * 0.08, r * 0.46, r * 0.46, pick([0.62, 0.58, 0.48]), Mat.EnemyBody, { depthY: D + 0.01, param: 0.5 / 16 });
    eyes(ctx, e, 0.2, 0.08, [1, 0.25, 0.12], 0.6 + wind * 0.4);
    const hx = e.x + px * 0.34;
    const hy = e.y + py * 0.34 - 0.12;
    blade(ctx, hx, hy, pose.angle, 1.15 * pose.extend, 0.06, pick([0.55, 0.43, 0.33]), D, danger ? wind * 0.6 : 0);
    swingTrail(ctx, e, pose, [1.0, 0.5, 0.35]);
  } else if (e.enemyId === 'ashwolf') {
    const def = e.action ? ACTIONS[e.action] : undefined;
    const wind = def?.telegraph && e.at < def.startup ? e.at / def.startup : 0;
    const crouch = def?.id === 'wolf_lunge' && e.at < def.startup ? 0.82 : 1;
    const col = pick(lerpC([0.5, 0.45, 0.4], [0.8, 0.32, 0.14], wind * 0.6));
    ctx.out.push(Shape.Rect, e.x - fx * r * 1.55, e.y - fy * r * 1.55 - 0.08, 0.32, 0.07, pick([0.25, 0.22, 0.2]), Mat.EnemyBody, { rot: e.facing + Math.sin(ctx.time * 8) * 0.3, depthY: D - 0.04, param: -1 });
    ctx.out.push(Shape.Circle, e.x, e.y - 0.1, r * 1.45 * crouch, r * 0.78, col, Mat.EnemyBody, { rot: e.facing, depthY: D, param: -1 });
    ctx.out.push(Shape.Circle, e.x + fx * r * 1.25, e.y + fy * r * 1.25 - 0.14, r * 0.55, r * 0.5, pick([0.58, 0.52, 0.46]), Mat.EnemyBody, { rot: e.facing, depthY: D + 0.01, param: 0.5 / 16 });
    for (const sgn of [-1, 1]) ctx.out.push(Shape.Tri, e.x + fx * r * 1.15 + px * 0.12 * sgn, e.y + fy * r * 1.15 + py * 0.12 * sgn - 0.36, 0.08, 0.1, pick([0.42, 0.37, 0.33]), Mat.EnemyBody, { depthY: D + 0.012, param: 3.5 / 16 });
    eyes(ctx, e, r * 1.45, 0.09, [1, 0.72, 0.2], 0.55 + wind * 0.45);
  }

  if (ctx.nearWater(e.x, e.y + 0.8)) {
    ctx.reflect.push(Shape.Circle, e.x, e.y + 0.4, r, r * 0.9, e.team === 0 ? [0.5, 0.5, 0.6] : [0.4, 0.35, 0.3], Mat.Reflection, { depthY: D });
  }
}

/** Ground rings for root / iron guard that the ASCII rig used to draw around the body. */
function statusDecals(ctx: ActorContext, e: EntitySnap): void {
  if (e.dead) return;
  const st = e.statuses ?? [];
  const big = e.enemyId === 'giantspider' ? 2 : e.enemyId === 'ashwolf' ? 1.35 : 1;
  if (st.includes('root')) ctx.out.push(Shape.Circle, e.x, e.y, 0.55 * big, 0.3 * big, [1.0, 0.82, 0.35], Mat.Magic, { depthY: e.y - 0.05, emis: 0.55, param: -1 });
  if (st.includes('ironguard')) ctx.out.push(Shape.Circle, e.x, e.y - 0.7, 0.7, 0.9, [1.0, 0.85, 0.45], Mat.Magic, { depthY: e.y + 0.6, emis: 0.3, param: -1 });
}

export function drawActor(ctx: ActorContext, e: EntitySnap): void {
  if (e.kind === 'projectile') return drawActorBody(ctx, e);
  telegraph(ctx, e);
  const bodies = ctx.bodies !== false;
  if (!e.dead) {
    const wide = e.enemyId === 'ashwolf' ? 1.5 : e.enemyId === 'giantspider' ? 1.5 : e.enemyId === 'bonegiant' ? 1.3 : 1;
    if (bodies) ctx.shadows.shadow(e.x, e.y + 0.05, e.radius * 1.2 * wide, e.radius * 0.55, 0.6, 1.6);
    // swing arcs show the true gameplay reach on the ground
    if (e.action) {
      const def = ACTIONS[e.action];
      if (def?.hit && e.at >= def.startup && e.at < def.startup + def.active && def.hit.arc < Math.PI) {
        const r = e.radius + def.hit.range;
        ctx.out.push(Shape.Sector, e.x, e.y, r, r, e.team === 0 ? [0.9, 0.92, 1.0] : [1.0, 0.5, 0.35], Mat.Spark, { rot: e.adir, depthY: e.y - 0.6, param: 0.25, emis: 0.35, extra: def.hit.arc });
      }
    }
  }
  if (!bodies) {
    statusDecals(ctx, e);
    return;
  }
  const anim = ctx.anim(e);
  const rc = { out: ctx.out, tick: ctx.tick, time: ctx.time };
  if (e.enemyId === 'ashwolf') drawWolf(rc, e, anim);
  else if (e.enemyId === 'giantspider') drawSpider(rc, e, anim);
  else drawHumanoid(rc, e, anim);
  if (!e.dead && ctx.nearWater(e.x, e.y + 0.8)) {
    ctx.reflect.push(Shape.Capsule, e.x, e.y + 0.9, 0.95, 0.22, e.team === 0 ? [0.5, 0.5, 0.6] : [0.45, 0.42, 0.38], Mat.Reflection, { rot: Math.PI / 2, depthY: e.y, extra: 0.23 });
  }
}
