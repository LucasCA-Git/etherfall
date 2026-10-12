import { ACTIONS, type EntitySnap } from '@etherfall/shared';
import { InstanceBatch, Shape, type RGB } from './instances';
import { Mat } from './materials';
import { SPRITE_INDEX, SPRITES, type SpriteDef, type SpriteId } from './sprites';

/**
 * 2D skeletal rig for actors, seen in ¾ view (standing up from their feet).
 * Body space: x = toward the facing side, y = up, meters, origin at the feet.
 * Every pose is derived from the authoritative snapshot (action id + frame) so the
 * animation always matches what the server is resolving: wind-ups read as wind-ups.
 *
 * Bodies are assembled from painted cutout parts (render/sprites.ts) placed along bones.
 */

export interface AnimState {
  /** Walk cycle phase in radians (advances with distance travelled). */
  phase: number;
  /** +1 facing screen-right, -1 facing screen-left (sticky when moving vertically). */
  side: 1 | -1;
  /** Smoothed horizontal speed in m/s. */
  speed: number;
}

export interface RigContext {
  out: InstanceBatch;
  tick: number;
  time: number;
}

type V = { x: number; y: number };
const v = (x: number, y: number): V => ({ x, y });
/** Direction of a limb with absolute angle a (0 = straight down, +π/2 = forward, π = up). */
const dirOf = (a: number): V => v(Math.sin(a), -Math.cos(a));
const add = (p: V, d: V, len: number): V => v(p.x + d.x * len, p.y + d.y * len);
const mid = (a: V, b: V, t = 0.5): V => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const rot = (p: V, piv: V, a: number): V => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v(piv.x + (p.x - piv.x) * c - (p.y - piv.y) * s, piv.y + (p.x - piv.x) * s + (p.y - piv.y) * c);
};
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const WHITE: RGB = [1, 1, 1];

/** Phase of an action: 0..1 progress inside windup / active / recovery. */
/** Body animation of skill-tree actions, by their `anim` family (see ActionDef.anim). */
const ANIM_ALIAS: Record<string, string> = {
  slash: 'longsword_light', heavy: 'longsword_heavy', thrust: 'vanguard_charge', throw: 'rogue_knives', shout: 'barb_warcry',
  spin: 'vanguard_fury', trap: 'ranger_trap', guard: 'vanguard_ironguard', cast: 'arcanist_bolt', castSky: 'arcanist_collapse',
  castRaise: 'healer_light', castPlant: 'healer_sanctuary', bow: 'bow_shot',
};

export function actPhase(e: EntitySnap): { id: string; stage: 'windup' | 'active' | 'recovery' | 'none'; k: number; charge: number } {
  if (!e.action) return { id: '', stage: 'none', k: 0, charge: 0 };
  const d = ACTIONS[e.action];
  if (!d) return { id: e.action, stage: 'none', k: 0, charge: 0 };
  const charge = d.chargeable ? Math.min(1, e.charge / d.chargeable.maxTicks) : 0;
  if (e.charging) return { id: e.action, stage: 'windup', k: 0.2, charge };
  if (e.at < d.startup) return { id: e.action, stage: 'windup', k: e.at / Math.max(1, d.startup), charge };
  if (e.at < d.startup + d.active) return { id: e.action, stage: 'active', k: (e.at - d.startup + 0.5) / Math.max(1, d.active), charge };
  return { id: e.action, stage: 'recovery', k: Math.min(1, (e.at - d.startup - d.active) / Math.max(1, d.recovery)), charge };
}

