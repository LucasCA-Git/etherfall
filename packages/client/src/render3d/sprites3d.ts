import * as THREE from 'three';
import { ACTIONS, type ClassId, type EntitySnap } from '@etherfall/shared';
import type { AnimState } from '../render/rig';
import vanguardUrl from '../assets/heroes/hero_vanguard.webp';
import arcanistUrl from '../assets/heroes/hero_arcanist.webp';
import healerUrl from '../assets/heroes/hero_healer.webp';
import rangerUrl from '../assets/heroes/hero_ranger.webp';
import rogueUrl from '../assets/heroes/hero_rogue.webp';
import barbarianUrl from '../assets/heroes/hero_barbarian.webp';
import warlockUrl from '../assets/heroes/hero_warlock.webp';

/**
 * Player heroes drawn from pre-rendered isometric sprite sheets (Flare "Isometric Hero" by
 * Clint Bellanger, CC-BY-SA 3.0 — see CREDITS.md), one sheet per class composed offline from the
 * layered armour/head/weapon sheets. Each hero is a camera-facing quad in the 3D scene, so it goes
 * through the same ASCII post-process as everything else (tagged as an actor: alpha 0.7).
 *
 * Sheet layout (per class): 32 frames × 8 directions, 80 × 96 px per frame.
 *   stance 0–3 · run 4–11 · swing 12–15 · block 16–17 · hit 18–19 · die 18–23 · cast 24–27 · shoot 28–31
 *   rows: 0 W, 1 NW, 2 N, 3 NE, 4 E, 5 SE, 6 S, 7 SW (screen directions)
 * ?sprites=0 falls back to the procedural 3D rigs.
 */
const URLS: Record<ClassId, string> = {
  vanguard: vanguardUrl, arcanist: arcanistUrl, healer: healerUrl, ranger: rangerUrl,
  rogue: rogueUrl, barbarian: barbarianUrl, warlock: warlockUrl,
};
const COLS = 32;
const ROWS = 8;
const FW = 80;
const FH = 96;
/** Feet in the frame (px from the left / top). */
const ANCHOR_X = 40;
const ANCHOR_Y = 76;
/** Meters per sprite pixel (a standing hero is ~45 px tall ≈ the 3D rigs on screen). */
const M_PER_PX = 0.036;

export const SPRITES_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('sprites') !== '0';

const textures = new Map<ClassId, THREE.Texture>();
const loading = new Set<ClassId>();

/** True once the class sheet is loaded (starts the load on first ask). */
export function spriteReady(cls: ClassId): boolean {
  if (!SPRITES_ON || !URLS[cls]) return false;
  if (textures.has(cls)) return true;
  if (!loading.has(cls)) {
    loading.add(cls);
    new THREE.TextureLoader().load(URLS[cls], (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      textures.set(cls, t);
    }, undefined, () => console.warn('[etherfall] hero sheet failed', cls));
  }
  return false;
}

