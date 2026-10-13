import * as THREE from 'three';
import { ACTIONS, type EntitySnap } from '@etherfall/shared';
import type { AnimState } from '../render/rig';
import { SHEETS, type SheetDef } from './flareSheets.gen';

/**
 * Heroes and creatures drawn from the Flare game art (CC-BY-SA 3.0 — see CREDITS.md), unpacked and
 * repacked by tools/flare-sheets.py: every frame of every direction is a tight rect in one WebP sheet
 * with its feet anchor. Each actor is a camera-facing quad inside the 3D scene, so it goes through the
 * same ASCII post-process as the grass, trees and walls (tagged as an actor: alpha 0.7).
 * Sheet rows (directions on screen): 0 W, 1 NW, 2 N, 3 NE, 4 E, 5 SE, 6 S, 7 SW.
 * ?sprites=0 falls back to the procedural 3D rigs.
 */
export const SPRITES_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('sprites') !== '0';

const URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(import.meta.glob<string>('../assets/flare/*.webp', { eager: true, query: '?url', import: 'default' }))) {
  URLS[path.slice(path.lastIndexOf('/') + 1, -5)] = url;
}

/** How an entity is drawn: sheet + size multiplier + colour wash. */
export interface SpriteLook {
  sheet: string;
  scale?: number;
  tint?: [number, number, number];
  /** Constant glow (spectral summons). */
  glow?: [number, number, number];
}

const CREATURES: Record<string, SpriteLook> = {
  hollow: { sheet: 'zombie' },
  giantspider: { sheet: 'antlion', scale: 1.5 },
  bonegiant: { sheet: 'minotaur', scale: 1.35, tint: [0.95, 0.9, 0.85] },
  voidguard: { sheet: 'skeleton', scale: 1.3, tint: [0.75, 0.7, 1.05] },
  ancestor: { sheet: 'skeleton', tint: [0.6, 1.0, 0.95], glow: [0.05, 0.22, 0.2] },
  goblin: { sheet: 'goblin' },
  goblin_chief: { sheet: 'goblin_elite' },
  skeleton: { sheet: 'skeleton' },
  skeleton_archer: { sheet: 'skeleton_archer' },
  skeleton_mage: { sheet: 'skeleton_mage' },
  fire_ant: { sheet: 'fire_ant' },
  ice_ant: { sheet: 'ice_ant' },
  fire_dragon: { sheet: 'wyvern_fire', scale: 1.25 },
  frost_wyvern: { sheet: 'wyvern_water' },
  cursed_grave: { sheet: 'cursed_grave' },
  // 0.13: the people of Pedravelha, the cult and what it calls up
  villager: { sheet: 'hero_rogue_m', tint: [0.95, 0.85, 0.7] },
  cultist: { sheet: 'hero_warlock_m', tint: [1.15, 0.55, 0.5] },
  cult_leader: { sheet: 'hero_warlock_f', tint: [1.2, 0.5, 0.45], glow: [0.12, 0.02, 0.0] },
  demon: { sheet: 'minotaur', scale: 1.45, tint: [1.35, 0.45, 0.35], glow: [0.22, 0.04, 0.0] },
};

/** Sheet for an entity, or null when it keeps its 3D rig (wolves, imps, vampires...). */
export function lookFor(e: EntitySnap): SpriteLook | null {
  if (!SPRITES_ON) return null;
  let look: SpriteLook | undefined;
  if (e.kind === 'player') look = { sheet: `hero_${e.classId ?? 'vanguard'}_${e.gender === 'f' ? 'f' : 'm'}` };
  else if (e.enemyId === 'phantom') look = { sheet: 'hero_rogue_f', tint: [0.85, 0.65, 1.0], glow: [0.12, 0.05, 0.2] };
  else if (e.enemyId?.startsWith('phantom_')) look = { sheet: `hero_${e.enemyId.slice(8)}_${e.gender === 'f' ? 'f' : 'm'}`, tint: [1.2, 1.08, 0.8], glow: [0.16, 0.12, 0.04] };
  else if (e.enemyId === 'villager') look = { sheet: e.id % 2 ? 'hero_rogue_f' : 'hero_rogue_m', tint: [0.95, 0.85, 0.7] };
  else if (e.enemyId) look = CREATURES[e.enemyId];
  if (!look || !SHEETS[look.sheet] || !URLS[look.sheet]) return null;
  return sheetReady(look.sheet) ? look : null;
}