/** Painter that maps body-space primitives into world-space instances. */
class Painter {
  constructor(
    private out: InstanceBatch,
    private ox: number,
    private oy: number,
    private side: 1 | -1,
    private flash: boolean,
    /** Whole-body rotation (rolls, death fall) around `pivot` in body space. */
    private bodyRot = 0,
    private pivot: V = v(0, 0.9),
    /** Global tint (statuses, death fade). */
    private tint: RGB = WHITE,
  ) {}
  w(p: V): V {
    const q = this.bodyRot ? rot(p, this.pivot, this.bodyRot) : p;
    return v(this.ox + q.x * this.side, this.oy - q.y);
  }
  private col(c: RGB): RGB {
    return this.flash ? [1.7, 1.7, 1.7] : [c[0] * this.tint[0], c[1] * this.tint[1], c[2] * this.tint[2]];
  }
  /**
   * Painted part along the bone a→b (body space). The texture is stretched along the bone
   * (with its joint padding) and keeps its painted width.
   */
  part(id: SpriteId, a: V, b: V, depth: number, o: { tint?: RGB; mat?: number; emis?: number; widthMul?: number } = {}): void {
    const d: SpriteDef = SPRITES[id];
    const A = this.w(a);
    const B = this.w(b);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.max(1e-3, Math.hypot(dx, dy));
    const L = len / Math.max(0.2, 1 - d.padA - d.padB);
    const ux = dx / len;
    const uy = dy / len;
    const cx = A.x - ux * d.padA * L + ux * L * 0.5;
    const cy = A.y - uy * d.padA * L + uy * L * 0.5;
    const width = d.w * (o.widthMul ?? 1);
    const vertical = d.axis === 'y';
    const rotation = vertical ? Math.atan2(-dx, dy) : Math.atan2(dy, dx);
    const flip = this.side === -1 ? (vertical ? 1 : 2) : 0;
    this.out.push(Shape.Sprite, cx, cy, vertical ? width / 2 : L / 2, vertical ? L / 2 : width / 2, this.col(o.tint ?? WHITE), o.mat ?? Mat.PlayerBody, {
      rot: rotation, depthY: this.oy + depth, param: SPRITE_INDEX[id], emis: o.emis ?? 0, extra: flip,
    });
  }
  /** Crisp weapon line underneath painted weapons (orientation glyphs: ─ ╲ │ ╱). */
  line(a: V, b: V, hw: number, color: RGB, depth: number, emis = 0): void {
    const A = this.w(a);
    const B = this.w(b);
    this.out.push(Shape.Blade, (A.x + B.x) / 2, (A.y + B.y) / 2, Math.hypot(B.x - A.x, B.y - A.y) / 2, hw, this.col(color), Mat.Blade, {
      rot: Math.atan2(B.y - A.y, B.x - A.x), depthY: this.oy + depth, emis,
    });
  }
  ball(c: V, r: number, color: RGB, mat: number, depth: number, opts: { emis?: number; param?: number; ry?: number } = {}): void {
    const P = this.w(c);
    const col = mat === Mat.Magic || mat === Mat.Eyes ? color : this.col(color);
    this.out.push(Shape.Circle, P.x, P.y, r, opts.ry ?? r, col, mat, { depthY: this.oy + depth, emis: opts.emis, param: opts.param ?? -1 });
  }
}

export interface HumanPose {
  lean: number; // torso lean (+ forward)
  crouch: number; // hip drop in meters
  thigh: [number, number]; // [near, far]
  knee: [number, number];
  arm: [number, number]; // shoulder angle [near(weapon), far(off-hand)]
  elbow: [number, number];
  /** Weapon angle relative to the near forearm (0 = continues the forearm). */
  wrist: number;
  bodyRot: number;
  glow: number;
}

export type Style = 'sword' | 'staff' | 'undead' | 'bow' | 'twohand';

