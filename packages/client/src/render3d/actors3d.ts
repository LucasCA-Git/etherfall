import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ACTIONS, type EntitySnap, type WorldData } from '@etherfall/shared';
import { actPhase, humanPose, type AnimState, type HumanPose, type Style } from '../render/rig';
import type { Light } from '../render/renderer';
import { PITCH, SIN_P, buildWorld3D, type World3D } from './world3d';
import { CELL_FS, COMPOSE_FS, FINE_FS, FULL_VS, buildAsciiAtlas } from './asciiPost';
import { buildHumanoid, buildSpider, buildWolf, disposeRig, setSegment, type ActorRig, type HumanKind, type HumanRig, type SpiderRig, type WolfRig } from './models3d';

/**
 * The whole game view as one 3D scene (world + articulated actors) rendered through a fine ASCII
 * post-process (asciiPost.ts): the scene renders at a few samples per character cell, every cell
 * becomes one glyph coloured by what it covers, and the result is composed over a navy void.
 * Animation, every facing and lighting come for free, always in sync with the server frame data.
 *
 * The orthographic camera is pitched so ground positions land where the 2D layers expect them:
 *   screen = (x - camX) * ppm + W/2,  game y ↦ three z = y / sin(PITCH),  height h ↦ h·cos(PITCH).
 * The camera is snapped to the character grid and the compose pass shifts by the remainder, so
 * glyphs never shimmer while the camera glides.
 */
export { PITCH };
const POINT_LIGHTS = 8;

/** Screen-space height (meters above the feet) for names / health bars over a 3D actor. */
export function headOffset(e: EntitySnap): number {
  if (e.enemyId === 'ashwolf') return 1.15;
  if (e.enemyId === 'giantspider') return 2.3;
  if (e.enemyId === 'bonegiant') return 4.1;
  if (e.enemyId === 'voidguard') return 3.1;
  if (e.enemyId === 'imp') return 1.3;
  if (e.classId === 'barbarian') return 2.05;
  return 1.95;
}

/** Character cell height in CSS px (?cell=6..16 overrides the setting); width is 0.6 of it. */
const CELL_Q = (() => {
  const q = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('cell')) : NaN;
  return Number.isFinite(q) && q >= 6 && q <= 18 ? q : 0;
})();
/** ?ascii=0 shows the raw 3D scene (debug). */
const RAW = typeof location !== 'undefined' && new URLSearchParams(location.search).get('ascii') === '0';
/** Scene samples per cell: up to 4 × 6, fewer for tiny cells so the scene stays about screen-sized. */
const subFor = (cellW: number, cellH: number): [number, number] => [cellW >= 4 ? 4 : cellW >= 2 ? 2 : 1, cellH >= 6 ? 6 : cellH >= 4 ? 4 : cellH >= 2 ? 2 : 1];

export interface ActorFrame {
  views: EntitySnap[];
  /** CSS size of the game view. */
  viewW: number;
  viewH: number;
  camX: number;
  camY: number;
  ppm: number;
  dt: number;
  time: number;
  tick: number;
  anim: (e: EntitySnap) => AnimState;
  ambient: readonly [number, number, number];
  sunLight: number;
  lights: Light[];
  flash: number;
  /** Local player position (see-through walls/canopies, fade-to-dark radius); null = none. */
  player: { x: number; y: number } | null;
  windDir: readonly [number, number];
  windStrength: number;
  rain: number;
  /** Character cell height in CSS px. */
  cellSize: number;
  /** Grass spring field (game/grass.ts), uploaded for the blades. */
  grass: { data: Uint8Array; size: number; cell: number; x0: number; y0: number } | null;
  /** Meters around the player before the view fades to the void. */
  renderDistance: number;
  vignette: number;
}

interface Slot {
  rig: ActorRig;
  /** Frames since the entity was last within the keep-alive area (rigs are retired after ~1 s). */
  unseen: number;
  yaw: number;
  deadT: number;
  block: number;
  /** Smoothed joint angles actually shown (blends between poses instead of snapping). */
  pose: HumanPose | null;
}

/**
 * Exponential blend toward the target pose. Strikes stay snappy (fast rate during the active
 * frames), everything else eases in/out, so wind-ups, recoveries and stance changes flow.
 */
