import * as THREE from 'three';

/**
 * Procedural, articulated 3D models for actors (Dark Eden / Diablo II look: dark plate,
 * heavy cloth, glowing eyes). Every model faces +Z, stands on y = 0, and exposes its joints
 * as groups so the animation layer can pose them from the authoritative frame data.
 *
 * Joint convention (matches render/rig.ts): limbs hang along -Y from their joint; a joint's
 * rotation.x = -angle swings the limb forward by `angle` (0 = straight down, π/2 = forward).
 */

type Mats = ReturnType<typeof makeMats>;

function rnd(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const texCache = new Map<string, THREE.Texture>();
function noiseTex(base: string, amount: number, seed: number, size = 128, streak = false, rep = 1): THREE.Texture {
  const key = `${base}|${amount}|${seed}|${size}|${streak}|${rep}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = rnd(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < (size * size) / 6; i++) {
    const v = (r() - 0.5) * amount;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    if (streak) g.fillRect(r() * size, r() * size, 1, 3 + r() * 6);
    else g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

function spiderTex(): THREE.Texture {
  const hit = texCache.get('spider');
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rnd(31);
  g.fillStyle = '#2a1c1a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${(80 + r() * 60) | 0},${(60 + r() * 30) | 0},50,${r() * 0.5})`;
    g.fillRect(r() * 256, r() * 256, 1, 4);
  }
  // pale skull mark and a blood-red hourglass on the abdomen
  g.strokeStyle = '#d8c8a0';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(128, 96, 40, Math.PI * 1.1, Math.PI * 1.9);
  g.stroke();
  g.fillStyle = '#0a0505';
  g.beginPath();
  g.ellipse(110, 104, 12, 10, 0, 0, 7);
  g.ellipse(146, 104, 12, 10, 0, 0, 7);
  g.fill();
  g.fillStyle = '#c01808';
  g.beginPath();
  g.moveTo(116, 150);
  g.lineTo(140, 150);
  g.lineTo(128, 170);
  g.lineTo(140, 192);
  g.lineTo(116, 192);
  g.lineTo(128, 170);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set('spider', t);
  return t;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const DS = THREE.DoubleSide;

/** Fresh material set for one actor (textures are shared): lets each actor flash/tint on its own. */
export function makeMats() {
  return {
    steel: std({ color: 0x9aa0ab, metalness: 0.85, roughness: 0.32, map: noiseTex('#bfc3cc', 0.25, 3) }),
    dsteel: std({ color: 0x50545e, metalness: 0.8, roughness: 0.4 }),
    blade: std({ color: 0xdfe6f0, metalness: 1, roughness: 0.15 }),
    gold: std({ color: 0xc89a3a, metalness: 0.95, roughness: 0.28 }),
    red: std({ color: 0x7a0b10, roughness: 0.85, map: noiseTex('#a01818', 0.3, 5, 128, true), side: DS }),
    leather: std({ color: 0x4a2e18, roughness: 0.8 }),
    navy: std({ color: 0x1a2a5a, roughness: 0.5, metalness: 0.4 }),
    violet: std({ color: 0x3a1652, roughness: 0.88, map: noiseTex('#5a2a7a', 0.25, 7, 128, true), side: DS }),
    dviolet: std({ color: 0x1c0a28, roughness: 0.9, side: DS }),
    white: std({ color: 0xe8e2d4, roughness: 0.75, map: noiseTex('#f0ebe0', 0.18, 9, 128, true), side: DS }),
    sky: std({ color: 0x2f5a9a, roughness: 0.7, side: DS }),
    mantle: std({ color: 0x7d9ac8, roughness: 0.8, side: DS }),
    skin: std({ color: 0xd9a98a, roughness: 0.6 }),
    pale: std({ color: 0xcfc8d4, roughness: 0.5 }),
    hands: std({ color: 0xb8a0a8, roughness: 0.6 }),
    black: std({ color: 0x111015, roughness: 0.6, side: DS }),
    coat: std({ color: 0x1a0f12, roughness: 0.55, metalness: 0.1, map: noiseTex('#2a1a1e', 0.2, 11, 128, true), side: DS }),
    blood: std({ color: 0x6a0610, roughness: 0.5, side: DS }),
    bone: std({ color: 0xcfc4a6, roughness: 0.75, map: noiseTex('#d8ccb0', 0.3, 13) }),
    rust: std({ color: 0x6a4128, metalness: 0.5, roughness: 0.75, map: noiseTex('#7a4a2a', 0.45, 15) }),
    rag: std({ color: 0x3a2c1c, roughness: 1, side: DS }),
    wood: std({ color: 0x3c2a1a, roughness: 0.95, map: noiseTex('#4a3220', 0.35, 17, 128, true) }),
    fur: std({ color: 0x6a645c, roughness: 1, map: noiseTex('#7a7268', 0.5, 19, 128, true, 2) }),
    chitin: std({ color: 0x2a1c1a, roughness: 0.35, metalness: 0.2, map: noiseTex('#3a2824', 0.5, 21, 256, false, 2) }),
    abdomen: std({ map: spiderTex(), roughness: 0.35, metalness: 0.15 }),
    eyeR: std({ color: 0xff2a10, emissive: 0xff2a10, emissiveIntensity: 4 }),
    eyeB: std({ color: 0x7ad0ff, emissive: 0x7ad0ff, emissiveIntensity: 4 }),
    eyeA: std({ color: 0xffb030, emissive: 0xffa020, emissiveIntensity: 3 }),
    ember: std({ color: 0xff6a10, emissive: 0xff4a00, emissiveIntensity: 3 }),
    gem: std({ color: 0x8ad8ff, emissive: 0x5ab8ff, emissiveIntensity: 3 }),
    sun: std({ color: 0xffe08a, emissive: 0xffc040, emissiveIntensity: 3 }),
    forest: std({ color: 0x35532a, roughness: 0.9, map: noiseTex('#4a6a38', 0.3, 23, 128, true), side: DS }),
    dforest: std({ color: 0x1e2c18, roughness: 0.95, side: DS }),
    tan: std({ color: 0x8a5a34, roughness: 0.8, map: noiseTex('#9a6a40', 0.3, 27, 128) }),
    dleather: std({ color: 0x2a2026, roughness: 0.7, map: noiseTex('#3a2c34', 0.25, 29, 128) }),
    plum: std({ color: 0x3a2440, roughness: 0.85, side: DS }),
    bronzed: std({ color: 0xb07850, roughness: 0.55 }),
    hair: std({ color: 0x6a3418, roughness: 0.9 }),
    iron: std({ color: 0x3e3c3a, metalness: 0.75, roughness: 0.5, map: noiseTex('#5a5652', 0.35, 33, 128) }),
    voidc: std({ color: 0x15111c, roughness: 0.8, map: noiseTex('#221a2c', 0.25, 35, 128, true), side: DS }),
    fel: std({ color: 0x5aff7a, emissive: 0x30ff60, emissiveIntensity: 3 }),
    tome: std({ color: 0x4a1830, roughness: 0.6 }),
    demon: std({ color: 0x8a2416, roughness: 0.55, map: noiseTex('#a8341e', 0.35, 37, 128) }),
    wing: std({ color: 0x4a1410, roughness: 0.8, side: DS }),
    abyss: std({ color: 0x1a1622, metalness: 0.4, roughness: 0.45, map: noiseTex('#2a2234', 0.35, 39, 128) }),
    flame: std({ color: 0xffa040, emissive: 0xff6010, emissiveIntensity: 3.5 }),
  };
}

// ---------------------------------------------------------------- helpers

interface MeshOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  s?: [number, number, number];
}
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, o: MeshOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  if (o.s) m.scale.set(...o.s);
  return m;
}
const cyl = (rt: number, rb: number, h: number, seg = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const sph = (r: number, w = 16, h = 12, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, w, h, ps, pl, ts, tl);
const lathe = (pts: Array<[number, number]>, seg = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/** Limb hanging from its joint: a tapered cylinder from y = 0 down to y = -len. */
function hang(len: number, rTop: number, rBot: number, mat: THREE.Material, open = false): THREE.Mesh {
  return mesh(cyl(rBot, rTop, len, 12, open), mat, 0, -len / 2, 0);
}

/** Segment between two points (static parts). */
function limb(a: [number, number, number], b: [number, number, number], r1: number, r2: number, mat: THREE.Material): THREE.Mesh {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const m = new THREE.Mesh(cyl(r2, r1, d.length(), 10), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/**
 * Cloth panel whose origin is its top edge; it hangs along -Y with folds that flare out
 * toward the hem. `back` = +1 bulges toward -Z (capes), -1 toward +Z (tabards).
 */
function cloth(w: number, h: number, mat: THREE.Material, fold = 0.06, flare = 0.2, back = 1): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h, 10, 14);
  g.translate(0, -h / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const t = -p.getY(i) / h;
    p.setX(i, x * (1 + flare * t));
    p.setZ(i, Math.sin(x * 28) * fold * t - back * t * t * 0.15);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Enables shadows, returns the materials in use and frees the unused ones of the set. */
function finish(root: THREE.Object3D, mats: Mats): THREE.MeshStandardMaterial[] {
  const used = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = false;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) used.add(mat as THREE.MeshStandardMaterial);
  });
  for (const mat of Object.values(mats)) if (!used.has(mat)) mat.dispose();
  return [...used];
}

// ---------------------------------------------------------------- humanoids

export type HumanKind = 'vanguard' | 'arcanist' | 'healer' | 'ranger' | 'rogue' | 'barbarian' | 'warlock' | 'vampire' | 'skeleton' | 'bonegiant' | 'imp' | 'voidguard';

export interface HumanRig {
  type: 'human';
  kind: HumanKind;
  root: THREE.Group;
  /** Whole-body tilt around the feet (death fall). */
  tilt: THREE.Group;
  pelvis: THREE.Group;
  pelvisY: number;
  torso: THREE.Group;
  head: THREE.Group;
  /** [weapon side, off-hand side] */
  shoulder: [THREE.Group, THREE.Group];
  elbow: [THREE.Group, THREE.Group];
  hand: [THREE.Group, THREE.Group];
  /** Weapon pivot in the weapon hand (rotation.x = -wrist). */
  weapon: THREE.Group;
  hip: [THREE.Group, THREE.Group];
  knee: [THREE.Group, THREE.Group];
  cape: THREE.Group | null;
  skirt: THREE.Group | null;
  shield: THREE.Group | null;
  orb: THREE.Mesh | null;
  /** Item in the off hand (bow, dagger, grimoire). The bow turns upright while aiming. */
  offhand: THREE.Group | null;
  /** Materials actually used by the meshes (tinted per frame, disposed with the rig). */
  materials: THREE.MeshStandardMaterial[];
}

const ARM_X = 0.3;
const HIP_X = 0.11;

function skeletonFrame(kind: HumanKind, pelvisY = 0.92) {
  const root = new THREE.Group();
  const tilt = group(root);
  const pelvis = group(tilt, 0, pelvisY, 0);
  const torso = group(pelvis, 0, 0.04, 0);
  const head = group(torso, 0, 0.66, 0);
  // right hand (weapon) is -X when facing +Z
  const shoulder: [THREE.Group, THREE.Group] = [group(torso, -ARM_X, 0.5, 0), group(torso, ARM_X, 0.5, 0)];
  const elbow: [THREE.Group, THREE.Group] = [group(shoulder[0], 0, -0.29, 0), group(shoulder[1], 0, -0.29, 0)];
  const hand: [THREE.Group, THREE.Group] = [group(elbow[0], 0, -0.27, 0), group(elbow[1], 0, -0.27, 0)];
  const weapon = group(hand[0]);
  const hip: [THREE.Group, THREE.Group] = [group(pelvis, -HIP_X, 0, 0), group(pelvis, HIP_X, 0, 0)];
  const knee: [THREE.Group, THREE.Group] = [group(hip[0], 0, -0.44, 0), group(hip[1], 0, -0.44, 0)];
  const rig: HumanRig = {
    type: 'human', kind, root, tilt, pelvis, pelvisY, torso, head, shoulder, elbow, hand, weapon, hip, knee,
    cape: null, skirt: null, shield: null, orb: null, offhand: null, materials: [],
  };
  return rig;
}

function addCape(rig: HumanRig, w: number, h: number, mat: THREE.Material, z = -0.22, y = 0.52, flare = 0.45): void {
  const cape = group(rig.torso, 0, y, z);
  const c = cloth(w, h, mat, 0.07, flare, 1);
  cape.add(c);
  rig.cape = cape;
}

function sword(rig: HumanRig, m: Mats, rusty: boolean): void {
  const w = rig.weapon;
  const bl = rusty ? m.rust : m.blade;
  w.add(mesh(new THREE.BoxGeometry(rusty ? 0.07 : 0.06, 0.95, 0.012), bl, 0, -0.56, 0));
  w.add(mesh(new THREE.ConeGeometry(0.035, 0.12, 4), bl, 0, -1.08, 0, { rx: Math.PI, ry: Math.PI / 4, s: [1, 1, 0.25] }));
  w.add(mesh(new THREE.BoxGeometry(rusty ? 0.22 : 0.3, 0.04, 0.05), rusty ? m.rust : m.gold, 0, -0.06, 0));
  w.add(mesh(cyl(0.022, 0.022, 0.16), m.leather, 0, 0.03, 0));
  w.add(mesh(sph(0.035, 10, 8), rusty ? m.rust : m.gold, 0, 0.13, 0));
}

function buildVanguard(m: Mats): HumanRig {
  const r = skeletonFrame('vanguard');
  for (let i = 0; i < 2; i++) {
    const hip = r.hip[i]!;
    const knee = r.knee[i]!;
    hip.add(hang(0.44, 0.09, 0.075, m.steel));
    knee.add(mesh(sph(0.075, 12, 8), m.steel));
    knee.add(hang(0.42, 0.07, 0.055, m.steel));
    knee.add(mesh(new THREE.BoxGeometry(0.13, 0.1, 0.26), m.dsteel, 0, -0.43, 0.05));
  }
  // faulds + tabard
  r.pelvis.add(mesh(cyl(0.22, 0.27, 0.26, 18), m.steel, 0, -0.08, 0, { s: [1, 1, 0.82] }));
  const tab = cloth(0.24, 0.62, m.red, 0.02, 0.15, -1);
  tab.position.set(0, 0.02, 0.24);
  r.pelvis.add(tab);
  // breastplate
  r.torso.add(mesh(lathe([[0.17, 0], [0.21, 0.12], [0.26, 0.32], [0.25, 0.44], [0.14, 0.54], [0.08, 0.56]]), m.steel, 0, 0, 0, { s: [1, 1, 0.78] }));
  r.torso.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24), m.gold, 0, 0.02, 0, { rx: Math.PI / 2, s: [1, 0.8, 1] }));
  const t2 = cloth(0.16, 0.34, m.red, 0.01, 0, -1);
  t2.position.set(0, 0.42, 0.205);
  r.torso.add(t2);
  r.torso.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), m.gold, 0, 0.26, 0.215));
  for (const s of [-1, 1]) {
    r.torso.add(mesh(sph(0.15, 16, 10), m.steel, s * ARM_X, 0.52, 0, { s: [1, 0.75, 1.1] }));
    r.torso.add(mesh(sph(0.13, 14, 8), m.steel, s * (ARM_X + 0.03), 0.45, 0, { s: [1, 0.7, 1.05] }));
    r.torso.add(mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 20), m.gold, s * ARM_X, 0.48, 0, { rx: Math.PI / 2 }));
  }
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.065, 0.06, m.steel));
    r.elbow[i]!.add(mesh(sph(0.06, 10, 8), m.dsteel));
    r.elbow[i]!.add(hang(0.27, 0.06, 0.055, m.steel));
    r.hand[i]!.add(mesh(sph(0.065, 10, 8), m.dsteel));
  }
  // helm with visor slit, gold cross and a red plume
  r.head.add(mesh(cyl(0.12, 0.13, 0.24, 18), m.steel, 0, 0, 0));
  r.head.add(mesh(sph(0.12, 18, 10), m.steel, 0, 0.12, 0, { s: [1, 0.8, 1] }));
  r.head.add(mesh(new THREE.BoxGeometry(0.2, 0.025, 0.05), m.black, 0, 0.02, 0.11));
  r.head.add(mesh(new THREE.BoxGeometry(0.02, 0.24, 0.03), m.gold, 0, 0.04, 0.125));
  r.head.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(0, 0.32, -0.1), new THREE.Vector3(0, 0.24, -0.32), new THREE.Vector3(0, 0, -0.42)]), 16, 0.045, 8), m.red));
  addCape(r, 0.62, 1.25, m.red);
  sword(r, m, false);
  // kite shield, carried by the torso so it can swing to the front when guarding
  const sh = new THREE.Shape();
  sh.moveTo(-0.22, 0.28);
  sh.lineTo(0.22, 0.28);
  sh.lineTo(0.22, 0.0);
  sh.quadraticCurveTo(0.2, -0.24, 0, -0.36);
  sh.quadraticCurveTo(-0.2, -0.24, -0.22, 0);
  sh.closePath();
  const shield = group(r.torso);
  shield.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), [m.navy, m.gold]));
  shield.add(mesh(new THREE.BoxGeometry(0.05, 0.56, 0.02), m.gold, 0, -0.03, 0.07));
  shield.add(mesh(new THREE.BoxGeometry(0.4, 0.05, 0.02), m.gold, 0, 0.08, 0.07));
  r.shield = shield;
  return r;
}

