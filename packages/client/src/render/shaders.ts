/**
 * GLSL ES 3.00 sources for the ASCII pipeline:
 *
 *   [shadow pass]  instanced ellipses  -> R8 shadow mask (MAX blend)
 *   [scene pass]   ground + reflections + instanced shapes -> MRT
 *                    RT0 = lit color, RT1 = (material, glyph param, emissive, priority)
 *   [cell pass]    one fragment per ASCII cell: priority sampling, Sobel edges, glyph
 *                    choice, LOD, fog, palette  -> FG(rgb, row) + BG(rgb, col)
 *   [compose]      per screen pixel: glyph atlas lookup, grain, vignette
 *
 * The world keeps real 2D geometry; characters are only the final look.
 */

export const MAX_LIGHTS = 24;
export const MAX_BENDERS = 16;
export const MAX_RIPPLES = 16;
export const MAX_SEE = 8;
export const MAX_SPRITES = 64;

const HEADER = `#version 300 es
precision highp float;
precision highp int;
#define MAX_LIGHTS ${MAX_LIGHTS}
#define MAX_BENDERS ${MAX_BENDERS}
#define MAX_RIPPLES ${MAX_RIPPLES}
#define MAX_SEE ${MAX_SEE}
#define MAX_SPRITES ${MAX_SPRITES}
`;

const COMMON = `
uniform vec4 uView;          // world rect of the scene target: left, top, width, height
uniform float uTime;
uniform vec3 uAmbient;
uniform int uLightCount;
uniform vec4 uLights[MAX_LIGHTS];      // x, y, radius, intensity
uniform vec3 uLightColors[MAX_LIGHTS];
uniform vec2 uWindDir;
uniform float uWindStrength;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
vec3 lightAt(vec2 w) {
  vec3 l = uAmbient;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec4 L = uLights[i];
    float d = distance(w, L.xy);
    float a = clamp(1.0 - d / L.z, 0.0, 1.0);
    l += uLightColors[i] * L.w * a * a;
  }
  return l;
}
`;

// ---------------------------------------------------------------- fullscreen
export const FULLSCREEN_VS = `#version 300 es
const vec2 P[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

// ---------------------------------------------------------------- ground
export const GROUND_FS = `${HEADER}${COMMON}
uniform sampler2D uTiles;     // R = tile type, G = variation
uniform sampler2D uShadow;
uniform vec2 uWorldSize;
uniform vec2 uSceneSize;
uniform vec4 uBenders[MAX_BENDERS];   // x, y, radius, strength
uniform int uBenderCount;
uniform vec4 uRipples[MAX_RIPPLES];   // x, y, startTime, strength
uniform int uRippleCount;
uniform float uSunLight;
uniform float uRain;
uniform sampler2D uGrass;     // spring-simulated grass deflection, RG (0.5 = rest)
uniform vec4 uGrassRect;      // world x0, y0, width, height of the field
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oMat;

int tileAt(vec2 w) {
  ivec2 t = ivec2(floor(w));
  if (t.x < 0 || t.y < 0 || t.x >= int(uWorldSize.x) || t.y >= int(uWorldSize.y)) return 6;
  return int(texelFetch(uTiles, t, 0).r * 255.0 + 0.5);
}
bool isWater(int t) { return t == 4 || t == 5; }