function blendPose(cur: HumanPose, target: HumanPose, dt: number, rate: number): void {
  const k = 1 - Math.exp(-dt * rate);
  const kl = 1 - Math.exp(-dt * Math.max(rate, 30)); // legs follow the stride closely
  cur.lean += (target.lean - cur.lean) * k;
  cur.crouch += (target.crouch - cur.crouch) * k;
  cur.wrist += (target.wrist - cur.wrist) * k;
  cur.glow += (target.glow - cur.glow) * k;
  cur.bodyRot = target.bodyRot; // rolls and falls are already continuous
  for (let i = 0; i < 2; i++) {
    cur.arm[i] = cur.arm[i]! + (target.arm[i]! - cur.arm[i]!) * k;
    cur.elbow[i] = cur.elbow[i]! + (target.elbow[i]! - cur.elbow[i]!) * k;
    cur.thigh[i] = cur.thigh[i]! + (target.thigh[i]! - cur.thigh[i]!) * kl;
    cur.knee[i] = cur.knee[i]! + (target.knee[i]! - cur.knee[i]!) * kl;
  }
}

interface MatBase {
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
}

const TAU = Math.PI * 2;
const angDiff = (a: number, b: number) => ((((b - a) % TAU) + TAU * 1.5) % TAU) - Math.PI;
const smooth = (t: number) => t * t * (3 - 2 * t);
const SLOW_TINT = new THREE.Color(0.75, 0.88, 1.2);
/** Scratch vectors for the spider leg IK (no per-frame allocation). */
const IK = { hip: new THREE.Vector3(), foot: new THREE.Vector3(), knee: new THREE.Vector3(), d: new THREE.Vector3(), n: new THREE.Vector3() };
const FLASH = new THREE.Color(0.9, 0.9, 0.9);

function kindOf(e: EntitySnap): 'wolf' | 'spider' | HumanKind {
  if (e.kind === 'player') return e.classId ?? 'vanguard';
  if (e.enemyId === 'ashwolf') return 'wolf';
  if (e.enemyId === 'giantspider') return 'spider';
  if (e.enemyId === 'vampire') return 'vampire';
  if (e.enemyId === 'bonegiant') return 'bonegiant';
  if (e.enemyId === 'imp') return 'imp';
  if (e.enemyId === 'voidguard') return 'voidguard';
  return 'skeleton';
}

const STYLE: Record<HumanKind, Style> = {
  vanguard: 'sword', arcanist: 'staff', healer: 'staff', ranger: 'bow', rogue: 'sword', barbarian: 'twohand',
  warlock: 'staff', vampire: 'sword', skeleton: 'undead', bonegiant: 'undead', imp: 'sword', voidguard: 'undead',
};
const SPIN = new Set(['vanguard_fury', 'barb_whirl', 'rogue_dance']);
const POISON_TINT = new THREE.Color(0.7, 1.15, 0.6);
const CURSE_TINT = new THREE.Color(0.85, 0.6, 1.1);
const EMPOWER = new THREE.Color(0.16, 0.03, 0.0);
const STEALTH = new THREE.Color(0.035, 0.015, 0.06);