function staff(r: HumanRig, m: Mats, healer: boolean): void {
  // built along +Y, then flipped so the focus sits beyond the hand along -Y (weapon convention)
  const st = group(r.weapon, 0, 0.55, 0);
  st.rotation.x = Math.PI;
  if (healer) {
    st.add(mesh(cyl(0.022, 0.026, 1.85), m.gold, 0, 0.92, 0));
    st.add(mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 28), m.gold, 0, 1.92, 0));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      st.add(mesh(new THREE.ConeGeometry(0.018, 0.1, 6), m.gold, Math.cos(a) * 0.19, 1.92 + Math.sin(a) * 0.19, 0, { rz: a - Math.PI / 2 }));
    }
    r.orb = mesh(sph(0.06, 14, 10), m.sun, 0, 1.92, 0);
  } else {
    const curve = new THREE.CatmullRomCurve3([0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.75].map((y, i) => new THREE.Vector3(Math.sin(i * 1.7) * 0.025, y, Math.cos(i * 1.3) * 0.02)));
    st.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.028, 8), m.wood));
    for (const s of [-1, 1]) st.add(mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12, Math.PI), m.wood, s * 0.03, 1.84, 0, { rz: s * 0.6 }));
    r.orb = mesh(new THREE.OctahedronGeometry(0.09), m.gem, 0, 1.9, 0);
  }
  st.add(r.orb);
}

