/**
 * Painted cutout sprites for actors ("recortes animados").
 *
 * Every body part is painted once, procedurally, with Canvas2D (gradients, plates, folds,
 * fur strokes, chitin highlights) into a single atlas. The rig places each part along a
 * bone as a textured quad; the ASCII cell pass then turns the shaded texels into glyphs,
 * so armour plates, folds and emblems become readable character detail instead of
 * flat-colored sticks.
 *
 * Canvas convention: top of a part = the bone's first joint (A), bottom = the second (B)
 * for `axis: 'y'` parts (limbs, torsos). `axis: 'x'` parts (quadruped bodies) run left→right
 * from rear (A) to front (B) with the back at the top. "Forward" is canvas +x for 'y' parts.
 */

export type C3 = [number, number, number];

export interface SpriteDef {
  /** Width across the bone, meters. */
  w: number;
  /** Nominal length along the bone (only used for painting resolution), meters. */
  h: number;
  /** Fraction of the texture beyond joint A / joint B. */
  padA: number;
  padB: number;
  axis: 'x' | 'y';
  paint: (g: CanvasRenderingContext2D, W: number, H: number, rnd: () => number) => void;
}

export const SPRITE_PPM = 128;

// ------------------------------------------------------------------ painting helpers
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const css = (c: C3, a = 1): string => `rgba(${Math.round(clamp01(c[0]) * 255)},${Math.round(clamp01(c[1]) * 255)},${Math.round(clamp01(c[2]) * 255)},${a})`;
const sh = (c: C3, k: number): C3 => [c[0] * k, c[1] * k, c[2] * k];

/** Cylindrical shading across x (key light upper-left, rim on the right). */
function cyl(g: CanvasRenderingContext2D, x0: number, x1: number, base: C3, hi = 1.45, lo = 0.42): CanvasGradient {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, css(sh(base, lo)));
  gr.addColorStop(0.28, css(sh(base, hi)));
  gr.addColorStop(0.5, css(base));
  gr.addColorStop(0.85, css(sh(base, 0.62)));
  gr.addColorStop(1, css(sh(base, lo * 0.75)));
  return gr;
}
function fillShaded(g: CanvasRenderingContext2D, path: Path2D, x0: number, x1: number, base: C3, y0: number, y1: number, hi = 1.45, lo = 0.42): void {
  g.fillStyle = cyl(g, x0, x1, base, hi, lo);
  g.fill(path);
  // vertical falloff: lit from above
  g.save();
  g.clip(path);
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = gr;
  g.fillRect(Math.min(x0, x1) - 2, y0, Math.abs(x1 - x0) + 4, y1 - y0);
  g.restore();
}
function stroke(g: CanvasRenderingContext2D, path: Path2D, c: C3, w: number, a = 1): void {
  g.strokeStyle = css(c, a);
  g.lineWidth = w;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke(path);
}
function line(g: CanvasRenderingContext2D, pts: number[], c: C3, w: number, a = 1): void {
  const p = new Path2D();
  p.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i]!, pts[i + 1]!);
  stroke(g, p, c, w, a);
}
function poly(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i]!, pts[i + 1]!);
  p.closePath();
  return p;
}
function ellipse(cx: number, cy: number, rx: number, ry: number): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  return p;
}
function rrect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}
/** Speckle texture (wear, grime, grain) clipped to a path. */
function grain(g: CanvasRenderingContext2D, path: Path2D, W: number, H: number, rnd: () => number, n: number, light: C3, dark: C3, size = 1.5): void {
  g.save();
  g.clip(path);
  for (let i = 0; i < n; i++) {
    g.fillStyle = css(rnd() < 0.5 ? light : dark, 0.25 + rnd() * 0.35);
    g.fillRect(rnd() * W, rnd() * H, size, size);
  }
  g.restore();
}
/** Cloth folds: dark/bright strokes that fan out downward. */
function folds(g: CanvasRenderingContext2D, path: Path2D, x0: number, x1: number, y0: number, y1: number, base: C3, n: number, rnd: () => number, fan = 0.25): void {
  g.save();
  g.clip(path);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const xa = x0 + (x1 - x0) * (0.5 + (t - 0.5) * (1 - fan));
    const xb = x0 + (x1 - x0) * t + (rnd() - 0.5) * 4;
    line(g, [xa, y0, xa + (xb - xa) * 0.5 + (rnd() - 0.5) * 6, (y0 + y1) / 2, xb, y1], sh(base, 0.45), 2.6, 0.7);
    line(g, [xa + 2.5, y0, xb + 2.5, y1], sh(base, 1.5), 1.2, 0.45);
  }
  g.restore();
}
/** Fur: many short strokes following a direction field. */
function fur(g: CanvasRenderingContext2D, path: Path2D, W: number, H: number, base: C3, rnd: () => number, n: number, dir: (x: number, y: number) => number, len = 7): void {
  g.save();
  g.clip(path);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const a = dir(x, y) + (rnd() - 0.5) * 0.5;
    const k = 0.55 + rnd() * 0.9;
    line(g, [x, y, x + Math.cos(a) * len, y + Math.sin(a) * len], sh(base, k), 1.4, 0.75);
  }
  g.restore();
}
function rivets(g: CanvasRenderingContext2D, pts: number[], c: C3, r = 1.6): void {
  for (let i = 0; i < pts.length; i += 2) {
    g.fillStyle = css(sh(c, 1.5));
    g.beginPath();
    g.arc(pts[i]!, pts[i + 1]!, r, 0, Math.PI * 2);
    g.fill();
  }
}

// ------------------------------------------------------------------ palettes
const STEEL: C3 = [0.6, 0.63, 0.7];
const DSTEEL: C3 = [0.34, 0.36, 0.42];
const GOLD: C3 = [0.85, 0.66, 0.26];
const CRIMSON: C3 = [0.58, 0.07, 0.08];
const LEATHER: C3 = [0.36, 0.22, 0.12];
const VIOLET: C3 = [0.3, 0.12, 0.42];
const DVIOLET: C3 = [0.13, 0.06, 0.2];
const RUNE: C3 = [0.55, 0.85, 1.0];
const SILVER: C3 = [0.75, 0.78, 0.85];
const IVORY: C3 = [0.92, 0.9, 0.84];
const SKY: C3 = [0.35, 0.55, 0.85];
const SKIN: C3 = [0.86, 0.68, 0.55];
const BONE: C3 = [0.84, 0.8, 0.68];
const RUST: C3 = [0.5, 0.3, 0.17];
const ASHFUR: C3 = [0.46, 0.42, 0.38];
const CHITIN: C3 = [0.3, 0.21, 0.19];

type Paint = SpriteDef['paint'];

