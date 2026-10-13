import { CHEST_NAMES, DT, zoneAt, TICK_RATE, Tile, generateWorld, tileAt, type AbilitySlot, type Prop, type CharacterSave, type ClassId, type EntitySnap } from '@etherfall/shared';
import { AudioEngine } from '../audio/audio';
import { Hud } from '../hud/hud';
import { WorldMap } from '../hud/map';
import { CharacterSheet, Menu } from '../hud/menu';
import { Overlay } from '../hud/overlay';
import { InputManager } from '../input/input';
import type { KeyMap } from '../input/keymap';
import { LOCAL_SESSION, LocalTransport, type Transport } from '../net/localTransport';
import { drawActor } from '../render/actors';
import type { AnimState } from '../render/rig';
import { InstanceBatch } from '../render/instances';
import { Renderer } from '../render/renderer';
import type { RenderSettings } from '../render/settings';
import { Camera } from './camera';
import { Effects } from './effects';
import { environmentAt } from './environment';
import { interpolate } from './interp';
import { GrassField } from './grass';
import { Minimap } from '../hud/minimap';
import { TalentPanel } from '../hud/talents';
import { InventoryPanel, type ItemOp } from '../hud/inventory';
import { ActorLayer, headOffset } from '../render3d/actors3d';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  /** Transparent canvas for the 3D actor layer (omitted or ?actors=ascii → ASCII bodies). */
  actors?: HTMLCanvasElement;
  hudRoot: HTMLElement;
  classId: ClassId;
  name: string;
  seed: number;
  settings: RenderSettings;
  keymap: KeyMap;
  audio: AudioEngine;
  dayOffset?: number;
  /** Force rain intensity (0..1); null = deterministic weather cycle. */
  rain?: number | null;
  /** Online play: an already-joined server transport (otherwise a local room is created). */
  transport?: Transport;
  /** Offline play: the saved character to load (progress is exported back via currentSave). */
  save?: CharacterSave;
}

/** Dev/preview flag: ?noactors=1 renders the world without characters. */
const HIDE_ACTORS = typeof location !== 'undefined' && new URLSearchParams(location.search).get('noactors') === '1';
/** ?actors=ascii keeps the old ASCII-rig characters instead of the 3D layer. */
const ASCII_ACTORS = typeof location !== 'undefined' && new URLSearchParams(location.search).get('actors') === 'ascii';

const hash1 = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Client orchestrator: transport (authority) -> interpolation -> presentation.
 * Owns no gameplay rules; everything it shows comes from snapshots and events.
 */
export class Game {
  readonly transport: Transport;
  readonly renderer: Renderer;
  readonly input: InputManager;
  readonly camera: Camera;
  readonly hud: Hud;
  readonly overlay: Overlay;
  readonly effects: Effects;
  readonly menu: Menu;
  readonly sheet: CharacterSheet;
  readonly map: WorldMap;
  readonly talents: TalentPanel;
  readonly inventory: InventoryPanel;
  /** Chest props of the world (prompt + open state come from the viewer's snapshot). */
  private chests: Prop[] = [];
  private zoneId = '';
  private dyn = new InstanceBatch(2048);
  private dynShadow = new InstanceBatch(256);
  private dynReflect = new InstanceBatch(64);
  private last = 0;
  private time = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private cpuMs = 0;
  private debug = false;
  private dayOffset: number;
  private running = false;
  private aim = 0;
  private views: EntitySnap[] = [];
  private animState = new Map<number, AnimState & { x: number; y: number }>();
  private anims = new Map<number, AnimState>();
  private grass = new GrassField(96, 0.5);
  readonly minimap: Minimap;
  readonly actors3d: ActorLayer | null;
  private lightningSlot = -1;
  private snapped = false;
  private saveRecord: CharacterSave | null;
  private thunderAt: number[] = [];