function buildRobed(kind: 'arcanist' | 'healer', m: Mats): HumanRig {
  const healer = kind === 'healer';
  const R = healer ? m.white : m.violet;
  const r = skeletonFrame(kind);
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.08, 0.06, m.black));
    r.knee[i]!.add(hang(0.4, 0.06, 0.05, m.black));
    r.knee[i]!.add(mesh(sph(0.075, 10, 8), healer ? m.leather : m.black, 0, -0.42, 0.04, { s: [1, 0.7, 1.5] }));
  }
  // robe skirt: hangs from the waist and sways with the stride
  const skirt = group(r.pelvis, 0, 0.02, 0);
  skirt.add(mesh(lathe([[0.36, -0.92], [0.33, -0.84], [0.27, -0.42], [0.21, 0]]), R, 0, 0, 0, { s: [1, 1, 0.85] }));
  skirt.add(mesh(new THREE.TorusGeometry(0.33, 0.02, 6, 28), healer ? m.gold : m.gem, 0, -0.86, 0, { rx: Math.PI / 2, s: [1, 0.85, 1] }));
  const pan = cloth(0.2, 0.9, healer ? m.sky : m.dviolet, 0.01, 0.6, -0.4);
  pan.position.set(0, 0.0, 0.25);
  pan.rotation.x = -0.18;
  skirt.add(pan);
  r.skirt = skirt;
  r.torso.add(mesh(lathe([[0.21, -0.04], [0.19, 0.18], [0.25, 0.4], [0.24, 0.52], [0.1, 0.6]]), R, 0, 0, 0, { s: [1, 1, 0.85] }));
  r.torso.add(mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 24), healer ? m.gold : m.dsteel, 0, 0.04, 0, { rx: Math.PI / 2, s: [1, 0.85, 1] }));
  for (const s of [-1, 1]) r.torso.add(mesh(sph(0.12, 14, 10), R, s * 0.27, 0.48, 0, { s: [1, 0.8, 1] }));
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.08, 0.09, R, true));
    r.elbow[i]!.add(hang(0.27, 0.08, 0.15, R, true));
    r.hand[i]!.add(mesh(sph(0.05, 10, 8), healer ? m.skin : m.hands));
  }
  if (healer) {
    r.head.add(mesh(sph(0.115, 18, 14), m.skin, 0, 0.02, 0.02));
    r.head.add(mesh(lathe([[0.2, 0], [0.17, 0.12], [0.15, 0.3], [0.13, 0.42], [0.0, 0.48]], 22), m.white, 0, -0.28, -0.05));
    r.head.add(mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 22), m.gold, 0, 0.08, 0.01, { rx: Math.PI / 2.4 }));
    r.head.add(mesh(sph(0.025, 8, 6), m.gem, 0, 0.09, 0.13));
    for (const s of [-1, 1]) r.head.add(mesh(sph(0.016, 6, 5), m.black, s * 0.04, 0.03, 0.105));
    addCape(r, 0.66, 1.3, m.mantle, -0.22, 0.5);
  } else {
    r.head.add(mesh(new THREE.ConeGeometry(0.17, 0.5, 16), m.violet, 0, 0.16, -0.04, { rx: -0.35 }));
    r.head.add(mesh(sph(0.16, 16, 12), m.violet, 0, 0, 0));
    r.head.add(mesh(sph(0.11, 12, 10), m.black, 0, -0.02, 0.07, { s: [1, 1, 0.6] }));
    for (const s of [-1, 1]) r.head.add(mesh(sph(0.02, 6, 5), m.eyeB, s * 0.04, 0, 0.13));
    addCape(r, 0.66, 1.3, m.dviolet, -0.22, 0.5);
  }
  staff(r, m, healer);
  return r;
}