// ------------------------------------------------------------------ generic part painters
/** Plated limb segment (arm/leg) with an optional joint cop and an end piece. */
function platedLimb(base: C3, opts: { cop?: 'bottom' | 'top'; end?: 'gauntlet' | 'sabaton'; bands?: number; trim?: C3 }): Paint {
  return (g, W, H, rnd) => {
    const top = H * 0.06;
    const bot = opts.end ? H * 0.78 : H * 0.94;
    const body = poly([W * 0.16, top, W * 0.84, top, W * 0.76, bot, W * 0.24, bot]);
    fillShaded(g, body, W * 0.12, W * 0.88, base, top, bot);
    const bands = opts.bands ?? 2;
    for (let i = 1; i <= bands; i++) {
      const y = top + ((bot - top) * i) / (bands + 1);
      line(g, [W * 0.2, y, W * 0.8, y + 2], sh(base, 0.35), 2.2);
      line(g, [W * 0.22, y + 2.5, W * 0.78, y + 4], sh(base, 1.6), 1);
    }
    if (opts.trim) line(g, [W * 0.18, top + 2, W * 0.82, top + 2], opts.trim, 3);
    line(g, [W * 0.36, top + 4, W * 0.32, bot - 4], [1, 1, 1], 1.4, 0.55);
    stroke(g, body, sh(base, 0.22), 2);
    if (opts.cop) {
      const cy = opts.cop === 'bottom' ? bot - H * 0.04 : top + H * 0.06;
      const cop = ellipse(W * 0.52, cy, W * 0.42, H * 0.09);
      fillShaded(g, cop, W * 0.1, W * 0.94, sh(base, 1.08), cy - H * 0.09, cy + H * 0.09, 1.7);
      stroke(g, cop, sh(base, 0.25), 2);
      rivets(g, [W * 0.52, cy], base, 2);
    }
    if (opts.end === 'gauntlet') {
      const hand = rrect(W * 0.18, bot - 2, W * 0.64, H * 0.2, 5);
      fillShaded(g, hand, W * 0.18, W * 0.82, sh(base, 0.85), bot, H, 1.5);
      for (let i = 0; i < 3; i++) line(g, [W * 0.24, bot + 4 + i * 5, W * 0.78, bot + 5 + i * 5], sh(base, 0.35), 1.6);
      stroke(g, hand, sh(base, 0.22), 2);
    } else if (opts.end === 'sabaton') {
      const foot = poly([W * 0.15, bot - 3, W * 0.8, bot - 3, W * 1.0, H * 0.93, W * 0.98, H * 0.99, W * 0.12, H * 0.99]);
      fillShaded(g, foot, W * 0.1, W, sh(base, 0.8), bot, H, 1.5);
      line(g, [W * 0.4, bot, W * 0.55, H * 0.98], sh(base, 0.3), 1.6);
      stroke(g, foot, sh(base, 0.2), 2);
    }
    grain(g, body, W, H, rnd, 40, sh(base, 1.6), sh(base, 0.5));
  };
}
/** Cloth sleeve with folds and an optional hand. */
function clothLimb(base: C3, opts: { bell?: boolean; hand?: C3; cuff?: C3 }): Paint {
  return (g, W, H, rnd) => {
    const bot = opts.hand ? H * 0.8 : H * 0.96;
    const wb = opts.bell ? 0.98 : 0.8;
    const body = poly([W * 0.2, H * 0.03, W * 0.8, H * 0.03, W * wb, bot, W * (1 - wb), bot]);
    fillShaded(g, body, 0, W, base, 0, bot, 1.35);
    folds(g, body, W * 0.1, W * 0.9, 0, bot, base, 3, rnd, 0.6);
    if (opts.cuff) {
      line(g, [W * (1 - wb) + 2, bot - 3, W * wb - 2, bot - 3], opts.cuff, 3.5);
      line(g, [W * (1 - wb) + 2, bot - 0.5, W * wb - 2, bot - 0.5], sh(opts.cuff, 0.5), 1.2);
    }
    stroke(g, body, sh(base, 0.3), 1.8);
    if (opts.hand) {
      const hand = ellipse(W * 0.5, H * 0.88, W * 0.26, H * 0.1);
      fillShaded(g, hand, W * 0.24, W * 0.76, opts.hand, H * 0.78, H, 1.3);
      stroke(g, hand, sh(opts.hand, 0.45), 1.4);
    }
  };
}
/** Long bone with knobbed ends (skeletons). */
function boneLimb(opts: { hand?: boolean; foot?: boolean; thick?: number }): Paint {
  return (g, W, H, rnd) => {
    const t = opts.thick ?? 0.32;
    const shaft = poly([W * (0.5 - t / 2), H * 0.08, W * (0.5 + t / 2), H * 0.08, W * (0.5 + t / 2.6), H * 0.86, W * (0.5 - t / 2.6), H * 0.86]);
    fillShaded(g, shaft, W * 0.2, W * 0.8, BONE, 0, H, 1.3, 0.5);
    for (const y of [0.08, 0.86]) {
      const k = ellipse(W * 0.5, H * y, W * 0.34, H * 0.06);
      fillShaded(g, k, W * 0.16, W * 0.84, BONE, H * (y - 0.06), H * (y + 0.06), 1.4);
      stroke(g, k, sh(BONE, 0.4), 1.4);
    }
    stroke(g, shaft, sh(BONE, 0.35), 1.6);
    line(g, [W * 0.45, H * 0.2, W * 0.47, H * 0.7], sh(BONE, 0.55), 1.2, 0.8);
    grain(g, shaft, W, H, rnd, 30, sh(BONE, 1.2), sh(BONE, 0.5));
    if (opts.hand) for (let i = 0; i < 4; i++) line(g, [W * (0.32 + i * 0.12), H * 0.88, W * (0.28 + i * 0.13), H * 0.99], BONE, 2.2);
    if (opts.foot) {
      const f = poly([W * 0.25, H * 0.88, W * 0.98, H * 0.94, W * 0.95, H * 0.99, W * 0.2, H * 0.99]);
      fillShaded(g, f, W * 0.2, W, BONE, H * 0.88, H, 1.3);
      stroke(g, f, sh(BONE, 0.4), 1.4);
    }
  };
}
/** Tapered limb of a beast: fur (wolf) or chitin with bristles (spider). */
function beastLimb(base: C3, opts: { fur?: boolean; claw?: boolean; knob?: boolean; taper?: number }): Paint {
  return (g, W, H, rnd) => {
    const tp = opts.taper ?? 0.5;
    const body = poly([W * 0.12, H * 0.04, W * 0.88, H * 0.04, W * (0.5 + 0.38 * tp), H * 0.92, W * (0.5 - 0.38 * tp), H * 0.92]);
    fillShaded(g, body, 0, W, base, 0, H, opts.fur ? 1.3 : 1.9, 0.35);
    if (opts.fur) fur(g, body, W, H, base, rnd, 90, () => Math.PI / 2, 6);
    else {
      for (let i = 1; i < 4; i++) line(g, [W * 0.18, (H * i) / 4, W * 0.82, (H * i) / 4 + 2], sh(base, 0.3), 1.6);
      line(g, [W * 0.34, H * 0.08, W * 0.42, H * 0.86], [1, 1, 1], 1.3, 0.4);
      for (let i = 0; i < 26; i++) {
        const y = rnd() * H * 0.9;
        const sx = rnd() < 0.5 ? W * 0.16 : W * 0.84;
        line(g, [sx, y, sx + (sx < W / 2 ? -5 : 5), y + 4], sh(base, 1.6), 1, 0.8);
      }
    }
    stroke(g, body, sh(base, 0.25), 1.6);
    if (opts.knob) {
      const k = ellipse(W * 0.5, H * 0.06, W * 0.46, H * 0.06);
      fillShaded(g, k, 0, W, base, 0, H * 0.12, 1.8);
      stroke(g, k, sh(base, 0.25), 1.4);
    }
    if (opts.claw) {
      if (opts.fur) {
        const paw = ellipse(W * 0.56, H * 0.93, W * 0.4, H * 0.06);
        fillShaded(g, paw, 0, W, sh(base, 0.8), H * 0.86, H, 1.2);
        for (let i = 0; i < 3; i++) line(g, [W * (0.4 + i * 0.16), H * 0.95, W * (0.5 + i * 0.18), H * 0.995], [0.1, 0.09, 0.08], 1.6);
      } else {
        g.fillStyle = css(sh(base, 0.3));
        g.fill(poly([W * 0.36, H * 0.9, W * 0.64, H * 0.9, W * 0.55, H * 1.0]));
      }
    }
  };
}
function sunburst(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: C3, w: number): void {
  const p = new Path2D();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.moveTo(cx, cy);
    p.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  stroke(g, p, c, w);
}
function longRobe(base: C3, panel: C3 | null, hem: C3, runes: boolean): Paint {
  return (g, W, H, rnd) => {
    const pts = [W * 0.24, 0, W * 0.76, 0, W * 0.98, H * 0.96];
    for (let i = 0; i <= 6; i++) pts.push(W * (0.98 - i * 0.16), H * (0.97 + Math.sin(i * 1.7) * 0.02));
    const p = poly(pts);
    fillShaded(g, p, 0, W, base, 0, H, 1.3, 0.42);
    folds(g, p, 0, W, H * 0.03, H, base, 6, rnd, 0.0);
    if (panel) {
      const pn = poly([W * 0.43, H * 0.02, W * 0.57, H * 0.02, W * 0.66, H * 0.97, W * 0.36, H * 0.97]);
      fillShaded(g, pn, W * 0.36, W * 0.66, panel, 0, H, 1.3);
      for (let i = 0; i < 6; i++) {
        const y = H * (0.15 + i * 0.13);
        line(g, [W * 0.51, y - 4, W * 0.51, y + 4], hem, 1.6);
        line(g, [W * 0.51 - 4, y, W * 0.51 + 4, y], hem, 1.6);
      }
    }
    if (runes) {
      for (let i = 0; i < 9; i++) {
        const x = W * (0.08 + i * 0.1);
        line(g, [x, H * 0.88, x + 3, H * 0.84, x + 6, H * 0.9, x + 9, H * 0.86], RUNE, 1.6);
      }
    }
    line(g, [W * 0.03, H * 0.94, W * 0.97, H * 0.94], hem, 3);
    stroke(g, p, sh(base, 0.25), 2);
  };
}
function capeShape(base: C3, trim: C3): Paint {
  return (g, W, H, rnd) => {
    const pts = [W * 0.22, 0, W * 0.78, 0, W * 0.96, H * 0.9];
    for (let i = 0; i <= 6; i++) pts.push(W * (0.96 - (i * 0.92) / 6), H * (0.9 + (i % 2 ? 0.1 : 0.02) - rnd() * 0.04));
    const p = poly(pts);
    fillShaded(g, p, 0, W, base, 0, H, 1.25, 0.35);
    folds(g, p, 0, W, H * 0.05, H, base, 5, rnd, 0.1);
    line(g, [W * 0.22, 2, W * 0.78, 2], trim, 4);
    stroke(g, p, sh(base, 0.3), 2);
  };
}