/** Locomotion + action → joint angles. */
export function humanPose(e: EntitySnap, anim: AnimState, time: number, style: Style): HumanPose {
  const run = Math.min(1, anim.speed / 4.2);
  const ph = anim.phase;
  const swing = Math.sin(ph) * 0.62 * run;
  const lift = (o: number) => Math.max(0, Math.sin(ph + o)) * 0.95 * run;
  const breathe = Math.sin(time * 2.1) * 0.02;
  const p: HumanPose = {
    lean: 0.08 * run + (style === 'undead' ? 0.18 : 0),
    crouch: Math.abs(Math.cos(ph)) * 0.035 * run,
    thigh: [swing, -swing],
    knee: [0.12 + lift(-0.9), 0.12 + lift(Math.PI - 0.9)],
    arm: [style === 'staff' ? 0.35 : 0.28 - swing * 0.7, (style === 'bow' ? 0.2 : -0.15) + swing * 0.8 + breathe],
    elbow: [style === 'staff' ? 0.9 : 0.35 + 0.25 * run, 0.35],
    wrist: style === 'staff' ? 1.75 : 0.95, // staves are held upright at rest
    bodyRot: 0,
    glow: 0,
  };
  if (style === 'undead') {
    p.arm[1] = 0.3 + Math.sin(time * 1.3) * 0.08;
    p.elbow[1] = 0.6;
  }
  const a = actPhase(e);
  const def = a.id ? ACTIONS[a.id] : undefined;
  const W = a.stage === 'windup';
  const A = a.stage === 'active';
  const R = a.stage === 'recovery';
  const k = ease(a.k);
  const second = e.combo % 2 === 1;

  switch (a.id) {
    case '':
      break;
    case 'dodge': {
      // evasive dash (no roll): drop low, lunge into a long stride, arms flung back for balance
      const t = Math.min(1, (e.at + 0.5) / 12);
      const k = Math.sin(t * Math.PI);
      p.bodyRot = 0;
      p.crouch = 0.24 * k;
      p.lean = 0.42 * k;
      p.thigh = [1.0 * k, -0.55 * k];
      p.knee = [0.9 * k + 0.12, 0.35 * k + 0.12];
      p.arm = [-0.7 * k + 0.2, -0.5 * k + 0.1];
      p.elbow = [0.5, 0.5];
      p.wrist = style === 'staff' ? 1.2 : 0.6;
      break;
    }
    case 'arcanist_step':
      p.lean = 0.45;
      p.glow = 1;
      break;
    case 'stagger':
    case 'parried':
    case 'guardbreak': {
      const big = a.id !== 'stagger' ? 1.4 : 1;
      p.lean = -0.35 * big * (1 - a.k * 0.6);
      p.arm = [2.4 * big, -0.6];
      p.elbow = [0.5, 0.8];
      p.thigh = [0.35, -0.25];
      break;
    }
    case 'dead':
      p.bodyRot = Math.PI / 2;
      p.thigh = [0.1, -0.1];
      p.knee = [0.3, 0.2];
      p.arm = [1.2, 0.6];
      break;
    case 'sit':
      // seated on a bonfire log: thighs level, shins down, forearms on the knees
      p.crouch = 0.47;
      p.thigh = [1.45, 1.35];
      p.knee = [1.45, 1.3];
      p.lean = 0.2;
      p.arm = [0.75, 0.7];
      p.elbow = [0.7, 0.75];
      p.wrist = style === 'staff' ? 1.2 : 0.4;
      break;
    case 'rest':
      p.crouch = 0.42;
      p.thigh = [1.5, 0.9];
      p.knee = [2.4, 1.8];
      p.lean = 0.3;
      p.arm = [0.6, 0.4];
      break;
    default: {
      if (!def) break;
      // longbow: the bow arm points at the target, the draw hand pulls the string to the cheek
      if (style === 'bow' && (def.projectile || def.strikes)) {
        const up = def.strikes ? 0.9 : 0; // arrow rain is loosed at the sky
        p.arm[1] = Math.PI / 2 + up;
        p.elbow[1] = 0.05;
        const pull = W ? k : A ? 1 : 1 - k;
        p.arm[0] = Math.PI / 2 + up - 0.1;
        p.elbow[0] = 0.4 + pull * 2.3;
        p.wrist = 0.2;
        p.lean = -0.05;
        if (anim.speed < 1) p.thigh = [0.3, -0.25];
        break;
      }
      // Weapon arm keyframes [wind-up end, active end]. Angles: 0 down, π/2 forward, π up, >π up-back.
      let from = 0.3;
      let to = 0.3;
      let leanW = 0;
      let leanA = 0.2;
      let cast = false;
      let sky = false;
      // skill-tree actions reuse the body animation of a representative kit action
      const id = ANIM_ALIAS[def.anim ?? ''] ?? a.id;
      if (id.endsWith('_light') && id !== 'healer_light' || id === 'hollow_slash' || id === 'vampire_claw' || id === 'giant_sweep' || id === 'imp_claw' || id === 'guard_cleave') {
        from = second ? -0.4 : 3.5;
        to = second ? 2.4 : 0.55;
      } else if ((id.endsWith('_heavy') && id !== 'warlock_heavy') || id === 'hollow_overhead' || id === 'barb_stun' || id === 'giant_slam' || id === 'barb_leap' || id === 'guard_slam') {
        from = 3.7;
        to = 0.75;
        leanW = -0.15;
        leanA = 0.4;
        p.glow = a.charge;
        cast = style === 'staff';
      } else if (id === 'vanguard_rising') {
        from = -0.5;
        to = 3.0;
        leanW = 0.25;
        leanA = -0.1;
      } else if (id === 'vanguard_seismic') {
        from = 3.4;
        to = 1.05;
        leanA = 0.45;
        p.crouch = A || R ? 0.22 : 0;
      } else if (id === 'vanguard_charge' || id === 'vanguard_counter' || id === 'vampire_dash' || id === 'rogue_venom' || id === 'rogue_assassinate') {
        from = 1.2;
        to = 1.62;
        leanW = 0.35;
        leanA = 0.45;
      } else if (id === 'rogue_knives' || id === 'barb_throw' || id === 'rogue_smoke') {
        // overhand throw
        from = 3.4;
        to = 1.2;
        leanW = -0.15;
        leanA = 0.35;
      } else if (id === 'barb_warcry' || id === 'barb_rage' || id === 'ranger_hawkeye') {
        // war cry: both arms thrown up
        from = 2.5;
        to = 2.8;
        leanW = -0.25;
        leanA = -0.2;
        p.arm[1] = W ? lerp(p.arm[1], 2.6, k) : A ? 2.6 : lerp(2.6, p.arm[1], k);
        p.elbow[1] = 0.3;
        p.glow = A ? 1 : 0.5;
      } else if (id === 'giant_stomp') {
        from = 0.6;
        to = 0.4;
        p.thigh[0] = W ? lerp(0.28, 1.35, k) : A ? 0.1 : lerp(0.1, 0.28, k);
        p.knee[0] = W ? lerp(0.12, 1.2, k) : 0.15;
        leanW = -0.1;
        leanA = 0.15;
      } else if (id === 'ranger_trap') {
        from = 0.9;
        to = 0.5;
        leanA = 0.5;
        p.crouch = W || A ? 0.28 : 0.1;
      } else if (id === 'vanguard_fury' || id === 'barb_whirl' || id === 'rogue_dance') {
        from = 1.5;
        to = 1.5;
        leanA = 0.2;
      } else if (id === 'vanguard_ironguard') {
        from = 2.7;
        to = 2.9;
        p.glow = 1;
      } else if (id.startsWith('arcanist_') || id.startsWith('healer_') || id.startsWith('warlock_') || id === 'vampire_bolt' || id === 'imp_bolt') {
        cast = true;
        sky = id === 'arcanist_collapse' || id === 'healer_dawn' || id === 'warlock_abyss' || id === 'warlock_guardian';
        const raised = id === 'healer_light' || id === 'healer_aegis' || id === 'healer_purify';
        const planted = id === 'healer_sanctuary' || id === 'arcanist_icelance';
        from = sky ? 3.0 : raised ? 2.4 : 1.9;
        to = planted ? 0.75 : sky ? 3.1 : raised ? 2.7 : 1.6;
        leanW = sky ? -0.2 : 0.05;
        leanA = planted ? 0.35 : 0.1;
      }
      if (cast) {
        p.glow = Math.max(p.glow, W ? 0.4 + k * 0.6 : A ? 1 : 0.4 * (1 - a.k));
        if (sky) {
          p.arm[1] = W || A ? 2.9 : lerp(2.9, -0.15, a.k);
          p.elbow[1] = 0.2;
        }
      }
      const rest = p.arm[0];
      if (W) {
        p.arm[0] = lerp(rest, from, k);
        p.lean = lerp(p.lean, leanW, k);
      } else if (A) {
        p.arm[0] = lerp(from, to, k);
        p.lean = leanA;
      } else if (R) {
        p.arm[0] = lerp(to, rest, k);
        p.lean = lerp(leanA, p.lean, k);
      }
      p.elbow[0] = A ? 0.1 : 0.45;
      if (style !== 'staff') p.wrist = 0.15;
      else p.wrist = W ? lerp(1.75, 0, k) : A ? 0 : lerp(0, 1.75, k); // staff swings down to point at the target
      if (anim.speed < 1) p.thigh = [0.28, -0.22]; // grounded stance while committing
    }
  }
  if (style === 'twohand' && !e.blocking && e.action !== null && a.stage !== 'none' && a.id !== 'barb_warcry' && a.id !== 'barb_rage' && a.id !== 'sit' && a.id !== 'dodge') {
    p.arm[1] = p.arm[0] - 0.12;
    p.elbow[1] = p.elbow[0] + 0.25;
  } else if (style === 'twohand' && !e.action) {
    // great axe held in front with both hands on the haft, head raised over the shoulder
    p.arm[0] = 0.55 + Math.sin(anim.phase) * 0.05;
    p.elbow[0] = 0.95;
    p.arm[1] = 0.62 + Math.sin(anim.phase) * 0.05;
    p.elbow[1] = 1.15;
    p.wrist = 1.05;
  }
  if (e.blocking) {
    p.arm[1] = 1.35;
    p.elbow[1] = 1.25;
    p.lean = 0.08;
    p.crouch = 0.06;
  }
  return p;
}