void main() {
  vec2 uv = gl_FragCoord.xy / uSceneSize;
  vec2 w = vec2(uView.x + uv.x * uView.z, uView.y + (1.0 - uv.y) * uView.w);
  int t = tileAt(w);
  float n = vnoise(w * 0.35);
  float n2 = vnoise(w * 1.7 + 13.0);
  vec3 col;
  float mat;
  float param;
  float emis = 0.0;

  if (t == 0 || t == 1) {
    col = mix(vec3(0.10, 0.27, 0.10), vec3(0.22, 0.44, 0.14), n);
    col = mix(col, vec3(0.36, 0.40, 0.13), smoothstep(0.65, 0.95, n2) * 0.45);
    if (t == 1) col = mix(col, vec3(0.34, 0.48, 0.15), 0.4);
    // wind: travelling gusts + per-blade oscillation
    float gust = vnoise(w * 0.11 - uWindDir * uTime * 1.6);
    float sway = sin(uTime * 2.4 + dot(w, uWindDir) * 0.9 + n * 6.0) * 0.35 + (gust - 0.35) * 1.6;
    vec2 bend = uWindDir * uWindStrength * sway;
    float flatten = 0.0;
    for (int i = 0; i < MAX_BENDERS; i++) {
      if (i >= uBenderCount) break;
      vec4 b = uBenders[i];
      vec2 d = w - b.xy;
      float dist = length(d);
      float infl = 1.0 - smoothstep(b.z * 0.35, b.z, dist);
      bend += (d / max(dist, 1e-3)) * infl * b.w * 1.8;
      flatten = max(flatten, infl * b.w);
    }
    // physical grass: blades keep swinging after an actor or a blast passes (spring field)
    if (uGrassRect.z > 0.0) {
      vec2 gu = (w - uGrassRect.xy) / uGrassRect.zw;
      if (gu.x > 0.0 && gu.y > 0.0 && gu.x < 1.0 && gu.y < 1.0) {
        vec2 d = texture(uGrass, gu).rg * 2.0 - 1.0;
        bend += d * 2.4;
        flatten = max(flatten, smoothstep(0.55, 0.95, length(d)));
      }
    }
    int bucket = flatten > 0.8 ? 3 : (bend.x > 0.3 ? 1 : (bend.x < -0.3 ? 2 : 0));
    int variant = int(hash12(floor(w * 4.0)) * 4.0);
    param = (float(bucket * 4 + variant) + 0.5) / 16.0;
    col *= 0.85 + 0.35 * clamp(length(bend), 0.0, 1.0);
    mat = t == 0 ? 1.0 : 2.0;
  } else if (t == 2) {
    col = mix(vec3(0.19, 0.14, 0.09), vec3(0.27, 0.2, 0.12), n);
    param = hash12(floor(w * 4.0));
    mat = 3.0;
  } else if (t == 3) {
    col = mix(vec3(0.40, 0.36, 0.24), vec3(0.50, 0.45, 0.31), n);
    param = hash12(floor(w * 4.0));
    mat = 4.0;
  } else if (isWater(t)) {
    float ph = sin(dot(w, vec2(0.8, 0.6)) * 1.7 + uTime * 1.5) + sin(dot(w, vec2(-0.5, 0.9)) * 2.3 - uTime * 1.1) * 0.6;
    ph += (vnoise(w * 0.8 + vec2(uTime * 0.25, 0.0)) - 0.5) * 1.2;
    for (int i = 0; i < MAX_RIPPLES; i++) {
      if (i >= uRippleCount) break;
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (age < 0.0 || age > 2.6) continue;
      float d = distance(w, r.xy);
      float front = age * 2.4;
      float ring = sin((d - front) * 7.0) * exp(-age * 1.5) * (1.0 - smoothstep(0.0, 0.8, abs(d - front)));
      ph += ring * 2.2 * r.w;
    }
    bool deep = t == 5;
    col = deep ? vec3(0.03, 0.10, 0.24) : vec3(0.07, 0.25, 0.32);
    col += ph * vec3(0.03, 0.05, 0.06);
    emis = smoothstep(1.55, 1.95, ph) * (0.12 + 0.22 * uSunLight);
    param = fract(ph * 0.22 + 0.5) * 0.74;
    // shoreline foam
    bool shore = !isWater(tileAt(w + vec2(0.35, 0.0))) || !isWater(tileAt(w - vec2(0.35, 0.0))) ||
                 !isWater(tileAt(w + vec2(0.0, 0.35))) || !isWater(tileAt(w - vec2(0.0, 0.35)));
    if (shore && !deep) {
      float foam = 0.5 + 0.5 * sin(uTime * 2.0 + dot(w, vec2(3.0, 2.0)));
      col = mix(col, vec3(0.55, 0.68, 0.70), 0.35 * foam);
      param = (12.0 + floor(foam * 3.0) + 0.5) / 16.0;
    }
    mat = deep ? 6.0 : 5.0;
  } else if (t == 8) {
    // castle flagstones: offset courses, mortar joints, worn centers
    vec2 q = vec2(w.x * 0.8 + step(1.0, mod(floor(w.y * 1.6), 2.0)) * 0.5, w.y * 1.6);
    vec2 fq = fract(q);
    float joint = min(min(fq.x, 1.0 - fq.x) * 1.25, min(fq.y, 1.0 - fq.y));
    float stone = hash12(floor(q));
    col = mix(vec3(0.17, 0.17, 0.19), vec3(0.27, 0.27, 0.28), stone * 0.7 + n2 * 0.3);
    if (joint < 0.06) { col *= 0.55; param = fq.y < 0.06 || fq.y > 0.94 ? 2.5 / 16.0 : 3.5 / 16.0; mat = 8.0; }
    else { param = hash12(floor(w * 3.0)); mat = 4.0; }  // sparse dots inside each slab
  } else if (t == 9) {
    // crypt floor: dark, cracked, damp
    float crack = 1.0 - smoothstep(0.0, 0.03, abs(vnoise(w * 1.4) - 0.5));
    col = mix(vec3(0.11, 0.105, 0.1), vec3(0.2, 0.19, 0.17), n2) * (1.0 - crack * 0.6);
    param = crack > 0.4 ? (hash12(floor(w * 3.0)) < 0.5 ? 1.5 / 16.0 : 0.5 / 16.0) : hash12(floor(w * 3.3));
    mat = crack > 0.4 ? 8.0 : 3.0;
  } else if (t == 6) {
    float s = vnoise(w * 1.3) * 0.6 + n2 * 0.4;
    float ridge = abs(vnoise(w * 0.6 + 4.0) - 0.5) * 2.0;
    col = mix(vec3(0.17, 0.16, 0.17), vec3(0.36, 0.34, 0.33), s) * (0.55 + 0.6 * ridge);
    param = hash12(floor(w * 2.5) + floor(s * 3.0));
    mat = 7.0;
  } else {
    vec2 fw = fract(w);
    float ex = min(fw.x, 1.0 - fw.x);
    float ey = min(fw.y, 1.0 - fw.y);
    col = mix(vec3(0.26, 0.24, 0.21), vec3(0.34, 0.31, 0.27), n2);
    if (ex < 0.09 && ey < 0.09) { param = 0.5 / 16.0; col *= 0.7; }
    else if (ey < 0.07) { param = 2.5 / 16.0; col *= 0.75; }
    else if (ex < 0.07) { param = 3.5 / 16.0; col *= 0.75; }
    else param = (12.0 + floor(hash12(floor(w * 3.0)) * 4.0) + 0.5) / 16.0;
    mat = 8.0;
  }

  if (t != 9) col *= 1.0 - uRain * 0.22;   // wet ground
  col *= lightAt(w);
  float sh = texture(uShadow, uv).r;
  col *= 1.0 - sh * 0.55;
  oColor = vec4(col, 1.0);
  oMat = vec4(mat / 255.0, clamp(param, 0.0, 0.999), emis, 0.0);
}
`;

// ---------------------------------------------------------------- instanced shapes
export const SHAPE_VS = `${HEADER}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 iPosSize;   // x, y, halfW, halfH
layout(location = 2) in vec4 iRot;       // rotation, depthY, sway, phase|height
layout(location = 3) in vec4 iColorMat;  // r, g, b, material
layout(location = 4) in vec4 iPSEE;      // param, shape, emissive, extra
uniform vec4 uView;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform int uMode;          // 0 normal, 1 water reflection, 2 shadow
uniform vec2 uSunOffset;
out vec2 vLocal;
out vec2 vWorld;
flat out vec4 vColorMat;
flat out vec4 vPSEE;
flat out float vRot;
void main() {
  vec2 local = aCorner * iPosSize.zw;
  float c = cos(iRot.x);
  float s = sin(iRot.x);
  vec2 w = iPosSize.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  if (uMode != 2 && iRot.z > 0.0) {
    int shp = int(iPSEE.y + 0.5);
    // travelling gust fronts + per-tree flutter; foliage bends more at the top (skew, not slide)
    float front = sin(uTime * 0.7 - dot(iPosSize.xy, uWindDir) * 0.18) * 0.5 + 0.5;
    float gust = front * front * 1.4 + sin(uTime * 0.6 + iPosSize.x * 0.15) * 0.25;
    float flutter = sin(uTime * 2.3 + iRot.w * 6.283) * 0.45 + sin(uTime * 5.1 + iRot.w * 17.0) * 0.12;
    float topK = (shp == 5 || shp == 2) ? 0.3 + 0.7 * (0.5 - aCorner.y * 0.5) : 1.0;
    w += uWindDir * (flutter + gust) * iRot.z * uWindStrength * topK;
    w.y += abs(flutter) * iRot.z * uWindStrength * 0.15 * topK;
  }
  if (uMode == 1) w.x += sin(w.y * 5.0 + uTime * 2.2) * 0.07;
  if (uMode == 2) w += uSunOffset * iRot.w;
  vLocal = aCorner;
  vWorld = w;
  vColorMat = iColorMat;
  vPSEE = iPSEE;
  vRot = iRot.x;
  vec2 ndc = vec2((w.x - uView.x) / uView.z * 2.0 - 1.0, 1.0 - (w.y - uView.y) / uView.w * 2.0);
  float t = clamp((iRot.y - uView.y + 8.0) / (uView.w + 16.0), 0.0, 1.0);
  gl_Position = vec4(ndc, (1.0 - t) * 1.8 - 0.9, 1.0);
}
`;

export const SHAPE_FS = `${HEADER}${COMMON}
uniform sampler2D uTiles;
uniform vec2 uWorldSize;
uniform int uMode;
uniform vec2 uPlayer;
uniform vec3 uSee[MAX_SEE];   // actors that foliage must never hide: x, y(body center), radius
uniform int uSeeCount;
uniform sampler2D uSpriteTex;           // painted actor parts (premultiplied alpha)
uniform vec4 uSprites[MAX_SPRITES];      // atlas rect per sprite: u0, v0, du, dv
in vec2 vLocal;
in vec2 vWorld;
flat in vec4 vColorMat;
flat in vec4 vPSEE;
flat in float vRot;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oMat;