function buildVampire(m: Mats): HumanRig {
  const r = skeletonFrame('vampire');
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.08, 0.065, m.coat));
    r.knee[i]!.add(hang(0.42, 0.065, 0.05, m.black));
    r.knee[i]!.add(mesh(new THREE.BoxGeometry(0.11, 0.08, 0.26), m.black, 0, -0.43, 0.05));
  }
  const skirt = group(r.pelvis, 0, 0.02, 0);
  skirt.add(mesh(lathe([[0.38, -0.88], [0.33, -0.78], [0.26, -0.32], [0.2, 0]]), m.coat, 0, 0, 0, { s: [1, 1, 0.8] }));
  const inner = cloth(0.24, 0.8, m.blood, 0.02, 0.8, -0.4);
  inner.position.set(0, -0.05, 0.23);
  inner.rotation.x = -0.15;
  skirt.add(inner);
  r.skirt = skirt;
  r.torso.add(mesh(lathe([[0.2, -0.04], [0.24, 0.28], [0.22, 0.48], [0.1, 0.58]]), m.coat, 0, 0, 0, { s: [1, 1, 0.8] }));
  // high collar standing behind the head (half shell: coat outside, blood-red lining)
  r.torso.add(mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.38, 18, 1, true, Math.PI / 2, Math.PI), m.coat, 0, 0.66, -0.04, { rx: 0.25 }));
  r.torso.add(mesh(new THREE.CylinderGeometry(0.28, 0.15, 0.36, 18, 1, true, Math.PI / 2, Math.PI), m.blood, 0, 0.66, -0.02, { rx: 0.25 }));
  for (const s of [-1, 1]) {
    r.torso.add(mesh(sph(0.13, 12, 10), m.coat, s * 0.27, 0.48, 0, { s: [1.1, 0.7, 1] }));
    r.torso.add(mesh(new THREE.ConeGeometry(0.05, 0.18, 8), m.gold, s * 0.33, 0.6, 0, { rz: -s * 0.4 }));
  }
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.08, 0.07, m.coat));
    r.elbow[i]!.add(hang(0.27, 0.07, 0.06, m.coat));
    r.hand[i]!.add(mesh(sph(0.045, 10, 8), m.pale));
    for (let f = 0; f < 3; f++) r.hand[i]!.add(mesh(new THREE.ConeGeometry(0.012, 0.14, 6), m.pale, (f - 1) * 0.025, -0.08, 0.02, { rx: Math.PI - 0.3 }));
  }
  r.head.add(mesh(sph(0.11, 18, 14), m.pale, 0, 0.0, 0.02, { s: [0.9, 1.1, 1] }));
  r.head.add(mesh(sph(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.black, 0, 0.02, -0.01, { s: [0.95, 1.1, 1.05] }));
  for (const s of [-1, 1]) r.head.add(mesh(sph(0.018, 6, 5), m.eyeR, s * 0.038, 0.01, 0.11));
  addCape(r, 0.78, 1.4, m.coat, -0.24, 0.56, 0.3);
  return r;
}

function buildSkeleton(m: Mats): HumanRig {
  const r = skeletonFrame('skeleton', 0.9);
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.04, 0.035, m.bone));
    r.knee[i]!.add(mesh(sph(0.045, 8, 6), m.bone));
    r.knee[i]!.add(hang(0.42, 0.035, 0.03, m.bone));
    r.knee[i]!.add(mesh(new THREE.BoxGeometry(0.08, 0.04, 0.16), m.bone, 0, -0.43, 0.04));
  }
  r.pelvis.add(mesh(new THREE.TorusGeometry(0.11, 0.03, 8, 14), m.bone, 0, 0, 0, { rx: Math.PI / 2 }));
  const rag = cloth(0.36, 0.42, m.rag, 0.05, 0.3, -1);
  rag.position.set(0, 0.02, 0.1);
  r.pelvis.add(rag);
  r.torso.add(limb([0, -0.02, -0.04], [0, 0.58, -0.02], 0.025, 0.025, m.bone));
  for (let i = 0; i < 5; i++) {
    r.torso.add(mesh(new THREE.TorusGeometry(0.15 - i * 0.008, 0.016, 6, 16, Math.PI * 1.5), m.bone, 0, 0.2 + i * 0.075, 0, { rx: Math.PI / 2, rz: Math.PI * 0.25, s: [1, 0.8, 1] }));
  }
  r.torso.add(limb([-0.2, 0.5, 0], [0.2, 0.5, 0], 0.03, 0.03, m.bone));
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.03, 0.025, m.bone));
    r.elbow[i]!.add(hang(0.27, 0.025, 0.022, m.bone));
    r.hand[i]!.add(mesh(sph(0.035, 8, 6), m.bone));
  }
  r.head.add(mesh(sph(0.11, 16, 12), m.bone, 0, 0, 0.02, { s: [0.9, 1, 1.05] }));
  r.head.add(mesh(new THREE.BoxGeometry(0.12, 0.06, 0.1), m.bone, 0, -0.09, 0.05));
  r.head.add(mesh(sph(0.115, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), m.rust, 0, 0.02, 0, { s: [1, 1, 1.06] }));
  for (const s of [-1, 1]) {
    r.head.add(mesh(sph(0.03, 8, 6), m.black, s * 0.04, 0.01, 0.1));
    r.head.add(mesh(sph(0.014, 6, 5), m.ember, s * 0.04, 0.01, 0.12));
  }
  sword(r, m, true);
  return r;
}

/** Short pointed hood that covers the back of the head (shared by ranger / rogue). */
function hood(r: HumanRig, mat: THREE.Material, face: THREE.Material): void {
  r.head.add(mesh(sph(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mat, 0, 0.02, -0.015, { s: [1, 1.12, 1.08] }));
  r.head.add(mesh(new THREE.ConeGeometry(0.1, 0.22, 10), mat, 0, 0.06, -0.12, { rx: -1.1 }));
  r.head.add(mesh(sph(0.1, 14, 10), face, 0, -0.01, 0.025));
  r.head.add(mesh(lathe([[0.17, -0.2], [0.15, -0.12], [0.13, -0.05]], 16), mat, 0, 0, -0.01));
}

function buildRanger(m: Mats): HumanRig {
  const r = skeletonFrame('ranger');
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.08, 0.065, m.leather));
    r.knee[i]!.add(hang(0.42, 0.065, 0.05, m.dforest));
    r.knee[i]!.add(hang(0.2, 0.075, 0.07, m.tan));
    r.knee[i]!.add(mesh(new THREE.BoxGeometry(0.12, 0.09, 0.25), m.leather, 0, -0.43, 0.05));
  }
  r.pelvis.add(mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 20), m.tan, 0, 0.0, 0, { rx: Math.PI / 2, s: [1, 0.85, 1] }));
  const skirt = group(r.pelvis, 0, 0.02, 0);
  skirt.add(mesh(lathe([[0.27, -0.38], [0.24, -0.2], [0.2, 0]]), m.forest, 0, 0, 0, { s: [1, 1, 0.85] }));
  r.skirt = skirt;
  r.torso.add(mesh(lathe([[0.19, -0.04], [0.22, 0.25], [0.22, 0.45], [0.1, 0.58]]), m.tan, 0, 0, 0, { s: [1, 1, 0.82] }));
  r.torso.add(limb([-0.18, 0.5, 0.12], [0.15, 0.05, 0.16], 0.025, 0.025, m.leather)); // baldric
  // quiver with fletchings on the back
  const q = group(r.torso, 0.1, 0.3, -0.2);
  q.rotation.z = -0.35;
  q.add(mesh(cyl(0.07, 0.06, 0.5, 10), m.leather));
  for (let k = 0; k < 5; k++) q.add(mesh(new THREE.ConeGeometry(0.02, 0.09, 4), m.white, (k - 2) * 0.022, 0.3, (k % 2) * 0.02));
  for (const s2 of [-1, 1]) r.torso.add(mesh(sph(0.11, 12, 8), m.forest, s2 * 0.27, 0.48, 0, { s: [1, 0.8, 1] }));
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.07, 0.06, m.forest));
    r.elbow[i]!.add(hang(0.27, 0.06, 0.055, m.tan));
    r.hand[i]!.add(mesh(sph(0.045, 8, 6), m.skin));
  }
  hood(r, m.forest, m.skin);
  for (const s2 of [-1, 1]) r.head.add(mesh(sph(0.014, 6, 5), m.black, s2 * 0.035, 0.0, 0.115));
  addCape(r, 0.55, 1.1, m.dforest, -0.2, 0.5, 0.35);
  // nocked arrow in the draw hand
  r.weapon.add(mesh(cyl(0.008, 0.008, 0.75, 5), m.wood, 0, -0.2, 0, { rx: Math.PI / 2 }));
  // longbow in the off hand: limbs along local Z (upright when the arm points at the target)
  const bow = group(r.hand[1]!, 0, -0.04, 0);
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 6 - 1;
    pts.push(new THREE.Vector3(0, 0.16 * t * t - 0.05, 0.78 * t));
  }
  bow.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.04, 6), m.tan));
  bow.add(mesh(cyl(0.004, 0.004, 1.56, 4), m.white, 0, 0.11, 0, { rx: Math.PI / 2 }));
  bow.add(mesh(cyl(0.03, 0.03, 0.14, 8), m.leather, 0, -0.05, 0, { rx: Math.PI / 2 }));
  r.offhand = bow;
  return r;
}

