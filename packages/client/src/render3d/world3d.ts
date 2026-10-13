import { FLORA_KINDS, FLORA_ON, buildFlora, type FloraUniforms } from './flora';
import * as THREE from 'three';
import { Tile, hash2, summonSignOf, type Prop, type WorldData } from '@etherfall/shared';

/**
 * The static world as real 3D geometry (terrain, rock cliffs, forests, castle, ruins),
 * built once from the shared WorldData. Everything is rendered by the same three.js scene as the
 * actors and then turned into fine ASCII by the post pass in actors3d.ts.
 *
 * Grass is real blades with spring physics (buildGrass); the grass ground under them is also tagged
 * (alpha 0.55/0.58) so the ASCII pass can fill the gaps between tufts with faint strokes.
 *
 * Mapping (shared with actors3d): game (x, y) on the ground ↦ three (x, 0, y / sin(PITCH)), so the
 * pitched orthographic camera shows the ground exactly where the 2D layers expect it.
 */
export const PITCH = (35 * Math.PI) / 180;
export const SIN_P = Math.sin(PITCH);
export const COS_P = Math.cos(PITCH);
const ZS = 1 / SIN_P; // three z per game meter
const CHUNK = 32;

/** Shared uniforms of the "see-through" patch: walls and canopies in front of the player open up. */
export interface SeeUniforms {
  /** player x, player z (three), radius (screen meters), enabled */
  uSee: { value: THREE.Vector4 };
}


type Xform = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; rx?: number; rz?: number; c?: THREE.Color };

/** Deterministic per-prop random stream. */
function rng(seed: number): () => number {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Injects the see-through cut-out into a standard material (shared uniform object). */
function seeThrough(m: THREE.MeshStandardMaterial, see: SeeUniforms): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSee = see.uSee;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        { vec4 sw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          sw = instanceMatrix * sw;
        #endif
          vSeeW = (modelMatrix * sw).xyz; }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSeeW;\nuniform vec4 uSee;`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uSee.w > 0.5 && vSeeW.y > 0.35 && vSeeW.z > uSee.y + 0.6) {
          vec2 d = vec2(vSeeW.x - uSee.x, (vSeeW.z * ${SIN_P.toFixed(5)} - vSeeW.y * ${COS_P.toFixed(5)}) - (uSee.y * ${SIN_P.toFixed(5)} - 0.95 * ${COS_P.toFixed(5)}));
          float k = 1.0 - smoothstep(uSee.z * 0.65, uSee.z, length(d));
          vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
          if (k > 0.5 && (q.x + q.y != 1.0 || k > 0.85)) discard;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'see';
  return m;
}

/** Builds InstancedMeshes per chunk so off-screen chunks are culled. */
class Batcher {
  private buckets = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; items: Xform[]; shadow: boolean }>();
  add(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, chunk: number, t: Xform, shadow = true): void {
    const k = `${key}#${chunk}`;
    let b = this.buckets.get(k);
    if (!b) {
      b = { geo, mat, items: [], shadow };
      this.buckets.set(k, b);
    }
    b.items.push(t);
  }
  build(group: THREE.Group): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (const b of this.buckets.values()) {
      const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.items.length);
      b.items.forEach((t, i) => {
        e.set(t.rx ?? 0, t.ry, t.rz ?? 0);
        q.setFromEuler(e);
        m.compose(p.set(t.x, t.y, t.z), q, s.set(t.sx, t.sy, t.sz));
        mesh.setMatrixAt(i, m);
        if (t.c) mesh.setColorAt(i, t.c);
      });
      mesh.castShadow = b.shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
  }
}

