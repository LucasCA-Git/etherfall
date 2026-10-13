import * as THREE from 'three';
import { Tile, type Prop, type WorldData } from '@etherfall/shared';
import { FLORA } from './flora.gen';
import floraUrl from '../assets/flora/flora.webp';

/**
 * Vegetation and small decorations from the Flare tilesets (CC-BY-SA 3.0 — see CREDITS.md):
 * trees, pines, dead trees (snowy in the peaks), tents and tombstones, drawn as one instanced set of
 * camera-facing quads inside the 3D scene. They write depth like any mesh, so the ASCII pass
 * outlines them and lights/shading read through the glyph ramp. ?flora=0 keeps the 3D models.
 */
export const FLORA_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('flora') !== '0';
export const FLORA_KINDS = new Set<Prop['kind']>(['tree', 'pine', 'deadtree', 'tent', 'grave']);

export interface FloraUniforms {
  uRight: { value: THREE.Vector3 };
  uUp: { value: THREE.Vector3 };
  uFwd: { value: THREE.Vector3 };
  /** Overall light on the painted sprites (night … day). */
  uLight: { value: number };
}

const ZS = 1 / Math.sin((35 * Math.PI) / 180);

const VS = /* glsl */ `
attribute vec3 aPos;     // feet, three world space
attribute vec4 aRect;    // atlas rect, normalized (x, y from top, w, h)
attribute vec4 aGeom;    // width, height (m), anchor x, anchor y (fractions from left / top)
attribute vec3 aTint;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
varying vec2 vUv;
varying vec3 vTint;
varying vec3 vWorld;
void main() {
  vec2 q = position.xy; // unit quad, origin bottom-left
  vec3 wp = aPos + uRight * ((q.x - aGeom.z) * aGeom.x) + uUp * ((q.y - (1.0 - aGeom.w)) * aGeom.y) + uFwd * 0.35;
  vUv = vec2(aRect.x + q.x * aRect.z, 1.0 - (aRect.y + (1.0 - q.y) * aRect.w));
  vTint = aTint;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FS = /* glsl */ `
uniform sampler2D tMap;
uniform float uLight;
uniform vec4 uSee;
varying vec2 vUv;
varying vec3 vTint;
varying vec3 vWorld;
void main() {
  vec4 c = texture2D(tMap, vUv);
  if (c.a < 0.55) discard; // the painted drop shadow and the soft fringe stay out
  // canopies that hide the player become a see-through screen door, like the 3D foliage
  if (uSee.w > 0.5 && vWorld.y > 0.9 && vWorld.z > uSee.y + 0.4) {
    float d = length(vec2(vWorld.x - uSee.x, (vWorld.z - uSee.y) * 0.55 + vWorld.y * 0.3 - 0.4));
    float k = 1.0 - smoothstep(uSee.z * 0.7, uSee.z * 1.1, d);
    vec2 m = mod(floor(gl_FragCoord.xy), 2.0);
    if (k > 0.5 && (m.x + m.y != 1.0 || k > 0.85)) discard;
  }
  gl_FragColor = vec4(pow(c.rgb, vec3(0.9)) * vTint * uLight, 0.86); // alpha tag: foliage (ASCII pass)
}`;

export function buildFlora(world: WorldData, see: { uSee: { value: THREE.Vector4 } }, disposables: Array<{ dispose(): void }>): { mesh: THREE.Mesh; uniforms: FloraUniforms } | null {
  if (!FLORA_ON) return null;
  const items = world.props.filter((p) => FLORA_KINDS.has(p.kind));
  const n = items.length;
  const pos = new Float32Array(n * 3);
  const rect = new Float32Array(n * 4);
  const geomA = new Float32Array(n * 4);
  const tint = new Float32Array(n * 3);
  const W = world.width;
  const kinds = FLORA.kinds as unknown as Record<string, ReadonlyArray<readonly number[]>>;
  items.forEach((p, i) => {
    const t = world.tiles[Math.floor(p.y) * W + Math.floor(p.x)];
    const onSnow = t === Tile.Snow;
    const kind = p.kind === 'deadtree' && onSnow ? 'deadtree_snow' : p.kind;
    const variants = kinds[kind] ?? kinds.tree!;
    const [x, y, w, h, ax, ay] = variants[Math.floor(p.v * variants.length) % variants.length]! as [number, number, number, number, number, number];
    const scale = p.kind === 'tree' || p.kind === 'pine' || p.kind === 'deadtree' ? 0.55 + p.size * 0.2 : p.kind === 'grave' ? 0.9 : 1;
    pos.set([p.x, 0, p.y * ZS], i * 3);
    rect.set([x / FLORA.w, y / FLORA.h, w / FLORA.w, h / FLORA.h], i * 4);
    geomA.set([w * FLORA.mpp * scale, h * FLORA.mpp * scale, ax / w, ay / h], i * 4);
    // a little variation per plant; pines frosted on snow, sick green in the swamp, sooty in the ash
    const k = 0.85 + (((p.id * 7919) % 100) / 100) * 0.3;
    if (onSnow && p.kind === 'pine') tint.set([1.25 * k, 1.35 * k, 1.5 * k], i * 3);
    else if (t === Tile.Mud) tint.set([0.75 * k, 0.8 * k, 0.6 * k], i * 3);
    else if (t === Tile.Ash) tint.set([0.7 * k, 0.62 * k, 0.58 * k], i * 3);
    else tint.set([k, k, k], i * 3);
  });
  const g = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0.5, 0.5, 0);
  g.index = quad.index;
  g.setAttribute('position', quad.getAttribute('position'));
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
  g.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
  g.setAttribute('aGeom', new THREE.InstancedBufferAttribute(geomA, 4));
  g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  g.instanceCount = n;
  const tex = new THREE.TextureLoader().load(floraUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const uniforms: FloraUniforms = {
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uFwd: { value: new THREE.Vector3(0, 0, 1) },
    uLight: { value: 0.3 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: { tMap: { value: tex }, uSee: see.uSee, ...uniforms },
    side: THREE.DoubleSide,
  });
  disposables.push(g, quad, tex, mat);
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