// 0 = keep, 1 = fully cut, in between = dithered see-through
float seeThrough(vec2 w) {
  float k = 0.0;
  for (int i = 0; i < MAX_SEE; i++) {
    if (i >= uSeeCount) break;
    float d = distance(w, uSee[i].xy);
    k = max(k, 1.0 - smoothstep(uSee[i].z * 0.55, uSee[i].z, d));
  }
  return k;
}
bool foliageCut(vec2 w) {
  float k = seeThrough(w);
  if (k <= 0.0) return false;
  float d = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  return d < k * 0.85 + 0.1 * step(0.99, k);
}

bool waterAt(vec2 w) {
  ivec2 t = ivec2(floor(w));
  if (t.x < 0 || t.y < 0 || t.x >= int(uWorldSize.x) || t.y >= int(uWorldSize.y)) return false;
  int k = int(texelFetch(uTiles, t, 0).r * 255.0 + 0.5);
  return k == 4 || k == 5;
}

void main() {
  vec2 p = vLocal;
  int shape = int(vPSEE.y + 0.5);
  float r = length(p);
  int mat = int(vColorMat.a + 0.5);
  float param = vPSEE.x;
  vec3 sprCol = vec3(1.0);
  bool sprite = false;
  if (shape == 8) {
    // painted cutout: param = sprite index, extra = flip bits (1: x, 2: y)
    vec4 rc = uSprites[int(param + 0.5)];
    int fl = int(vPSEE.w + 0.5);
    vec2 lp = p;
    if ((fl & 1) == 1) lp.x = -lp.x;
    if ((fl & 2) == 2) lp.y = -lp.y;
    vec4 tx = texture(uSpriteTex, rc.xy + (lp * 0.5 + 0.5) * rc.zw);
    if (tx.a < 0.38) discard;
    sprCol = tx.rgb / tx.a;
    sprite = true;
    param = 0.0;
  } else if (shape == 0) {
    if (r > 1.0) discard;
  } else if (shape == 1) {
    // tall masonry (extra = 1): brick courses + see-through around actors behind it
    if (vPSEE.w > 0.5) {
      if (uMode == 0 && foliageCut(vWorld)) discard;
      if (mat == 8) {
        vec2 bq = vec2(vWorld.x * 1.7 + step(1.0, mod(floor(vWorld.y * 3.2), 2.0)) * 0.5, vWorld.y * 3.2);
        vec2 bf = fract(bq);
        float bh = hash12(floor(bq));
        if (bf.y < 0.16) { param = 2.5 / 16.0; mat = 8; }          // bed joint  ═
        else if (bf.x < 0.1) { param = 3.5 / 16.0; mat = 8; }      // head joint ║
        else { mat = 11; param = (bh * 0.55 + 0.2); }              // brick face ▓█▒
        sprCol = vec3(bf.y < 0.16 || bf.x < 0.1 ? 0.55 : 0.85 + bh * 0.35);
      }
    }
  } else if (shape == 2) {
    if (abs(p.x) > (p.y + 1.0) * 0.5) discard;
    if (uMode == 0 && (mat == 28 || vPSEE.w > 0.5) && foliageCut(vWorld)) discard;
  } else if (shape == 3) {
    if (r > 1.0 || r < vPSEE.w) discard;
  } else if (shape == 4) {
    // telegraph sector; param carries fill progress
    float a = abs(atan(p.y, p.x));
    if (r > 1.0 || a > vPSEE.w) discard;
    bool rim = r > 0.9 || (vPSEE.w < 3.1 && a > vPSEE.w - 0.07 / max(r, 0.05));
    if (!rim) {
      float d = hash12(floor(gl_FragCoord.xy * 0.5));
      if (r > param || d > 0.5) discard;
    }
    param = hash12(floor(vWorld * 3.0) + floor(uTime * 5.0));
  } else if (shape == 5) {
    // canopy: noisy silhouette + see-through dither near the player
    float edge = 1.0 - 0.22 * vnoise(vec2(atan(p.y, p.x) * 2.5, vPSEE.w * 10.0));
    if (r > edge) discard;
    if (uMode == 0 && foliageCut(vWorld)) discard;
    param = hash12(floor(vWorld * 2.7) + vPSEE.w * 17.0);
  } else if (shape == 7) {
    // capsule limb: extra = radius / halfLength (both in local units); cylindrical shading
    float ratio = vPSEE.w;
    float d = length(vec2(max(abs(p.x) - (1.0 - ratio), 0.0), p.y * ratio));
    if (d > ratio) discard;
    float across = d / ratio;
    float shade = sqrt(max(0.0, 1.0 - across * across));
    // key light from the upper-left in body space, rim on the far edge
    float side = clamp(-p.y * sign(cos(vRot) + 1e-4) * 0.5 + 0.5, 0.0, 1.0);
    float lum = 0.35 + 0.5 * shade + 0.25 * side;
    if (param < 0.0) param = clamp(lum * 0.92, 0.0, 0.99);
  } else if (shape == 6) {
    float a = mod(vRot, 3.14159265);
    int b = int(mod(floor(a / 0.785398 + 0.5), 4.0));
    param = (float(b) + 0.5) / 16.0;
  }
  if (param < 0.0) param = hash12(floor(vWorld * 3.0) + vec2(vPSEE.w * 7.0));
  if (mat == 13) param = hash12(floor(vWorld * 4.0) + floor(uTime * 10.0));
  if (uMode == 1) {
    if (!waterAt(vWorld)) discard;
    mat = 23;
    param = fract(sin(vWorld.y * 4.0 + uTime * 2.0) * 0.5 + 0.5) * 0.99;
  }
  vec3 col = vColorMat.rgb * sprCol;
  float emis = vPSEE.z;
  if (shape == 0 || shape == 5) col *= 0.8 + 0.35 * clamp(-p.y * 0.5 + 0.5 - r * 0.25, 0.0, 1.0);
  if (shape == 7) col *= 0.55 + 0.7 * param;
  if (emis <= 0.0) col *= lightAt(vWorld);
  else col *= 1.0 + emis * 0.4;
  if (uMode == 1) col *= 0.5;
  // painted parts: the glyph follows the lit shading of each texel (dark -> sparse, bright -> dense)
  if (sprite && uMode != 1) param = clamp(sqrt(dot(col, vec3(0.299, 0.587, 0.114))) * 1.02, 0.0, 0.99);
  float prio = (mat == 14 || mat == 15 || mat == 16 || mat == 17 || mat == 26 || mat == 27) ? 1.0
             : (mat == 18 || mat == 19 || mat == 20 || mat == 22) ? 0.6 : 0.0;
  if (uMode == 1) prio = 0.0;
  oColor = vec4(col, 1.0);
  oMat = vec4(float(mat) / 255.0, clamp(param, 0.0, 0.999), clamp(emis, 0.0, 1.0), prio);
}
`;

export const SHADOW_FS = `${HEADER}
in vec2 vLocal;
flat in vec4 vPSEE;
out vec4 o;
void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  o = vec4(vPSEE.z * (1.0 - smoothstep(0.55, 1.0, r)));
}
`;

// ---------------------------------------------------------------- cell (glyph selection)
export const CELL_FS = `${HEADER}
uniform sampler2D uSceneColor;
uniform sampler2D uSceneMat;
uniform vec2 uGrid;
uniform vec4 uView;
uniform vec2 uPlayer;
uniform float uDensity;
uniform float uContrast;
uniform float uEdge;
uniform float uGlow;
uniform float uRenderDist;
uniform float uLodDist;
uniform float uDither;
uniform float uBgLevel;
uniform float uExposure;
uniform int uPalette;
uniform int uSub;
uniform int uFine;        // 1 = this pass is the fine actor layer (2x grid)
uniform int uFineOn;      // coarse pass: a fine actor layer exists, so keep scenery under actors
uniform float uTime;
uniform float uRain;      // 0..1
uniform float uCellW;     // meters per coarse cell
uniform float uWindX;
layout(location = 0) out vec4 oFg;
layout(location = 1) out vec4 oBg;