function dagger(parent: THREE.Group, m: Mats): void {
  parent.add(mesh(new THREE.BoxGeometry(0.045, 0.36, 0.01), m.blade, 0, -0.26, 0));
  parent.add(mesh(new THREE.ConeGeometry(0.023, 0.08, 4), m.blade, 0, -0.48, 0, { rx: Math.PI, s: [1, 1, 0.3] }));
  parent.add(mesh(new THREE.BoxGeometry(0.14, 0.025, 0.035), m.iron, 0, -0.06, 0));
  parent.add(mesh(cyl(0.018, 0.018, 0.12, 6), m.dleather, 0, 0.01, 0));
}

function buildRogue(m: Mats): HumanRig {
  const r = skeletonFrame('rogue');
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.075, 0.06, m.dleather));
    r.knee[i]!.add(hang(0.42, 0.06, 0.05, m.dleather));
    r.knee[i]!.add(hang(0.24, 0.07, 0.065, m.black));
    r.knee[i]!.add(mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), m.black, 0, -0.43, 0.05));
  }
  for (const y of [0.0, -0.08]) r.pelvis.add(mesh(new THREE.TorusGeometry(0.18, 0.018, 6, 20), m.leather, 0, y, 0, { rx: Math.PI / 2 + y, s: [1, 0.85, 1] }));
  r.pelvis.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), m.gold, 0, 0, 0.17));
  const skirt = group(r.pelvis, 0, 0.0, 0);
  const tail = cloth(0.3, 0.5, m.plum, 0.04, 0.3, 1);
  tail.position.set(0, 0, -0.16);
  skirt.add(tail);
  r.skirt = skirt;
  r.torso.add(mesh(lathe([[0.18, -0.04], [0.2, 0.24], [0.21, 0.44], [0.1, 0.58]]), m.dleather, 0, 0, 0, { s: [1, 1, 0.8] }));
  r.torso.add(limb([0.18, 0.5, 0.12], [-0.15, 0.08, 0.15], 0.02, 0.02, m.leather));
  for (let k = 0; k < 3; k++) r.torso.add(mesh(new THREE.BoxGeometry(0.03, 0.08, 0.02), m.iron, 0.06 - k * 0.06, 0.32 - k * 0.1, 0.17));
  r.torso.add(mesh(lathe([[0.22, 0.42], [0.16, 0.54], [0.1, 0.62]], 16), m.plum, 0, 0, 0)); // scarf
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.065, 0.055, m.dleather));
    r.elbow[i]!.add(hang(0.27, 0.055, 0.05, m.black));
    r.hand[i]!.add(mesh(sph(0.042, 8, 6), m.black));
  }
  hood(r, m.black, m.skin);
  r.head.add(mesh(sph(0.102, 14, 8, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), m.plum, 0, -0.005, 0.03)); // face mask
  for (const s2 of [-1, 1]) r.head.add(mesh(sph(0.014, 6, 5), m.eyeA, s2 * 0.035, 0.01, 0.12));
  addCape(r, 0.46, 0.8, m.black, -0.2, 0.5, 0.25);
  dagger(r.weapon, m);
  const off = group(r.hand[1]!);
  dagger(off, m);
  r.offhand = off;
  return r;
}

function buildBarbarian(m: Mats): HumanRig {
  const r = skeletonFrame('barbarian');
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.1, 0.08, m.leather));
    r.knee[i]!.add(hang(0.42, 0.075, 0.06, m.bronzed));
    r.knee[i]!.add(hang(0.22, 0.09, 0.085, m.fur));
    r.knee[i]!.add(mesh(new THREE.BoxGeometry(0.14, 0.1, 0.27), m.leather, 0, -0.43, 0.05));
  }
  const skirt = group(r.pelvis, 0, 0.02, 0);
  skirt.add(mesh(lathe([[0.3, -0.36], [0.27, -0.2], [0.23, 0]]), m.fur, 0, 0, 0, { s: [1, 1, 0.85] }));
  r.skirt = skirt;
  r.pelvis.add(mesh(new THREE.TorusGeometry(0.23, 0.045, 8, 22), m.leather, 0, 0.02, 0, { rx: Math.PI / 2, s: [1, 0.85, 1] }));
  r.pelvis.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10), m.iron, 0, 0.02, 0.2, { rx: Math.PI / 2 }));
  // bare, broad torso with a leather strap and a fur mantle
  r.torso.add(mesh(lathe([[0.22, -0.04], [0.27, 0.2], [0.3, 0.42], [0.12, 0.6]]), m.bronzed, 0, 0, 0, { s: [1, 1, 0.8] }));
  r.torso.add(limb([-0.24, 0.5, 0.14], [0.2, 0.05, 0.18], 0.03, 0.03, m.leather));
  r.torso.add(mesh(sph(0.36, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), m.fur, 0, 0.42, -0.02, { s: [1.05, 0.7, 0.85] }));
  for (const s2 of [-1, 1]) r.torso.add(mesh(sph(0.15, 12, 8), m.fur, s2 * 0.3, 0.5, 0, { s: [1, 0.75, 1] }));
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.085, 0.075, m.bronzed));
    r.elbow[i]!.add(hang(0.27, 0.07, 0.065, m.bronzed));
    r.elbow[i]!.add(hang(0.16, 0.08, 0.075, m.leather));
    r.hand[i]!.add(mesh(sph(0.055, 8, 6), m.bronzed));
  }
  // horned iron helm and a braided beard
  r.head.add(mesh(sph(0.12, 16, 12), m.bronzed, 0, 0, 0.02));
  r.head.add(mesh(sph(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m.iron, 0, 0.02, 0, { s: [1, 1, 1.05] }));
  r.head.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), m.iron, 0, 0.0, 0.13));
  for (const s2 of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s2 * 0.11, 0.06, 0), new THREE.Vector3(s2 * 0.24, 0.1, 0.02), new THREE.Vector3(s2 * 0.28, 0.25, 0.06)]), 10, 0.025, 6), m.bone);
    r.head.add(horn);
  }
  r.head.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 10), m.hair, 0, -0.14, 0.08, { rx: Math.PI - 0.25 }));
  r.head.add(mesh(sph(0.08, 10, 8), m.hair, 0, -0.06, 0.08, { s: [1, 0.7, 0.7] }));
  for (const s2 of [-1, 1]) r.head.add(mesh(sph(0.014, 6, 5), m.black, s2 * 0.04, 0.0, 0.12));
  // great battle axe: crescent blade facing the swing (local -Z = the side that leads a chop), spike behind
  const w = r.weapon;
  w.add(mesh(cyl(0.025, 0.028, 1.35, 8), m.wood, 0, -0.38, 0));
  const bit = new THREE.Shape();
  bit.moveTo(0, -0.08);
  bit.quadraticCurveTo(0.2, -0.16, 0.36, -0.3);
  bit.quadraticCurveTo(0.46, -0.02, 0.36, 0.32);
  bit.quadraticCurveTo(0.2, 0.18, 0, 0.12);
  bit.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bit, { depth: 0.03, bevelEnabled: false }), m.steel);
  blade.position.set(-0.015, -1.0, 0);
  blade.rotation.y = Math.PI / 2; // shape +X -> local -Z (forward edge)
  w.add(blade);
  w.add(mesh(new THREE.BoxGeometry(0.034, 0.58, 0.03), m.blade, 0, -0.99, -0.42)); // bright cutting edge
  w.add(mesh(new THREE.ConeGeometry(0.04, 0.24, 6), m.iron, 0, -0.98, 0.14, { rx: Math.PI / 2 }));
  w.add(mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), m.iron, 0, -0.98, 0));
  w.add(mesh(sph(0.04, 8, 6), m.iron, 0, -1.13, 0));
  r.root.scale.setScalar(1.08);
  return r;
}