interface Skeleton {
  hip: V;
  chest: V;
  neck: V;
  head: V;
  up: V;
  torsoDir: V;
  shoulder: [V, V];
  elbow: [V, V];
  hand: [V, V];
  knee: [V, V];
  foot: [V, V];
  handAngle: [number, number];
}

function solveHuman(p: HumanPose): Skeleton {
  const hip = v(0, 0.9 - p.crouch);
  const torsoDir = dirOf(Math.PI + p.lean); // upward, tilted forward
  const chest = add(hip, torsoDir, 0.42);
  const neck = add(hip, torsoDir, 0.56);
  const up = dirOf(Math.PI + p.lean * 0.6);
  const head = add(neck, up, 0.15);
  const sh = (o: number) => add(add(hip, torsoDir, 0.5), v(1, 0), o);
  const shoulder: [V, V] = [sh(0.04), sh(-0.07)];
  const elbow: [V, V] = [add(shoulder[0], dirOf(p.arm[0] + p.lean), 0.29), add(shoulder[1], dirOf(p.arm[1] + p.lean), 0.29)];
  const fa: [number, number] = [p.arm[0] + p.lean + p.elbow[0], p.arm[1] + p.lean + p.elbow[1]];
  const hand: [V, V] = [add(elbow[0], dirOf(fa[0]), 0.27), add(elbow[1], dirOf(fa[1]), 0.27)];
  const hipN = add(hip, v(1, 0), 0.05);
  const hipF = add(hip, v(1, 0), -0.05);
  const knee: [V, V] = [add(hipN, dirOf(p.thigh[0]), 0.44), add(hipF, dirOf(p.thigh[1]), 0.44)];
  const foot: [V, V] = [add(knee[0], dirOf(p.thigh[0] - p.knee[0]), 0.44), add(knee[1], dirOf(p.thigh[1] - p.knee[1]), 0.44)];
  return { hip, chest, neck, head, up, torsoDir, shoulder, elbow, hand, knee, foot, handAngle: fa };
}

