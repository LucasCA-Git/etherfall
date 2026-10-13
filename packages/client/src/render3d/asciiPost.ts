import * as THREE from 'three';

/**
 * Fine ASCII post-process for the 3D scene ("ASCII MMORPG" look):
 *  1. cell pass  — one fragment per character cell reads its block of scene samples, tone-maps
 *     them, and picks a glyph: oriented strokes (| / - \) where the block has a coherent edge
 *     (grass blades, silhouettes, wall seams), otherwise a glyph whose ink coverage matches the
 *     block's brightness. Colour = the block's average colour, slightly desaturated.
 *  2. compose    — every screen pixel samples its cell's glyph from the atlas over a navy void.
 */

/**
 * Atlas layout: 16 columns × 4 rows.
 *   0–23  main density ramp (space → '@' / 'W'), sorted by measured ink
 *   24–35 wall ramp: vertical glyphs for surfaces facing sideways (| ! [ ] I H #)
 *   36–47 floor ramp: flat glyphs for surfaces facing up (. , - _ ~ = )
 *   48–55 strokes at 8 angles, 56 'o' splash, 57 '.'
 * A curated, well spread set reads as ASCII art; a long ramp of letters reads as noise.
 */
const COLS = 16;
const ROWS = 4;
const CANDIDATES = " .'`,:;-~=+*!/\\|?<>()xoe#%&$@WM";
const WALL_CANDS = " .':|!][lI}{1H#";
const FLOOR_CANDS = " .,`'-_~:;=+";
export const RAMP_LEN = 24;
export const WALL_BASE = 24;
export const FLOOR_BASE = 36;
export const SUB_RAMP = 12;
/** 8 stroke angles at 48..55, splash 'o' at 56, '.' at 57. */
export const STROKE_BASE = 48;
export const SPLASH = 56;
/**
 * Rasterizes the glyphs at exactly the on-screen cell size (TW × TH device pixels) and samples
 * them pixel for pixel: tiny cells stay crisp letters instead of blurred mip levels.
 */