/** Clumpy light/dark speckle (sRGB texture, tiled): foliage and stone read as glyph texture, not flat facets. */
function speckle(seed: number, amount: number, rep: number): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, size, size);
  let s = (seed % 2147483646) + 1;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 900; i++) {
    const v = (r() - 0.5) * 2 * amount;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    const rad = 2 + r() * 6;
    g.beginPath();
    g.arc(r() * size, r() * size, rad, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tileColor(t: Tile, v: number, out: THREE.Color): THREE.Color {
  const j = 0.82 + v * 0.36;
  switch (t) {
    case Tile.Grass: return out.setRGB(0.032 * j, 0.055 * j, 0.036 * j);
    case Tile.TallGrass: return out.setRGB(0.028 * j, 0.05 * j, 0.032 * j);
    case Tile.Dirt: return out.setRGB(0.04 * j, 0.032 * j, 0.025 * j);
    case Tile.Sand: return out.setRGB(0.12 * j, 0.105 * j, 0.075 * j);
    case Tile.ShallowWater: return out.setRGB(0.02, 0.045, 0.07);
    case Tile.DeepWater: return out.setRGB(0.008, 0.018, 0.04);
    case Tile.Rock: return out.setRGB(0.06 * j, 0.062 * j, 0.072 * j);
    case Tile.RuinFloor: return out.setRGB(0.09 * j, 0.09 * j, 0.1 * j);
    case Tile.CastleFloor: return out.setRGB(0.075 * j, 0.078 * j, 0.095 * j);
    case Tile.DungeonFloor: return out.setRGB(0.05 * j, 0.048 * j, 0.056 * j);
    case Tile.Snow: return out.setRGB(0.2 * j, 0.21 * j, 0.24 * j);
    case Tile.Ice: return out.setRGB(0.11 * j, 0.15 * j, 0.2 * j);
    case Tile.Ash: return out.setRGB(0.035 * j, 0.032 * j, 0.032 * j);
    case Tile.Mud: return out.setRGB(0.032 * j, 0.03 * j, 0.02 * j);
    case Tile.Cobble: return out.setRGB(0.085 * j, 0.08 * j, 0.075 * j);
    // lava glows: values above 1 survive the tone mapping as bright embers in the ASCII
    case Tile.Lava: return out.setRGB(1.6 + v * 0.8, 0.32 + v * 0.2, 0.04);
    default: return out.setRGB(0.03, 0.03, 0.03);
  }
}

export interface World3D {
  group: THREE.Group;
  see: SeeUniforms;
  /** Shared flame material (flickered each frame). */
  fire: THREE.MeshStandardMaterial;
  /** Grass blades: wind + the CPU spring field (actors push, blasts kick). */
  grass: GrassUniforms;
  /** Flare vegetation billboards (null with ?flora=0). */
  flora: FloraUniforms | null;
  dispose(): void;
}

export interface GrassUniforms {
  uTime: { value: number };
  uWind: { value: THREE.Vector2 };
  uCam: { value: THREE.Vector2 };
  /** Spring deflection field (RG8, 128 = rest) and its rect in game meters (x0, y0, w, h). */
  uField: { value: THREE.DataTexture };
  uFieldRect: { value: THREE.Vector4 };
}

export function buildWorld3D(world: WorldData): World3D {
  const group = new THREE.Group();
  const see: SeeUniforms = { uSee: { value: new THREE.Vector4(0, 0, 2.4, 0) } };
  const disposables: Array<{ dispose(): void }> = [];
  const mat = (o: THREE.MeshStandardMaterialParameters, cut = false) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true, ...o });
    disposables.push(m);
    return cut ? seeThrough(m, see) : m;
  };
  const geo = <G extends THREE.BufferGeometry>(g: G): G => {
    disposables.push(g);
    return g;
  };
  const W = world.width;
  const H = world.height;
  const chunkOf = (x: number, y: number) => Math.floor(y / CHUNK) * 64 + Math.floor(x / CHUNK);

  // ---------------------------------------------------------------- ground (one mesh per chunk)
  const groundMat = mat({ vertexColors: true, roughness: 0.95, flatShading: false });
  groundMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGrass;\nvarying vec2 vGrass;\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrass = aGrass;\nvGround = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGrass;\nvarying vec2 vGround;')
      // alpha tags grass ground for the ASCII pass: 0.55 grass, 0.58 tall grass, 1 anything else; borders are ragged
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float gn = fract(sin(dot(floor(vGround * vec2(3.0, 1.8)), vec2(12.9898, 78.233))) * 43758.5453);
        float gg = vGrass.x + (gn - 0.5) * 0.45;
        gl_FragColor.a = gg > 0.5 ? (vGrass.y + (gn - 0.5) * 0.4 > 0.5 ? 0.58 : 0.55) : 1.0;`,
      );
  };
  groundMat.customProgramCacheKey = () => 'ground-grass';
  const waterMat = mat({ vertexColors: true, roughness: 0.12, metalness: 0.4, flatShading: false });
  const col = new THREE.Color();
  // corner data shared by the 4 tiles around it: smooth colour and grass blends (no tile grid)
  const CW = W + 1;
  const cornerCol = new Float32Array(CW * (H + 1) * 3);
  const cornerGrass = new Float32Array(CW * (H + 1) * 2);
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x <= W; x++) {
      let r = 0, g = 0, b = 0, n = 0, gr = 0, tl = 0;
      for (const [tx, ty] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]] as const) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const t = world.tiles[ty * W + tx] as Tile;
        if (t === Tile.Rock || t === Tile.ShallowWater || t === Tile.DeepWater) continue;
        tileColor(t, hash2(tx, ty, world.seed) * 0.6 + hash2(x, y, world.seed + 3) * 0.4, col);
        if (t === Tile.CastleFloor || t === Tile.RuinFloor || t === Tile.Cobble) col.multiplyScalar((tx + ty) % 2 ? 0.92 : 1.08);
        r += col.r;
        g += col.g;
        b += col.b;
        gr += t === Tile.Grass || t === Tile.TallGrass ? 1 : 0;
        tl += t === Tile.TallGrass ? 1 : 0;
        n++;
      }
      const i = y * CW + x;
      if (n) {
        cornerCol.set([r / n, g / n, b / n], i * 3);
        cornerGrass.set([gr / n, tl / n], i * 2);
      }
    }
  }
  for (let cy = 0; cy < H; cy += CHUNK) {
    for (let cx = 0; cx < W; cx += CHUNK) {
      const land: number[] = [];
      const landC: number[] = [];
      const landG: number[] = [];
      const water: number[] = [];
      const waterC: number[] = [];
      for (let y = cy; y < Math.min(H, cy + CHUNK); y++) {
        for (let x = cx; x < Math.min(W, cx + CHUNK); x++) {
          const t = world.tiles[y * W + x] as Tile;
          if (t === Tile.Rock) continue; // covered by a cliff block
          const wet = t === Tile.ShallowWater || t === Tile.DeepWater;
          const h = wet ? (t === Tile.DeepWater ? -0.12 : -0.05) : 0;
          const corner = (ix: number, iy: number) => {
            if (wet) {
              tileColor(t, hash2(ix, iy, world.seed + 3), col);
              water.push(ix, h, iy * ZS);
              waterC.push(col.r, col.g, col.b);
              return;
            }
            const i = iy * CW + ix;
            land.push(ix, h, iy * ZS);
            landC.push(cornerCol[i * 3]!, cornerCol[i * 3 + 1]!, cornerCol[i * 3 + 2]!);
            landG.push(cornerGrass[i * 2]!, cornerGrass[i * 2 + 1]!);
          };
          corner(x, y);
          corner(x, y + 1);
          corner(x + 1, y);
          corner(x + 1, y);
          corner(x, y + 1);
          corner(x + 1, y + 1);
        }
      }
      for (const [P, C, m] of [[land, landC, groundMat], [water, waterC, waterMat]] as const) {
        if (!P.length) continue;
        const g = geo(new THREE.BufferGeometry());
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        if (m === groundMat) g.setAttribute('aGrass', new THREE.Float32BufferAttribute(landG, 2));
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, m);
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
  }

  // ---------------------------------------------------------------- props + rock cliffs
  const B = new Batcher();
  const box = geo(new THREE.BoxGeometry(1, 1, 1));
  const cyl8 = geo(new THREE.CylinderGeometry(1, 1, 1, 8));
  const cylTaper = geo(new THREE.CylinderGeometry(0.7, 1, 1, 6));
  const cone = geo(new THREE.ConeGeometry(1, 1, 7));
  const ico = geo(new THREE.IcosahedronGeometry(1, 0));
  const ico1 = geo(new THREE.IcosahedronGeometry(1, 1));
  const dode = geo(new THREE.DodecahedronGeometry(1, 0));
  const sphere = geo(new THREE.SphereGeometry(1, 8, 6));

  const tex = <T extends THREE.Texture>(t: T): T => {
    disposables.push(t);
    return t;
  };
  const stoneTex = tex(speckle(world.seed + 2, 0.35, 2));
  const leafTex = tex(speckle(world.seed, 0.55, 3));
  const rockMat = mat({ color: 0xffffff, roughness: 0.95, map: stoneTex }, true);
  const stoneMat = mat({ color: 0xffffff, roughness: 0.9, map: stoneTex }, true);
  const barkMat = mat({ color: 0x2a2118 }, true);
  const leafMat = mat({ color: 0xffffff, roughness: 0.85, map: leafTex }, true);
  const pineMat = mat({ color: 0xffffff, roughness: 0.85, map: tex(speckle(world.seed + 1, 0.5, 4)) }, true);
  const bushMat = mat({ color: 0xffffff, map: leafTex });
  const fireMat = mat({ color: 0x331100, emissive: 0xff7a22, emissiveIntensity: 3.2 });
  const emberMat = mat({ color: 0x1a0a04, emissive: 0xff4a10, emissiveIntensity: 1.6 });
  const logMat = mat({ color: 0x24170e });
  const ironMat = mat({ color: 0x1a1a1e, metalness: 0.6, roughness: 0.5 });
  const runeMat = mat({ color: 0x220000, emissive: 0xff2a10, emissiveIntensity: 2.4 });
  const waxMat = mat({ color: 0xcfc6b0, roughness: 0.7 });
  const signMat = mat({ color: 0x221a08, emissive: 0xffc860, emissiveIntensity: 2.2 });

  // cliffs: one block per rock tile, taller deep inside rock masses
  const isRock = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || world.tiles[y * W + x] === Tile.Rock;
  const dungeons = world.regions.filter((r) => r.kind === 'dungeon');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (world.tiles[y * W + x] !== Tile.Rock) continue;
      let inner = 0;
      for (let k = 1; k <= 3; k++) if (isRock(x - k, y) && isRock(x + k, y) && isRock(x, y - k) && isRock(x, y + k)) inner = k;
      const v = hash2(x, y, world.seed + 11);
      const inDungeon = dungeons.some((d) => x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1);
      const h = inDungeon ? 2.3 + v * 0.5 : 1.0 + inner * 0.55 + v * 1.6;
      const g = 0.1 + v * 0.06;
      B.add('rock', box, rockMat, chunkOf(x, y), { x: x + 0.5, y: h / 2 - 0.02, z: (y + 0.5) * ZS, sx: 1.02, sy: h, sz: ZS * 1.02, ry: 0, c: new THREE.Color(g, g * 1.02, g * 1.18) });
    }
  }

  const green = (r: () => number, base: [number, number, number]) => {
    const k = 0.75 + r() * 0.5;
    return new THREE.Color(base[0] * k, base[1] * k * (0.9 + r() * 0.2), base[2] * k);
  };

  /** Canopy colour by the ground under it: frosted on snow, sick and dark in the swamp. */
  const canopy = (p: Prop, r: () => number, base: [number, number, number]) => {
    const t = world.tiles[Math.floor(p.y) * W + Math.floor(p.x)];
    if (t === Tile.Snow) return green(r, [0.36, 0.4, 0.44]);
    if (t === Tile.Mud) return green(r, [0.09, 0.12, 0.07]);
    return green(r, base);
  };
  for (const p of world.props) addProp(p);

  function addProp(p: Prop): void {
    if (FLORA_ON && FLORA_KINDS.has(p.kind)) return; // painted Flare billboards (flora.ts)
    const r = rng(p.v * 0.999 + 0.0005 + (p.id % 97) * 1e-6);
    const cx = p.x;
    const cz = p.y * ZS;
    const ch = chunkOf(p.x, p.y);
    switch (p.kind) {
      case 'tree': {
        const s = p.size;
        const th = 1.3 + s * 0.6;
        B.add('trunk', cylTaper, barkMat, ch, { x: cx, y: th / 2, z: cz, sx: 0.11 * s, sy: th, sz: 0.11 * s, ry: r() * 6 });
        const n = 4 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + r();
          const d = i === 0 ? 0 : s * (0.35 + r() * 0.3);
          const rr = s * (0.55 + r() * 0.3);
          B.add('leaf', ico1, leafMat, ch, {
            x: cx + Math.cos(a) * d, y: th + rr * 0.55 + r() * s * 0.4, z: cz + Math.sin(a) * d, sx: rr, sy: rr * (0.75 + r() * 0.2), sz: rr, ry: r() * 6,
            c: canopy(p, r, [0.13, 0.2, 0.14]),
          });
        }
        break;
      }
      case 'pine': {
        const s = p.size;
        B.add('trunk', cylTaper, barkMat, ch, { x: cx, y: 0.6, z: cz, sx: 0.1 * s, sy: 1.2, sz: 0.1 * s, ry: 0 });
        const c = canopy(p, r, [0.11, 0.19, 0.17]);
        for (let i = 0; i < 3; i++) {
          const w = s * (0.95 - i * 0.24);
          const hh = s * (1.25 - i * 0.18);
          B.add('pine', cone, pineMat, ch, { x: cx, y: 0.9 + i * s * 0.62 + hh / 2, z: cz, sx: w, sy: hh, sz: w, ry: r() * 6, c });
        }
        break;
      }
      case 'bush': {
        const s = p.size;
        for (let i = 0; i < 2; i++) {
          B.add('bush', ico, bushMat, ch, { x: cx + (r() - 0.5) * 0.4 * s, y: 0.22 * s, z: cz + (r() - 0.5) * 0.4 * s, sx: 0.45 * s, sy: 0.38 * s, sz: 0.45 * s, ry: r() * 6, c: green(r, [0.07, 0.12, 0.08]) }, false);
        }
        break;
      }
      case 'rock': {
        const s = p.size;
        const g = 0.07 + r() * 0.04;
        B.add('boulder', dode, stoneMat, ch, { x: cx, y: 0.18 * s, z: cz, sx: 0.55 * s, sy: 0.4 * s, sz: 0.55 * s, ry: r() * 6, rx: r() * 0.4, c: new THREE.Color(g, g, g * 1.12) });
        break;
      }
      case 'deadtree': {
        // bare, crooked trunk with a few broken branches
        const s = p.size;
        const th = 1.6 + s * 0.9;
        const lean = (r() - 0.5) * 0.25;
        B.add('trunk', cylTaper, barkMat, ch, { x: cx, y: th / 2, z: cz, sx: 0.12 * s, sy: th, sz: 0.12 * s, ry: r() * 6, rz: lean });
        for (let i = 0; i < 3 + Math.floor(r() * 2); i++) {
          const a = r() * Math.PI * 2;
          const L = 0.5 + r() * 0.6 * s;
          B.add('trunk', cylTaper, barkMat, ch, { x: cx + Math.cos(a) * L * 0.35, y: th * (0.55 + r() * 0.4), z: cz + Math.sin(a) * L * 0.35, sx: 0.045 * s, sy: L, sz: 0.045 * s, ry: -a, rz: 0.9 + r() * 0.5 }, false);
        }
        break;
      }
      case 'house': {
        // timber house: stone base, plastered walls, a steep dark roof, a lit window
        const s = p.size;
        const ry = (p.v - 0.5) * 0.6;
        const wall = new THREE.Color(0.16 + r() * 0.04, 0.14, 0.11);
        B.add('wall', box, stoneMat, ch, { x: cx, y: 1.1 * s, z: cz, sx: 3.6 * s, sy: 2.2 * s, sz: 2.8 * s * ZS, ry, c: wall });
        B.add('wall', box, stoneMat, ch, { x: cx, y: 2.6 * s, z: cz, sx: 3.0 * s, sy: 1.0 * s, sz: 2.2 * s * ZS, ry, c: new THREE.Color(0.07, 0.045, 0.035) });
        B.add('wall', box, stoneMat, ch, { x: cx, y: 3.3 * s, z: cz, sx: 2.0 * s, sy: 0.6 * s, sz: 1.4 * s * ZS, ry, c: new THREE.Color(0.06, 0.04, 0.03) });
        B.add('flame', box, fireMat, ch, { x: cx + Math.cos(ry) * 0.7 * s, y: 1.3 * s, z: cz + 1.42 * s * ZS, sx: 0.4, sy: 0.4, sz: 0.04, ry: 0 }, false);
        break;
      }
      case 'well': {
        B.add('wall', cyl8, stoneMat, ch, { x: cx, y: 0.4, z: cz, sx: 0.85, sy: 0.8, sz: 0.85, ry: 0, c: new THREE.Color(0.11, 0.11, 0.12) });
        for (const ox of [-0.7, 0.7]) B.add('log', cyl8, logMat, ch, { x: cx + ox, y: 1.2, z: cz, sx: 0.06, sy: 1.4, sz: 0.06, ry: 0 }, false);
        B.add('wall', box, stoneMat, ch, { x: cx, y: 2.0, z: cz, sx: 1.8, sy: 0.25, sz: 1.0, ry: 0, c: new THREE.Color(0.06, 0.04, 0.03) });
        break;
      }
      case 'stall': {
        const ry = (p.v - 0.5) * 0.4;
        B.add('wall', box, stoneMat, ch, { x: cx, y: 0.45, z: cz, sx: 1.4, sy: 0.9, sz: 0.8, ry, c: new THREE.Color(0.14, 0.09, 0.05) });
        const awning = [new THREE.Color(0.35, 0.08, 0.06), new THREE.Color(0.1, 0.14, 0.32), new THREE.Color(0.32, 0.26, 0.08)][Math.floor(p.v * 3)]!;
        B.add('wall', box, stoneMat, ch, { x: cx, y: 1.75, z: cz, sx: 1.6, sy: 0.12, sz: 1.0, ry, rx: 0.25, c: awning }, false);
        for (const ox of [-0.7, 0.7]) B.add('log', cyl8, logMat, ch, { x: cx + ox, y: 1.0, z: cz + 0.4, sx: 0.04, sy: 1.6, sz: 0.04, ry: 0 }, false);
        break;
      }
      case 'tent': {
        // A-frame canvas shelter: two sloped panels on a ridge pole, posts at the ends
        const canvas = new THREE.Color(0.3 + r() * 0.06, 0.23, 0.13);
        const along = false; // ridge pointing away from the camera: both slopes read, lit and shaded
        const T = 0.85;
        const off = 0.575 * Math.cos(T);
        const cyy = 1.15 - 0.575 * Math.sin(T);
        for (const sd of [-1, 1]) {
          if (along) B.add('wall', box, stoneMat, ch, { x: cx, y: cyy, z: cz + sd * off, sx: 2.1, sy: 0.05, sz: 1.15, ry: 0, rx: sd * T, c: canvas });
          else B.add('wall', box, stoneMat, ch, { x: cx + sd * off, y: cyy, z: cz, sx: 1.15, sy: 0.05, sz: 1.9, ry: 0, rz: -sd * T, c: canvas });
          const px = along ? cx + sd * 1.0 : cx;
          const pz = along ? cz : cz + sd * 1.0;
          B.add('log', cyl8, logMat, ch, { x: px, y: 0.6, z: pz, sx: 0.045, sy: 1.25, sz: 0.045, ry: 0 }, false);
        }
        B.add('log', cyl8, logMat, ch, { x: cx, y: 1.17, z: cz, sx: 0.04, sy: 2.2, sz: 0.04, ry: 0, rx: along ? 0 : Math.PI / 2, rz: along ? Math.PI / 2 : 0 }, false);
        // a bedroll under it
        B.add('boulder', box, stoneMat, ch, { x: cx, y: 0.04, z: cz, sx: along ? 1.6 : 0.6, sy: 0.08, sz: along ? 0.6 : 1.6, ry: 0, c: new THREE.Color(0.2, 0.08, 0.06) }, false);
        break;
      }
      case 'stake': {
        const h = 1.4 * p.size;
        B.add('log', cylTaper, logMat, ch, { x: cx, y: h / 2, z: cz, sx: 0.09, sy: h, sz: 0.09, ry: 0, rz: (p.v - 0.5) * 0.3 }, false);
        break;
      }
      case 'grave': {
        const g = 0.09 + r() * 0.04;
        B.add('wall', box, stoneMat, ch, { x: cx, y: 0.4 * p.size, z: cz, sx: 0.5, sy: 0.8 * p.size, sz: 0.14, ry: (r() - 0.5) * 0.3, rz: (r() - 0.5) * 0.25, c: new THREE.Color(g, g, g * 1.1) });
        break;
      }
      case 'bones': {
        for (let i = 0; i < 3; i++) B.add('boulder', cyl8, stoneMat, ch, { x: cx + (r() - 0.5) * 0.8, y: 0.05, z: cz + (r() - 0.5) * 0.8, sx: 0.05, sy: 0.6, sz: 0.05, ry: r() * 6, rz: Math.PI / 2, c: new THREE.Color(0.32, 0.3, 0.26) }, false);
        B.add('boulder', ico, stoneMat, ch, { x: cx, y: 0.14, z: cz, sx: 0.16, sy: 0.14, sz: 0.16, ry: 0, c: new THREE.Color(0.34, 0.32, 0.28) }, false);
        break;
      }
      case 'castleWall': {
        const h = 3.1;
        const g = 0.085 + r() * 0.03;
        const c = new THREE.Color(g, g * 1.02, g * 1.2);
        B.add('wall', box, stoneMat, ch, { x: cx, y: h / 2, z: cz, sx: 1.01, sy: h, sz: ZS * 1.01, ry: 0, c });
        if ((Math.floor(p.x) + Math.floor(p.y)) % 2 === 0) B.add('wall', box, stoneMat, ch, { x: cx, y: h + 0.25, z: cz, sx: 0.55, sy: 0.5, sz: 0.55 * ZS, ry: 0, c });
        break;
      }
      case 'tower': {
        const rad = p.size * 0.78;
        const h = 5.2;
        const g = 0.08 + r() * 0.02;
        const c = new THREE.Color(g, g * 1.02, g * 1.2);
        B.add('tower', cyl8, stoneMat, ch, { x: cx, y: h / 2, z: cz, sx: rad, sy: h, sz: rad, ry: 0, c });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          B.add('wall', box, stoneMat, ch, { x: cx + Math.cos(a) * rad * 0.88, y: h + 0.3, z: cz + Math.sin(a) * rad * 0.88, sx: 0.5, sy: 0.6, sz: 0.5, ry: -a, c });
        }
        break;
      }
      case 'ruinWall': {
        const h = 0.6 + r() * 2.0;
        const g = 0.08 + r() * 0.03;
        const c = new THREE.Color(g, g * 1.03, g * 1.15);
        B.add('wall', box, stoneMat, ch, { x: cx, y: h / 2, z: cz, sx: 0.98, sy: h, sz: ZS * 0.98, ry: 0, c });
        if (r() < 0.5) B.add('wall', box, stoneMat, ch, { x: cx + (r() - 0.5) * 0.4, y: h + 0.2, z: cz, sx: 0.45, sy: 0.4, sz: 0.5, ry: r() * 0.4, c });
        break;
      }
      case 'pillar': {
        const h = 1.0 + r() * 2.2;
        const g = 0.09 + r() * 0.03;
        const c = new THREE.Color(g, g, g * 1.15);
        B.add('pillar', cyl8, stoneMat, ch, { x: cx, y: h / 2, z: cz, sx: 0.3, sy: h, sz: 0.3, ry: r(), c });
        B.add('wall', box, stoneMat, ch, { x: cx, y: 0.12, z: cz, sx: 0.8, sy: 0.24, sz: 0.8, ry: 0, c });
        break;
      }
      case 'chest': {
        // tiers: 0 wood, 1 iron-bound, 2 gilded; facing the camera so the lid reads
        const tier = Math.round(p.size);
        const wood = tier === 2 ? new THREE.Color(0.55, 0.38, 0.08) : new THREE.Color(0.2, 0.11, 0.05);
        const band = tier === 0 ? new THREE.Color(0.12, 0.08, 0.04) : tier === 1 ? new THREE.Color(0.3, 0.3, 0.32) : new THREE.Color(0.95, 0.72, 0.2);
        B.add('wall', box, stoneMat, ch, { x: cx, y: 0.24, z: cz, sx: 0.9, sy: 0.48, sz: 0.55, ry: 0, c: wood });
        B.add('wall', box, stoneMat, ch, { x: cx, y: 0.55, z: cz, sx: 0.92, sy: 0.16, sz: 0.57, ry: 0, c: wood });
        for (const ox of [-0.3, 0.3]) B.add('wall', box, stoneMat, ch, { x: cx + ox, y: 0.33, z: cz, sx: 0.08, sy: 0.66, sz: 0.6, ry: 0, c: band }, false);
        B.add('wall', box, stoneMat, ch, { x: cx, y: 0.42, z: cz + 0.29, sx: 0.12, sy: 0.14, sz: 0.04, ry: 0, c: band }, false);
        break;
      }
      case 'ritual': {
        // summoning circle: a glowing ring and pentagram burnt into the ground, candles at the points, an altar
        const R = p.size;
        const at = (a: number, rr: number) => ({ x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr * ZS });
        const seg = (a: { x: number; z: number }, b: { x: number; z: number }, w: number) => {
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          B.add('rune', box, runeMat, ch, { x: (a.x + b.x) / 2, y: 0.025, z: (a.z + b.z) / 2, sx: Math.hypot(dx, dz) + w * 0.5, sy: 0.03, sz: w, ry: Math.atan2(-dz, dx) }, false);
        };
        const N = 36;
        for (let i = 0; i < N; i++) seg(at((i / N) * Math.PI * 2, R), at(((i + 1) / N) * Math.PI * 2, R), 0.09);
        for (let i = 0; i < N; i++) seg(at((i / N) * Math.PI * 2, R * 0.86), at(((i + 1) / N) * Math.PI * 2, R * 0.86), 0.05);
        const star = (i: number) => at(-Math.PI / 2 + (i * Math.PI * 2) / 5, R * 0.86);
        for (let i = 0; i < 5; i++) seg(star(i), star(i + 2), 0.08);
        for (let i = 0; i < 5; i++) {
          const c = at(-Math.PI / 2 + (i * Math.PI * 2) / 5, R + 0.35);
          const h = 0.25 + r() * 0.2;
          B.add('wax', cyl8, waxMat, ch, { x: c.x, y: h / 2, z: c.z, sx: 0.07, sy: h, sz: 0.07, ry: 0 }, false);
          B.add('flame', sphere, fireMat, ch, { x: c.x, y: h + 0.07, z: c.z, sx: 0.045, sy: 0.09, sz: 0.045, ry: 0 }, false);
        }
        B.add('wall', box, stoneMat, ch, { x: cx, y: 0.3, z: cz, sx: 0.9, sy: 0.6, sz: 0.55, ry: 0, c: new THREE.Color(0.06, 0.05, 0.05) });
        B.add('boulder', ico, stoneMat, ch, { x: cx, y: 0.7, z: cz, sx: 0.13, sy: 0.12, sz: 0.14, ry: 0, c: new THREE.Color(0.4, 0.37, 0.32) }, false);
        B.add('rune', sphere, runeMat, ch, { x: cx, y: 0.62, z: cz + 0.05, sx: 0.3, sy: 0.02, sz: 0.2, ry: 0 }, false);
        break;
      }
      case 'torch': {
        B.add('pole', cyl8, ironMat, ch, { x: cx, y: 0.7, z: cz, sx: 0.045, sy: 1.4, sz: 0.045, ry: 0 }, false);
        B.add('bowl', cylTaper, ironMat, ch, { x: cx, y: 1.43, z: cz, sx: 0.13, sy: 0.12, sz: 0.13, ry: 0 }, false);
        B.add('flame', sphere, fireMat, ch, { x: cx, y: 1.58, z: cz, sx: 0.09, sy: 0.18, sz: 0.09, ry: 0 }, false);
        break;
      }
      case 'bonfire': {
        // the summon sign beside it: a small golden circle of runes burnt into the ground
        {
          const sg = summonSignOf(p);
          const sx = sg.x;
          const sz = sg.y * ZS;
          const R = 0.55;
          const N = 18;
          for (let i = 0; i < N; i++) {
            const a0 = (i / N) * Math.PI * 2;
            const a1 = ((i + 1) / N) * Math.PI * 2;
            const ax = sx + Math.cos(a0) * R, az = sz + Math.sin(a0) * R * ZS;
            const bx = sx + Math.cos(a1) * R, bz = sz + Math.sin(a1) * R * ZS;
            B.add('sign', box, signMat, ch, { x: (ax + bx) / 2, y: 0.03, z: (az + bz) / 2, sx: Math.hypot(bx - ax, bz - az) + 0.02, sy: 0.02, sz: 0.05, ry: Math.atan2(-(bz - az), bx - ax) }, false);
          }
          // a hand-drawn glyph inside: three strokes like a stylised figure
          for (const [x0, z0, x1, z1] of [[0, -0.3, 0, 0.25], [-0.25, -0.05, 0.25, -0.05], [-0.18, 0.3, 0.18, 0.3]] as const) {
            const ax = sx + x0, az = sz + z0 * ZS, bx = sx + x1, bz = sz + z1 * ZS;
            B.add('sign', box, signMat, ch, { x: (ax + bx) / 2, y: 0.03, z: (az + bz) / 2, sx: Math.hypot(bx - ax, bz - az) + 0.03, sy: 0.02, sz: 0.045, ry: Math.atan2(-(bz - az), bx - ax) }, false);
          }
        }
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI + 0.3;
          B.add('log', cyl8, logMat, ch, { x: cx, y: 0.12, z: cz, sx: 0.07, sy: 0.9, sz: 0.07, ry: a, rz: Math.PI / 2 - 0.25, rx: 0 }, false);
        }
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          B.add('boulder', dode, stoneMat, ch, { x: cx + Math.cos(a) * 0.62, y: 0.06, z: cz + Math.sin(a) * 0.62, sx: 0.14, sy: 0.1, sz: 0.14, ry: a, c: new THREE.Color(0.07, 0.07, 0.075) }, false);
        }
        B.add('ember', sphere, emberMat, ch, { x: cx, y: 0.06, z: cz, sx: 0.42, sy: 0.08, sz: 0.42, ry: 0 }, false);
        B.add('flame', sphere, fireMat, ch, { x: cx, y: 0.45, z: cz, sx: 0.18, sy: 0.42, sz: 0.18, ry: 0 }, false);
        break;
      }
    }
  }
  B.build(group);
  const flora = buildFlora(world, see, disposables);
  if (flora) group.add(flora.mesh);
  const grass = buildGrass(world, disposables);
  group.add(grass.mesh);

  return {
    group,
    see,
    fire: fireMat,
    grass: grass.uniforms,
    flora: flora?.uniforms ?? null,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Blade clumps per square meter of the wrapping patch, and blades per clump. */
const CLUMPS = 2.8;
const PER_CLUMP = 8;
const PATCH = 80;

/**
 * Grass as real blades (tufts of tapered strips) in a patch that wraps around the camera.
 * Each blade bends with the wind and with the spring field of game/grass.ts, so actors walking
 * through part it and blows make it wobble back. Blade pixels write their on-screen direction
 * into alpha (< 0.5): the ASCII pass then draws each cell as a stroke along the blades.
 */
function buildGrass(world: WorldData, disposables: Array<{ dispose(): void }>): { mesh: THREE.Mesh; uniforms: GrassUniforms } {
  const g = new THREE.InstancedBufferGeometry();
  // 3-segment blade, x in [-0.5, 0.5], y in [0, 1]
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.38, 0.4, 0, 0.38, 0.4, 0, -0.2, 0.75, 0, 0.2, 0.75, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  const clumps = Math.floor(PATCH * PATCH * CLUMPS);
  const n = clumps * PER_CLUMP;
  const a = new Float32Array(n * 4);
  let s = 98765;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  let k = 0;
  for (let c = 0; c < clumps; c++) {
    const cx = rnd() * PATCH;
    const cy = rnd() * PATCH;
    const fan = rnd() * Math.PI * 2;
    for (let i = 0; i < PER_CLUMP; i++) {
      const r = Math.sqrt(rnd()) * 0.22;
      const t = rnd() * Math.PI * 2;
      a[k++] = cx + Math.cos(t) * r;
      a[k++] = cy + Math.sin(t) * r * 0.8;
      a[k++] = rnd(); // height / brightness
      a[k++] = (fan + (i / PER_CLUMP - 0.5) * 2.2 + (rnd() - 0.5) * 0.4) / (Math.PI * 2); // lean direction (turns)
    }
  }
  g.setAttribute('aBlade', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = n;
  disposables.push(g);

  const tiles = new THREE.DataTexture(world.tiles.slice(), world.width, world.height, THREE.RedFormat, THREE.UnsignedByteType);
  tiles.magFilter = THREE.NearestFilter;
  tiles.minFilter = THREE.NearestFilter;
  tiles.needsUpdate = true;
  const field = new THREE.DataTexture(new Uint8Array([128, 128]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType);
  field.magFilter = THREE.LinearFilter;
  field.minFilter = THREE.LinearFilter;
  field.needsUpdate = true;
  disposables.push(tiles, field);

  const uniforms: GrassUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.5, 0) },
    uCam: { value: new THREE.Vector2() },
    uField: { value: field },
    uFieldRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, { uTiles: { value: tiles }, uWorld: { value: new THREE.Vector2(world.width, world.height) } });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aBlade;
        uniform float uTime;
        uniform vec2 uWind;
        uniform vec2 uCam;
        uniform sampler2D uField;
        uniform vec4 uFieldRect;
        uniform sampler2D uTiles;
        uniform vec2 uWorld;
        varying float vTip;
        varying float vAng;
        varying vec3 vBladeCol;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = vec3(0.0, 0.8, 0.6);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(1.0, 0.0, 0.0);
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec2 gp = aBlade.xy + ${PATCH.toFixed(1)} * floor((uCam - aBlade.xy) / ${PATCH.toFixed(1)} + 0.5);
        float tile = texture2D(uTiles, (floor(gp) + 0.5) / uWorld).r * 255.0;
        float h = 0.0;
        if (tile < 0.5) h = 0.38 + aBlade.z * 0.42;
        else if (tile < 1.5) h = 0.8 + aBlade.z * 0.75;
        else if (tile < 2.5 && aBlade.z > 0.7) h = 0.2 + aBlade.z * 0.15;
        if (gp.x < 0.5 || gp.y < 0.5 || gp.x > uWorld.x - 0.5 || gp.y > uWorld.y - 0.5) h = 0.0;
        float y = position.y;
        vTip = y;
        // lean: the tuft's own fan + wind gusts travelling across the field + spring physics
        float ang = aBlade.w * 6.2831853;
        vec2 bend = vec2(cos(ang), sin(ang)) * 0.45;
        float gust = sin(uTime * 1.6 + gp.x * 0.32 + gp.y * 0.18) * 0.6 + sin(uTime * 2.9 + gp.x * 0.8 - gp.y * 0.3) * 0.25;
        bend += uWind * (0.5 + gust);
        vec2 fuv = (gp - uFieldRect.xy) / max(uFieldRect.zw, vec2(1e-3));
        if (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) bend += (texture2D(uField, fuv).rg - 0.5) * 2.0 * 1.6;
        float bl = length(bend);
        if (bl > 1.5) { bend *= 1.5 / bl; bl = 1.5; }
        // a blade that bends lies lower (keeps its length)
        float droop = 1.0 - 0.38 * bl * y;
        float curve = y * y;
        float w = 0.055 * (0.75 + aBlade.z * 0.5) * (h > 0.0 ? 1.0 : 0.0);
        vec3 side = normalize(vec3(-bend.y + 0.001, 0.0, bend.x * ${ZS.toFixed(5)} + 0.3));
        vec3 transformed = vec3(gp.x, 0.0, gp.y * ${ZS.toFixed(5)});
        transformed += side * position.x * w;
        transformed.y += y * h * droop;
        transformed.x += bend.x * h * curve * 0.75;
        transformed.z += bend.y * h * curve * 0.75 * ${ZS.toFixed(5)};
        // on-screen direction of the blade's upper half (encoded for the ASCII pass)
        vec3 tipOff = vec3(bend.x * h * 0.55, h * (1.0 - 0.3 * bl), bend.y * h * 0.55 * ${ZS.toFixed(5)});
        vec2 sd = (modelViewMatrix * vec4(tipOff, 0.0)).xy;
        vAng = fract(atan(sd.y, sd.x) / PI + 1.0);
        float v = fract(sin(dot(floor(gp * 0.7), vec2(12.9898, 78.233))) * 43758.5453);
        vBladeCol = tile < 1.5 ? vec3(0.17, 0.27, 0.16) : vec3(0.22, 0.2, 0.14);
        vBladeCol *= 0.6 + 0.55 * mix(aBlade.z, v, 0.4);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTip;\nvarying float vAng;\nvarying vec3 vBladeCol;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vBladeCol * (0.25 + 1.15 * vTip), opacity );')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vBladeCol * vTip * vTip * 0.12;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a = 0.04 + 0.42 * vAng;');
  };
  m.customProgramCacheKey = () => 'grass-blades-v2';
  disposables.push(m);
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return { mesh, uniforms };
}