const FAR: RGB = [0.72, 0.72, 0.78];

/** Draws one humanoid actor. Far-side limbs go first and darker; near side, weapon and FX on top. */
export function drawHumanoid(ctx: RigContext, e: EntitySnap, anim: AnimState): void {
  const style: Style = e.classId === 'arcanist' || e.classId === 'healer' || e.classId === 'warlock' ? 'staff' : e.enemyId === 'hollow' || e.enemyId === 'bonegiant' ? 'undead' : 'sword';
  const pose = humanPose(e, anim, ctx.time, style);
  const flash = ctx.tick - e.hitTick < 4 && !e.dead;
  const statuses = e.statuses ?? [];
  const slow = statuses.includes('slow');
  const fade = e.dead ? 0.5 : 1;
  const tint: RGB = slow ? [0.75 * fade, 0.88 * fade, 1.2 * fade] : [fade, fade, fade];
  const P = new Painter(ctx.out, e.x, e.y, anim.side, flash, pose.bodyRot, v(0, e.dead ? 0 : 0.85), tint);
  const k = solveHuman(pose);
  const sa = k.handAngle[0] + pose.wrist;
  const wdir = dirOf(sa);
  const flutter = Math.sin(ctx.time * 3 + anim.phase) * 0.06 + Math.min(1, anim.speed / 4) * 0.25;
  const capeA = add(add(k.neck, k.torsoDir, -0.02), v(-0.07, 0), 1);
  const capeB = v(-0.2 - flutter, 0.12 + flutter * 0.5);
  const under = (a: V, b: V) => mid(a, b, 0.62);

  if (style === 'sword') {
    const PB = Mat.PlayerBody;
    P.part('vg_cape', capeA, capeB, -0.03, { mat: Mat.Cloth });
    P.part('vg_thigh', add(k.hip, v(-0.05, 0), 1), k.knee[1], -0.02, { tint: FAR, mat: PB });
    P.part('vg_shin', k.knee[1], k.foot[1], -0.021, { tint: FAR, mat: PB });
    P.part('vg_upper', k.shoulder[1], k.elbow[1], -0.016, { tint: FAR, mat: PB });
    P.part('vg_fore', k.elbow[1], k.hand[1], -0.015, { tint: FAR, mat: PB });
    if (!e.blocking) {
      const sc = add(k.hand[1], v(-0.04, 0.06), 1);
      P.part('vg_shield', add(sc, k.up, 0.3), add(sc, k.up, -0.3), -0.012, { mat: Mat.Shield, tint: [0.85, 0.85, 0.9] });
    }
    P.part('vg_thigh', add(k.hip, v(0.05, 0), 1), k.knee[0], 0.006, { mat: PB });
    P.part('vg_shin', k.knee[0], k.foot[0], 0.007, { mat: PB });
    P.part('vg_torso', k.neck, k.hip, 0.008, { mat: PB });
    P.part('vg_faulds', add(k.hip, k.torsoDir, 0.04), under(k.hip, mid(k.knee[0], k.knee[1])), 0.009, { mat: PB });
    P.part('vg_plume', add(add(k.head, k.up, 0.3), v(-0.08, 0), 1), add(add(k.head, k.up, 0.05), v(-0.03, 0), 1), 0.011, { mat: Mat.Cloth });
    P.part('vg_helm', add(k.head, k.up, 0.18), add(k.head, k.up, -0.17), 0.012, { mat: PB });
    if (e.blocking) {
      const sc = add(k.hand[1], v(0.1, 0.04), 1);
      P.part('vg_shield', add(sc, k.up, 0.32), add(sc, k.up, -0.32), 0.03, { mat: Mat.Shield, emis: 0.08 });
    }
    P.part('vg_pauldron', add(k.shoulder[0], k.torsoDir, 0.1), add(k.shoulder[0], k.torsoDir, -0.1), 0.017, { mat: PB });
    P.part('vg_upper', k.shoulder[0], k.elbow[0], 0.018, { mat: PB });
    P.part('vg_fore', k.elbow[0], k.hand[0], 0.019, { mat: PB });
    const counter = statuses.includes('counter');
    P.line(add(k.hand[0], wdir, 0.12), add(k.hand[0], wdir, 0.92), 0.06, counter ? [1.3, 1.1, 0.6] : [0.85, 0.88, 0.95], 0.0195, pose.glow * 0.5);
    P.part('vg_sword', add(k.hand[0], wdir, -0.1), add(k.hand[0], wdir, 0.95), 0.02, {
      mat: PB, tint: counter ? [1.35, 1.15, 0.6] : WHITE, emis: pose.glow * 0.5 + (counter ? 0.5 : 0),
    });
  } else if (style === 'staff') {
    const healer = e.classId === 'healer';
    const C = Mat.Cloth;
    P.part(healer ? 'he_mantle' : 'ar_cloak', capeA, capeB, -0.03, { mat: C });
    P.part(healer ? 'he_sleeve_u' : 'ar_sleeve_u', k.shoulder[1], k.elbow[1], -0.016, { tint: FAR, mat: C });
    P.part(healer ? 'he_sleeve_l' : 'ar_sleeve_l', k.elbow[1], k.hand[1], -0.015, { tint: FAR, mat: C });
    // boots under the hem
    P.ball(add(k.foot[1], v(0.05, 0.04), 1), 0.07, healer ? [0.55, 0.42, 0.25] : [0.12, 0.08, 0.06], Mat.PlayerBody, -0.02, { ry: 0.05 });
    P.ball(add(k.foot[0], v(0.05, 0.04), 1), 0.07, healer ? [0.62, 0.48, 0.28] : [0.15, 0.1, 0.07], Mat.PlayerBody, 0.004, { ry: 0.05 });
    // robe falls from the waist to the ground, swaying with the stride
    const hem = v((k.foot[0].x + k.foot[1].x) / 2 + Math.sin(anim.phase) * 0.04, 0.02);
    P.part(healer ? 'he_skirt' : 'ar_skirt', add(k.hip, k.torsoDir, 0.06), hem, 0.005, { mat: C });
    P.part(healer ? 'he_torso' : 'ar_torso', k.neck, k.hip, 0.008, { mat: C });
    P.part(healer ? 'he_head' : 'ar_hood', add(k.head, k.up, 0.22), add(k.head, k.up, -0.2), 0.012, { mat: C });
    if (!healer) P.ball(add(k.head, v(0.07, -0.01), 1), 0.035, [0.55, 0.8, 1.0], Mat.Eyes, 0.013, { emis: 0.45 + pose.glow * 0.4 });
    P.part(healer ? 'he_sleeve_u' : 'ar_sleeve_u', k.shoulder[0], k.elbow[0], 0.018, { mat: C });
    P.part(healer ? 'he_sleeve_l' : 'ar_sleeve_l', k.elbow[0], k.hand[0], 0.019, { mat: C });
    const tip = add(k.hand[0], wdir, 1.12);
    P.line(tip, add(k.hand[0], wdir, -0.55), 0.055, healer ? [0.9, 0.82, 0.6] : [0.5, 0.36, 0.2], 0.0195);
    P.part(healer ? 'he_staff' : 'ar_staff', tip, add(k.hand[0], wdir, -0.6), 0.02, { mat: healer ? Mat.PlayerBody : Mat.Trunk });
    const focus = add(tip, wdir, healer ? -0.14 : -0.09);
    const orb = (healer ? 0.07 : 0.09) + pose.glow * 0.07 + Math.sin(ctx.time * 5) * 0.01;
    P.ball(focus, orb, healer ? [1.0, 0.9, 0.55] : [0.6, 0.82, 1.0], Mat.Magic, 0.03, { emis: 0.75 + pose.glow * 0.25 });
    if (statuses.includes('ironguard')) P.ball(v(0, 0.85), 0.62, [1.0, 0.85, 0.45], Mat.Magic, -0.04, { emis: 0.3, ry: 0.85 });
  } else {
    // "Errante Oco": skeletal warrior with a rusted half-helm and a notched blade
    const def = e.action ? ACTIONS[e.action] : undefined;
    const wind = def?.telegraph && e.at < def.startup ? e.at / def.startup : 0;
    const danger = def?.telegraph === 'danger';
    const EB = Mat.EnemyBody;
    P.part('sk_femur', add(k.hip, v(-0.04, 0), 1), k.knee[1], -0.02, { tint: FAR, mat: EB });
    P.part('sk_tibia', k.knee[1], k.foot[1], -0.021, { tint: FAR, mat: EB });
    P.part('sk_upper', k.shoulder[1], k.elbow[1], -0.016, { tint: FAR, mat: EB });
    P.part('sk_fore', k.elbow[1], k.hand[1], -0.015, { tint: FAR, mat: EB });
    P.part('sk_ribs', k.neck, add(k.hip, k.torsoDir, 0.04), 0.004, { mat: EB });
    P.part('sk_pelvis', add(k.hip, k.torsoDir, 0.06), add(k.hip, k.torsoDir, -0.28), 0.006, { mat: EB });
    P.part('sk_femur', add(k.hip, v(0.04, 0), 1), k.knee[0], 0.008, { mat: EB });
    P.part('sk_tibia', k.knee[0], k.foot[0], 0.009, { mat: EB });
    P.part('sk_skull', add(k.head, k.up, 0.16), add(k.head, k.up, -0.16), 0.012, { mat: EB });
    P.ball(add(k.head, v(0.06, 0.02), 1), 0.032, [1, 0.25, 0.12], Mat.Eyes, 0.014, { emis: 0.6 + wind * 0.4 });
    P.part('sk_upper', k.shoulder[0], k.elbow[0], 0.018, { mat: EB });
    P.part('sk_fore', k.elbow[0], k.hand[0], 0.019, { mat: EB });
    P.line(add(k.hand[0], wdir, 0.1), add(k.hand[0], wdir, 0.9), 0.06, danger ? [1.0, 0.45, 0.25] : [0.6, 0.5, 0.42], 0.0195, danger ? wind * 0.7 : 0);
    P.part('sk_sword', add(k.hand[0], wdir, -0.1), add(k.hand[0], wdir, 0.95), 0.02, {
      mat: EB, tint: danger ? [1.5, 0.7, 0.45] : WHITE, emis: danger ? wind * 0.7 : 0,
    });
  }
  if (statuses.includes('root') && !e.dead) {
    P.ball(v(0, 0.02), 0.55, [1.0, 0.82, 0.35], Mat.Magic, -0.05, { emis: 0.55, ry: 0.22 });
  }
}