function buildWarlock(m: Mats): HumanRig {
  const r = skeletonFrame('warlock');
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.08, 0.06, m.black));
    r.knee[i]!.add(hang(0.4, 0.06, 0.05, m.black));
    r.knee[i]!.add(mesh(sph(0.075, 10, 8), m.black, 0, -0.42, 0.04, { s: [1, 0.7, 1.5] }));
  }
  const skirt = group(r.pelvis, 0, 0.02, 0);
  skirt.add(mesh(lathe([[0.37, -0.92], [0.33, -0.84], [0.27, -0.42], [0.21, 0]]), m.voidc, 0, 0, 0, { s: [1, 1, 0.85] }));
  skirt.add(mesh(new THREE.TorusGeometry(0.34, 0.012, 6, 28), m.fel, 0, -0.87, 0, { rx: Math.PI / 2, s: [1, 0.85, 1] }));
  const pan = cloth(0.18, 0.86, m.tome, 0.01, 0.5, -0.4);
  pan.position.set(0, 0, 0.25);
  pan.rotation.x = -0.18;
  skirt.add(pan);
  r.skirt = skirt;
  r.torso.add(mesh(lathe([[0.21, -0.04], [0.19, 0.18], [0.25, 0.4], [0.24, 0.52], [0.1, 0.6]]), m.voidc, 0, 0, 0, { s: [1, 1, 0.85] }));
  r.torso.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 22), m.bone, 0, 0.04, 0, { rx: Math.PI / 2, s: [1, 0.85, 1] }));
  for (let k = 0; k < 3; k++) r.torso.add(mesh(sph(0.025, 8, 6), m.bone, -0.08 + k * 0.08, 0.08, 0.2)); // skull charms
  for (const s2 of [-1, 1]) {
    r.torso.add(mesh(sph(0.13, 12, 8), m.voidc, s2 * 0.27, 0.48, 0, { s: [1, 0.8, 1] }));
    r.torso.add(mesh(new THREE.ConeGeometry(0.04, 0.2, 6), m.bone, s2 * 0.31, 0.6, -0.02, { rz: -s2 * 0.5 }));
  }
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.08, 0.09, m.voidc, true));
    r.elbow[i]!.add(hang(0.27, 0.08, 0.15, m.voidc, true));
    r.hand[i]!.add(mesh(sph(0.045, 8, 6), m.pale));
  }
  // horned hood with a dark face and fel-green eyes
  r.head.add(mesh(sph(0.16, 16, 12), m.voidc, 0, 0.01, -0.01));
  r.head.add(mesh(sph(0.11, 12, 10), m.black, 0, -0.02, 0.07, { s: [1, 1, 0.6] }));
  for (const s2 of [-1, 1]) {
    r.head.add(mesh(sph(0.02, 6, 5), m.fel, s2 * 0.04, 0, 0.13));
    const horn = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s2 * 0.1, 0.1, -0.02), new THREE.Vector3(s2 * 0.16, 0.22, -0.1), new THREE.Vector3(s2 * 0.12, 0.3, -0.24)]), 10, 0.022, 6), m.bone);
    r.head.add(horn);
  }
  addCape(r, 0.7, 1.32, m.voidc, -0.22, 0.5, 0.45);
  // bone staff with a skull and a fel flame
  const st = group(r.weapon, 0, 0.55, 0);
  st.rotation.x = Math.PI;
  st.add(mesh(cyl(0.022, 0.028, 1.8, 7), m.bone, 0, 0.9, 0));
  st.add(mesh(sph(0.07, 10, 8), m.bone, 0, 1.84, 0, { s: [0.9, 1, 1.05] }));
  r.orb = mesh(new THREE.ConeGeometry(0.06, 0.18, 8), m.fel, 0, 1.98, 0);
  st.add(r.orb);
  // grimoire in the off hand
  const off = group(r.hand[1]!, 0, -0.06, 0.04);
  off.add(mesh(new THREE.BoxGeometry(0.2, 0.26, 0.06), m.tome));
  off.add(mesh(new THREE.BoxGeometry(0.18, 0.24, 0.065), m.white));
  off.add(mesh(sph(0.03, 8, 6), m.fel, 0, 0, 0.035));
  r.offhand = off;
  return r;
}

/** "Colosso de Ossos": a skeletal giant (~4 m) with a rusted pauldron and a femur club. */
function buildBoneGiant(m: Mats): HumanRig {
  const r = skeletonFrame('bonegiant', 0.9);
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.06, 0.05, m.bone));
    r.knee[i]!.add(mesh(sph(0.065, 8, 6), m.bone));
    r.knee[i]!.add(hang(0.42, 0.05, 0.045, m.bone));
    r.knee[i]!.add(mesh(new THREE.BoxGeometry(0.12, 0.05, 0.22), m.bone, 0, -0.43, 0.05));
  }
  r.pelvis.add(mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 14), m.bone, 0, 0, 0, { rx: Math.PI / 2 }));
  const rag = cloth(0.2, 0.36, m.rag, 0.06, 0.25, -1);
  rag.position.set(0, 0.02, 0.12);
  r.pelvis.add(rag);
  r.torso.add(limb([0, -0.02, -0.04], [0, 0.6, -0.02], 0.04, 0.04, m.bone));
  for (let i = 0; i < 6; i++) r.torso.add(mesh(new THREE.TorusGeometry(0.17 - i * 0.008, 0.022, 6, 16, Math.PI * 1.5), m.bone, 0, 0.16 + i * 0.07, 0, { rx: Math.PI / 2, rz: Math.PI * 0.25, s: [1, 0.8, 1] }));
  r.torso.add(mesh(sph(0.07, 10, 8), m.ember, 0, 0.32, 0.02)); // smouldering heart inside the ribs
  r.torso.add(limb([-0.24, 0.5, 0], [0.24, 0.5, 0], 0.04, 0.04, m.bone));
  r.torso.add(mesh(sph(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m.rust, -0.3, 0.5, 0, { s: [1, 0.8, 1.1] }));
  for (let k = 0; k < 3; k++) r.torso.add(mesh(new THREE.ConeGeometry(0.035, 0.18, 6), m.rust, -0.3 + (k - 1) * 0.08, 0.66, 0));
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.045, 0.035, m.bone));
    r.elbow[i]!.add(mesh(sph(0.05, 8, 6), m.bone));
    r.elbow[i]!.add(hang(0.27, 0.035, 0.03, m.bone));
    r.hand[i]!.add(mesh(sph(0.055, 8, 6), m.bone));
  }
  r.head.add(mesh(sph(0.13, 16, 12), m.bone, 0, 0, 0.02, { s: [0.95, 1, 1.1] }));
  r.head.add(mesh(new THREE.BoxGeometry(0.14, 0.07, 0.12), m.bone, 0, -0.11, 0.06));
  for (const s2 of [-1, 1]) {
    r.head.add(mesh(sph(0.035, 8, 6), m.black, s2 * 0.045, 0.01, 0.12));
    r.head.add(mesh(sph(0.018, 6, 5), m.ember, s2 * 0.045, 0.01, 0.14));
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 4 - 0.5) * 1.6;
    r.head.add(mesh(new THREE.ConeGeometry(0.025, 0.2, 6), m.rust, Math.sin(a) * 0.12, 0.16, Math.cos(a) * 0.02 - 0.02, { rz: -a * 0.6 }));
  }
  // femur club
  const w = r.weapon;
  w.add(mesh(cyl(0.05, 0.04, 1.1, 8), m.bone, 0, -0.45, 0));
  w.add(mesh(sph(0.11, 10, 8), m.bone, 0, -1.0, 0, { s: [1.3, 1, 1] }));
  w.add(mesh(sph(0.08, 10, 8), m.bone, 0, 0.1, 0, { s: [1.3, 1, 1] }));
  for (let k = 0; k < 4; k++) w.add(mesh(new THREE.ConeGeometry(0.025, 0.12, 5), m.rust, Math.cos(k * 1.6) * 0.1, -0.9 - k * 0.05, Math.sin(k * 1.6) * 0.1, { rz: Math.cos(k * 1.6) * 1.4, rx: Math.sin(k * 1.6) * 1.4 }));
  r.root.scale.setScalar(2.4);
  return r;
}