export function buildAsciiAtlas(TW: number, TH: number): { texture: THREE.CanvasTexture; rampLen: number } {
  const c = document.createElement('canvas');
  c.width = COLS * TW;
  c.height = ROWS * TH;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable for the ASCII atlas');
  // fill the cell: at small sizes glyphs touch their neighbours, like a dense terminal
  // glyphs leave a 1-px gutter so neighbouring letters stay separate even at tiny sizes
  const fontPx = Math.max(4, Math.round(Math.min(Math.max(1, TH - 1), Math.max(1, TW - 1) * 1.75)));
  // bold strokes from 9 px up: letters stand out instead of dissolving into grain
  const font = `${TH >= 9 ? 'bold ' : ''}${fontPx}px "DejaVu Sans Mono", "JetBrains Mono", Consolas, Menlo, monospace`;
  // measure ink coverage of every candidate and keep an evenly spread ramp
  const probe = document.createElement('canvas');
  probe.width = TW;
  probe.height = TH;
  const pg = probe.getContext('2d', { willReadFrequently: true })!;
  pg.font = font;
  pg.textAlign = 'center';
  pg.textBaseline = 'middle';
  const ink = new Map<string, number>();
  for (const ch of new Set(CANDIDATES + WALL_CANDS + FLOOR_CANDS)) {
    pg.fillStyle = '#000';
    pg.fillRect(0, 0, TW, TH);
    pg.fillStyle = '#fff';
    pg.fillText(ch, (TW - 1) / 2, (TH - 1) / 2 + 0.5);
    const d = pg.getImageData(0, 0, TW, TH).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i]!;
    ink.set(ch, s / (255 * TW * TH));
  }
  /** `len` glyphs from `cands`, evenly spread over the measured ink (space first). */
  const pickRamp = (cands: string, len: number): string[] => {
    const sorted = [...new Set(cands)].map((ch) => [ch, ink.get(ch) ?? 0] as const).sort((a, b) => a[1] - b[1]);
    const maxInk = sorted[sorted.length - 1]![1] || 1;
    const out: string[] = [' '];
    for (let i = 1; i < len; i++) {
      const want = (i / (len - 1)) * maxInk;
      let best = sorted[1]![0];
      let bd = Infinity;
      for (const [ch, v] of sorted) {
        if (ch === ' ') continue;
        const d = Math.abs(v - want) + (out.includes(ch) ? 0.03 : 0);
        if (d < bd) {
          bd = d;
          best = ch;
        }
      }
      out.push(best);
    }
    return out;
  };
  const ramp = pickRamp(CANDIDATES, RAMP_LEN);
  const wall = pickRamp(WALL_CANDS, SUB_RAMP);
  const floor = pickRamp(FLOOR_CANDS, SUB_RAMP);
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const put = (i: number, ch: string) => {
    if (ch === ' ') return;
    const x = (i % COLS) * TW + (TW - 1) / 2;
    const y = Math.floor(i / COLS) * TH + (TH - 1) / 2 + 0.5;
    g.save();
    g.beginPath();
    g.rect((i % COLS) * TW, Math.floor(i / COLS) * TH, TW - 1, TH - 1);
    g.clip();
    g.fillText(ch, x, y);
    g.restore();
  };
  ramp.forEach((ch, i) => put(i, ch));
  wall.forEach((ch, i) => put(WALL_BASE + i, ch));
  floor.forEach((ch, i) => put(FLOOR_BASE + i, ch));
  // strokes drawn as lines at 8 screen angles (0°, 22.5°, … 157.5° from horizontal) so they
  // connect cell to cell like blades of grass, rain or the edges of a silhouette
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineWidth = Math.max(1, TW * 0.16);
  for (let k = 0; k < 8; k++) {
    const i = STROKE_BASE + k;
    const a = (k * Math.PI) / 8;
    const cx = (i % COLS) * TW + TW / 2;
    const cy = Math.floor(i / COLS) * TH + TH / 2;
    const L = TH * 0.46;
    const dx = Math.cos(a) * L;
    const dy = -Math.sin(a) * L;
    g.save();
    g.beginPath();
    g.rect((i % COLS) * TW, Math.floor(i / COLS) * TH, TW, TH);
    g.clip();
    g.beginPath();
    g.moveTo(cx - dx, cy - dy);
    g.lineTo(cx + dx, cy + dy);
    g.stroke();
    g.restore();
  }
  put(SPLASH, 'o');
  put(SPLASH + 1, '.');
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  return { texture: t, rampLen: RAMP_LEN };
}

export const FULL_VS = `in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const CELL_FS = `precision highp float;
precision highp int;
// tScene alpha tags: < 0.5 grass blade (on-screen angle code), 0.55/0.58 grass ground,
// 0.7 character (drawn by the fine pass), 1 anything else
uniform sampler2D tScene;
uniform ivec2 uSub;          // scene samples per cell (x, y)
uniform vec4 uView;          // game x of cell column 0, game y of row 0 (bottom), cell w, cell h (m)
uniform vec2 uPlayer;
uniform float uFade;         // meters around the player before the dark falls
uniform float uExposure;
uniform float uTime;
uniform float uRain;
uniform float uRampLen;
uniform vec2 uWind;
uniform highp sampler2D tDepth; // scene depth (orthographic: linear in view distance)
uniform vec2 uDepthRange;       // camera near, far
uniform float uPitch;           // camera pitch below the horizon (rad)
uniform float uContrast;        // ramp contrast (settings)
uniform float uDensity;         // glyph density (settings)
uniform float uDither;          // glyph jitter (settings)
uniform float uEdges;           // edge strokes + wall/floor glyphs (settings)
out vec4 o;
const float PI = 3.14159265;
float viewDist(ivec2 p, ivec2 lim) {
  float d = texelFetch(tDepth, clamp(p, ivec2(0), lim), 0).r;
  return d >= 0.99999 ? -1.0 : uDepthRange.x + d * (uDepthRange.y - uDepthRange.x);
}
/**
 * Surface of a cell from the depth buffer: x = class (1 floor facing up, 2 vertical wall, 0 other),
 * y = 1 on a depth break (silhouette of a wall, tree or prop against what is behind it),
 * zw = depth gradient on screen (its perpendicular is the outline direction).
 * The view-space normal of a plane is (dz/dx, dz/dy, 1) for this orthographic camera.
 */