// start decoding every class sheet right away (they are inlined data URLs)
if (typeof document !== 'undefined') for (const c of Object.keys(URLS) as ClassId[]) spriteReady(c);

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
  if (c.a < 0.75) discard; // drops the baked drop-shadow (alpha ~0.67) and the fringe
  // the sheets are lit dark for a bright floor; lift them so they read in the ASCII ramp
  vec3 col = (pow(c.rgb, vec3(0.7)) + 0.03) * uGain * uTint + uAdd;
  gl_FragColor = vec4(col, 0.7);
}`;

export interface SpriteRig {
  type: 'sprite';
  cls: ClassId;
  root: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  materials: THREE.MeshStandardMaterial[];
}

let geo: THREE.PlaneGeometry | null = null;
function quad(): THREE.PlaneGeometry {
  if (geo) return geo;
  const w = FW * M_PER_PX;
  const h = FH * M_PER_PX;
  geo = new THREE.PlaneGeometry(w, h);
  // origin at the feet
  geo.translate(w / 2 - ANCHOR_X * M_PER_PX, h / 2 - (FH - ANCHOR_Y) * M_PER_PX, 0);
  return geo;
}

export function buildSprite(cls: ClassId): SpriteRig {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      tMap: { value: textures.get(cls)! },
      uFrame: { value: new THREE.Vector4(0, 0, 1 / COLS, 1 / ROWS) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uAdd: { value: new THREE.Color(0, 0, 0) },
      uGain: { value: 2.2 },
    },
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(quad(), mat);
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  return { type: 'sprite', cls, root, mesh, materials: [] };
}

export function disposeSprite(r: SpriteRig): void {
  r.mesh.material.dispose();
}

/** Screen-direction angle (game coords, y down) → sheet row. */
function rowFor(angle: number): number {
  return ((Math.round((angle - Math.PI) / (Math.PI / 4)) % 8) + 8) % 8;
}

type Seg = [start: number, frames: number];
const STANCE: Seg = [0, 4];
const RUN: Seg = [4, 8];
const SWING: Seg = [12, 4];
const BLOCK: Seg = [16, 2];
const CAST: Seg = [24, 4];
const SHOOT: Seg = [28, 4];
const CASTS = new Set(['cast', 'castSky', 'castRaise', 'castPlant', 'shout', 'trap']);

function segFor(cls: ClassId, id: string): Seg {
  const d = ACTIONS[id];
  if (!d || id === 'dodge') return RUN;
  if (id === 'sit') return [16, 1];
  if (d.anim === 'guard') return BLOCK;
  if (d.anim === 'bow' || d.anim === 'throw') return SHOOT;
  if (d.anim && CASTS.has(d.anim)) return CAST;
  if (d.anim) return SWING;
  const ranged = !!(d as { projectile?: unknown }).projectile;
  if (ranged && cls === 'ranger') return SHOOT;
  if (ranged || (d.mana ?? 0) > 0) return cls === 'vanguard' || cls === 'barbarian' || cls === 'rogue' ? SWING : CAST;
  return SWING;
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
  /** Overall light on the hero (≈0.5 night … 1.2 day, + flashes). */
  light: number;
  tint: THREE.Color;
  add: THREE.Color;
}

const FWD = new THREE.Vector3();

export function poseSprite(r: SpriteRig, p: SpritePoseIn): void {
  const { e, anim } = p;
  // face the camera; nudged toward it so the feet are not clipped by the ground just in front
  r.mesh.quaternion.copy(p.camera.quaternion);
  FWD.set(0, 0, 1).applyQuaternion(p.camera.quaternion);
  r.mesh.position.copy(FWD).multiplyScalar(0.6);

  const dir = e.action && !e.dead ? e.adir : e.facing;
  let row = rowFor(dir);
  let frame: number;
  if (e.dead) {
    frame = 18 + Math.min(5, Math.floor(p.deadT * 6));
  } else if (p.tick - e.hitTick < 6 && !e.action) {
    frame = p.tick - e.hitTick < 3 ? 18 : 19;
  } else if (e.blocking) {
    frame = 17;
  } else if (e.action && p.stage !== 'none') {
    const [s0, n] = segFor(r.cls, e.action);
    if (n === 8) frame = s0 + (Math.floor(p.k * 8) % 8);
    else if (n === 1) frame = s0;
    else {
      // windup → first half of the strip, active → strike frames, recovery holds the last frame
      const t = p.stage === 'windup' ? p.k * 0.5 : p.stage === 'active' ? 0.5 + p.k * 0.5 : 1;
      frame = s0 + Math.min(n - 1, Math.floor(t * n));
    }
    if (p.spin && p.stage === 'active') row = (row + Math.floor(p.k * 16)) % 8;
  } else if (anim.speed > 0.6) {
    frame = RUN[0] + ((Math.floor((anim.phase / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  } else {
    // back-and-forth breathing
    const t = Math.floor(p.time * 4) % 6;
    frame = STANCE[0] + (t < 4 ? t : 6 - t);
  }
  const u = r.mesh.material.uniforms;
  (u.uFrame!.value as THREE.Vector4).set(frame / COLS, 1 - (row + 1) / ROWS, 1 / COLS, 1 / ROWS);
  (u.uTint!.value as THREE.Color).copy(p.tint);
  (u.uAdd!.value as THREE.Color).copy(p.add);
  u.uGain!.value = 3.4 * p.light;
}