const int RAMP_ROW = 31;
const int EDGE_ROW = 30;
const int SPLASH_ROW = 24;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
const float BAYER[16] = float[](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float L(vec2 uv) { return luma(texture(uSceneColor, uv).rgb); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
int edgeCol(vec2 outward) {
  float ang = atan(outward.y, outward.x);
  int bk = int(mod(floor((ang + 0.3927) / 0.7854), 4.0));
  return int(mod(float(bk + 2), 4.0));
}
vec3 palette(vec3 fg) {
  if (uPalette == 1) return vec3(0.93, 0.87, 0.72) * luma(fg) * 1.35;
  if (uPalette == 2) {
    fg = floor(clamp(fg * 1.2, 0.0, 1.0) * 3.0 + 0.5) / 3.0;
    return clamp(mix(vec3(luma(fg)), fg, 1.5), 0.0, 1.0);
  }
  return fg;
}

// Fine actor layer: one glyph per scene texel where an actor is the top layer.
void fineMain() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 cs = 1.0 / uGrid;
  vec2 uv = (cell + 0.5) * cs;
  vec4 m = texture(uSceneMat, uv);
  if (m.a < 0.9) { oFg = vec4(0.0, 0.0, 0.0, 1.0); oBg = vec4(0.0); return; }
  vec3 c = texture(uSceneColor, uv).rgb * uExposure;
  c = max((c - 0.28) * uContrast + 0.28, 0.0);
  int row = int(m.r * 255.0 + 0.5);
  int col = clamp(int(m.g * 16.0), 0, 15);
  // silhouette: thick edges become thin oriented strokes (line-art outline)
  vec2 outward = vec2(0.0);
  float n = 0.0;
  vec2 offs[4] = vec2[](vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1));
  for (int i = 0; i < 4; i++) {
    if (texture(uSceneMat, uv + offs[i] * cs).a < 0.9 && texture(uSceneMat, uv - offs[i] * cs).a > 0.9) { outward += offs[i]; n += 1.0; }
  }
  if (n > 0.5 && length(outward) > 0.01) { row = EDGE_ROW; col = edgeCol(outward); c = c * 1.15 + 0.03; }
  vec3 fg = palette(c * (1.0 + m.b * uGlow * 1.6));
  vec2 world = vec2(uView.x + uv.x * uView.z, uView.y + (1.0 - uv.y) * uView.w);
  float fog = smoothstep(uRenderDist * 0.72, uRenderDist, distance(world, uPlayer));
  fg *= 1.0 - fog;
  vec3 bg = (uPalette == 2 ? vec3(0.0) : palette(c) * 0.14) * (1.0 - fog);
  oFg = vec4(clamp(fg * 0.5, 0.0, 1.0), float(row) / 255.0);
  oBg = vec4(clamp(bg, 0.0, 1.0), float(col) / 255.0);
}