const textures = new Map<string, THREE.Texture>();
const loading = new Set<string>();

function sheetReady(name: string): boolean {
  if (textures.has(name)) return true;
  if (!loading.has(name)) {
    loading.add(name);
    new THREE.TextureLoader().load(URLS[name]!, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      textures.set(name, t);
    }, undefined, () => console.warn('[etherfall] sprite sheet failed', name));
  }
  return false;
}

// every sheet starts decoding right away (heroes first): creatures must not pop in as 3D rigs
if (typeof document !== 'undefined' && SPRITES_ON) {
  const keys = Object.keys(URLS).sort((a, b) => Number(b.startsWith('hero_')) - Number(a.startsWith('hero_')));
  for (const k of keys) sheetReady(k);
}

const VS = /* glsl */ `
uniform vec4 uFrame; // u0, v0, du, dv
varying vec2 vUv;
void main() {
  vUv = uFrame.xy + uv * uFrame.zw;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FS = /* glsl */ `
uniform sampler2D tMap;
uniform vec3 uTint;
uniform vec3 uAdd;
uniform float uGain;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tMap, vUv);
  if (c.a < 0.72) discard; // drops the baked drop-shadow (alpha ~0.6) and the soft fringe
  // the art is lit for a bright floor; lift it so it reads in the ASCII ramp
  vec3 col = (pow(c.rgb, vec3(0.85)) + 0.01) * uGain * uTint + uAdd;
  gl_FragColor = vec4(col, 0.7);
}`;

export interface SpriteRig {
  type: 'sprite';
  key: string;
  def: SheetDef;
  look: SpriteLook;
  root: THREE.Group;
  pivot: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  materials: THREE.MeshStandardMaterial[];
  /** Direction row held while the actor does not turn. */
  row: number;
}

let geo: THREE.PlaneGeometry | null = null;
function unitQuad(): THREE.PlaneGeometry {
  if (!geo) {
    geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0.5, 0.5, 0); // origin at the bottom-left corner
  }
  return geo;
}

export function spriteKey(look: SpriteLook): string {
  return `sprite:${look.sheet}:${look.scale ?? 1}:${(look.tint ?? []).join(',')}`;
}

export function buildSprite(look: SpriteLook): SpriteRig {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      tMap: { value: textures.get(look.sheet)! },
      uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uAdd: { value: new THREE.Color(0, 0, 0) },
      uGain: { value: 3 },
    },
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(unitQuad(), mat);
  mesh.frustumCulled = false;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  const root = new THREE.Group();
  root.add(pivot);
  return { type: 'sprite', key: spriteKey(look), def: SHEETS[look.sheet]!, look, root, pivot, mesh, materials: [], row: 6 };
}

export function disposeSprite(r: SpriteRig): void {
  r.mesh.material.dispose();
}

/** Screen-direction angle (game coords, y down) → sheet row. */
function rowFor(angle: number): number {
  // the packed rows run one step counter-clockwise from their names (row "W" is drawn facing SW, "SW" faces S,
  // checked frame by frame), so look up the row for the angle 45° further round
  return ((Math.round((angle + Math.PI / 4 - Math.PI) / (Math.PI / 4)) % 8) + 8) % 8;
}

const CASTS = new Set(['cast', 'castSky', 'castRaise', 'castPlant', 'shout', 'trap']);

/** Which strip of the sheet plays for an action. */
function segFor(def: SheetDef, id: string, isPlayer: boolean): string {
  const has = (s: string) => !!def.segs[s];
  const d = ACTIONS[id];
  if (!d || id === 'dodge') return 'run';
  if (id === 'sit') return has('block') ? 'block' : 'stance';
  if (d.anim === 'guard') return has('block') ? 'block' : 'stance';
  if (d.summon && has('cast')) return 'cast';
  if (d.anim === 'bow' || d.anim === 'throw') return has('shoot') ? 'shoot' : 'swing';
  if (d.anim && CASTS.has(d.anim)) return has('cast') ? 'cast' : 'swing';
  if (d.anim) return 'swing';
  if (!isPlayer && d.lunge && d.lunge.speed >= 9 && has('dash_attack')) return 'dash_attack';
  if (d.projectile || d.spikes || d.zone || d.strikes) {
    if (has('shoot') && /arrow|shot|bow|archer/.test(id)) return 'shoot';
    return has('cast') ? 'cast' : 'swing';
  }
  if ((d.mana ?? 0) > 0 && has('cast') && !d.hit) return 'cast';
  return 'swing';
}

export interface SpritePoseIn {
  e: EntitySnap;
  anim: AnimState;
  time: number;
  tick: number;
  deadT: number;
  stage: 'windup' | 'active' | 'recovery' | 'none';
  k: number;
  camera: THREE.Camera;
  spin: boolean;
  /** Overall light on the actor (≈0.75 night … 1.45 day, + flashes). */
  light: number;
  tint: THREE.Color;
  add: THREE.Color;
}

const FWD = new THREE.Vector3();

export function poseSprite(r: SpriteRig, p: SpritePoseIn): void {
  const { e, anim } = p;
  const def = r.def;
  // face the camera; nudged toward it so the feet are not clipped by the ground just in front
  r.pivot.quaternion.copy(p.camera.quaternion);
  FWD.set(0, 0, 1).applyQuaternion(p.camera.quaternion);
  r.pivot.position.copy(FWD).multiplyScalar(0.6 * (r.look.scale ?? 1));

  const dir = e.action && !e.dead ? e.adir : e.facing;
  let row = rowFor(dir);
  const seg = (name: string) => def.segs[name] ?? def.segs.stance!;
  let frame: number;
  if (e.dead) {
    const [s0, n] = seg('die');
    frame = s0 + Math.min(n - 1, Math.floor(p.deadT * n));
  } else if (p.tick - e.hitTick < 6 && !e.action && def.segs.hit) {
    const [s0, n] = seg('hit');
    frame = s0 + Math.min(n - 1, Math.floor(((p.tick - e.hitTick) / 6) * n));
  } else if (e.blocking && def.segs.block) {
    const [s0, n] = seg('block');
    frame = s0 + n - 1;
  } else if (e.action && p.stage !== 'none') {
    const name = segFor(def, e.action, e.kind === 'player');
    const [s0, n] = seg(name);
    if (name === 'run') frame = s0 + (Math.floor(p.k * n) % n);
    else if (e.action === 'sit') frame = s0 + n - 1;
    else {
      // windup → first half of the strip, active → strike frames, recovery holds the last frame
      const t = p.stage === 'windup' ? p.k * 0.5 : p.stage === 'active' ? 0.5 + p.k * 0.5 : 1;
      frame = s0 + Math.min(n - 1, Math.floor(t * n));
    }
    if (p.spin && p.stage === 'active') row = (row + Math.floor(p.k * 16)) % 8;
  } else if (anim.speed > 0.6) {
    const [s0, n] = seg('run');
    let step = Math.floor((anim.phase / (Math.PI * 2)) * n);
    // moving away from where you aim: keep facing the aim and play the stride backwards (backpedal)
    // instead of turning the body sideways or moonwalking
    const away = Math.abs(((Math.atan2(e.vy, e.vx) - dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (away > 1.95) step = -step;
    frame = s0 + ((step % n) + n) % n;
  } else {
    const [s0, n, ms, type] = seg('stance');
    const step = Math.floor((p.time * 1000 * n) / Math.max(1, ms));
    if (type === 'back_forth' && n > 1) {
      const t = step % (2 * n - 2);
      frame = s0 + (t < n ? t : 2 * n - 2 - t);
    } else frame = s0 + (step % n);
  }
  const i = (row * def.frames + frame) * 6;
  const R = def.rects;
  const x = R[i]!, y = R[i + 1]!, w = R[i + 2]!, h = R[i + 3]!, ax = R[i + 4]!, ay = R[i + 5]!;
  const m = def.mpp * (r.look.scale ?? 1);
  r.mesh.position.set(-ax * m, -(h - ay) * m, 0);
  r.mesh.scale.set(Math.max(1e-3, w * m), Math.max(1e-3, h * m), 1);
  const u = r.mesh.material.uniforms;
  (u.uFrame!.value as THREE.Vector4).set(x / def.w, 1 - (y + h) / def.h, w / def.w, h / def.h);
  const t = u.uTint!.value as THREE.Color;
  t.copy(p.tint);
  if (r.look.tint) t.setRGB(t.r * r.look.tint[0], t.g * r.look.tint[1], t.b * r.look.tint[2]);
  const a = u.uAdd!.value as THREE.Color;
  a.copy(p.add);
  if (r.look.glow) a.setRGB(a.r + r.look.glow[0], a.g + r.look.glow[1], a.b + r.look.glow[2]);
  u.uGain!.value = 0.8 * p.light;
}