vec4 surface(ivec2 base, ivec2 lim) {
  ivec2 k = max(uSub - 1, ivec2(1));
  float d0 = viewDist(base, lim);
  float dx = viewDist(base + ivec2(k.x, 0), lim);
  float dy = viewDist(base + ivec2(0, k.y), lim);
  float dd = viewDist(base + k, lim);
  float sky = float(d0 < 0.0) + float(dx < 0.0) + float(dy < 0.0) + float(dd < 0.0);
  if (sky > 0.0) return vec4(0.0, sky < 4.0 ? 1.0 : 0.0, float(dx < 0.0) - float(d0 < 0.0), float(dy < 0.0) - float(d0 < 0.0));
  float sx = float(k.x) * uView.z / float(uSub.x);
  float sy = float(k.y) * uView.w / float(uSub.y);
  float gx = (dx - d0) / sx;
  float gy = (dy - d0) / sy;
  // a jump far steeper than any surface seen at this pitch = an object's edge
  float jump = max(abs(dd - dx - dy + d0) / max(sx, sy), max(abs(gx), abs(gy) - 1.6));
  if (jump > 5.0) return vec4(0.0, 1.0, gx, gy);
  vec3 n = normalize(vec3(gx, gy, 1.0));
  float up = dot(n, vec3(0.0, cos(uPitch), sin(uPitch)));
  return vec4(up > 0.82 ? 1.0 : up < 0.4 ? 2.0 : 0.0, 0.0, gx, gy);
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float strokeGlyph(float ang) { return float(${STROKE_BASE}) + mod(floor(mod(ang, PI) / (PI / 8.0) + 0.5), 8.0); }
vec3 tint(vec3 c, float l, float sat, float bright) {
  vec3 f = mix(vec3(l), c, sat);
  return f / max(max(f.r, max(f.g, f.b)), 1e-3) * clamp(bright, 0.0, 1.0);
}
const int MAXS = 6;
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  ivec2 base = cell * uSub;
  ivec2 lim = textureSize(tScene, 0) - 1;
  float L[MAXS * MAXS];
  vec3 sum = vec3(0.0);
  float n = 0.0;
  float peak = 0.0;
  vec3 bsum = vec3(0.0);   // grass blades
  float bn = 0.0;
  float bpeak = 0.0;
  vec2 bdir = vec2(0.0);
  vec3 gsum = vec3(0.0);   // grass ground
  float gn = 0.0;
  float tall = 0.0;
  float an = 0.0;          // characters
  for (int y = 0; y < MAXS; y++) {
    if (y >= uSub.y) break;
    for (int x = 0; x < MAXS; x++) {
      if (x >= uSub.x) break;
      vec4 t = texelFetch(tScene, min(base + ivec2(x, y), lim), 0);
      vec3 c = toSrgb(aces(t.rgb * uExposure));
      float l = luma(c);
      L[y * MAXS + x] = l;
      sum += c;
      peak = max(peak, l);
      n += 1.0;
      if (t.a < 0.5) {
        float a = (t.a - 0.04) / 0.42 * PI;
        bdir += vec2(cos(2.0 * a), sin(2.0 * a)) * (0.05 + l);
        bsum += c;
        bn += 1.0;
        bpeak = max(bpeak, l);
      } else if (t.a < 0.62) {
        gsum += c;
        gn += 1.0;
        tall += step(0.565, t.a);
      } else if (t.a < 0.8) {
        an += 1.0;
      }
    }
  }
  vec3 avg = sum / n;
  float lum = luma(avg);
  vec2 world = vec2(uView.x + (float(cell.x) + 0.5) * uView.z, uView.y - (float(cell.y) + 0.5) * uView.w);
  vec2 wcell = floor(world / uView.zw + 0.5);
  float fade = 1.0 - smoothstep(uFade * 0.62, uFade, distance(world, uPlayer));
  float rnd = hash12(wcell);

  float glyph;
  vec3 fg;
  if (an > 0.0) {
    // characters are drawn by the fine pass (2× the glyph density); keep a dark gap around them
    glyph = 0.0;
    fg = vec3(0.0);
  } else if (bn >= n * 0.2) {
    // grass blades: one stroke along their on-screen direction; tips are bright, roots dark
    vec3 bc = bsum / bn;
    float bl = luma(bc);
    float ang = 0.5 * atan(bdir.y, bdir.x);
    glyph = strokeGlyph(ang);
    float cover = bn / n;
    fg = tint(bc, bl, 0.85, (0.1 + bpeak * 2.4) * (0.55 + 0.45 * cover));
    if (bpeak < 0.015) glyph = 0.0;
  } else if (gn >= n * 0.5) {
    // grass ground between tufts: faint, sparse strokes keep the meadow continuous
    vec3 gc = gsum / gn;
    float gl = luma(gc);
    float isTall = tall / gn;
    float fa = sin(world.x * 0.23 + uTime * 0.15) * 1.6 + cos(world.y * 0.31 - uTime * 0.1) * 1.6;
    float lean = uWind.x * 0.5 + sin(fa) * 0.7 + (rnd - 0.5) * 0.8;
    glyph = rnd < 0.45 + isTall * 0.25 ? strokeGlyph(PI * 0.5 - lean * 0.5) : (rnd < 0.6 ? float(${SPLASH + 1}) : 0.0);
    fg = tint(gc, gl, 0.8, (0.08 + gl * 1.5) * (0.6 + 0.4 * rnd));
  } else {
    // structure tensor of the block: dominant orientation and how coherent it is
    float jxx = 0.0, jyy = 0.0, jxy = 0.0;
    for (int y = 0; y < MAXS; y++) {
      if (y >= uSub.y) break;
      for (int x = 0; x < MAXS; x++) {
        if (x >= uSub.x) break;
        float c0 = L[y * MAXS + x];
        float gx = x + 1 < uSub.x ? L[y * MAXS + x + 1] - c0 : 0.0;
        float gy = y + 1 < uSub.y ? L[(y + 1) * MAXS + x] - c0 : 0.0;
        // samples are spaced unevenly (cells are 0.6:1): rescale so angles are screen angles
        gy *= 0.6 * float(uSub.x) / float(uSub.y);
        jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
      }
    }
    float tr = jxx + jyy;
    float det = sqrt((jxx - jyy) * (jxx - jyy) + 4.0 * jxy * jxy);
    float coherence = tr > 1e-6 ? det / tr : 0.0;
    float strength = sqrt(tr / n);
    // tone curve: shadows fall to empty space, highlights (fire, moonlit stone) climb to '#' '@'
    float x = clamp((lum - 0.02) * 2.0 * uDensity, 0.0, 1.0);
    float density = pow(x, 0.8 + 0.4 * (uContrast - 1.0));
    vec4 sf = uEdges > 0.05 ? surface(base, lim) : vec4(0.0);
    int sc = int(sf.x + 0.5);
    float edgeBoost = 1.0;
    // world-locked patches (~1.5 m) share one hatching direction, like grain in the reference
    float tilePick = hash12(floor(world / 1.5));
    if (sf.y > 0.5 && peak > 0.025) {
      // depth break: a crisp outline stroke along the edge of walls, trees and props
      glyph = strokeGlyph(atan(sf.w, sf.z) + PI * 0.5);
      edgeBoost = 1.0 + 0.6 * uEdges;
    } else if (n > 3.0 && strength > (0.045 + lum * 0.25) * (1.6 - uEdges) && coherence > 0.74 && peak > 0.06) {
      // shading edge inside a surface (shadow line, mortar seam)
      glyph = strokeGlyph(0.5 * atan(2.0 * jxy, jxx - jyy) + PI * 0.5);
    } else if (density < 0.07) {
      // near-dark: sparse dots keep the ground readable without noise
      glyph = density > 0.025 && rnd < 0.4 ? 1.0 : 0.0;
    } else if (sc == 1) {
      // floors: brightness lives in the colour; the glyphs stay strokes. Slanted strokes in
      // world-locked patches, a dash or dot between them, '=' '+' only on the brightest spots.
      float ang = tilePick < 0.42 ? PI * 0.25 : tilePick < 0.84 ? PI * 0.75 : 0.0;
      if (rnd < min(0.88, 0.3 + density * 0.8)) glyph = strokeGlyph(ang + (rnd - 0.5) * 0.35);
      else glyph = float(${FLOOR_BASE}) + clamp(floor(density * 6.0 + 0.5), 1.0, 7.0);
    } else if (sc == 2) {
      // walls and trunks: vertical strokes, brackets and bars; '#' 'H' only in strong light
      float wi = density > 0.85 ? mix(8.0, float(${SUB_RAMP - 1}), (density - 0.85) / 0.15) : mix(2.0, 7.0, density);
      glyph = rnd < 0.62 ? strokeGlyph(PI * 0.5) : float(${WALL_BASE}) + clamp(floor(wi + 0.5), 1.0, float(${SUB_RAMP - 1}));
    } else {
      // everything else (props, foliage, water): the density ramp, capped below the heaviest glyphs
      float jitter = (rnd - 0.5) * 2.0 * uDither;
      glyph = clamp(floor(min(density, 0.85) * (uRampLen - 1.0) + 0.5 + jitter), 1.0, uRampLen - 1.0);
    }
    fg = tint(avg, lum, 0.8, (0.16 + peak * 1.7) * (0.8 + 0.2 * uContrast) * edgeBoost);
  }

  // rain: world-locked falling streaks (sized in meters, so they look the same at any cell size)
  if (uRain > 0.01) {
    vec2 rc = floor(world / vec2(0.075, 0.11));
    float slant = clamp(uWind.x, -1.0, 1.0) * 0.45;
    float colId = rc.x - floor(rc.y * slant);
    float seed = hash12(vec2(colId, 17.0));
    if (seed < uRain * 0.22) {
      float P = 26.0 + floor(seed * 30.0);
      float ph = fract((rc.y - uTime * (60.0 + seed * 30.0)) / P + seed * 7.0);
      float len = 5.0;
      if (ph < len / P) {
        glyph = strokeGlyph(PI * 0.5 - slant * 1.1);
        fg = vec3(0.78, 0.84, 0.98) * (0.5 + 0.55 * (1.0 - ph * P / len));
      }
    }
    vec2 sc = floor(world / vec2(0.16, 0.2));
    float h = hash12(sc + floor(uTime * 6.0) * vec2(13.1, 7.7));
    if (an == 0.0 && h < uRain * 0.02) { glyph = float(${SPLASH}) + step(0.5, fract(h * 97.0)); fg = mix(fg, vec3(0.62, 0.7, 0.85), 0.75); }
  }
  fg *= fade;
  if (fade < 0.02) glyph = 0.0;
  o = vec4(clamp(fg, 0.0, 1.0), glyph / 255.0);
}`;

/**
 * Fine actor pass: a grid twice as dense as the world's, drawing only character pixels (alpha tag
 * 0.7). More glyphs per character = readable silhouettes, weapons and capes. Elsewhere it writes
 * a = 1 ("use the coarse cell").
 */
export const FINE_FS = `precision highp float;
precision highp int;
uniform sampler2D tScene;
uniform ivec2 uSub;          // samples per fine cell
uniform float uExposure;
uniform float uRampLen;
uniform vec4 uView;          // as the coarse pass, with fine cell size
out vec4 o;
const float PI = 3.14159265;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float strokeGlyph(float ang) { return float(${STROKE_BASE}) + mod(floor(mod(ang, PI) / (PI / 8.0) + 0.5), 8.0); }
bool isActor(float a) { return a > 0.62 && a < 0.8; }
/** Shaded luma at a fine cell's centre, or -1 when no actor covers it. */
float centreLuma(ivec2 c, ivec2 lim) {
  vec4 t = texelFetch(tScene, clamp(c * uSub + uSub / 2, ivec2(0), lim), 0);
  return isActor(t.a) ? luma(toSrgb(aces(t.rgb * uExposure))) : -1.0;
}
/** Actor coverage (0..1) of a fine cell. */
float cover(ivec2 c, ivec2 lim) {
  float k = 0.0, n = 0.0;
  for (int y = 0; y < 4; y++) {
    if (y >= uSub.y) break;
    for (int x = 0; x < 4; x++) {
      if (x >= uSub.x) break;
      k += isActor(texelFetch(tScene, clamp(c * uSub + ivec2(x, y), ivec2(0), lim), 0).a) ? 1.0 : 0.0;
      n += 1.0;
    }
  }
  return k / n;
}
/** Luma gradient across the neighbouring fine cells (written to g); true when it marks an inner edge. */
bool fineDetail(ivec2 c, ivec2 lim, float al, inout vec2 g) {
  float lN = centreLuma(c + ivec2(0, 1), lim), lS = centreLuma(c - ivec2(0, 1), lim);
  float lE = centreLuma(c + ivec2(1, 0), lim), lW = centreLuma(c - ivec2(1, 0), lim);
  if (min(min(lN, lS), min(lE, lW)) < 0.0) return false;
  vec2 d = vec2(lE - lW, (lN - lS) * 0.6);
  if (length(d) < 0.12 + al * 0.35) return false;
  g = d;
  return true;
}
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  ivec2 base = cell * uSub;
  ivec2 lim = textureSize(tScene, 0) - 1;
  vec3 asum = vec3(0.0);
  float an = 0.0;
  float n = 0.0;
  float peak = 0.0;
  for (int y = 0; y < 4; y++) {
    if (y >= uSub.y) break;
    for (int x = 0; x < 4; x++) {
      if (x >= uSub.x) break;
      vec4 t = texelFetch(tScene, min(base + ivec2(x, y), lim), 0);
      n += 1.0;
      if (isActor(t.a)) {
        vec3 c = toSrgb(aces(t.rgb * uExposure));
        asum += c;
        an += 1.0;
        peak = max(peak, luma(c));
      }
    }
  }
  if (an < n * 0.34) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 ac = asum / an;
  float al = luma(ac);
  vec2 world = vec2(uView.x + (float(cell.x) + 0.5) * uView.z, uView.y - (float(cell.y) + 0.5) * uView.w);
  float rnd = hash12(floor(world / uView.zw + 0.5));
  // silhouette: coverage gradient over the 8 neighbours -> a contour stroke along the edge
  float cN = cover(cell + ivec2(0, 1), lim), cS = cover(cell - ivec2(0, 1), lim);
  float cE = cover(cell + ivec2(1, 0), lim), cW = cover(cell - ivec2(1, 0), lim);
  float cNE = cover(cell + ivec2(1, 1), lim), cNW = cover(cell + ivec2(-1, 1), lim);
  float cSE = cover(cell + ivec2(1, -1), lim), cSW = cover(cell + ivec2(-1, -1), lim);
  vec2 g = vec2((cNE + 2.0 * cE + cSE) - (cNW + 2.0 * cW + cSW), (cNW + 2.0 * cN + cNE) - (cSW + 2.0 * cS + cSE));
  g.y *= 0.6; // fine cells are 0.6:1
  float edge = min(min(cN, cS), min(cE, cW));
  vec3 fg;
  float glyph;
  if (edge < 0.34 && length(g) > 0.5) {
    // contour: a bright line along the outline (capes and dark armour keep a readable shape)
    glyph = strokeGlyph(atan(g.y, g.x) + PI * 0.5);
    vec3 f = mix(vec3(al), ac, 0.75);
    fg = f / max(max(f.r, max(f.g, f.b)), 1e-3) * clamp(0.5 + peak * 1.4, 0.0, 1.0);
  } else if (fineDetail(cell, lim, al, g)) {
    // inner contour: a strong shading step inside the body (arm over chest, belt, cape fold)
    glyph = strokeGlyph(atan(g.y, g.x) + PI * 0.5);
    vec3 f = mix(vec3(al), ac, 0.8);
    fg = f / max(max(f.r, max(f.g, f.b)), 1e-3) * clamp(0.12 + peak * 1.2, 0.0, 1.0);
  } else {
    // inside: glyph ink follows the real shading, dark cloth stays dark
    float d = clamp(0.22 + al * 1.7, 0.0, 1.0);
    glyph = clamp(floor(d * (uRampLen - 1.0) + (rnd - 0.5) * 3.0 + 0.5), 1.0, uRampLen - 1.0);
    vec3 f = mix(vec3(al), ac, 0.9);
    fg = f / max(max(f.r, max(f.g, f.b)), 1e-3) * clamp(0.18 + peak * 1.9, 0.0, 1.0);
  }
  o = vec4(clamp(fg, 0.0, 1.0), glyph / 255.0);
}`;

export const COMPOSE_FS = `precision highp float;
precision highp int;
uniform sampler2D tCells;
uniform sampler2D tFine;
uniform sampler2D tAtlas;     // glyphs rasterized at the coarse cell size
uniform sampler2D tAtlasFine; // ... and at the fine cell size
uniform vec2 uCell;           // coarse cell size in device px (integers)
uniform float uFineK;         // fine grid factor (1 or 2)
uniform vec2 uOffset;         // device px: pixel + offset -> grid space
uniform vec2 uScreen;
uniform float uVignette;
uniform vec3 uVoid;
uniform float uFlash;
out vec4 o;
float glyphAt(sampler2D atlas, float gi, vec2 lc, vec2 cellPx) {
  // cells too small for letters (1–2 px): each cell becomes a dot whose brightness is the glyph's ink
  if (cellPx.x < 3.0 || cellPx.y < 4.0) {
    if (gi < 0.5) return 0.0;
    return gi < float(${STROKE_BASE}) ? 0.15 + 0.85 * gi / float(${RAMP_LEN} - 1) : 0.75;
  }
  ivec2 px = clamp(ivec2(floor(lc * cellPx)), ivec2(0), ivec2(cellPx) - 1);
  ivec2 tile = ivec2(int(mod(gi, 16.0)), int(floor(gi / 16.0)));
  ivec2 cs = ivec2(cellPx);
  return texelFetch(atlas, ivec2(tile.x * cs.x + px.x, tile.y * cs.y + (cs.y - 1 - px.y)), 0).r;
}
void main() {
  vec2 p = floor(gl_FragCoord.xy + uOffset) + 0.5;
  vec2 cp = p / uCell;
  ivec2 lim = textureSize(tCells, 0) - 1;
  vec4 c = texelFetch(tCells, clamp(ivec2(floor(cp)), ivec2(0), lim), 0);
  // characters: the fine grid wins wherever it has something
  vec2 fcell = uCell / uFineK;
  vec2 fp = p / fcell;
  ivec2 flim = textureSize(tFine, 0) - 1;
  vec4 fc = texelFetch(tFine, clamp(ivec2(floor(fp)), ivec2(0), flim), 0);
  float m;
  if (fc.a < 0.999) {
    c = fc;
    m = uFineK > 1.5 ? glyphAt(tAtlasFine, floor(c.a * 255.0 + 0.5), fract(fp), fcell) : glyphAt(tAtlas, floor(c.a * 255.0 + 0.5), fract(fp), fcell);
  } else {
    m = glyphAt(tAtlas, floor(c.a * 255.0 + 0.5), fract(cp), uCell);
  }
  vec3 col = uVoid + c.rgb * 0.04 + c.rgb * m * 0.95;
  vec2 q = gl_FragCoord.xy / uScreen - 0.5;
  col *= 1.0 - dot(q, q) * uVignette * 1.4;
  col = mix(col, vec3(0.8, 0.85, 1.0), uFlash * 0.5);
  o = vec4(col, 1.0);
}`;