/** Dire wolf: painted body/head/tail on a quadruped rig with a gallop cycle. */
export function drawWolf(ctx: RigContext, e: EntitySnap, anim: AnimState): void {
  const flash = ctx.tick - e.hitTick < 4 && !e.dead;
  const a = actPhase(e);
  const def = a.id ? ACTIONS[a.id] : undefined;
  const wind = def?.telegraph && a.stage === 'windup' ? a.k : 0;
  const dead = e.dead;
  const slow = (e.statuses ?? []).includes('slow');
  const tint: RGB = slow ? [0.75, 0.88, 1.2] : dead ? [0.5, 0.5, 0.5] : [1 + wind * 0.4, 1 - wind * 0.1, 1 - wind * 0.2];
  const P = new Painter(ctx.out, e.x, e.y, anim.side, flash, dead ? 0.25 : 0, v(0, 0), tint);
  const run = Math.min(1, anim.speed / 5);
  const ph = anim.phase * 1.25;
  const lunge = a.id === 'wolf_lunge';
  const crouch = lunge && a.stage === 'windup' ? 0.16 * a.k : 0;
  const leap = lunge && a.stage === 'active' ? Math.sin(a.k * Math.PI) * 0.35 : 0;
  const bob = Math.abs(Math.sin(ph)) * 0.05 * run;
  const bodyH = 0.62 - crouch + leap + bob - (dead ? 0.4 : 0);
  const EB = Mat.EnemyBody;
  const hipP = v(-0.46, bodyH);
  const shP = v(0.42, bodyH + 0.05);
  const legs: Array<[V, number, number, boolean]> = [
    [shP, 0.0, -0.01, true],
    [hipP, Math.PI * 1.0, -0.011, false],
    [shP, Math.PI * 0.35, 0.012, true],
    [hipP, Math.PI * 1.35, 0.013, false],
  ];
  for (const [root, off, depth, front] of legs) {
    const sw = dead ? 1.2 : Math.sin(ph + off) * 0.75 * run + (crouch ? 0.4 : 0) + (leap ? (front ? 0.9 : -0.9) : 0);
    const knee = add(root, dirOf(sw), 0.3);
    const bend = (front ? -1 : 1) * (0.35 + Math.max(0, Math.sin(ph + off + 1.2)) * 0.8 * run);
    const paw = add(knee, dirOf(sw + bend), 0.32);
    const t: RGB | undefined = depth < 0 ? FAR : undefined;
    P.part('wf_leg_u', root, knee, depth, { mat: EB, tint: t });
    P.part('wf_leg_l', knee, paw, depth + 0.0005, { mat: EB, tint: t });
  }
  const tw = Math.sin(ctx.time * 6) * 0.12;
  P.part('wf_tail', add(hipP, v(-0.55, 0.12 + tw), 1), add(hipP, v(0.02, 0.08), 1), -0.005, { mat: EB });
  P.part('wf_body', hipP, shP, 0, { mat: EB });
  const bite = a.id === 'wolf_bite' && a.stage === 'active' ? 0.15 : 0;
  const neck = add(shP, v(0.12, 0.12 - crouch * 0.5), 1);
  const snout = add(neck, v(0.5 + bite, -0.06 - crouch * 0.3), 1);
  P.part('wf_head', neck, snout, 0.008, { mat: EB });
  P.ball(add(neck, v(0.2, 0.06), 1), 0.03, [1, 0.72, 0.2], Mat.Eyes, 0.012, { emis: dead ? 0 : 0.55 + wind * 0.45 });
  if ((e.statuses ?? []).includes('root') && !dead) P.ball(v(0, 0.02), 0.75, [1.0, 0.82, 0.35], Mat.Magic, -0.05, { emis: 0.55, ry: 0.25 });
}