const tagged = new WeakSet<THREE.Material>();
/** Actor pixels carry alpha 0.7 so the ASCII pass can draw characters solid and bright. */
function tagActor(m: THREE.MeshStandardMaterial): void {
  if (tagged.has(m)) return;
  tagged.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a = 0.7;');
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|actor`;
  m.needsUpdate = true;
}

export class ActorLayer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private hemi = new THREE.HemisphereLight(0x9aa6c0, 0x2a2016, 1.3);
  private sun = new THREE.DirectionalLight(0xd8dce8, 1.7);
  private pool: THREE.PointLight[] = [];
  private carry = new THREE.PointLight(0xb8c8ff, 0, 9, 1.4);
  private slots = new Map<number, Slot>();
  private bases = new WeakMap<THREE.MeshStandardMaterial, MatBase>();
  private lost = false;
  private shadowR = 0;
  private world: World3D;
  private sceneRT: THREE.WebGLRenderTarget;
  private cellRT: THREE.WebGLRenderTarget;
  private fineRT: THREE.WebGLRenderTarget;
  private finePass: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>;
  private cellPass: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>;
  private composePass: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>;
  private postScene = new THREE.Scene();
  private postCam = new THREE.Camera();
  private atlas: THREE.Texture;
  private atlasFine: THREE.Texture;
  private atlasKey = '';
  private gridW = 0;
  private subX = 0;
  private fineK = 0;
  private subY = 0;
  private gridH = 0;
  private devW = 0;
  private devH = 0;

  /** False after a lost WebGL context. */
  get active(): boolean {
    return !this.lost;
  }

  /** Returns null when WebGL for three.js is unavailable. */
  static create(canvas: HTMLCanvasElement, world: WorldData): ActorLayer | null {
    try {
      return new ActorLayer(canvas, world);
    } catch (err) {
      console.warn('[etherfall] 3D ASCII view unavailable', err);
      return null;
    }
  }

  private constructor(private canvas: HTMLCanvasElement, worldData: WorldData) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.setClearColor(0x000000, 1);
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // tone mapping and sRGB happen in the ASCII cell pass (the scene renders linear HDR)
    r.toneMapping = THREE.NoToneMapping;
    this.renderer = r;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.cellRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.fineRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const atlas = buildAsciiAtlas(6, 10);
    this.atlas = atlas.texture;
    this.atlasFine = buildAsciiAtlas(3, 5).texture;
    const quad = new THREE.PlaneGeometry(2, 2);
    const pass = (fs: string, uniforms: Record<string, THREE.IUniform>) => {
      const m = new THREE.Mesh(quad, new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FULL_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false }));
      m.frustumCulled = false;
      return m;
    };
    this.cellPass = pass(CELL_FS, {
      tScene: { value: this.sceneRT.texture },
      uSub: { value: new THREE.Vector2(4, 6) },
      uView: { value: new THREE.Vector4() },
      uPlayer: { value: new THREE.Vector2() },
      uFade: { value: 30 },
      uExposure: { value: 1.35 },
      uTime: { value: 0 },
      uRain: { value: 0 },
      uRampLen: { value: atlas.rampLen },
      uWind: { value: new THREE.Vector2(0.5, 0) },
    });
    this.finePass = pass(FINE_FS, {
      tScene: { value: this.sceneRT.texture },
      uSub: { value: new THREE.Vector2(2, 3) },
      uExposure: { value: 1.35 },
      uRampLen: { value: atlas.rampLen },
      uView: { value: new THREE.Vector4() },
    });
    this.composePass = pass(COMPOSE_FS, {
      tCells: { value: this.cellRT.texture },
      tFine: { value: this.fineRT.texture },
      tAtlas: { value: this.atlas },
      tAtlasFine: { value: this.atlasFine },
      uFineK: { value: 2 },
      uCell: { value: new THREE.Vector2(6, 10) },
      uOffset: { value: new THREE.Vector2() },
      uScreen: { value: new THREE.Vector2(1, 1) },
      uVignette: { value: 0.35 },
      uVoid: { value: new THREE.Vector3(0.028, 0.032, 0.058) },
      uFlash: { value: 0 },
    });
    this.postScene.add(this.composePass);
    try {
      const pm = new THREE.PMREMGenerator(r);
      const room = new RoomEnvironment();
      this.scene.environment = pm.fromScene(room, 0.04).texture;
      room.dispose();
      pm.dispose();
    } catch (err) {
      r.dispose();
      throw err;
    }
    this.scene.environmentIntensity = 0.12;
    canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
    });
    this.scene.add(this.hemi);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    Object.assign(s.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.5, far: 80 });
    s.shadow.bias = -0.0006;
    s.shadow.normalBias = 0.02;
    this.scene.add(s, s.target);
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const L = new THREE.PointLight(0xff8a30, 0, 10, 1.6);
      this.pool.push(L);
      this.scene.add(L);
    }
    this.scene.add(this.carry);
    this.world = buildWorld3D(worldData);
    this.scene.add(this.world.group);
  }

  /** Number of live rigs (E2E / debug). */
  get count(): number {
    return this.slots.size;
  }

  /** Character grid of the last frame (debug overlay). */
  get grid(): { cols: number; rows: number } {
    return { cols: this.gridW, rows: this.gridH };
  }

  render(f: ActorFrame): void {
    if (this.lost) return;
    const cw = f.viewW;
    const ch = f.viewH;
    if (cw === 0 || ch === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.floor(cw * dpr));
    const H = Math.max(1, Math.floor(ch * dpr));
    let cellH = Math.max(1, Math.round((CELL_Q || f.cellSize) * dpr));
    let cellW = Math.max(1, Math.round(cellH * 0.6));
    // characters get a grid twice as fine once its glyphs are still legible (>= 4 px tall)
    const fineK = cellH >= 8 ? 2 : 1;
    if (fineK === 2) {
      cellH = Math.round(cellH / 2) * 2;
      cellW = Math.max(4, Math.round(cellW / 2) * 2);
    }
    const [subX, subY] = subFor(cellW, cellH);
    const key = `${cellW}x${cellH}/${fineK}`;
    if (key !== this.atlasKey) {
      this.atlasKey = key;
      this.atlas.dispose();
      this.atlasFine.dispose();
      this.atlas = buildAsciiAtlas(cellW, cellH).texture;
      this.atlasFine = buildAsciiAtlas(Math.max(1, cellW / fineK), Math.max(1, cellH / fineK)).texture;
      const cu = this.composePass.material.uniforms;
      cu.tAtlas!.value = this.atlas;
      cu.tAtlasFine!.value = this.atlasFine;
      cu.uFineK!.value = fineK;
    }
    const cols = Math.ceil(W / cellW) + 2;
    const rows = Math.ceil(H / cellH) + 2;
    if (W !== this.devW || H !== this.devH) {
      this.devW = W;
      this.devH = H;
      this.renderer.setSize(W, H, false);
    }
    if (cols !== this.gridW || rows !== this.gridH || subX !== this.subX || subY !== this.subY || fineK !== this.fineK) {
      this.fineK = fineK;
      this.gridW = cols;
      this.gridH = rows;
      this.subX = subX;
      this.subY = subY;
      (this.cellPass.material.uniforms.uSub!.value as THREE.Vector2).set(subX, subY);
      (this.finePass.material.uniforms.uSub!.value as THREE.Vector2).set(subX / fineK, subY / fineK);
      this.sceneRT.setSize(cols * subX, rows * subY);
      this.cellRT.setSize(cols, rows);
      this.fineRT.setSize(cols * fineK, rows * fineK);
    }

    // camera snapped to the character grid; the compose pass shifts by the remainder
    const ppmD = f.ppm * dpr;
    const cwm = cellW / ppmD; // meters per cell (x)
    const chm = cellH / ppmD; // meters per cell (game y)
    const qx = Math.floor(f.camX / cwm) * cwm;
    const qy = Math.floor(f.camY / chm) * chm;
    const hw = (cols * cwm) / 2;
    const hh = (rows * chm) / 2;
    const gridLeft = qx - hw;
    const gridBottom = qy + hh; // game y at the bottom edge of row 0
    const cam = this.camera;
    cam.left = -hw;
    cam.right = hw;
    cam.top = hh;
    cam.bottom = -hh;
    const tz = qy / SIN_P;
    cam.position.set(qx, Math.sin(PITCH) * 60, tz + Math.cos(PITCH) * 60);
    cam.lookAt(qx, 0, tz);
    cam.updateProjectionMatrix();

    this.light(f, tz);
    // shadow frustum covers the visible ground (resized only when the zoom changes enough)
    const R = Math.ceil(Math.max(hw, hh / SIN_P) + 3);
    if (R !== this.shadowR) {
      this.shadowR = R;
      const sc = this.sun.shadow.camera;
      sc.left = -R;
      sc.right = R;
      sc.top = R;
      sc.bottom = -R;
      sc.far = 60 + R * 2;
      sc.updateProjectionMatrix();
    }

    // grass: wind + the spring field (actors push, blows kick); see-through around the player
    const cu0 = this.cellPass.material.uniforms;
    (cu0.uWind!.value as THREE.Vector2).set(f.windDir[0] * f.windStrength, f.windDir[1] * f.windStrength);
    const gu = this.world.grass;
    gu.uTime.value = f.time;
    gu.uWind.value.set(f.windDir[0] * f.windStrength * 1.3, f.windDir[1] * f.windStrength * 1.3);
    gu.uCam.value.set(f.camX, f.camY);
    if (f.grass) {
      const fld = f.grass;
      const tex = gu.uField.value;
      if (tex.image.width !== fld.size) {
        tex.image = { data: fld.data, width: fld.size, height: fld.size };
        tex.dispose(); // reallocate at the new size
      }
      tex.needsUpdate = true;
      gu.uFieldRect.value.set(fld.x0, fld.y0, fld.size * fld.cell, fld.size * fld.cell);
    }
    this.world.fire.emissiveIntensity = 2.6 + Math.sin(f.time * 13) * 0.5 + Math.sin(f.time * 7.3) * 0.4;
    const see = this.world.see.uSee.value;
    if (f.player) see.set(f.player.x, f.player.y / SIN_P, 2.6, 1);
    else see.w = 0;

    // rigs: create inside the view (+margin), keep alive in a wider band, retire after ~1 s unseen
    for (const s of this.slots.values()) s.unseen++;
    for (const e of f.views) {
      if (e.kind === 'projectile') continue;
      const ox = Math.abs(e.x - f.camX) - hw;
      const oy = e.y < f.camY ? f.camY - hh - e.y : e.y - f.camY - hh - 2;
      const out = Math.max(ox, oy);
      let s = this.slots.get(e.id);
      if (out > 4) {
        if (s && out < 14) {
          s.unseen = 0;
          s.rig.root.visible = false;
        }
        continue;
      }
      const kind = kindOf(e);
      if (s && (s.rig.type === 'human' ? s.rig.kind : s.rig.type) !== kind) {
        this.retire(e.id, s);
        s = undefined;
      }
      if (!s) {
        const rig = kind === 'wolf' ? buildWolf() : kind === 'spider' ? buildSpider() : buildHumanoid(kind);
        s = { rig, unseen: 0, yaw: Math.PI / 2 - e.facing, deadT: 0, block: 0, pose: null };
        this.slots.set(e.id, s);
        for (const m of rig.materials) tagActor(m);
        this.scene.add(rig.root);
      }
      s.unseen = 0;
      s.rig.root.visible = true;
      this.pose(s, e, f);
    }
    for (const [id, s] of this.slots) if (s.unseen > 45) this.retire(id, s);

    // 1) scene at subX × subY samples per character cell
    const rr = this.renderer;
    if (RAW) {
      rr.setRenderTarget(null);
      rr.toneMapping = THREE.ACESFilmicToneMapping;
      rr.toneMappingExposure = 1.35;
      rr.render(this.scene, cam);
      return;
    }
    rr.setRenderTarget(this.sceneRT);
    rr.setClearColor(0x000000, 1);
    rr.clear();
    rr.render(this.scene, cam);
    // 2) one glyph per cell
    const cu = this.cellPass.material.uniforms;
    cu.uView!.value.set(gridLeft, gridBottom, cwm, chm);
    if (f.player) cu.uPlayer!.value.set(f.player.x, f.player.y);
    else cu.uPlayer!.value.set(f.camX, f.camY);
    cu.uFade!.value = f.renderDistance;
    cu.uTime!.value = f.time;
    cu.uRain!.value = f.rain;
    this.postScene.remove(this.composePass);
    this.postScene.add(this.cellPass);
    rr.setRenderTarget(this.cellRT);
    rr.render(this.postScene, this.postCam);
    this.postScene.remove(this.cellPass);
    // 2b) characters at twice the glyph density
    this.finePass.material.uniforms.uView!.value.set(gridLeft, gridBottom, cwm / fineK, chm / fineK);
    this.postScene.add(this.finePass);
    rr.setRenderTarget(this.fineRT);
    rr.render(this.postScene, this.postCam);
    this.postScene.remove(this.finePass);
    this.postScene.add(this.composePass);
    // 3) glyphs to the screen
    const pu = this.composePass.material.uniforms;
    pu.uCell!.value.set(cellW, cellH);
    pu.uOffset!.value.set((f.camX - gridLeft) * ppmD - W / 2, (gridBottom - f.camY) * ppmD - H / 2);
    pu.uScreen!.value.set(W, H);
    pu.uVignette!.value = f.vignette;
    pu.uFlash!.value = f.flash;
    rr.setRenderTarget(null);
    rr.render(this.postScene, this.postCam);
  }

  dispose(): void {
    for (const [id, s] of this.slots) this.retire(id, s);
    this.world.dispose();
    this.scene.environment?.dispose();
    this.sun.shadow.dispose();
    this.sceneRT.dispose();
    this.cellRT.dispose();
    this.fineRT.dispose();
    this.finePass.material.dispose();
    this.atlas.dispose();
    this.atlasFine.dispose();
    this.cellPass.geometry.dispose();
    this.cellPass.material.dispose();
    this.composePass.material.dispose();
    this.renderer.dispose();
  }

  private retire(id: number, s: Slot): void {
    this.scene.remove(s.rig.root);
    disposeRig(s.rig);
    this.slots.delete(id);
  }

  private light(f: ActorFrame, tz: number): void {
    const [ar, ag, ab] = f.ambient;
    const lum = Math.max(ar, ag, ab);
    const n = Math.max(1e-3, lum);
    // hue of the world's ambient light, kept bright enough that characters stay readable at night
    this.hemi.color.setRGB(0.55 + 0.45 * (ar / n), 0.55 + 0.45 * (ag / n), 0.55 + 0.45 * (ab / n));
    this.hemi.intensity = 0.3 + 0.9 * Math.min(1, lum) + f.flash * 2;
    const day = Math.max(0, Math.min(1, f.sunLight));
    this.sun.color.setRGB(0.62 + 0.3 * day, 0.68 + 0.26 * day, 0.95 - 0.05 * day);
    this.sun.intensity = 0.3 + 1.3 * day;
    // a soft cold light rides above the local player: their surroundings read even in the dark
    if (f.player) {
      this.carry.position.set(f.player.x, 2.4, f.player.y / SIN_P + 1.2);
      this.carry.intensity = 1.3 * (1 - 0.6 * day);
    } else this.carry.intensity = 0;
    // moon from the front-left, low: tops and front faces catch a cold light
    this.sun.position.set(f.camX - 9, 17, tz + 7);
    this.sun.target.position.set(f.camX, 0, tz);
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const L = this.pool[i]!;
      const g = f.lights[i];
      if (!g) {
        L.intensity = 0;
        continue;
      }
      L.color.setRGB(g.color[0], g.color[1], g.color[2]);
      L.intensity = g.intensity * 22;
      L.distance = g.radius * 1.4;
      L.position.set(g.x, 1.3, g.y / SIN_P + 0.4);
    }
  }

  private pose(s: Slot, e: EntitySnap, f: ActorFrame): void {
    const rig = s.rig;
    const anim = f.anim(e);
    rig.root.position.set(e.x, 0, e.y / SIN_P);
    const dir = e.action && !e.dead ? e.adir : e.facing;
    s.yaw += angDiff(s.yaw, Math.PI / 2 - dir) * (1 - Math.exp(-f.dt * 16));
    rig.root.rotation.y = s.yaw;
    s.deadT = e.dead ? Math.min(1, s.deadT + f.dt / 0.55) : 0;

    const a = actPhase(e);
    const def = a.id ? ACTIONS[a.id] : undefined;
    const warn = e.team !== 0 && def?.telegraph && a.stage === 'windup' ? (def.telegraph === 'danger' ? 1 : 0.45) * a.k : 0;
    const flash = f.tick - e.hitTick < 4 && !e.dead;
    const st = e.statuses ?? [];
    this.tint(rig, flash, st, e.dead, warn, rig.type === 'spider' ? 0.16 : 0.035);

    if (rig.type === 'human') this.poseHuman(rig, s, e, anim, f, a);
    else if (rig.type === 'wolf') this.poseWolf(rig, s, e, anim, f, a);
    else this.poseSpider(rig, s, e, anim, f, a);
  }

  /** `selfLit`: constant glow added to every material (giant spiders read as pale line-art). */
  private tint(rig: ActorRig, flash: boolean, st: readonly string[], dead: boolean, warn: number, selfLit: number): void {
    const slow = st.includes('slow');
    const poison = st.includes('poison');
    const curse = st.includes('curse');
    const empower = st.includes('empower');
    const stealth = st.includes('stealth');
    for (const m of rig.materials) {
      let b = this.bases.get(m);
      if (!b) {
        b = { color: m.color.clone(), emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity };
        this.bases.set(m, b);
      }
      m.color.copy(b.color);
      if (slow) m.color.multiply(SLOW_TINT);
      if (poison) m.color.multiply(POISON_TINT);
      if (curse) m.color.multiply(CURSE_TINT);
      if (stealth) m.color.multiplyScalar(0.25);
      if (dead) m.color.multiplyScalar(0.5);
      const glowing = b.emissiveIntensity > 0 && b.emissive.getHex() !== 0;
      if (flash) {
        m.emissive.copy(FLASH);
        m.emissiveIntensity = 1;
      } else if (glowing) {
        m.emissive.copy(b.emissive);
        m.emissiveIntensity = dead ? 0 : b.emissiveIntensity * (1 + warn);
      } else if (warn > 0) {
        m.emissive.setRGB(warn * 0.55, warn * 0.1, 0.02);
        m.emissiveIntensity = 1;
      } else if (stealth || empower) {
        m.emissive.copy(stealth ? STEALTH : EMPOWER);
        m.emissiveIntensity = 1;
      } else {
        // characters are self-lit a little so they read against the dark world (as in the reference)
        m.emissive.copy(b.color).multiplyScalar(1.1).addScalar(selfLit);
        if (stealth) m.emissive.multiplyScalar(0.2);
        m.emissiveIntensity = dead ? 0.4 : 1;
      }
    }
  }

  private poseHuman(r: HumanRig, s: Slot, e: EntitySnap, anim: AnimState, f: ActorFrame, a: ReturnType<typeof actPhase>): void {
    const style = STYLE[r.kind];
    const target = humanPose(e, anim, f.time, style);
    if (!s.pose) s.pose = { ...target, thigh: [...target.thigh], knee: [...target.knee], arm: [...target.arm], elbow: [...target.elbow] };
    blendPose(s.pose, target, f.dt, a.stage === 'active' ? 55 : a.stage === 'windup' ? 26 : 16);
    const p = s.pose;
    // whirlwinds spin the whole body; leaps arc through the air
    if (SPIN.has(a.id) && a.stage === 'active') r.root.rotation.y += a.k * Math.PI * 2 * 2.5;
    r.root.position.y = a.id === 'barb_leap' && a.stage === 'active' ? Math.sin(Math.min(1, a.k) * Math.PI) * 1.1 : 0;
    if (r.offhand && r.kind === 'ranger') {
      const aim = Math.max(0, Math.min(1, (p.arm[1] - 0.4) / 1.0));
      r.offhand.rotation.x = -(1 - aim) * 1.35;
    }
    const run = Math.min(1, anim.speed / 4.2);
    // stride: hips and shoulders counter-rotate, the head steadies itself, a slight bounce
    const stride = Math.sin(anim.phase) * run;
    r.pelvis.position.y = r.pelvisY - p.crouch + Math.abs(Math.cos(anim.phase)) * 0.025 * run;
    r.pelvis.rotation.y = -stride * 0.12;
    r.torso.rotation.x = p.lean;
    r.torso.rotation.y = stride * 0.22;
    r.torso.rotation.z = Math.cos(anim.phase) * 0.03 * run;
    r.head.rotation.x = -p.lean * 0.4;
    r.head.rotation.y = -stride * 0.12;
    const twoHanded = style === 'twohand' && !e.dead && a.id !== 'dodge' && a.id !== 'barb_warcry' && a.id !== 'barb_rage' && a.id !== 'sit' && !e.blocking;
    for (let i = 0; i < 2; i++) {
      const out = i === 0 ? -1 : 1;
      r.shoulder[i]!.rotation.x = -(p.arm[i]! + p.lean);
      // two-handed weapons: both arms swing inward so the hands meet on the haft
      r.shoulder[i]!.rotation.z = twoHanded ? -out * 0.42 : out * 0.1;
      r.elbow[i]!.rotation.x = -p.elbow[i]!;
      r.hip[i]!.rotation.x = -p.thigh[i]!;
      r.hip[i]!.rotation.z = out * 0.03;
      r.knee[i]!.rotation.x = p.knee[i]!;
    }
    r.weapon.rotation.x = -p.wrist;
    // dodge rolls spin around the hips; death topples the whole body backward from the feet
    if (e.dead) {
      const k = smooth(s.deadT);
      r.pelvis.rotation.x = 0;
      r.tilt.rotation.x = (-Math.PI / 2) * k;
      r.tilt.position.y = 0.12 * k;
    } else {
      r.pelvis.rotation.x = -p.bodyRot;
      r.tilt.rotation.x = 0;
      r.tilt.position.y = 0;
    }
    if (r.cape) r.cape.rotation.x = 0.1 + run * 0.4 + Math.max(0, p.lean) * 0.6 + Math.sin(f.time * 3 + anim.phase) * 0.05;
    if (r.skirt) r.skirt.rotation.x = Math.sin(anim.phase) * 0.06 * run - p.lean * 0.5;
    if (r.shield) {
      s.block += ((e.blocking ? 1 : 0) - s.block) * (1 - Math.exp(-f.dt * 18));
      const b = smooth(s.block);
      r.shield.position.set(0.36 - 0.26 * b, 0.26 + 0.18 * b, 0.05 + 0.4 * b);
      r.shield.rotation.set(-0.1 * (1 - b), 1.25 * (1 - b) + 0.12 * b, 0);
    }
    if (r.orb) r.orb.scale.setScalar(1 + p.glow * 0.7 + Math.sin(f.time * 5) * 0.06);
  }

  private poseWolf(r: WolfRig, s: Slot, e: EntitySnap, anim: AnimState, f: ActorFrame, a: ReturnType<typeof actPhase>): void {
    const run = Math.min(1, anim.speed / 5);
    const ph = anim.phase * 1.25;
    const lunge = a.id === 'wolf_lunge';
    const crouch = lunge && a.stage === 'windup' ? 0.16 * a.k : 0;
    const leap = lunge && a.stage === 'active' ? Math.sin(a.k * Math.PI) * 0.35 : 0;
    const bite = a.id === 'wolf_bite' && a.stage === 'active';
    const bob = Math.abs(Math.sin(ph)) * 0.05 * run;
    const dk = smooth(s.deadT);
    r.body.position.y = 0.72 - crouch + leap + bob - dk * 0.42;
    r.body.rotation.z = (Math.PI / 2) * dk;
    r.body.rotation.x = -leap * 0.4 + crouch * 0.8;
    for (const L of r.legs) {
      const sw = e.dead ? 0.4 : Math.sin(ph + L.off) * 0.75 * run + (crouch ? 0.4 : 0) + (leap ? (L.front ? 0.9 : -0.9) : 0);
      const bend = (L.front ? -1 : 1) * (0.35 + Math.max(0, Math.sin(ph + L.off + 1.2)) * 0.8 * run);
      L.hip.rotation.x = -sw;
      L.knee.rotation.x = -bend;
    }
    r.head.rotation.x = crouch * 2 - leap * 0.5;
    r.jaw.rotation.x = bite ? 0.55 : a.stage === 'windup' && (a.id === 'wolf_bite' || lunge) ? 0.3 * a.k : 0.04;
    r.tail.rotation.y = e.dead ? 0 : Math.sin(f.time * 6) * 0.3;
    r.tail.rotation.x = -0.2 * run;
  }

  private poseSpider(r: SpiderRig, s: Slot, e: EntitySnap, anim: AnimState, f: ActorFrame, a: ReturnType<typeof actPhase>): void {
    const run = Math.min(1, anim.speed / 4);
    const ph = anim.phase * 1.6;
    const leap = a.id === 'spider_leap';
    const crouch = leap && a.stage === 'windup' ? 0.3 * a.k : 0;
    const air = leap && a.stage === 'active' ? Math.sin(a.k * Math.PI) * 0.7 : 0;
    const web = a.id === 'spider_web';
    const tilt = web && a.stage !== 'recovery' ? (a.stage === 'windup' ? a.k : 1) * 0.35 : 0;
    const bite = a.id === 'spider_bite' && a.stage === 'active';
    const dk = smooth(s.deadT);
    const bodyH = 1.15 - crouch + air + Math.abs(Math.sin(ph)) * 0.03 * run - dk * 0.75;
    r.body.position.y = bodyH;
    r.body.rotation.x = tilt * 0.6 + crouch * 0.4;
    r.body.rotation.z = dk * 0.25;
    for (const fg of r.fangs) fg.rotation.x = bite ? -0.5 : a.id === 'spider_bite' && a.stage === 'windup' ? 0.35 * a.k : Math.sin(f.time * 4) * 0.08;
    const { hip, foot, knee, d, n } = IK;
    const L1 = 1.5;
    const L2 = 2.3;
    for (const L of r.legs) {
      const i = L.i;
      const sd = L.side;
      hip.set(sd * 0.42, bodyH - 0.05, 0.6 - i * 0.28);
      const off = (i % 2 === 0) !== sd > 0 ? 0 : Math.PI;
      const step = Math.sin(ph + off);
      const lift = Math.max(0, Math.cos(ph + off)) * 0.35 * run;
      if (e.dead) {
        // legs curl in over the body
        const curl = dk;
        foot.set(sd * (1.9 - 1.1 * curl), 0.02 + 0.9 * curl, (1.4 - i * 1.05) * (1 - 0.6 * curl));
      } else {
        foot.set(sd * (1.9 + (i % 2) * 0.2) * (1 + crouch * 0.4), lift, 1.4 - i * 1.05 + step * 0.45 * run);
        if (air) foot.y = 0.3 + air * 0.5;
      }
      // two-bone IK, knee arching up and outward
      d.subVectors(foot, hip);
      const dist = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L2 - L1) + 1e-3, d.length()));
      d.normalize();
      const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
      n.set(sd * 0.35, 1, 0);
      n.addScaledVector(d, -n.dot(d)).normalize();
      knee.copy(hip).addScaledVector(d, along).addScaledVector(n, h);
      foot.copy(hip).addScaledVector(d, dist);
      setSegment(L.femur, hip, knee, 0.1);
      setSegment(L.tibia, knee, foot, 0.08);
      L.joint.position.copy(knee);
      L.joint.scale.setScalar(0.09);
    }
  }
}