// ------------------------------------------------------------------ sprite table
export const SPRITES = {
  // ======================= Vanguarda (cavaleira de placas) =======================
  vg_cape: { w: 0.6, h: 1.05, padA: 0.02, padB: 0.02, axis: 'y', paint: capeShape(CRIMSON, GOLD) },
  vg_torso: {
    w: 0.5, h: 0.66, padA: 0.08, padB: 0.06, axis: 'y',
    paint: (g, W, H, rnd) => {
      const plate = poly([W * 0.06, H * 0.12, W * 0.3, H * 0.04, W * 0.7, H * 0.04, W * 0.94, H * 0.12, W * 0.86, H * 0.5, W * 0.76, H * 0.86, W * 0.24, H * 0.86, W * 0.14, H * 0.5]);
      fillShaded(g, plate, 0, W, STEEL, 0, H, 1.55, 0.4);
      line(g, [W * 0.47, H * 0.1, W * 0.47, H * 0.84], [1, 1, 1], 1.6, 0.7);
      line(g, [W * 0.5, H * 0.1, W * 0.5, H * 0.84], sh(STEEL, 0.35), 1.6);
      line(g, [W * 0.16, H * 0.42, W * 0.5, H * 0.52, W * 0.84, H * 0.42], sh(STEEL, 0.4), 2);
      const tab = poly([W * 0.36, H * 0.28, W * 0.64, H * 0.28, W * 0.66, H * 1.0, W * 0.34, H * 1.0]);
      fillShaded(g, tab, W * 0.3, W * 0.7, CRIMSON, H * 0.28, H, 1.3, 0.5);
      folds(g, tab, W * 0.34, W * 0.66, H * 0.3, H, CRIMSON, 2, rnd, 0.2);
      stroke(g, tab, GOLD, 1.6);
      sunburst(g, W * 0.5, H * 0.44, W * 0.09, GOLD, 2.2);
      g.fillStyle = css(sh(GOLD, 1.2));
      g.fill(ellipse(W * 0.5, H * 0.44, W * 0.035, W * 0.035));
      const gor = poly([W * 0.3, 0, W * 0.7, 0, W * 0.74, H * 0.1, W * 0.26, H * 0.1]);
      fillShaded(g, gor, W * 0.26, W * 0.74, DSTEEL, 0, H * 0.1, 1.6);
      line(g, [W * 0.26, H * 0.1, W * 0.74, H * 0.1], GOLD, 3);
      const belt = poly([W * 0.22, H * 0.8, W * 0.78, H * 0.8, W * 0.78, H * 0.88, W * 0.22, H * 0.88]);
      fillShaded(g, belt, W * 0.2, W * 0.8, LEATHER, H * 0.8, H * 0.88, 1.4);
      g.fillStyle = css(GOLD);
      g.fillRect(W * 0.45, H * 0.79, W * 0.1, H * 0.1);
      stroke(g, plate, sh(STEEL, 0.2), 2.2);
      grain(g, plate, W, H, rnd, 70, [1, 1, 1], sh(STEEL, 0.4));
    },
  },
  vg_faulds: {
    w: 0.46, h: 0.32, padA: 0.05, padB: 0.05, axis: 'y',
    paint: (g, W, H, rnd) => {
      for (let i = 0; i < 3; i++) {
        const y = H * (0.02 + i * 0.27);
        const lame = poly([W * (0.14 - i * 0.03), y, W * (0.86 + i * 0.03), y, W * (0.9 + i * 0.04), y + H * 0.3, W * (0.1 - i * 0.04), y + H * 0.3]);
        fillShaded(g, lame, 0, W, STEEL, y, y + H * 0.3, 1.6);
        stroke(g, lame, sh(STEEL, 0.25), 1.8);
        rivets(g, [W * 0.2, y + H * 0.08, W * 0.8, y + H * 0.08], STEEL);
      }
      const tab = poly([W * 0.38, 0, W * 0.62, 0, W * 0.64, H, W * 0.56, H * 0.92, W * 0.48, H, W * 0.36, H * 0.95]);
      fillShaded(g, tab, W * 0.34, W * 0.66, CRIMSON, 0, H, 1.3);
      folds(g, tab, W * 0.36, W * 0.64, 0, H, CRIMSON, 2, rnd);
      stroke(g, tab, GOLD, 1.4);
    },
  },
  vg_helm: {
    w: 0.32, h: 0.36, padA: 0.02, padB: 0.02, axis: 'y',
    paint: (g, W, H) => {
      const helm = new Path2D();
      helm.moveTo(W * 0.12, H * 0.4);
      helm.quadraticCurveTo(W * 0.12, H * 0.02, W * 0.52, H * 0.02);
      helm.quadraticCurveTo(W * 0.92, H * 0.02, W * 0.94, H * 0.4);
      helm.lineTo(W * 0.92, H * 0.9);
      helm.quadraticCurveTo(W * 0.6, H * 1.0, W * 0.14, H * 0.9);
      helm.closePath();
      fillShaded(g, helm, 0, W, STEEL, 0, H, 1.7, 0.38);
      g.fillStyle = 'rgba(5,5,8,1)';
      g.fill(poly([W * 0.42, H * 0.38, W * 0.96, H * 0.36, W * 0.96, H * 0.45, W * 0.42, H * 0.46]));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.fillRect(W * (0.66 + i * 0.09), H * (0.58 + j * 0.08), 2.5, 2.5);
      line(g, [W * 0.58, H * 0.04, W * 0.58, H * 0.36], GOLD, 3);
      line(g, [W * 0.58, H * 0.47, W * 0.58, H * 0.92], GOLD, 3);
      line(g, [W * 0.14, H * 0.88, W * 0.92, H * 0.88], GOLD, 2.4);
      line(g, [W * 0.3, H * 0.08, W * 0.24, H * 0.6], [1, 1, 1], 2, 0.7);
      stroke(g, helm, sh(STEEL, 0.2), 2.2);
    },
  },
  vg_plume: {
    w: 0.3, h: 0.32, padA: 0, padB: 0, axis: 'y',
    paint: (g, W, H, rnd) => {
      const p = new Path2D();
      p.moveTo(W * 0.7, H * 0.95);
      p.quadraticCurveTo(W * 0.85, H * 0.15, W * 0.35, H * 0.05);
      p.quadraticCurveTo(W * 0.02, H * 0.3, W * 0.05, H * 0.62);
      p.quadraticCurveTo(W * 0.4, H * 0.4, W * 0.7, H * 0.95);
      fillShaded(g, p, 0, W, [0.75, 0.1, 0.09], 0, H, 1.4, 0.4);
      for (let i = 0; i < 14; i++) {
        const t = rnd();
        line(g, [W * (0.6 - t * 0.4), H * (0.85 - t * 0.7), W * (0.3 - t * 0.25), H * (0.6 - t * 0.5)], [0.95, 0.3, 0.25], 1.1, 0.6);
      }
      stroke(g, p, [0.3, 0.03, 0.03], 1.5);
    },
  },
  vg_pauldron: {
    w: 0.27, h: 0.22, padA: 0.05, padB: 0.05, axis: 'y',
    paint: (g, W, H) => {
      for (let i = 2; i >= 0; i--) {
        const y = H * (0.05 + i * 0.25);
        const p = new Path2D();
        p.moveTo(W * 0.04, y + H * 0.42);
        p.quadraticCurveTo(W * 0.04, y, W * 0.5, y);
        p.quadraticCurveTo(W * 0.96, y, W * 0.96, y + H * 0.42);
        p.closePath();
        fillShaded(g, p, 0, W, i === 0 ? STEEL : sh(STEEL, 0.9), y, y + H * 0.42, 1.8);
        stroke(g, p, sh(STEEL, 0.2), 1.8);
        if (i === 0) line(g, [W * 0.08, y + H * 0.4, W * 0.92, y + H * 0.4], GOLD, 2.4);
      }
      rivets(g, [W * 0.5, H * 0.18], GOLD, 2.4);
    },
  },
  vg_upper: { w: 0.15, h: 0.34, padA: 0.08, padB: 0.06, axis: 'y', paint: platedLimb(STEEL, { bands: 2 }) },
  vg_fore: { w: 0.14, h: 0.34, padA: 0.06, padB: 0.1, axis: 'y', paint: platedLimb(STEEL, { cop: 'top', end: 'gauntlet', bands: 1, trim: GOLD }) },
  vg_thigh: { w: 0.18, h: 0.5, padA: 0.06, padB: 0.08, axis: 'y', paint: platedLimb(STEEL, { cop: 'bottom', bands: 2 }) },
  vg_shin: { w: 0.18, h: 0.52, padA: 0.04, padB: 0.06, axis: 'y', paint: platedLimb(DSTEEL, { end: 'sabaton', bands: 2 }) },
  vg_shield: {
    w: 0.46, h: 0.6, padA: 0.02, padB: 0.02, axis: 'y',
    paint: (g, W, H) => {
      const s = new Path2D();
      s.moveTo(W * 0.04, H * 0.04);
      s.lineTo(W * 0.96, H * 0.04);
      s.lineTo(W * 0.96, H * 0.42);
      s.quadraticCurveTo(W * 0.92, H * 0.82, W * 0.5, H * 0.98);
      s.quadraticCurveTo(W * 0.08, H * 0.82, W * 0.04, H * 0.42);
      s.closePath();
      fillShaded(g, s, 0, W, [0.12, 0.18, 0.42], 0, H, 1.6, 0.45);
      g.save();
      g.clip(s);
      g.fillStyle = css(CRIMSON);
      g.fillRect(0, 0, W * 0.5, H * 0.45);
      g.fillRect(W * 0.5, H * 0.45, W * 0.5, H);
      g.restore();
      line(g, [W * 0.5, H * 0.06, W * 0.5, H * 0.94], GOLD, 5);
      line(g, [W * 0.06, H * 0.45, W * 0.94, H * 0.45], GOLD, 5);
      const boss = ellipse(W * 0.5, H * 0.45, W * 0.11, W * 0.11);
      fillShaded(g, boss, W * 0.38, W * 0.62, GOLD, H * 0.35, H * 0.55, 1.8);
      stroke(g, s, sh(STEEL, 1.1), 4);
      stroke(g, s, sh(STEEL, 0.25), 1.2);
      line(g, [W * 0.18, H * 0.1, W * 0.14, H * 0.5], [1, 1, 1], 2, 0.5);
    },
  },
  vg_sword: {
    w: 0.16, h: 1.32, padA: 0, padB: 0, axis: 'y',
    paint: (g, W, H) => {
      g.fillStyle = css(GOLD);
      g.fill(ellipse(W * 0.5, H * 0.02, W * 0.18, H * 0.018));
      const grip = rrect(W * 0.4, H * 0.035, W * 0.2, H * 0.12, 3);
      fillShaded(g, grip, W * 0.4, W * 0.6, LEATHER, 0, H * 0.16, 1.4);
      for (let i = 0; i < 5; i++) line(g, [W * 0.4, H * (0.05 + i * 0.022), W * 0.6, H * (0.06 + i * 0.022)], sh(LEATHER, 0.5), 1.2);
      fillShaded(g, rrect(W * 0.04, H * 0.155, W * 0.92, H * 0.022, 3), 0, W, GOLD, 0, H, 1.8);
      const blade = poly([W * 0.34, H * 0.18, W * 0.66, H * 0.18, W * 0.62, H * 0.9, W * 0.5, H * 1.0, W * 0.38, H * 0.9]);
      fillShaded(g, blade, W * 0.34, W * 0.66, [0.82, 0.85, 0.92], 0, H, 1.5, 0.55);
      line(g, [W * 0.5, H * 0.19, W * 0.5, H * 0.86], sh(STEEL, 0.5), 1.8);
      line(g, [W * 0.44, H * 0.2, W * 0.45, H * 0.88], [1, 1, 1], 1.2, 0.9);
      stroke(g, blade, sh(STEEL, 0.3), 1.2);
    },
  },

  // ======================= Arcanista (manto e capuz) =======================
  ar_cloak: { w: 0.56, h: 1.12, padA: 0.02, padB: 0.02, axis: 'y', paint: capeShape(DVIOLET, SILVER) },
  ar_torso: {
    w: 0.44, h: 0.62, padA: 0.08, padB: 0.06, axis: 'y',
    paint: (g, W, H, rnd) => {
      const p = poly([W * 0.1, H * 0.12, W * 0.32, H * 0.02, W * 0.68, H * 0.02, W * 0.9, H * 0.12, W * 0.82, H * 0.96, W * 0.18, H * 0.96]);
      fillShaded(g, p, 0, W, VIOLET, 0, H, 1.4, 0.4);
      folds(g, p, W * 0.1, W * 0.9, H * 0.1, H, VIOLET, 3, rnd, 0.3);
      g.fillStyle = css(DVIOLET);
      g.fill(poly([W * 0.3, H * 0.04, W * 0.5, H * 0.5, W * 0.7, H * 0.04, W * 0.6, H * 0.04, W * 0.5, H * 0.32, W * 0.4, H * 0.04]));
      line(g, [W * 0.3, H * 0.04, W * 0.5, H * 0.5, W * 0.7, H * 0.04], SILVER, 2.2);
      for (let i = 0; i < 5; i++) line(g, [W * (0.36 + i * 0.03), H * (0.1 + i * 0.08), W * (0.39 + i * 0.03), H * (0.13 + i * 0.08)], RUNE, 1.6);
      const sash = poly([W * 0.18, H * 0.74, W * 0.82, H * 0.7, W * 0.82, H * 0.8, W * 0.18, H * 0.84]);
      fillShaded(g, sash, W * 0.18, W * 0.82, [0.12, 0.1, 0.16], H * 0.7, H * 0.84, 1.6);
      g.fillStyle = css(RUNE);
      g.fill(ellipse(W * 0.5, H * 0.77, W * 0.05, W * 0.05));
      stroke(g, p, [0.06, 0.02, 0.1], 2);
    },
  },
  ar_skirt: { w: 0.62, h: 0.98, padA: 0.03, padB: 0.02, axis: 'y', paint: longRobe(VIOLET, DVIOLET, SILVER, true) },
  ar_hood: {
    w: 0.36, h: 0.44, padA: 0.02, padB: 0.02, axis: 'y',
    paint: (g, W, H) => {
      const hood = new Path2D();
      hood.moveTo(W * 0.1, H * 0.98);
      hood.quadraticCurveTo(W * 0.02, H * 0.45, W * 0.22, H * 0.2);
      hood.quadraticCurveTo(W * 0.25, H * 0.0, W * 0.05, H * 0.0);
      hood.quadraticCurveTo(W * 0.6, H * 0.02, W * 0.86, H * 0.36);
      hood.quadraticCurveTo(W * 0.98, H * 0.6, W * 0.9, H * 0.98);
      hood.closePath();
      fillShaded(g, hood, 0, W, VIOLET, 0, H, 1.5, 0.35);
      g.fillStyle = 'rgba(6,3,10,1)';
      g.fill(ellipse(W * 0.68, H * 0.62, W * 0.2, H * 0.24));
      line(g, [W * 0.56, H * 0.78, W * 0.84, H * 0.76], [0.55, 0.45, 0.5], 1.6, 0.8);
      line(g, [W * 0.48, H * 0.4, W * 0.88, H * 0.38], SILVER, 2);
      line(g, [W * 0.2, H * 0.3, W * 0.18, H * 0.85], [0.6, 0.35, 0.75], 1.6, 0.6);
      stroke(g, hood, [0.05, 0.02, 0.08], 2);
    },
  },
  ar_sleeve_u: { w: 0.16, h: 0.34, padA: 0.08, padB: 0.05, axis: 'y', paint: clothLimb(VIOLET, {}) },
  ar_sleeve_l: { w: 0.2, h: 0.36, padA: 0.05, padB: 0.12, axis: 'y', paint: clothLimb(VIOLET, { bell: true, hand: [0.78, 0.66, 0.6], cuff: SILVER }) },
  ar_staff: {
    w: 0.16, h: 1.72, padA: 0, padB: 0, axis: 'y',
    paint: (g, W, H, rnd) => {
      const shaft = new Path2D();
      shaft.moveTo(W * 0.44, H * 0.1);
      for (let i = 0; i <= 20; i++) shaft.lineTo(W * (0.3 + Math.sin(i * 1.3) * 0.06), H * (0.1 + i * 0.044));
      for (let i = 20; i >= 0; i--) shaft.lineTo(W * (0.7 + Math.sin(i * 1.3) * 0.06), H * (0.1 + i * 0.044));
      shaft.closePath();
      fillShaded(g, shaft, W * 0.35, W * 0.68, [0.42, 0.28, 0.15], 0, H, 1.5);
      for (let i = 0; i < 8; i++) line(g, [W * 0.4, H * (0.15 + i * 0.1), W * 0.62, H * (0.19 + i * 0.1)], [0.2, 0.12, 0.06], 1.4);
      for (const sx of [-1, 1]) {
        const c = new Path2D();
        c.moveTo(W * 0.5, H * 0.11);
        c.quadraticCurveTo(W * (0.5 + sx * 0.5), H * 0.07, W * (0.5 + sx * 0.18), H * 0.0);
        stroke(g, c, [0.5, 0.36, 0.2], 3.2);
      }
      line(g, [W * 0.42, H * 0.6, W * 0.62, H * 0.62], SILVER, 3);
      grain(g, shaft, W, H, rnd, 30, [0.6, 0.45, 0.3], [0.15, 0.1, 0.05]);
    },
  },

  // ======================= Curandeira (sacerdotisa da aurora) =======================
  he_mantle: { w: 0.56, h: 1.08, padA: 0.02, padB: 0.02, axis: 'y', paint: capeShape([0.6, 0.68, 0.86], GOLD) },
  he_torso: {
    w: 0.42, h: 0.62, padA: 0.08, padB: 0.06, axis: 'y',
    paint: (g, W, H, rnd) => {
      const p = poly([W * 0.12, H * 0.12, W * 0.34, H * 0.02, W * 0.66, H * 0.02, W * 0.88, H * 0.12, W * 0.8, H * 0.96, W * 0.2, H * 0.96]);
      fillShaded(g, p, 0, W, IVORY, 0, H, 1.15, 0.5);
      folds(g, p, W * 0.12, W * 0.88, H * 0.1, H, IVORY, 3, rnd, 0.3);
      const col = new Path2D();
      col.moveTo(W * 0.3, H * 0.04);
      col.quadraticCurveTo(W * 0.5, H * 0.24, W * 0.7, H * 0.04);
      stroke(g, col, GOLD, 4);
      const sash = poly([W * 0.16, H * 0.2, W * 0.32, H * 0.14, W * 0.86, H * 0.78, W * 0.72, H * 0.86]);
      fillShaded(g, sash, W * 0.1, W * 0.9, SKY, 0, H, 1.4);
      stroke(g, sash, sh(SKY, 0.45), 1.4);
      fillShaded(g, ellipse(W * 0.5, H * 0.3, W * 0.07, W * 0.07), W * 0.42, W * 0.58, GOLD, H * 0.24, H * 0.36, 1.9);
      sunburst(g, W * 0.5, H * 0.3, W * 0.11, GOLD, 1.4);
      line(g, [W * 0.2, H * 0.86, W * 0.8, H * 0.86], GOLD, 3);
      stroke(g, p, [0.45, 0.42, 0.38], 1.8);
    },
  },
  he_skirt: { w: 0.58, h: 0.98, padA: 0.03, padB: 0.02, axis: 'y', paint: longRobe(IVORY, SKY, GOLD, false) },
  he_head: {
    w: 0.34, h: 0.42, padA: 0.02, padB: 0.02, axis: 'y',
    paint: (g, W, H, rnd) => {
      const veil = new Path2D();
      veil.moveTo(W * 0.08, H * 0.98);
      veil.quadraticCurveTo(W * 0.0, H * 0.3, W * 0.42, H * 0.06);
      veil.quadraticCurveTo(W * 0.88, H * 0.04, W * 0.9, H * 0.4);
      veil.lineTo(W * 0.62, H * 0.98);
      veil.closePath();
      fillShaded(g, veil, 0, W, IVORY, 0, H, 1.2, 0.5);
      folds(g, veil, 0, W * 0.6, H * 0.2, H, IVORY, 3, rnd, 0.4);
      for (let i = 0; i < 6; i++) line(g, [W * (0.36 + i * 0.03), H * 0.3, W * (0.3 + i * 0.03), H * 0.8], [0.85, 0.7, 0.35], 1.6, 0.9);
      fillShaded(g, ellipse(W * 0.66, H * 0.52, W * 0.2, H * 0.22), W * 0.46, W * 0.86, SKIN, H * 0.3, H * 0.74, 1.2, 0.55);
      g.fillStyle = 'rgba(30,30,60,1)';
      g.fill(ellipse(W * 0.74, H * 0.48, W * 0.035, H * 0.022));
      line(g, [W * 0.68, H * 0.43, W * 0.8, H * 0.43], [0.45, 0.32, 0.2], 1.4);
      line(g, [W * 0.74, H * 0.64, W * 0.82, H * 0.63], [0.62, 0.3, 0.3], 1.6);
      const circ = new Path2D();
      circ.moveTo(W * 0.3, H * 0.3);
      circ.quadraticCurveTo(W * 0.6, H * 0.24, W * 0.86, H * 0.32);
      stroke(g, circ, GOLD, 3.2);
      g.fillStyle = css(SKY);
      g.fill(ellipse(W * 0.6, H * 0.27, W * 0.04, W * 0.04));
      stroke(g, veil, [0.45, 0.42, 0.38], 1.6);
    },
  },
  he_sleeve_u: { w: 0.15, h: 0.34, padA: 0.08, padB: 0.05, axis: 'y', paint: clothLimb(IVORY, {}) },
  he_sleeve_l: { w: 0.19, h: 0.36, padA: 0.05, padB: 0.12, axis: 'y', paint: clothLimb(IVORY, { bell: true, hand: SKIN, cuff: GOLD }) },
  he_staff: {
    w: 0.3, h: 1.75, padA: 0, padB: 0, axis: 'y',
    paint: (g, W, H) => {
      fillShaded(g, rrect(W * 0.38, H * 0.14, W * 0.24, H * 0.85, 3), W * 0.36, W * 0.64, [0.92, 0.88, 0.78], 0, H, 1.3);
      for (let i = 0; i < 4; i++) line(g, [W * 0.42, H * (0.3 + i * 0.18), W * 0.58, H * (0.3 + i * 0.18)], GOLD, 3);
      stroke(g, ellipse(W * 0.5, H * 0.08, W * 0.3, W * 0.3), GOLD, 4);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        line(g, [W * 0.5 + Math.cos(a) * W * 0.32, H * 0.08 + Math.sin(a) * W * 0.32, W * 0.5 + Math.cos(a) * W * 0.46, H * 0.08 + Math.sin(a) * W * 0.46], sh(GOLD, 1.2), 2);
      }
      line(g, [W * 0.5, H * 0.08 + W * 0.3, W * 0.5, H * 0.14], GOLD, 4);
    },
  },

  // ======================= Errante Oco (guerreiro esqueleto) =======================
  sk_skull: {
    w: 0.3, h: 0.34, padA: 0.02, padB: 0.02, axis: 'y',
    paint: (g, W, H, rnd) => {
      const sk = new Path2D();
      sk.moveTo(W * 0.14, H * 0.52);
      sk.quadraticCurveTo(W * 0.1, H * 0.06, W * 0.5, H * 0.06);
      sk.quadraticCurveTo(W * 0.92, H * 0.06, W * 0.9, H * 0.5);
      sk.lineTo(W * 0.86, H * 0.68);
      sk.lineTo(W * 0.3, H * 0.7);
      sk.closePath();
      fillShaded(g, sk, 0, W, BONE, 0, H, 1.3, 0.45);
      const jaw = poly([W * 0.36, H * 0.7, W * 0.88, H * 0.68, W * 0.84, H * 0.9, W * 0.42, H * 0.92]);
      fillShaded(g, jaw, W * 0.36, W * 0.88, sh(BONE, 0.85), H * 0.68, H, 1.2);
      g.fillStyle = 'rgba(30,25,20,1)';
      for (let i = 0; i < 6; i++) g.fillRect(W * (0.46 + i * 0.065), H * 0.69, 1.5, H * 0.06);
      g.fillStyle = 'rgba(8,4,3,1)';
      g.fill(ellipse(W * 0.66, H * 0.42, W * 0.11, H * 0.1));
      g.fill(poly([W * 0.82, H * 0.5, W * 0.88, H * 0.62, W * 0.78, H * 0.62]));
      const helm = new Path2D();
      helm.moveTo(W * 0.08, H * 0.4);
      helm.quadraticCurveTo(W * 0.08, H * 0.0, W * 0.5, H * 0.0);
      helm.quadraticCurveTo(W * 0.94, H * 0.0, W * 0.96, H * 0.32);
      helm.lineTo(W * 0.55, H * 0.3);
      helm.lineTo(W * 0.36, H * 0.42);
      helm.closePath();
      fillShaded(g, helm, 0, W, RUST, 0, H * 0.4, 1.5, 0.4);
      line(g, [W * 0.3, H * 0.05, W * 0.38, H * 0.2, W * 0.32, H * 0.32], [0.12, 0.06, 0.03], 1.5);
      grain(g, helm, W, H, rnd, 50, [0.7, 0.45, 0.25], [0.15, 0.08, 0.04], 2);
      stroke(g, sk, sh(BONE, 0.35), 1.6);
    },
  },
  sk_ribs: {
    w: 0.42, h: 0.6, padA: 0.06, padB: 0.06, axis: 'y',
    paint: (g, W, H, rnd) => {
      const rag = poly([W * 0.08, H * 0.05, W * 0.36, H * 0.05, W * 0.3, H * 0.62, W * 0.22, H * 0.5, W * 0.14, H * 0.7, W * 0.04, H * 0.45]);
      fillShaded(g, rag, 0, W * 0.4, [0.3, 0.24, 0.17], 0, H, 1.3);
      folds(g, rag, 0, W * 0.4, 0, H * 0.7, [0.3, 0.24, 0.17], 2, rnd);
      line(g, [W * 0.3, H * 0.02, W * 0.28, H * 0.98], BONE, 6);
      for (let i = 0; i < 9; i++) line(g, [W * 0.24, H * (0.06 + i * 0.105), W * 0.34, H * (0.06 + i * 0.105)], sh(BONE, 0.6), 2);
      line(g, [W * 0.04, H * 0.08, W * 0.96, H * 0.06], BONE, 5);
      for (let i = 0; i < 6; i++) {
        const y = H * (0.16 + i * 0.09);
        const r = new Path2D();
        r.moveTo(W * 0.3, y);
        r.quadraticCurveTo(W * (0.95 - i * 0.03), y - H * 0.02, W * (0.78 - i * 0.02), y + H * 0.08);
        stroke(g, r, sh(BONE, 0.45), 4.5);
        stroke(g, r, BONE, 2.6);
      }
      line(g, [W * 0.8, H * 0.14, W * 0.74, H * 0.6], sh(BONE, 0.9), 3);
    },
  },
  sk_pelvis: {
    w: 0.38, h: 0.34, padA: 0.05, padB: 0.05, axis: 'y',
    paint: (g, W, H, rnd) => {
      const pel = new Path2D();
      pel.moveTo(W * 0.1, H * 0.06);
      pel.quadraticCurveTo(W * 0.5, H * 0.32, W * 0.9, H * 0.06);
      pel.lineTo(W * 0.78, H * 0.36);
      pel.quadraticCurveTo(W * 0.5, H * 0.46, W * 0.22, H * 0.36);
      pel.closePath();
      fillShaded(g, pel, 0, W, BONE, 0, H * 0.5, 1.3);
      stroke(g, pel, sh(BONE, 0.35), 1.6);
      const loin = poly([W * 0.26, H * 0.3, W * 0.74, H * 0.3, W * 0.7, H * 0.98, W * 0.6, H * 0.84, W * 0.5, H * 1.0, W * 0.4, H * 0.86, W * 0.3, H * 0.96]);
      fillShaded(g, loin, W * 0.26, W * 0.74, [0.32, 0.22, 0.14], H * 0.3, H, 1.3);
      folds(g, loin, W * 0.26, W * 0.74, H * 0.3, H, [0.32, 0.22, 0.14], 3, rnd);
      line(g, [W * 0.2, H * 0.32, W * 0.8, H * 0.32], LEATHER, 3);
    },
  },
  sk_upper: { w: 0.1, h: 0.33, padA: 0.08, padB: 0.06, axis: 'y', paint: boneLimb({}) },
  sk_fore: { w: 0.11, h: 0.32, padA: 0.06, padB: 0.12, axis: 'y', paint: boneLimb({ hand: true, thick: 0.28 }) },
  sk_femur: { w: 0.12, h: 0.48, padA: 0.06, padB: 0.06, axis: 'y', paint: boneLimb({ thick: 0.36 }) },
  sk_tibia: { w: 0.15, h: 0.5, padA: 0.04, padB: 0.08, axis: 'y', paint: boneLimb({ foot: true, thick: 0.26 }) },
  sk_sword: {
    w: 0.16, h: 1.15, padA: 0, padB: 0, axis: 'y',
    paint: (g, W, H, rnd) => {
      fillShaded(g, rrect(W * 0.42, 0, W * 0.16, H * 0.13, 2), W * 0.4, W * 0.6, [0.25, 0.17, 0.1], 0, H * 0.13, 1.3);
      line(g, [W * 0.08, H * 0.14, W * 0.92, H * 0.15], RUST, 5);
      const pts = [W * 0.34, H * 0.16, W * 0.66, H * 0.16];
      for (let i = 1; i <= 8; i++) pts.push(W * (0.66 - (i % 3 === 0 ? 0.06 : 0)), H * (0.16 + i * 0.09));
      pts.push(W * 0.5, H * 1.0);
      for (let i = 8; i >= 1; i--) pts.push(W * (0.34 + (i % 4 === 1 ? 0.05 : 0)), H * (0.16 + i * 0.09));
      const blade = poly(pts);
      fillShaded(g, blade, W * 0.34, W * 0.66, [0.52, 0.47, 0.42], 0, H, 1.4, 0.5);
      grain(g, blade, W, H, rnd, 80, [0.7, 0.4, 0.2], [0.3, 0.15, 0.06], 2.5);
      stroke(g, blade, [0.15, 0.1, 0.07], 1.4);
    },
  },

  // ======================= Lobo de Cinza (lobo atroz) =======================
  wf_body: {
    w: 0.62, h: 1.15, padA: 0.12, padB: 0.14, axis: 'x',
    paint: (g, W, H, rnd) => {
      const p = new Path2D();
      p.moveTo(W * 0.04, H * 0.42);
      p.quadraticCurveTo(W * 0.1, H * 0.08, W * 0.4, H * 0.12);
      p.quadraticCurveTo(W * 0.7, H * 0.02, W * 0.9, H * 0.14);
      p.quadraticCurveTo(W * 1.0, H * 0.4, W * 0.92, H * 0.78);
      p.quadraticCurveTo(W * 0.8, H * 0.96, W * 0.66, H * 0.8);
      p.quadraticCurveTo(W * 0.45, H * 0.66, W * 0.26, H * 0.72);
      p.quadraticCurveTo(W * 0.02, H * 0.8, W * 0.04, H * 0.42);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, css(sh(ASHFUR, 0.55)));
      gr.addColorStop(0.35, css(sh(ASHFUR, 1.15)));
      gr.addColorStop(1, css(sh(ASHFUR, 0.65)));
      g.fillStyle = gr;
      g.fill(p);
      fur(g, p, W, H, ASHFUR, rnd, 420, (x) => (x < W * 0.8 ? Math.PI * 0.95 : Math.PI * 0.6), 9);
      g.save();
      g.clip(p);
      g.fillStyle = css(sh(ASHFUR, 0.35), 0.55);
      g.fill(ellipse(W * 0.5, H * 0.12, W * 0.45, H * 0.14));
      for (let i = 0; i < 4; i++) line(g, [W * (0.42 + i * 0.07), H * 0.45, W * (0.4 + i * 0.07), H * 0.62], sh(ASHFUR, 0.45), 2, 0.6);
      g.restore();
      stroke(g, p, sh(ASHFUR, 0.25), 2);
    },
  },
  wf_head: {
    w: 0.4, h: 0.55, padA: 0.15, padB: 0.05, axis: 'x',
    paint: (g, W, H, rnd) => {
      const p = new Path2D();
      p.moveTo(W * 0.04, H * 0.5);
      p.quadraticCurveTo(W * 0.15, H * 0.12, W * 0.45, H * 0.2);
      p.lineTo(W * 0.96, H * 0.4);
      p.lineTo(W * 0.98, H * 0.55);
      p.lineTo(W * 0.62, H * 0.62);
      p.lineTo(W * 0.9, H * 0.7);
      p.lineTo(W * 0.55, H * 0.86);
      p.quadraticCurveTo(W * 0.2, H * 0.92, W * 0.04, H * 0.5);
      fillShaded(g, p, 0, W, ASHFUR, 0, H, 1.3, 0.5);
      fur(g, p, W, H, ASHFUR, rnd, 160, () => Math.PI, 6);
      const ear = poly([W * 0.22, H * 0.22, W * 0.3, H * 0.0, W * 0.42, H * 0.22]);
      fillShaded(g, ear, W * 0.2, W * 0.44, sh(ASHFUR, 0.9), 0, H * 0.22, 1.4);
      stroke(g, ear, sh(ASHFUR, 0.3), 1.4);
      g.fillStyle = 'rgba(15,12,10,1)';
      g.fill(ellipse(W * 0.96, H * 0.44, W * 0.04, H * 0.05));
      g.fill(ellipse(W * 0.52, H * 0.36, W * 0.06, H * 0.05));
      line(g, [W * 0.62, H * 0.62, W * 0.95, H * 0.56], [0.45, 0.1, 0.1], 2.2);
      for (let i = 0; i < 4; i++) line(g, [W * (0.68 + i * 0.07), H * 0.58, W * (0.69 + i * 0.07), H * 0.66], [0.95, 0.92, 0.85], 2);
      stroke(g, p, sh(ASHFUR, 0.25), 1.8);
    },
  },
  wf_tail: {
    w: 0.24, h: 0.55, padA: 0.05, padB: 0.05, axis: 'x',
    paint: (g, W, H, rnd) => {
      const p = new Path2D();
      p.moveTo(W * 0.98, H * 0.4);
      p.quadraticCurveTo(W * 0.5, H * 0.0, W * 0.02, H * 0.5);
      p.quadraticCurveTo(W * 0.5, H * 0.95, W * 0.98, H * 0.65);
      fillShaded(g, p, 0, W, sh(ASHFUR, 0.9), 0, H, 1.3);
      fur(g, p, W, H, ASHFUR, rnd, 120, () => Math.PI, 7);
    },
  },
  wf_leg_u: { w: 0.17, h: 0.34, padA: 0.12, padB: 0.06, axis: 'y', paint: beastLimb(ASHFUR, { fur: true, taper: 0.7 }) },
  wf_leg_l: { w: 0.13, h: 0.36, padA: 0.04, padB: 0.1, axis: 'y', paint: beastLimb(ASHFUR, { fur: true, claw: true, taper: 0.6 }) },

  // ======================= Aranha Gigante =======================
  sp_abdomen: {
    w: 0.9, h: 1.05, padA: 0.04, padB: 0.06, axis: 'x',
    paint: (g, W, H, rnd) => {
      const p = ellipse(W * 0.48, H * 0.5, W * 0.46, H * 0.44);
      const gr = g.createRadialGradient(W * 0.38, H * 0.28, W * 0.05, W * 0.5, H * 0.5, W * 0.55);
      gr.addColorStop(0, css([0.5, 0.42, 0.4]));
      gr.addColorStop(0.35, css(sh(CHITIN, 1.6)));
      gr.addColorStop(1, css(sh(CHITIN, 0.4)));
      g.fillStyle = gr;
      g.fill(p);
      grain(g, p, W, H, rnd, 220, [0.4, 0.36, 0.34], [0.05, 0.04, 0.04], 2);
      const pat = new Path2D();
      pat.moveTo(W * 0.25, H * 0.3);
      pat.quadraticCurveTo(W * 0.5, H * 0.12, W * 0.8, H * 0.32);
      stroke(g, pat, [0.75, 0.65, 0.5], 4);
      for (let i = 0; i < 4; i++) {
        const x = W * (0.32 + i * 0.13);
        line(g, [x, H * 0.3, x + 6, H * 0.5, x, H * 0.62], [0.7, 0.18, 0.1], 3.2);
      }
      g.fillStyle = css([0.82, 0.18, 0.1]);
      g.fill(poly([W * 0.46, H * 0.62, W * 0.56, H * 0.62, W * 0.52, H * 0.72, W * 0.56, H * 0.82, W * 0.46, H * 0.82, W * 0.5, H * 0.72]));
      for (let i = 0; i < 120; i++) {
        const a = rnd() * Math.PI * 2;
        const x = W * 0.48 + Math.cos(a) * W * 0.45;
        const y = H * 0.5 + Math.sin(a) * H * 0.43;
        line(g, [x, y, x + Math.cos(a) * 5, y + Math.sin(a) * 5], [0.35, 0.3, 0.28], 1.2, 0.8);
      }
      g.fillStyle = css(sh(CHITIN, 0.8));
      g.fill(ellipse(W * 0.04, H * 0.6, W * 0.04, H * 0.06));
      stroke(g, p, [0.05, 0.04, 0.04], 2);
      line(g, [W * 0.3, H * 0.16, W * 0.5, H * 0.1], [1, 1, 1], 2.5, 0.45);
    },
  },
  sp_thorax: {
    w: 0.48, h: 0.62, padA: 0.08, padB: 0.08, axis: 'x',
    paint: (g, W, H, rnd) => {
      const p = new Path2D();
      p.moveTo(W * 0.04, H * 0.55);
      p.quadraticCurveTo(W * 0.1, H * 0.08, W * 0.55, H * 0.1);
      p.quadraticCurveTo(W * 0.98, H * 0.18, W * 0.96, H * 0.6);
      p.quadraticCurveTo(W * 0.6, H * 0.98, W * 0.04, H * 0.55);
      fillShaded(g, p, 0, W, sh(CHITIN, 1.4), 0, H, 1.9, 0.4);
      line(g, [W * 0.2, H * 0.3, W * 0.85, H * 0.3], sh(CHITIN, 0.5), 2);
      line(g, [W * 0.3, H * 0.18, W * 0.7, H * 0.16], [1, 1, 1], 1.8, 0.4);
      grain(g, p, W, H, rnd, 60, [0.4, 0.35, 0.33], [0.05, 0.04, 0.04], 2);
      stroke(g, p, [0.05, 0.04, 0.04], 2);
    },
  },
  sp_head: {
    w: 0.42, h: 0.46, padA: 0.08, padB: 0.06, axis: 'x',
    paint: (g, W, H, rnd) => {
      const p = ellipse(W * 0.45, H * 0.42, W * 0.42, H * 0.36);
      fillShaded(g, p, 0, W, sh(CHITIN, 1.3), 0, H, 1.8, 0.4);
      grain(g, p, W, H, rnd, 50, [0.4, 0.35, 0.33], [0.05, 0.04, 0.04], 2);
      for (const ox of [0, 0.12]) {
        fillShaded(g, ellipse(W * (0.7 + ox), H * 0.7, W * 0.1, H * 0.16), W * 0.6, W * 0.95, sh(CHITIN, 1.2), H * 0.55, H * 0.85, 1.6);
        const fang = new Path2D();
        fang.moveTo(W * (0.68 + ox), H * 0.82);
        fang.quadraticCurveTo(W * (0.66 + ox), H * 0.98, W * (0.8 + ox), H * 0.98);
        stroke(g, fang, [0.82, 0.78, 0.66], 3.4);
      }
      for (const [ex, ey, r] of [[0.66, 0.26, 0.06], [0.8, 0.3, 0.055], [0.56, 0.32, 0.04], [0.74, 0.4, 0.04], [0.86, 0.42, 0.035]] as const) {
        g.fillStyle = css([0.45, 0.04, 0.03]);
        g.fill(ellipse(W * ex, H * ey, W * r, W * r));
      }
      stroke(g, p, [0.05, 0.04, 0.04], 2);
    },
  },
  sp_femur: { w: 0.15, h: 0.62, padA: 0.06, padB: 0.04, axis: 'y', paint: beastLimb(sh(CHITIN, 1.4), { knob: true, taper: 0.75 }) },
  sp_tibia: { w: 0.12, h: 0.78, padA: 0.03, padB: 0.03, axis: 'y', paint: beastLimb(sh(CHITIN, 1.25), { knob: true, claw: true, taper: 0.35 }) },
} satisfies Record<string, SpriteDef>;