/** Bat-like wing on the back, built flat and angled outward. */
function wing(parent: THREE.Group, side: number, mat: THREE.Material, bone: THREE.Material, size: number): void {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.lineTo(0.55, 0.45);
  sh.lineTo(0.95, 0.3);
  sh.lineTo(0.75, 0.05);
  sh.lineTo(0.9, -0.2);
  sh.lineTo(0.55, -0.15);
  sh.lineTo(0.5, -0.4);
  sh.lineTo(0.2, -0.2);
  sh.closePath();
  const g = group(parent, side * 0.1, 0.45, -0.16);
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), mat));
  for (const [x, y] of [[0.55, 0.45], [0.95, 0.3], [0.9, -0.2], [0.5, -0.4]] as const) g.add(limb([0, 0, 0.01], [x, y, 0.01], 0.02, 0.008, bone));
  g.scale.set(side * size, size, size);
  g.rotation.y = side * 0.6;
}

/** Diabrete: small fire demon with horns, bat wings and a burning tail. */
function buildImp(m: Mats): HumanRig {
  const r = skeletonFrame('imp', 0.92);
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.08, 0.06, m.demon));
    r.knee[i]!.add(hang(0.42, 0.06, 0.04, m.demon));
    r.knee[i]!.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 6), m.black, 0, -0.44, 0.08, { rx: Math.PI / 2 }));
  }
  r.pelvis.add(mesh(sph(0.16, 12, 10), m.demon, 0, 0.02, 0, { s: [1, 0.8, 0.9] }));
  const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, -0.2, -0.45), new THREE.Vector3(0, 0.1, -0.75)]), 12, 0.03, 6), m.demon);
  r.pelvis.add(tail);
  r.pelvis.add(mesh(new THREE.ConeGeometry(0.06, 0.14, 6), m.flame, 0, 0.14, -0.78));
  r.torso.add(mesh(lathe([[0.16, -0.02], [0.22, 0.2], [0.24, 0.4], [0.1, 0.58]]), m.demon, 0, 0, 0, { s: [1, 1, 0.85] }));
  r.torso.add(mesh(sph(0.07, 8, 6), m.flame, 0, 0.3, 0.17)); // burning heart
  for (const s2 of [-1, 1]) wing(r.torso, s2, m.wing, m.black, 0.9);
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.065, 0.05, m.demon));
    r.elbow[i]!.add(hang(0.27, 0.05, 0.04, m.demon));
    for (let f = 0; f < 3; f++) r.hand[i]!.add(mesh(new THREE.ConeGeometry(0.012, 0.1, 5), m.black, (f - 1) * 0.022, -0.05, 0.02, { rx: Math.PI - 0.3 }));
  }
  r.head.add(mesh(sph(0.15, 14, 12), m.demon, 0, 0, 0.02, { s: [1, 0.95, 1.05] }));
  r.head.add(mesh(new THREE.BoxGeometry(0.18, 0.04, 0.06), m.black, 0, -0.07, 0.13)); // grin
  for (const s2 of [-1, 1]) {
    r.head.add(mesh(sph(0.03, 8, 6), m.flame, s2 * 0.055, 0.03, 0.13));
    r.head.add(mesh(new THREE.ConeGeometry(0.035, 0.2, 6), m.bone, s2 * 0.09, 0.15, -0.02, { rz: -s2 * 0.5 }));
    r.head.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 4), m.demon, s2 * 0.16, 0.02, 0, { rz: -s2 * 1.4 }));
  }
  r.orb = mesh(sph(0.06, 8, 6), m.flame, 0, -0.1, 0.05);
  r.hand[0]!.add(r.orb);
  r.root.scale.setScalar(0.62);
  return r;
}

/** Guardião Abissal: towering armored demon (~3 m) with horns, void cracks and great claws. */
function buildVoidGuard(m: Mats): HumanRig {
  const r = skeletonFrame('voidguard', 0.92);
  for (let i = 0; i < 2; i++) {
    r.hip[i]!.add(hang(0.44, 0.12, 0.1, m.abyss));
    r.knee[i]!.add(mesh(sph(0.1, 10, 8), m.abyss));
    r.knee[i]!.add(hang(0.42, 0.09, 0.07, m.demon));
    r.knee[i]!.add(mesh(new THREE.ConeGeometry(0.09, 0.26, 6), m.black, 0, -0.44, 0.1, { rx: Math.PI / 2 }));
  }
  r.pelvis.add(mesh(cyl(0.24, 0.3, 0.3, 14), m.abyss, 0, -0.06, 0, { s: [1, 1, 0.8] }));
  r.torso.add(mesh(lathe([[0.24, -0.04], [0.32, 0.22], [0.36, 0.44], [0.14, 0.62]]), m.demon, 0, 0, 0, { s: [1, 1, 0.8] }));
  r.torso.add(mesh(lathe([[0.25, 0.1], [0.3, 0.3], [0.28, 0.42], [0.12, 0.5]], 16), m.abyss, 0, 0, 0.02, { s: [1, 1, 0.85] }));
  for (let k = 0; k < 4; k++) r.torso.add(mesh(new THREE.BoxGeometry(0.03, 0.18, 0.02), m.fel, -0.12 + k * 0.08, 0.28 + (k % 2) * 0.06, 0.25, { rz: (k - 1.5) * 0.4 }));
  for (const s2 of [-1, 1]) {
    r.torso.add(mesh(sph(0.2, 12, 8), m.abyss, s2 * 0.34, 0.52, 0, { s: [1.1, 0.8, 1.1] }));
    for (let k = 0; k < 3; k++) r.torso.add(mesh(new THREE.ConeGeometry(0.04, 0.22, 6), m.bone, s2 * (0.3 + k * 0.06), 0.68, -0.04, { rz: -s2 * (0.3 + k * 0.2) }));
    wing(r.torso, s2, m.wing, m.bone, 1.6);
  }
  for (let i = 0; i < 2; i++) {
    r.shoulder[i]!.add(hang(0.29, 0.11, 0.09, m.demon));
    r.elbow[i]!.add(mesh(sph(0.09, 8, 6), m.abyss));
    r.elbow[i]!.add(hang(0.27, 0.09, 0.08, m.abyss));
    r.hand[i]!.add(mesh(sph(0.08, 8, 6), m.demon));
    for (let f = 0; f < 4; f++) r.hand[i]!.add(mesh(new THREE.ConeGeometry(0.022, 0.24, 5), m.bone, (f - 1.5) * 0.04, -0.14, 0.03, { rx: Math.PI - 0.25 }));
  }
  r.head.add(mesh(sph(0.15, 14, 12), m.demon, 0, 0, 0.03, { s: [1, 0.95, 1.15] }));
  r.head.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.1), m.abyss, 0, -0.09, 0.1));
  for (const s2 of [-1, 1]) {
    r.head.add(mesh(sph(0.03, 8, 6), m.fel, s2 * 0.06, 0.03, 0.16));
    const horn = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s2 * 0.12, 0.08, 0), new THREE.Vector3(s2 * 0.28, 0.2, -0.05), new THREE.Vector3(s2 * 0.3, 0.42, 0.05)]), 12, 0.04, 6), m.bone);
    r.head.add(horn);
  }
  r.root.scale.setScalar(1.55);
  return r;
}

