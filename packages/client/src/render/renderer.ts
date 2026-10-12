import { hash2, type WorldData } from '@etherfall/shared';
import { disposeTarget, program, target, texture, type Program, type Target } from './gl';
import { buildGlyphCanvas } from './glyphAtlas';
import { FLOATS_PER_INSTANCE, type InstanceBatch } from './instances';
import { CELL_FS, COMPOSE_FS, FULLSCREEN_VS, GROUND_FS, MAX_BENDERS, MAX_LIGHTS, MAX_RIPPLES, MAX_SEE, SHADOW_FS, SHAPE_FS, SHAPE_VS } from './shaders';
import type { RenderSettings } from './settings';
import { buildChunks, CHUNK_SIZE, type StaticChunk } from './worldLayer';
import { buildSpriteAtlas } from './sprites';

export interface Light {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  color: readonly [number, number, number];
}

export interface FrameInput {
  camX: number;
  camY: number;
  /** CSS pixels per meter (zoom applied). */
  ppm: number;
  time: number;
  ambient: readonly [number, number, number];
  lights: Light[];
  windDir: readonly [number, number];
  windStrength: number;
  sunOffset: readonly [number, number];
  sunLight: number;
  player: { x: number; y: number };
  /** Flat [x, y, radius]* — actors that foliage must reveal (see-through canopies). */
  see: number[];
  /** Flat [x, y, radius, strength]* — entities pushing grass. */
  benders: number[];
  /** Flat [x, y, startTime, strength]* — water ripples. */
  ripples: number[];
  dyn: InstanceBatch;
  dynShadow: InstanceBatch;
  dynReflect: InstanceBatch;
  flash: number;
  flashColor: readonly [number, number, number];
  /** Rain intensity 0..1 (0 indoors). */
  rain: number;
  /** Grass deflection field around the camera (spring physics, CPU-simulated). */
  grass: { data: Uint8Array; size: number; cell: number; x0: number; y0: number } | null;
}

export interface RenderStats {
  cols: number;
  rows: number;
  sceneW: number;
  sceneH: number;
  chunksDrawn: number;
  instances: number;
  gpuMs: number;
}

interface GpuChunk {
  src: StaticChunk;
  vao: [WebGLVertexArrayObject, WebGLVertexArrayObject, WebGLVertexArrayObject];
  counts: [number, number, number];
}