export type SpriteId = keyof typeof SPRITES;
export const SPRITE_IDS = Object.keys(SPRITES) as SpriteId[];
export const SPRITE_INDEX = Object.fromEntries(SPRITE_IDS.map((id, i) => [id, i])) as Record<SpriteId, number>;
export const MAX_SPRITES = 64;

export interface SpriteAtlas {
  canvas: HTMLCanvasElement;
  /** Flat [u0, v0, du, dv] per sprite index, in atlas UV space. */
  rects: Float32Array;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paints every part into one atlas (shelf packing with gutters). */
export function buildSpriteAtlas(size = 1024): SpriteAtlas {
  if (SPRITE_IDS.length > MAX_SPRITES) throw new Error('Too many sprites for the uniform table');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable for sprite atlas');
  const rects = new Float32Array(MAX_SPRITES * 4);
  // wide gutters: parts are sampled at small mip levels on screen and must not bleed into neighbours
  let x = 16;
  let y = 16;
  let rowH = 0;
  SPRITE_IDS.forEach((id, i) => {
    const d: SpriteDef = SPRITES[id];
    const tw = Math.ceil((d.axis === 'y' ? d.w : d.h) * SPRITE_PPM);
    const th = Math.ceil((d.axis === 'y' ? d.h : d.w) * SPRITE_PPM);
    if (x + tw + 16 > size) {
      x = 16;
      y += rowH + 32;
      rowH = 0;
    }
    if (y + th + 16 > size) throw new Error('Sprite atlas overflow');
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, tw, th);
    g.clip();
    d.paint(g, tw, th, mulberry(1000 + i * 7919));
    g.restore();
    rects.set([x / size, y / size, tw / size, th / size], i * 4);
    x += tw + 32;
    rowH = Math.max(rowH, th);
  });
  return { canvas, rects };
}