  constructor(private o: GameOptions) {
    const world = o.transport?.world ?? generateWorld(o.seed);
    this.transport = o.transport ?? new LocalTransport(world, o.name, o.classId, o.save);
    this.saveRecord = o.transport ? null : o.save ?? null;
    // the 3D ASCII view draws world + actors; the classic ASCII renderer then only carries effects on top
    this.actors3d = o.actors && !ASCII_ACTORS ? ActorLayer.create(o.actors, world) : null;
    if (o.actors && !this.actors3d) o.actors.style.display = 'none';
    if (o.actors && this.actors3d) o.canvas.parentElement?.insertBefore(o.actors, o.canvas);
    this.renderer = new Renderer(o.canvas, world, o.settings, !!this.actors3d);
    o.canvas.closest('#app')?.classList.toggle('mono-ui', !!this.actors3d);
    this.input = new InputManager(o.canvas, o.keymap);
    this.camera = new Camera(world.width, world.height);
    this.hud = new Hud(o.hudRoot, o.classId, o.keymap);
    this.overlay = new Overlay(o.overlay);
    this.effects = new Effects(world, o.audio, this.hud, this.overlay, this.camera);
    this.effects.particles.limit = o.settings.particleLimit;
    this.dayOffset = o.dayOffset ?? 0;
    this.menu = new Menu(o.hudRoot, {
      settings: o.settings,
      onSettings: (s) => {
        this.renderer.settings = s;
        this.effects.particles.limit = s.particleLimit;
      },
      input: this.input,
      onVolume: (v) => o.audio.setVolume(v),
      volume: o.audio.volume,
      onMusic: (v) => o.audio.music.setVolume(v),
      music: o.audio.music.userVolume,
      dayOffset: this.dayOffset,
      onDayOffset: (v) => (this.dayOffset = v),
    });
    this.sheet = new CharacterSheet(o.hudRoot, o.classId, (attr) => {
      const reply = this.transport.send({ t: 'allocate', attr });
      const err = reply.find((m) => m.t === 'error');
      if (err && err.t === 'error') this.hud.toast(err.message);
      else o.audio.play('ui');
    });
    const request = (msg: { t: 'talent'; node: string } | { t: 'equip'; slot: AbilitySlot; action: string | null } | { t: 'respec' } | ({ t: 'item' } & ItemOp)) => {
      const err = this.transport.send(msg).find((m) => m.t === 'error');
      if (err && err.t === 'error') this.hud.toast(err.message);
      else o.audio.play('ui');
    };
    this.talents = new TalentPanel(o.hudRoot, o.classId, (node) => request({ t: 'talent', node }), (slot, action) => request({ t: 'equip', slot, action }), () => request({ t: 'respec' }));
    this.inventory = new InventoryPanel(o.hudRoot, (op) => request({ t: 'item', ...op }));
    this.chests = world.props.filter((p) => p.kind === 'chest');
    this.map = new WorldMap(o.hudRoot, world);
    this.minimap = new Minimap(o.hudRoot, world);
    const me = this.transport.room?.sim.entities.get(this.transport.playerId);
    if (me) {
      this.camera.snap(me.pos.x, me.pos.y);
      this.snapped = true;
    }
    this.hud.message('Bem-vindo à Floresta do Crepúsculo. O Castelo de Vaelmor fica ao norte — sua cripta guarda aranhas gigantes. F: fogueira/portal · Esc: menu.', 'info');
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Offline play: the character's current progress as a save record (null online). */
  currentSave(): CharacterSave | null {
    const room = this.transport.room;
    if (!this.saveRecord || !room) return null;
    const next = room.exportCharacter(LOCAL_SESSION, this.saveRecord, Date.now());
    if (next) this.saveRecord = next;
    return next;
  }

  /** Live, read-only state used by automated E2E checks. */
  inspect(): Record<string, unknown> {
    const snap = this.transport.latest;
    const me = snap?.entities.find((e) => e.id === this.transport.playerId);
    return {
      tick: snap?.tick ?? 0,
      fps: this.fps,
      me: me ? { x: me.x, y: me.y, hp: me.hp, stamina: me.stamina, mana: me.mana, action: me.action } : null,
      enemiesVisible: snap?.entities.filter((e) => e.kind === 'enemy').length ?? 0,
      stats: { ...this.renderer.stats },
      actors3d: this.actors3d?.count ?? -1,
      grid3d: this.actors3d?.grid ?? { cols: 0, rows: 0 },
      particles: this.effects.particles.count,
    };
  }

  private frame(now: number): void {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    const t0 = performance.now();
    // Real elapsed time drives the authoritative clock (the transport caps its own backlog);
    // visuals use a clamped dt so a long hitch does not teleport particles/camera.
    const realDt = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.1, realDt);
    this.last = now;
    const anim = this.renderer.settings.animSpeed;
    this.time += dt * anim;

    for (const a of this.input.consumeUi()) this.ui(a);
    const wheel = this.input.consumeWheel();
    if (wheel && !this.menu.open) this.camera.zoomBy(wheel);

    // Aim: world angle from the player to the cursor.
    const latestMe = this.views.find((e) => e.id === this.transport.playerId);
    const ppm = this.camera.ppm;
    const cw = this.o.canvas.clientWidth;
    const ch = this.o.canvas.clientHeight;
    const camX = this.camera.x + this.camera.shakeX;
    const camY = this.camera.y + this.camera.shakeY;
    const mouseWX = camX + (this.input.mouseX - cw / 2) / ppm;
    const mouseWY = camY + (this.input.mouseY - ch / 2) / ppm;
    if (latestMe) this.aim = Math.atan2(mouseWY - (latestMe.y - 0.1), mouseWX - latestMe.x);

    const events = this.transport.update(realDt, () => this.input.sample(this.aim));
    const cur = this.transport.latest;
    if (!cur) return;
    this.views = interpolate(this.transport.previous, cur, this.transport.alpha);
    const byId = new Map(this.views.map((e) => [e.id, e]));
    const me = byId.get(this.transport.playerId) ?? null;
    this.effects.handle(events, this.transport.playerId, byId, this.time);
    for (const ev of events) if (ev.type === 'portal' && ev.id === this.transport.playerId) this.camera.snap(ev.x, ev.y);

    if (me && !this.snapped) {
      this.camera.snap(me.x, me.y);
      this.snapped = true;
    }
    if (me) this.camera.update(dt, me.x, me.y, mouseWX, mouseWY, cw, ch);
    const simSeconds = (cur.tick + this.transport.alpha) * DT;
    const env = environmentAt(simSeconds, this.dayOffset, this.o.rain ?? null);
    const region = me ? this.transport.world.regions.find((r) => me.x >= r.x0 && me.x < r.x1 && me.y >= r.y0 && me.y < r.y1) : undefined;
    const underground = region?.kind === 'dungeon';
    if (region?.kind === 'castle') {
      // inside the walls: sheltered from the rain
      env.rain = 0;
      env.storm = false;
      env.label = region.name;
    }
    if (underground) {
      env.ambient = [0.13, 0.12, 0.16];
      env.rain = 0;
      env.storm = false;
      env.windStrength = 0.05;
      env.sunLight = 0;
      env.label = region.name;
    }
    const night = underground ? 1 : 1 - env.sunLight;
    // Storm lightning: deterministic per half-second slot so every client flashes together.
    const slot = Math.floor(simSeconds * 2);
    if (env.storm && slot !== this.lightningSlot) {
      this.lightningSlot = slot;
      if (hash1(slot) < 0.035) {
        this.effects.flash = Math.max(this.effects.flash, 0.55);
        this.effects.flashColor = [0.78, 0.84, 1.0];
        this.thunderAt.push(this.time + 0.4 + hash1(slot + 7) * 1.4);
        this.thunderAt.sort((a, b) => a - b);
      }
    }
    if (this.thunderAt.length && this.time >= this.thunderAt[0]!) {
      this.thunderAt.shift();
      this.o.audio.play('skyThunder', me?.x, me?.y, 0.9);
      this.camera.addTrauma(0.12);
    }
    this.o.audio.listenerX = me?.x ?? 0;
    this.o.audio.listenerY = me?.y ?? 0;

    const hw = cw / 2 / ppm + 2;
    const hh = ch / 2 / ppm + 3;
    const view = { x0: this.camera.x - hw, y0: this.camera.y - hh, x1: this.camera.x + hw, y1: this.camera.y + hh + 2 };
    this.effects.ambient(dt * anim, this.time, this.views, this.transport.playerId, view, env.windDir, env.windStrength);
    if (me) {
      const amb = this.effects.ambienceLevels(me.x, me.y);
      this.o.audio.ambience(env.windStrength, amb.fire, amb.water, env.rain);
    }

    // Build dynamic geometry.
    this.dyn.clear();
    this.dynShadow.clear();
    this.dynReflect.clear();
    const world = this.transport.world;
    // locomotion state advances exactly once per entity per frame (2D decals and 3D rigs share it)
    const anims = this.anims;
    anims.clear();
    for (const e of this.views) if (e.kind !== 'projectile') anims.set(e.id, this.animFor(e, dt));
    const actorCtx = {
      tick: cur.tick,
      time: this.time,
      out: this.dyn,
      shadows: this.dynShadow,
      reflect: this.dynReflect,
      anim: (e: EntitySnap) => anims.get(e.id) ?? this.animFor(e, dt),
      bodies: !this.actors3d?.active,
      nearWater: (x: number, y: number) => {
        const t = tileAt(world, x, y);
        return t === Tile.ShallowWater || t === Tile.DeepWater;
      },
    };
    if (!HIDE_ACTORS) for (const e of this.views) drawActor(actorCtx, e);
    this.effects.drawPortals(this.dyn, this.time, view);
    this.effects.drawFlames(this.dyn, this.time, view);
    // grass springs: actors push, blasts kick
    for (const e of this.views) {
      if (e.kind === 'projectile') continue;
      this.grass.stamp(e.x, e.y, e.radius * 2.6, e.vx, e.vy, e.dead ? 0.3 : 1, dt);
    }
    for (const ev of events) {
      if (ev.type === 'shockwave') this.grass.blast(ev.x, ev.y, ev.radius * 1.8, 1.3);
      else if (ev.type === 'strike') this.grass.blast(ev.x, ev.y, ev.radius * 1.6, 1.1);
      else if (ev.type === 'dodge') this.grass.blast(ev.x, ev.y, 1.3, 0.5);
      else if (ev.type === 'death') this.grass.blast(ev.x, ev.y, 1.4, 0.6);
      else if (ev.type === 'hit') this.grass.blast(ev.x, ev.y, 1.0, 0.35);
    }
    this.grass.update(dt, this.camera.x, this.camera.y);
    if (me?.essenceMark) this.effects.drawEssence(this.dyn, me.essenceMark, this.time);
    this.effects.drawSpells(this.dyn, this.time, cur.zones ?? [], cur.tick + this.transport.alpha);
    this.effects.particles.draw(this.dyn, view.x0, view.y0 - 2, view.x1, view.y1);

    const lights = [
      ...this.effects.lights(this.time, view, this.views, me, night, me?.essenceMark ?? null),
      ...(cur.zones ?? []).map((z) => ({ x: z.x, y: z.y - 0.3, radius: z.r * 1.8, intensity: 0.8, color: z.kind === 'sanctuary' ? ([1, 0.85, 0.5] as const) : ([0.6, 0.4, 1] as const) })),
      ...this.transport.world.portals.map((p) => ({ x: p.x, y: p.y - 0.4, radius: 5, intensity: 1.1, color: [0.55, 0.4, 1] as const })),
    ].sort((a, b) => Math.hypot(a.x - camX, a.y - camY) - Math.hypot(b.x - camX, b.y - camY));
    this.renderer.render({
      camX,
      camY,
      ppm,
      time: this.time,
      ambient: env.ambient,
      lights,
      windDir: env.windDir,
      windStrength: env.windStrength,
      sunOffset: env.sunOffset,
      sunLight: env.sunLight,
      player: { x: me?.x ?? 0, y: me?.y ?? 0 },
      see: this.seeThrough(me),
      benders: this.effects.benders(this.views, this.time),
      ripples: this.effects.rippleUniforms(view),
      dyn: this.dyn,
      dynShadow: this.dynShadow,
      dynReflect: this.dynReflect,
      flash: this.effects.flash,
      flashColor: this.effects.flashColor,
      rain: this.actors3d ? 0 : env.rain, // the 3D view draws its own rain
      grass: this.grass,
    });

    if (this.actors3d) {
      this.actors3d.render({
        views: HIDE_ACTORS ? [] : this.views,
        viewW: cw,
        viewH: ch,
        camX,
        camY,
        ppm,
        dt,
        time: this.time,
        tick: cur.tick,
        anim: (e) => anims.get(e.id) ?? this.animFor(e, dt),
        ambient: env.ambient,
        sunLight: underground ? 0 : env.sunLight,
        lights: me ? [...lights].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)) : lights,
        flash: this.effects.flash,
        player: me ? { x: me.x, y: me.y } : null,
        windDir: env.windDir,
        windStrength: env.windStrength,
        rain: env.rain,
        cellSize: this.renderer.settings.cellSize,
        grass: this.grass,
        renderDistance: this.renderer.settings.renderDistance,
        vignette: this.renderer.settings.vignette,
        contrast: this.renderer.settings.contrast,
        density: this.renderer.settings.density,
        dither: this.renderer.settings.dither,
        edges: this.renderer.settings.edgeIntensity,
      });
    }

    // Overlay + HUD.
    const toScreen = (x: number, y: number) => ({ x: (x - camX) * ppm + cw / 2, y: (y - camY) * ppm + ch / 2 });
    let prompt: { x: number; y: number; text: string } | null = null;
    if (me && !me.dead && !me.action) {
      const key = this.o.keymap.interact[0]?.replace('Key', '') ?? 'F';
      const portal = this.effects.nearestPortal(me.x, me.y);
      const b = this.effects.nearestBonfire(me.x, me.y, 2.35);
      const opened = me.openedChests ?? [];
      let chest: { x: number; y: number; size: number } | null = null;
      for (const c of this.chests) if (!opened.includes(c.id) && Math.hypot(c.x - me.x, c.y - me.y) < 2.05 && (!b || Math.hypot(c.x - me.x, c.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y))) chest = c;
      // TALK_RANGE (2.4) in playerControl.ts, a little under so the prompt never lies
      const folk = this.views.find((v) => v.enemyId === 'villager' && !v.dead && Math.hypot(v.x - me.x, v.y - me.y) < 2.3);
      if (portal) prompt = { x: portal.x, y: portal.y - 0.8, text: `[${key}] ${portal.name}` };
      else if (chest) prompt = { x: chest.x, y: chest.y - 0.8, text: `[${key}] Abrir ${CHEST_NAMES[Math.round(chest.size)] ?? 'baú'}` };
      else if (folk && (!b || Math.hypot(folk.x - me.x, folk.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y))) prompt = { x: folk.x, y: folk.y + 1.1, text: `[${key}] Falar` };
      else if (b) prompt = { x: b.x, y: b.y - 0.6, text: `[${key}] Sentar na fogueira` };
    }
    // entering a new level region: a banner with its name and levels
    const zone = me ? zoneAt(this.transport.world, me.x, me.y) : null;
    if (zone && zone.id !== this.zoneId) {
      if (this.zoneId) {
        this.hud.toast(`${zone.name} · Nv ${zone.minLevel}–${zone.maxLevel}`);
        if (me && me.level < zone.minLevel - 2) this.hud.message(`Cuidado: ${zone.name} é para nível ${zone.minLevel} ou mais.`, 'bad');
      }
      this.zoneId = zone.id;
    }
    this.overlay.groundLoot = cur.loot ?? [];
    this.overlay.viewer = me ? { x: me.x, y: me.y } : null;
    this.overlay.draw(this.views, this.transport.playerId, toScreen, ppm, cur.tick, prompt, this.actors3d ? headOffset : undefined);
    if (me) this.hud.update(me, cur.tick, this.pickTarget(mouseWX, mouseWY));
    this.map.draw(this.views, this.transport.playerId);
    this.minimap.draw(this.views, this.transport.playerId, this.map.open);
    this.sheet.update(me);
    this.talents.update(me);
    this.inventory.update(me);

    this.cpuMs = this.cpuMs * 0.9 + (performance.now() - t0) * 0.1;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      const s = this.renderer.stats;
      const base = `FPS ${this.fps} · CPU ${this.cpuMs.toFixed(1)} ms${s.gpuMs ? ` · GPU ${s.gpuMs.toFixed(1)} ms` : ''} · ${env.label} ${String(Math.floor(env.timeOfDay * 24)).padStart(2, '0')}h`;
      this.hud.setPerf(
        this.debug
          ? `${base}\ntick ${cur.tick} (${TICK_RATE} Hz) · entidades ${cur.entities.length}\ncélulas ${s.cols}×${s.rows} · cena ${s.sceneW}×${s.sceneH}\nchunks ${s.chunksDrawn} · instâncias ${s.instances} · partículas ${this.effects.particles.count}\nvento ${env.windStrength.toFixed(2)} · zoom ${this.camera.zoom.toFixed(2)}`
          : base,
      );
    }
  }

  /** Walk phase from distance travelled; facing side is sticky so vertical moves don't flicker. */
  private animFor(e: EntitySnap, dt: number): AnimState {
    let a = this.animState.get(e.id);
    if (!a) {
      a = { phase: (e.id * 1.7) % (Math.PI * 2), side: Math.cos(e.facing) >= 0 ? 1 : -1, speed: 0, x: e.x, y: e.y };
      this.animState.set(e.id, a);
    }
    const d = Math.hypot(e.x - a.x, e.y - a.y);
    if (d < 2) {
      a.phase += (d / 1.45) * Math.PI;
      const inst = dt > 0 ? d / dt : 0;
      a.speed += (inst - a.speed) * Math.min(1, dt * 10);
    }
    a.x = e.x;
    a.y = e.y;
    const fx = Math.cos(e.action ? e.adir : e.facing);
    if (Math.abs(fx) > 0.2) a.side = fx >= 0 ? 1 : -1;
    return a;
  }

  /** The local player first, then the nearest living actors: foliage turns see-through around them. */
  private seeThrough(me: EntitySnap | null): number[] {
    const list = this.views.filter((e) => e.kind !== 'projectile' && !e.dead && e.id !== me?.id);
    if (me) list.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    const out: number[] = [];
    if (me) out.push(me.x, me.y - 0.3, 2.4);
    for (const e of list.slice(0, 7)) out.push(e.x, e.y - 0.3, 1.9);
    return out;
  }

  private pickTarget(wx: number, wy: number): EntitySnap | null {
    let best: EntitySnap | null = null;
    let bd = 1.6;
    for (const e of this.views) {
      if (e.kind !== 'enemy' || e.dead || e.team === 0) continue;
      const d = Math.hypot(e.x - wx, e.y - 0.2 - wy);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) return best;
    if (this.time < this.effects.lastTargetUntil) return this.views.find((e) => e.id === this.effects.lastTargetId) ?? null;
    return null;
  }

  private ui(a: string): void {
    const me = this.views.find((e) => e.id === this.transport.playerId) ?? null;
    switch (a) {
      case 'menu':
        if (this.map.open) this.map.toggle();
        else if (this.sheet.open) this.sheet.toggle(me);
        else if (this.talents.open) this.talents.toggle(me);
        else if (this.inventory.open) this.inventory.toggle(me);
        else this.menu.toggle();
        break;
      case 'map':
        this.map.toggle();
        break;
      case 'character':
        this.sheet.toggle(me);
        break;
      case 'talents':
        this.talents.toggle(me);
        break;
      case 'debug':
        this.debug = !this.debug;
        break;
      case 'inventory':
        this.inventory.toggle(me);
        break;
      case 'quests':
        this.hud.toast('Missões: ainda não implementadas');
        break;
      case 'context':
        this.hud.toast('Ação contextual (G): ainda não implementada');
        break;
    }
  }
}

declare global {
  interface Window {
    __etherfall?: Game;
  }
}