/** Two-bone IK with the joint bending upward (spider legs arch over the body). */
function ikUp(h: V, f: V, l1: number, l2: number, dirSign: number): V {
  const dx = f.x - h.x;
  const dy = f.y - h.y;
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const ang = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  const k1 = v(h.x + Math.cos(base + ang) * l1, h.y + Math.sin(base + ang) * l1);
  const k2 = v(h.x + Math.cos(base - ang) * l1, h.y + Math.sin(base - ang) * l1);
  const pick = k1.y > k2.y ? k1 : k2;
  return dirSign === 0 ? pick : pick;
}

/** Giant spider: abdomen, cephalothorax, fanged head and eight IK legs with an alternating tetrapod gait. */
export function drawSpider(ctx: RigContext, e: EntitySnap, anim: AnimState): void {
  const flash = ctx.tick - e.hitTick < 4 && !e.dead;
  const a = actPhase(e);
  const def = a.id ? ACTIONS[a.id] : undefined;
  const wind = def?.telegraph && a.stage === 'windup' ? a.k : 0;
  const dead = e.dead;
  const slow = (e.statuses ?? []).includes('slow');
  const tint: RGB = slow ? [0.75, 0.88, 1.2] : dead ? [0.55, 0.55, 0.55] : WHITE;
  const P = new Painter(ctx.out, e.x, e.y, anim.side, flash, 0, v(0, 0), tint);
  const run = Math.min(1, anim.speed / 4);
  const ph = anim.phase * 1.6;
  const leap = a.id === 'spider_leap';
  const crouch = leap && a.stage === 'windup' ? 0.22 * a.k : 0;
  const air = leap && a.stage === 'active' ? Math.sin(a.k * Math.PI) * 0.45 : 0;
  const web = a.id === 'spider_web';
  const tilt = web && a.stage !== 'recovery' ? (a.stage === 'windup' ? a.k : 1) * 0.35 : 0;
  const bite = a.id === 'spider_bite' && a.stage === 'active' ? 0.18 : 0;
  const bodyH = (dead ? 0.22 : 0.62) - crouch + air + Math.abs(Math.sin(ph)) * 0.025 * run;
  const EB = Mat.EnemyBody;

  const thorax = v(0.1, bodyH);
  const hipBase = [0.32, 0.16, 0.0, -0.14];
  const spread = [1.0, 0.55, -0.45, -0.95];
  const pairs: Array<{ i: number; far: boolean }> = [];
  for (let i = 0; i < 4; i++) pairs.push({ i, far: true });
  for (let i = 0; i < 4; i++) pairs.push({ i, far: false });
  const legPart = (far: boolean, i: number) => {
    const off = (i % 2 === 0) !== far ? 0 : Math.PI;
    const step = Math.sin(ph + off);
    const liftK = Math.max(0, Math.cos(ph + off)) * 0.18 * run;
    const hip = v(thorax.x + hipBase[i]! * 0.6, bodyH + 0.04);
    let fx = hipBase[i]! + spread[i]! * (far ? 0.82 : 1.0) + step * 0.22 * run;
    let fy = liftK;
    if (dead) {
      fx = hipBase[i]! * 0.5 + spread[i]! * 0.25;
      fy = 0.32;
    }
    if (crouch) fx += spread[i]! * 0.15;
    if (air) fy = 0.25 + air * 0.4;
    const foot = v(fx, fy);
    const knee = ikUp(hip, foot, 0.8, 0.95, 1);
    const t: RGB = far ? [0.62, 0.62, 0.68] : WHITE;
    const d = far ? -0.03 - i * 0.001 : 0.02 + i * 0.001;
    P.part('sp_femur', hip, knee, d, { mat: EB, tint: t });
    P.part('sp_tibia', knee, foot, d + 0.0005, { mat: EB, tint: t });
  };
  for (const l of pairs.filter((p) => p.far)) legPart(true, l.i);
  // abdomen behind (raises to aim the web), thorax, head with fangs
  const abA = v(-1.15, bodyH + 0.12 + tilt * 0.6);
  const abB = v(-0.05, bodyH + 0.02);
  P.part('sp_abdomen', abA, abB, -0.01, { mat: EB });
  P.part('sp_thorax', v(-0.2, bodyH), v(0.38, bodyH - 0.02), 0, { mat: EB });
  const head = v(0.42 + bite, bodyH - 0.04 - crouch * 0.3);
  P.part('sp_head', head, add(head, v(1, -0.12), 0.4), 0.004, { mat: EB });
  const eyeC = add(head, v(0.25, 0.09), 1);
  const eyeEm = dead ? 0 : 0.55 + wind * 0.45;
  for (const [ox, oy, r] of [[0, 0, 0.032], [0.06, -0.02, 0.028], [-0.05, -0.03, 0.022], [0.03, -0.06, 0.02]] as const) {
    P.ball(add(eyeC, v(ox, oy), 1), r, [1, 0.15, 0.08], Mat.Eyes, 0.006, { emis: eyeEm });
  }
  for (const l of pairs.filter((p) => !p.far)) legPart(false, l.i);
  if ((e.statuses ?? []).includes('root') && !dead) P.ball(v(0, 0.02), 1.1, [1.0, 0.82, 0.35], Mat.Magic, -0.05, { emis: 0.55, ry: 0.35 });
}