/**
 * Owns the GPU side of the ASCII pipeline. Gameplay never touches GL: it fills
 * InstanceBatches and a FrameInput each frame.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private ground: Program;
  private shape: Program;
  private shadowProg: Program;
  private cell: Program;
  private compose: Program;
  private quad: WebGLBuffer;
  private atlas: WebGLTexture;
  private tiles: WebGLTexture;
  private chunks: GpuChunk[] = [];
  private dynVao: WebGLVertexArrayObject[] = [];
  private dynBuf: WebGLBuffer[] = [];
  private emptyVao: WebGLVertexArrayObject;
  private scene: Target | null = null;
  private shadow: Target | null = null;
  private cells: Target | null = null;
  private fine: Target | null = null;
  private sprites: WebGLTexture;
  private spriteRects: Float32Array;
  private grassTex: WebGLTexture;
  private grassSize = 0;
  private lightsBuf = new Float32Array(MAX_LIGHTS * 4);
  private lightColBuf = new Float32Array(MAX_LIGHTS * 3);
  private benderBuf = new Float32Array(MAX_BENDERS * 4);
  private rippleBuf = new Float32Array(MAX_RIPPLES * 4);
  private seeBuf = new Float32Array(MAX_SEE * 3);
  private timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private queries: WebGLQuery[] = [];
  private timing = false;
  stats: RenderStats = { cols: 0, rows: 0, sceneW: 0, sceneH: 0, chunksDrawn: 0, instances: 0, gpuMs: 0 };

  /**
   * @param overlay effects-only mode: the 3D ASCII view draws the world and actors underneath, this
   * canvas is transparent and only carries spells, particles, flames, decals and rain.
   */
  constructor(
    private canvas: HTMLCanvasElement,
    private world: WorldData,
    public settings: RenderSettings,
    readonly overlay = false,
  ) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: overlay, premultipliedAlpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 não suportado neste navegador.');
    this.gl = gl;
    this.ground = program(gl, FULLSCREEN_VS, GROUND_FS, 'ground');
    this.shape = program(gl, SHAPE_VS, SHAPE_FS, 'shape');
    this.shadowProg = program(gl, SHAPE_VS, SHADOW_FS, 'shadow');
    this.cell = program(gl, FULLSCREEN_VS, CELL_FS, 'cell');
    this.compose = program(gl, FULLSCREEN_VS, COMPOSE_FS, 'compose');
    this.emptyVao = gl.createVertexArray()!;
    this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // Glyph atlas (mipmapped; sampled with explicit gradients in the compose pass).
    const glyphs = buildGlyphCanvas();
    this.atlas = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, glyphs);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Painted actor parts (premultiplied, mipmapped so small on-screen parts average correctly).
    const sa = buildSpriteAtlas();
    this.spriteRects = sa.rects;
    this.sprites = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sprites);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sa.canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 4); // 32 px gutters stay >= 2 px at level 4
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Grass deflection field (RG8, 0.5 = rest), re-uploaded every frame.
    this.grassTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.grassTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 1, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array([128, 128]));

    // Tile map: R = tile type, G = per-tile variation.
    const tw = world.width;
    const th = world.height;
    const td = new Uint8Array(tw * th * 2);
    for (let i = 0; i < tw * th; i++) {
      td[i * 2] = world.tiles[i]!;
      td[i * 2 + 1] = Math.floor(hash2(i % tw, (i / tw) | 0, world.seed) * 255);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.tiles = texture(gl, tw, th, gl.NEAREST, gl.RG8, gl.RG, td);

    for (const c of buildChunks(world)) {
      const vaos: WebGLVertexArrayObject[] = [];
      const counts: number[] = [];
      for (const b of [c.normal, c.shadow, c.reflect]) {
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, b.view(), gl.STATIC_DRAW);
        vaos.push(this.makeVao(buf));
        counts.push(b.count);
      }
      this.chunks.push({ src: c, vao: vaos as GpuChunk['vao'], counts: counts as GpuChunk['counts'] });
    }
    for (let i = 0; i < 3; i++) {
      const buf = gl.createBuffer()!;
      this.dynBuf.push(buf);
      this.dynVao.push(this.makeVao(buf));
    }
  }

  private makeVao(instBuf: WebGLBuffer): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    const stride = FLOATS_PER_INSTANCE * 4;
    for (let a = 0; a < 4; a++) {
      gl.enableVertexAttribArray(1 + a);
      gl.vertexAttribPointer(1 + a, 4, gl.FLOAT, false, stride, a * 16);
      gl.vertexAttribDivisor(1 + a, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  /** Recreate targets when the window, cell size or internal resolution changes. */
  private ensureTargets(cols: number, rows: number, sub: number): void {
    const gl = this.gl;
    const sw = cols * sub;
    const sh = rows * sub;
    const wantFine = sub >= 2;
    if (this.scene && this.scene.w === sw && this.scene.h === sh && this.cells && this.cells.w === cols && this.cells.h === rows && !!this.fine === wantFine) return;
    // Build the new set first; only swap (and free the old one) when all succeed.
    const built: Target[] = [];
    try {
      built.push(target(gl, sw, sh, 2, true));
      built.push(target(gl, sw, sh, 1, false, gl.LINEAR));
      built.push(target(gl, cols, rows, 2, false));
      if (wantFine) built.push(target(gl, cols * 2, rows * 2, 2, false));
    } catch (err) {
      for (const t of built) disposeTarget(gl, t);
      throw err;
    }
    disposeTarget(gl, this.scene);
    disposeTarget(gl, this.shadow);
    disposeTarget(gl, this.cells);
    disposeTarget(gl, this.fine);
    [this.scene, this.shadow, this.cells] = built as [Target, Target, Target];
    this.fine = built[3] ?? null;
  }

  private setCommon(p: Program, f: FrameInput, view: Float32Array): void {
    const gl = this.gl;
    gl.uniform4fv(p.u('uView'), view);
    gl.uniform1f(p.u('uTime'), f.time);
    gl.uniform3f(p.u('uAmbient'), f.ambient[0], f.ambient[1], f.ambient[2]);
    gl.uniform1i(p.u('uLightCount'), Math.min(MAX_LIGHTS, f.lights.length));
    gl.uniform4fv(p.u('uLights'), this.lightsBuf);
    gl.uniform3fv(p.u('uLightColors'), this.lightColBuf);
    gl.uniform2f(p.u('uWindDir'), f.windDir[0], f.windDir[1]);
    gl.uniform1f(p.u('uWindStrength'), f.windStrength);
  }

  private drawInstances(vao: WebGLVertexArrayObject, count: number): void {
    if (count <= 0) return;
    this.gl.bindVertexArray(vao);
    this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, count);
    this.stats.instances += count;
  }

  render(f: FrameInput): void {
    const gl = this.gl;
    const s = this.settings;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const H = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    // the effects layer over the 3D view keeps legible glyphs even when the world cells are tiny
    const cellPx = Math.max(3, Math.round((this.overlay ? Math.max(5, s.cellSize) : s.cellSize) * dpr));
    const ppm = f.ppm * dpr;
    const cols = Math.ceil(W / cellPx) + 1;
    const rows = Math.ceil(H / cellPx) + 1;
    const sub = Math.max(1, Math.min(4, Math.round(s.internalRes)));
    this.ensureTargets(cols, rows, sub);
    const scene = this.scene!;
    const shadow = this.shadow!;
    const cells = this.cells!;

    // Grid locked to world: quantize camera to whole cells, compose shifts by the remainder.
    const cellW = cellPx / ppm;
    const qx = Math.floor(f.camX / cellW) * cellW;
    const qy = Math.floor(f.camY / cellW) * cellW;
    const rx = f.camX - qx;
    const ry = f.camY - qy;
    const left = qx - W / (2 * ppm);
    const bottom = qy + H / (2 * ppm) + cellW;
    const view = new Float32Array([left, bottom - rows * cellW, cols * cellW, rows * cellW]);

    this.stats = { cols, rows, sceneW: scene.w, sceneH: scene.h, chunksDrawn: 0, instances: 0, gpuMs: this.stats.gpuMs };
    this.beginTimer();

    // Uniform arrays.
    this.lightsBuf.fill(0);
    this.lightColBuf.fill(0);
    f.lights.slice(0, MAX_LIGHTS).forEach((l, i) => {
      this.lightsBuf.set([l.x, l.y, l.radius, l.intensity], i * 4);
      this.lightColBuf.set(l.color, i * 3);
    });
    this.benderBuf.fill(0);
    this.benderBuf.set(f.benders.slice(0, MAX_BENDERS * 4));
    this.rippleBuf.fill(0);
    this.rippleBuf.set(f.ripples.slice(0, MAX_RIPPLES * 4));

    // Visible chunks (with margin for tall canopies and shadows).
    const vis: GpuChunk[] = [];
    const m = 7;
    for (const c of this.overlay ? [] : this.chunks) {
      const x0 = c.src.cx * CHUNK_SIZE;
      const y0 = c.src.cy * CHUNK_SIZE;
      if (x0 + CHUNK_SIZE + m < view[0]! || x0 - m > view[0]! + view[2]! || y0 + CHUNK_SIZE + m < view[1]! || y0 - m > view[1]! + view[3]!) continue;
      vis.push(c);
    }
    this.stats.chunksDrawn = vis.length;

    // Dynamic uploads.
    const dyn = [f.dyn, f.dynShadow, f.dynReflect];
    dyn.forEach((b, i) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf[i]!);
      gl.bufferData(gl.ARRAY_BUFFER, b.view(), gl.DYNAMIC_DRAW);
    });

    // ---- 1) shadow mask
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.fbo);
    gl.viewport(0, 0, shadow.w, shadow.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.useProgram(this.shadowProg.prog);
    gl.uniform4fv(this.shadowProg.u('uView'), view);
    gl.uniform1i(this.shadowProg.u('uMode'), 2);
    gl.uniform2f(this.shadowProg.u('uSunOffset'), f.sunOffset[0], f.sunOffset[1]);
    gl.uniform1f(this.shadowProg.u('uTime'), f.time);
    for (const c of vis) this.drawInstances(c.vao[1], c.counts[1]);
    this.drawInstances(this.dynVao[1]!, f.dynShadow.count);
    gl.disable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);

    // ---- 2) scene MRT
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    gl.viewport(0, 0, scene.w, scene.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    // glClear honours the depth write mask: it must be on, or last frame's depth survives
    // and silently rejects actors/props wherever the camera has moved (bug fixed in 0.2).
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.useProgram(this.ground.prog);
    this.setCommon(this.ground, f, view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tiles);
    gl.uniform1i(this.ground.u('uTiles'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadow.tex[0]!);
    gl.uniform1i(this.ground.u('uShadow'), 1);
    gl.uniform2f(this.ground.u('uWorldSize'), this.world.width, this.world.height);
    gl.uniform2f(this.ground.u('uSceneSize'), scene.w, scene.h);
    gl.uniform4fv(this.ground.u('uBenders'), this.benderBuf);
    gl.uniform1i(this.ground.u('uBenderCount'), Math.min(MAX_BENDERS, f.benders.length / 4));
    gl.uniform4fv(this.ground.u('uRipples'), this.rippleBuf);
    gl.uniform1i(this.ground.u('uRippleCount'), Math.min(MAX_RIPPLES, f.ripples.length / 4));
    gl.uniform1f(this.ground.u('uSunLight'), f.sunLight);
    gl.uniform1f(this.ground.u('uRain'), f.rain);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.grassTex);
    if (f.grass) {
      const g = f.grass;
      if (this.grassSize !== g.size) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, g.size, g.size, 0, gl.RG, gl.UNSIGNED_BYTE, g.data);
        this.grassSize = g.size;
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, g.size, g.size, gl.RG, gl.UNSIGNED_BYTE, g.data);
      gl.uniform4f(this.ground.u('uGrassRect'), g.x0, g.y0, g.size * g.cell, g.size * g.cell);
    } else gl.uniform4f(this.ground.u('uGrassRect'), 0, 0, 0, 0);
    gl.uniform1i(this.ground.u('uGrass'), 2);
    gl.bindVertexArray(this.emptyVao);
    if (!this.overlay) gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.shape.prog);
    this.setCommon(this.shape, f, view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tiles);
    gl.uniform1i(this.shape.u('uTiles'), 0);
    gl.uniform2f(this.shape.u('uWorldSize'), this.world.width, this.world.height);
    gl.uniform2f(this.shape.u('uPlayer'), f.player.x, f.player.y);
    this.seeBuf.fill(0);
    this.seeBuf.set(f.see.slice(0, MAX_SEE * 3));
    gl.uniform3fv(this.shape.u('uSee'), this.seeBuf);
    gl.uniform1i(this.shape.u('uSeeCount'), Math.min(MAX_SEE, f.see.length / 3));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sprites);
    gl.uniform1i(this.shape.u('uSpriteTex'), 1);
    gl.uniform4fv(this.shape.u('uSprites'), this.spriteRects);
    gl.uniform2f(this.shape.u('uSunOffset'), 0, 0);
    // reflections (on water only, under everything else)
    gl.uniform1i(this.shape.u('uMode'), 1);
    for (const c of vis) this.drawInstances(c.vao[2], c.counts[2]);
    this.drawInstances(this.dynVao[2]!, f.dynReflect.count);
    // objects with depth ordering by base Y
    gl.uniform1i(this.shape.u('uMode'), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    for (const c of vis) this.drawInstances(c.vao[0], c.counts[0]);
    this.drawInstances(this.dynVao[0]!, f.dyn.count);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    // ---- 3) cell pass: one fragment per ASCII cell
    gl.bindFramebuffer(gl.FRAMEBUFFER, cells.fbo);
    gl.viewport(0, 0, cells.w, cells.h);
    gl.useProgram(this.cell.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex[0]!);
    gl.uniform1i(this.cell.u('uSceneColor'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex[1]!);
    gl.uniform1i(this.cell.u('uSceneMat'), 1);
    gl.uniform2f(this.cell.u('uGrid'), cols, rows);
    gl.uniform4fv(this.cell.u('uView'), view);
    gl.uniform2f(this.cell.u('uPlayer'), f.player.x, f.player.y);
    gl.uniform1f(this.cell.u('uDensity'), s.density);
    gl.uniform1f(this.cell.u('uContrast'), s.contrast);
    gl.uniform1f(this.cell.u('uEdge'), s.edgeIntensity);
    gl.uniform1f(this.cell.u('uGlow'), s.glow);
    gl.uniform1f(this.cell.u('uRenderDist'), s.renderDistance);
    gl.uniform1f(this.cell.u('uLodDist'), s.lodDistance);
    gl.uniform1f(this.cell.u('uDither'), s.dither);
    gl.uniform1f(this.cell.u('uBgLevel'), s.bgLevel);
    gl.uniform1f(this.cell.u('uExposure'), 1.75);
    gl.uniform1i(this.cell.u('uPalette'), Math.round(s.palette));
    gl.uniform1i(this.cell.u('uSub'), sub);
    gl.uniform1i(this.cell.u('uFine'), 0);
    gl.uniform1i(this.cell.u('uFineOn'), this.fine ? 1 : 0);
    gl.uniform1f(this.cell.u('uTime'), f.time);
    gl.uniform1f(this.cell.u('uRain'), f.rain);
    gl.uniform1f(this.cell.u('uCellW'), cellW);
    gl.uniform1f(this.cell.u('uWindX'), f.windDir[0] * f.windStrength);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // ---- 3b) fine actor layer: twice the glyph resolution where characters are
    const fine = this.fine;
    if (fine) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fine.fbo);
      gl.viewport(0, 0, fine.w, fine.h);
      gl.uniform1i(this.cell.u('uFine'), 1);
      gl.uniform2f(this.cell.u('uGrid'), fine.w, fine.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ---- 4) compose to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    if (this.overlay) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.compose.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cells.tex[0]!);
    gl.uniform1i(this.compose.u('uFg'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cells.tex[1]!);
    gl.uniform1i(this.compose.u('uBg'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(this.compose.u('uAtlas'), 2);
    gl.uniform1i(this.compose.u('uFineOn'), fine ? 1 : 0);
    if (fine) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, fine.tex[0]!);
      gl.uniform1i(this.compose.u('uFineFg'), 3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, fine.tex[1]!);
      gl.uniform1i(this.compose.u('uFineBg'), 4);
    }
    gl.uniform2f(this.compose.u('uOffset'), rx * ppm, cellPx - ry * ppm);
    gl.uniform1f(this.compose.u('uCellPx'), cellPx);
    gl.uniform2f(this.compose.u('uGrid'), cols, rows);
    gl.uniform2f(this.compose.u('uScreen'), W, H);
    gl.uniform1f(this.compose.u('uGrain'), s.grain);
    gl.uniform1f(this.compose.u('uVignette'), s.vignette);
    gl.uniform1f(this.compose.u('uTime'), f.time);
    gl.uniform1f(this.compose.u('uFlash'), this.overlay ? 0 : f.flash);
    gl.uniform1i(this.compose.u('uOverlay'), this.overlay ? 1 : 0);
    gl.uniform3f(this.compose.u('uFlashColor'), f.flashColor[0], f.flashColor[1], f.flashColor[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.endTimer();
  }

  /** World meters -> CSS pixel position on the canvas (for the 2D overlay). */
  worldToScreen(f: { camX: number; camY: number; ppm: number }, x: number, y: number): { x: number; y: number } {
    return { x: (x - f.camX) * f.ppm + this.canvas.clientWidth / 2, y: (y - f.camY) * f.ppm + this.canvas.clientHeight / 2 };
  }

  private beginTimer(): void {
    const ext = this.timerExt;
    if (!ext) return;
    const gl = this.gl;
    // Resolve finished queries (non-blocking).
    while (this.queries.length) {
      const q = this.queries[0]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.queries.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) this.stats.gpuMs = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
      gl.deleteQuery(q);
    }
    if (this.queries.length > 3) return;
    const q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.queries.push(q);
    this.timing = true;
  }

  private endTimer(): void {
    const ext = this.timerExt;
    if (!ext || !this.timing) return;
    this.gl.endQuery(ext.TIME_ELAPSED_EXT);
    this.timing = false;
  }
}