void main() {
  if (uFine == 1) { fineMain(); return; }
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 cs = 1.0 / uGrid;
  vec2 uvC = (cell + 0.5) * cs;

  vec4 m = texture(uSceneMat, uvC);
  vec3 c = texture(uSceneColor, uvC).rgb;
  vec3 avg = c;
  float actorCount = m.a > 0.9 ? 1.0 : 0.0;
  vec2 actorDir = vec2(0.0);
  vec4 bm = m.a < 0.9 ? m : vec4(0.0, 0.0, 0.0, -1.0);
  vec3 bc = c;
  if (uSub > 1) {
    vec2 offs[4] = vec2[](vec2(-0.25, -0.25), vec2(0.25, -0.25), vec2(-0.25, 0.25), vec2(0.25, 0.25));
    for (int i = 0; i < 4; i++) {
      vec2 uv = uvC + offs[i] * cs;
      vec4 mi = texture(uSceneMat, uv);
      vec3 ci = texture(uSceneColor, uv).rgb;
      avg += ci;
      if (mi.a > 0.9) { actorCount += 1.0; actorDir += offs[i]; }
      else if (mi.a > bm.a) { bm = mi; bc = ci; }
      if (mi.a > m.a + 0.05) { m = mi; c = ci; }  // actors > effects > scenery
    }
    avg /= 5.0;
    if (m.a < 0.3) c = mix(c, avg, 0.4);
  }
  // With the fine layer on, coarse cells under actors keep the scenery (the actor is drawn finer on top).
  bool fineCovers = uFineOn == 1 && m.a > 0.9;
  if (fineCovers && bm.a >= 0.0) { m = bm; c = bc; }

  int mat = int(m.r * 255.0 + 0.5);
  float param = m.g;
  float emis = m.b;
  vec2 world = vec2(uView.x + uvC.x * uView.z, uView.y + (1.0 - uvC.y) * uView.w);
  float dist = distance(world, uPlayer);
  float fog = smoothstep(uRenderDist * 0.72, uRenderDist, dist);

  c *= uExposure;
  avg *= uExposure;
  c = max((c - 0.28) * uContrast + 0.28, 0.0);
  float lum = luma(c);
  float bay = (BAYER[int(mod(cell.x, 4.0)) + int(mod(cell.y, 4.0)) * 4] / 16.0 - 0.5) * uDither * 0.06;
  float Ld = lum * uDensity + bay;

  int row;
  int col;
  bool actor = m.a > 0.3;
  if (mat == 0) {
    row = RAMP_ROW; col = clamp(int(Ld * 18.0), 0, 15);
  } else if (dist > uLodDist && !actor && emis < 0.05) {
    row = RAMP_ROW; col = clamp(int(Ld * 20.0), 0, 12);
  } else if (Ld < 0.035 && emis < 0.05 && !actor) {
    row = RAMP_ROW; col = Ld < 0.012 ? 0 : (Ld < 0.024 ? 1 : 2);
  } else {
    row = mat; col = int(param * 16.0);
  }

  // Sobel on neighbouring cells -> structural edge glyphs (not on ground textures)
  if (uEdge > 0.0 && !actor && mat >= 7 && mat != 23) {
    float tl = L(uvC + cs * vec2(-1, 1)), t = L(uvC + cs * vec2(0, 1)), tr = L(uvC + cs * vec2(1, 1));
    float l = L(uvC + cs * vec2(-1, 0)), r = L(uvC + cs * vec2(1, 0));
    float bl = L(uvC + cs * vec2(-1, -1)), b = L(uvC + cs * vec2(0, -1)), br = L(uvC + cs * vec2(1, -1));
    vec2 g = vec2((tr + 2.0 * r + br) - (tl + 2.0 * l + bl), (tl + 2.0 * t + tr) - (bl + 2.0 * b + br));
    float gm = length(g) / max(lum + 0.08, 0.08);
    if (gm * uEdge > 1.6) { row = EDGE_ROW; col = edgeCol(g); }
  }

  // coarse actor silhouette (only when there is no fine layer)
  if (!fineCovers && actor && m.a > 0.9 && uSub > 1 && actorCount > 0.5 && actorCount < 4.5 && length(actorDir) > 0.01) {
    row = EDGE_ROW; col = edgeCol(-actorDir);
    c = c * 1.25 + 0.04;
  }
  vec3 fg = c * (1.0 + emis * uGlow * 1.6);
  float halo = mat == 5 || mat == 6 ? 0.0 : (texture(uSceneMat, uvC + vec2(cs.x, 0.0)).b + texture(uSceneMat, uvC - vec2(cs.x, 0.0)).b +
                texture(uSceneMat, uvC + vec2(0.0, cs.y)).b + texture(uSceneMat, uvC - vec2(0.0, cs.y)).b + emis) * 0.2;
  vec3 bg = avg * uBgLevel + fg * halo * uGlow * 0.45;

  // Rain: world-locked falling streaks + ground splashes (drawn over scenery, under the fine actor layer).
  if (uRain > 0.01) {
    vec2 wc = floor(world / uCellW);
    float slant = clamp(uWindX, -1.0, 1.0) * 0.45;
    float colId = wc.x - floor(wc.y * slant);
    float seed = hash12(vec2(colId, 17.0));
    if (seed < uRain * 0.85) {
      float P = 15.0 + floor(seed * 11.0);
      float ph = fract((wc.y - uTime * (30.0 + seed * 14.0)) / P + seed * 7.0);
      float len = 3.2;
      if (ph < len / P) {
        row = EDGE_ROW; col = abs(slant) < 0.12 ? 2 : (slant > 0.0 ? 3 : 1);
        vec3 rc = vec3(0.68, 0.76, 0.9) * (0.45 + 0.75 * (1.0 - ph * P / len));
        fg = mix(fg, rc, 0.9);
        bg *= 0.6;
      }
    }
    if (!actor && mat != 0 && mat < 9) {
      float h = hash12(wc + floor(uTime * 7.0) * vec2(13.1, 7.7));
      if (h < uRain * 0.03) {
        bool water = mat == 5 || mat == 6;
        row = water ? 5 : SPLASH_ROW; col = water ? 13 : int(fract(h * 91.0) * 8.0);
        fg = mix(fg, vec3(0.62, 0.7, 0.82), 0.8);
      }
    }
  }

  fg = palette(fg);
  if (uPalette == 1) bg = vec3(0.93, 0.87, 0.72) * luma(bg);
  else if (uPalette == 2) bg *= 0.0;
  fg *= 1.0 - fog;
  bg *= 1.0 - fog;
  if (fog > 0.97) { row = RAMP_ROW; col = 0; }
  oFg = vec4(clamp(fg * 0.5, 0.0, 1.0), float(row) / 255.0);
  oBg = vec4(clamp(bg, 0.0, 1.0), float(col) / 255.0);
}
`;

// ---------------------------------------------------------------- compose
export const COMPOSE_FS = `${HEADER}
uniform sampler2D uFg;
uniform sampler2D uBg;
uniform sampler2D uFineFg;
uniform sampler2D uFineBg;
uniform int uFineOn;
uniform sampler2D uAtlas;
uniform vec2 uOffset;
uniform float uCellPx;
uniform vec2 uGrid;
uniform vec2 uScreen;
uniform float uGrain;
uniform float uVignette;
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform int uOverlay;
out vec4 o;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 p = gl_FragCoord.xy + uOffset;
  float cpx = uCellPx;
  vec2 cell = floor(p / cpx);
  vec2 lc = fract(p / cpx);
  ivec2 ci = ivec2(clamp(cell, vec2(0.0), uGrid - 1.0));
  vec4 fgT = texelFetch(uFg, ci, 0);
  vec4 bgT = texelFetch(uBg, ci, 0);
  if (uFineOn == 1) {
    // actors use a grid twice as fine: more glyphs per character = more detail
    vec2 fp = p / (uCellPx * 0.5);
    ivec2 fi = ivec2(clamp(floor(fp), vec2(0.0), uGrid * 2.0 - 1.0));
    vec4 ff = texelFetch(uFineFg, fi, 0);
    if (ff.a < 0.999) {
      fgT = ff;
      bgT = texelFetch(uFineBg, fi, 0);
      lc = fract(fp);
      cpx = uCellPx * 0.5;
    }
  }
  float row = floor(fgT.a * 255.0 + 0.5);
  float col = floor(bgT.a * 255.0 + 0.5);
  vec2 auv = vec2((col + lc.x) / 16.0, (row + 1.0 - lc.y) / 32.0);
  float mask = textureGrad(uAtlas, auv, vec2(1.0 / (cpx * 16.0), 0.0), vec2(0.0, 1.0 / (cpx * 32.0))).r;
  vec3 color = mix(bgT.rgb, fgT.rgb * 2.0, mask);
  if (uOverlay == 1) {
    // effects layer over the 3D view: premultiplied, transparent where nothing glows
    color = max(fgT.rgb * 2.0 * mask, 0.0);
    float a = clamp(max(color.r, max(color.g, color.b)) * 1.5, 0.0, 1.0);
    o = vec4(min(color, vec3(a)), a);
    return;
  }
  color += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 311.0) - 0.5) * uGrain;
  vec2 q = gl_FragCoord.xy / uScreen - 0.5;
  color *= 1.0 - dot(q, q) * uVignette * 1.6;
  color = mix(color, uFlashColor, uFlash);
  o = vec4(pow(max(color, 0.0), vec3(0.92)), 1.0);
}
`;