export function buildHumanoid(kind: HumanKind): HumanRig {
  const m = makeMats();
  const builders: Record<HumanKind, (m: Mats) => HumanRig> = {
    vanguard: buildVanguard,
    arcanist: (mm) => buildRobed('arcanist', mm),
    healer: (mm) => buildRobed('healer', mm),
    ranger: buildRanger,
    rogue: buildRogue,
    barbarian: buildBarbarian,
    warlock: buildWarlock,
    vampire: buildVampire,
    skeleton: buildSkeleton,
    bonegiant: buildBoneGiant,
    imp: buildImp,
    voidguard: buildVoidGuard,
  };
  const r = builders[kind](m);
  r.materials = finish(r.root, m);
  return r;
}

// ---------------------------------------------------------------- dire wolf

export interface WolfLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  front: boolean;
  /** Gait phase offset. */
  off: number;
}

export interface WolfRig {
  type: 'wolf';
  materials: THREE.MeshStandardMaterial[];
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  tail: THREE.Group;
  legs: WolfLeg[];
}

export function buildWolf(): WolfRig {
  const m = makeMats();
  const root = new THREE.Group();
  const body = group(root, 0, 0.72, 0);
  body.add(mesh(new THREE.CapsuleGeometry(0.28, 0.85, 6, 14), m.fur, 0, 0, 0, { rx: Math.PI / 2, s: [1, 1, 0.95] }));
  body.add(mesh(sph(0.31, 16, 12), m.fur, 0, 0.08, 0.45)); // shaggy chest/mane
  body.add(mesh(sph(0.22, 12, 10), m.fur, 0, 0.18, 0.2, { s: [1, 0.6, 1.4] }));
  body.add(limb([0, 0.13, 0.6], [0, 0.28, 0.85], 0.16, 0.18, m.fur));
  const head = group(body, 0, 0.3, 0.9);
  head.add(mesh(sph(0.16, 14, 12), m.fur));
  head.add(mesh(new THREE.ConeGeometry(0.1, 0.32, 12), m.fur, 0, -0.03, 0.22, { rx: Math.PI / 2 }));
  head.add(mesh(sph(0.03, 6, 5), m.black, 0, -0.03, 0.38));
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 8), m.fur, s * 0.09, 0.16, -0.04, { rx: -0.2 }));
    head.add(mesh(sph(0.022, 6, 5), m.eyeA, s * 0.07, 0.04, 0.12));
    for (const f of [0.18, 0.28]) head.add(mesh(new THREE.ConeGeometry(0.012, 0.05, 5), m.bone, s * 0.04, -0.09, f, { rx: Math.PI }));
  }
  const jaw = group(head, 0, -0.08, 0.04);
  jaw.add(mesh(new THREE.ConeGeometry(0.07, 0.28, 10), m.fur, 0, -0.02, 0.16, { rx: Math.PI / 2, s: [1, 0.5, 1] }));
  const tail = group(body, 0, 0.08, -0.68);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.05, -0.27), new THREE.Vector3(0, -0.25, -0.47)]), 10, 0.07, 8), m.fur));
  const legs: WolfLeg[] = [];
  const spots: Array<[number, number, boolean, number]> = [
    [0.17, 0.42, true, Math.PI * 0.35],
    [-0.17, 0.42, true, 0],
    [0.17, -0.45, false, Math.PI * 1.35],
    [-0.17, -0.45, false, Math.PI],
  ];
  for (const [x, z, front, off] of spots) {
    const hip = group(body, x, -0.04, z);
    hip.add(hang(0.36, 0.08, 0.06, m.fur));
    const knee = group(hip, 0, -0.36, 0);
    knee.add(hang(0.32, 0.055, 0.045, m.fur));
    knee.add(mesh(sph(0.06, 8, 6), m.fur, 0, -0.32, 0.03, { s: [1, 0.6, 1.3] }));
    legs.push({ hip, knee, front, off });
  }
  return { type: 'wolf', materials: finish(root, m), root, body, head, jaw, tail, legs };
}

// ---------------------------------------------------------------- giant spider

export interface SpiderLeg {
  femur: THREE.Mesh;
  tibia: THREE.Mesh;
  joint: THREE.Mesh;
  side: 1 | -1;
  i: number;
}

export interface SpiderRig {
  type: 'spider';
  materials: THREE.MeshStandardMaterial[];
  root: THREE.Group;
  body: THREE.Group;
  abdomen: THREE.Mesh;
  head: THREE.Group;
  fangs: THREE.Group[];
  legs: SpiderLeg[];
}

const UNIT_CYL = (() => {
  let g: THREE.CylinderGeometry | null = null;
  return () => {
    if (!g) {
      g = new THREE.CylinderGeometry(0.4, 1, 1, 10);
      g.translate(0, 0.5, 0);
    }
    return g;
  };
})();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();

/** Places a unit segment mesh (base at origin, +Y length 1) from A to B with base radius r. */
export function setSegment(m: THREE.Mesh, A: THREE.Vector3, B: THREE.Vector3, r: number): void {
  tmpV.subVectors(B, A);
  const len = Math.max(1e-3, tmpV.length());
  m.position.copy(A);
  m.quaternion.setFromUnitVectors(Y_AXIS, tmpV.divideScalar(len));
  m.scale.set(r, len, r);
}

export function buildSpider(): SpiderRig {
  const m = makeMats();
  const root = new THREE.Group();
  const body = group(root, 0, 1.15, 0.1);
  const abdomen = mesh(sph(1, 28, 20), m.abdomen, 0, 0.2, -1.35, { s: [1.05, 0.85, 1.3], rx: -0.35 });
  body.add(abdomen);
  body.add(mesh(sph(0.6, 22, 16), m.chitin, 0, 0, 0, { s: [1, 0.75, 1.15] }));
  // bristles along the back
  for (let i = 0; i < 9; i++) body.add(mesh(new THREE.ConeGeometry(0.03, 0.22, 5), m.chitin, (i % 3 - 1) * 0.18, 0.42, 0.25 - Math.floor(i / 3) * 0.25, { rx: -0.4 }));
  const head = group(body, 0, -0.1, 0.65);
  head.add(mesh(sph(0.4, 18, 14), m.chitin));
  const fangs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const f = group(head, s * 0.12, -0.15, 0.23);
    f.add(limb([0, 0, 0], [s * 0.02, -0.38, 0.17], 0.07, 0.05, m.chitin));
    f.add(mesh(new THREE.ConeGeometry(0.035, 0.28, 8), m.bone, s * 0.02, -0.5, 0.2, { rx: -2.7 }));
    fangs.push(f);
  }
  for (const [x, y, rr] of [[0.1, 0.15, 0.07], [-0.1, 0.15, 0.07], [0.2, 0.07, 0.05], [-0.2, 0.07, 0.05], [0.06, 0.25, 0.04], [-0.06, 0.25, 0.04], [0.15, 0.21, 0.035], [-0.15, 0.21, 0.035]] as const) {
    head.add(mesh(sph(rr, 8, 6), m.eyeR, x, y, 0.33));
  }
  const legs: SpiderLeg[] = [];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1] as const) {
      const femur = new THREE.Mesh(UNIT_CYL(), m.chitin);
      const tibia = new THREE.Mesh(UNIT_CYL(), m.chitin);
      const joint = mesh(sph(1, 10, 8), m.chitin);
      root.add(femur, tibia, joint);
      legs.push({ femur, tibia, joint, side, i });
    }
  }
  return { type: 'spider', materials: finish(root, m), root, body, abdomen, head, fangs, legs };
}

export type ActorRig = HumanRig | WolfRig | SpiderRig;

/** Frees GPU resources of one rig (shared textures and the unit leg geometry stay cached). */
export function disposeRig(rig: ActorRig): void {
  const unit = UNIT_CYL();
  rig.root.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh && mm.geometry !== unit) mm.geometry.dispose();
  });
  for (const mat of rig.materials) mat.dispose();
}
