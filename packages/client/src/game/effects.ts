import { ACTIONS, Tile, tileAt, type EntitySnap, type Prop, type SimEvent, type WorldData } from '@etherfall/shared';
import type { AudioEngine } from '../audio/audio';
import { projectileStyle } from '../render/actors';
import { ELEMENT_RGB } from '../render/elements';
import type { Hud } from '../hud/hud';
import type { Overlay } from '../hud/overlay';
import { InstanceBatch, Shape, type RGB } from '../render/instances';
import { Mat } from '../render/materials';
import type { Light } from '../render/renderer';
import type { Camera } from './camera';
import { Particles } from './particles';

/** Ring colours of the skill-tree zones (outer, inner). */
const ZONE_COLORS: Record<string, [RGB, RGB]> = {
  thorns: [[0.45, 0.75, 0.3], [0.6, 0.5, 0.25]],
  poison: [[0.4, 1.0, 0.3], [0.25, 0.6, 0.2]],
  illusion: [[0.85, 0.6, 1.0], [0.6, 0.85, 1.0]],
  fire: [[1.0, 0.5, 0.15], [1.0, 0.8, 0.3]],
  banner: [[0.95, 0.7, 0.35], [1.0, 0.9, 0.6]],
};


interface TransientLight extends Light {
  born: number;
  life: number;
}

const rand = Math.random; // visual-only randomness (never feeds the simulation)

/**
 * Client-side presentation of authoritative events: particles, sounds, camera shake,
 * screen flashes, floating text, transient lights, water ripples and grass pushes.
 */
export class Effects {
  readonly particles = new Particles(4096);
  private ripples: number[] = [];
  private pulses: Array<{ x: number; y: number; t0: number; r: number }> = [];
  private tLights: TransientLight[] = [];
  private stepAcc = new Map<number, { x: number; y: number; d: number }>();
  private trees: Prop[];
  private bonfires: Prop[];
  private torches: Prop[];
  private spikes: Array<{ x: number; y: number; dir: number; born: number; r: number }> = [];
  private warns: Array<{ x: number; y: number; r: number; born: number; until: number; color: RGB }> = [];
  /** Projectile id → action that fired it (for impact colors). */
  private projNames = new Map<number, string>();
  private arrowsFalling: Array<{ x: number; y: number; born: number }> = [];
  private voidClaws: Array<{ x: number; y: number; born: number; r: number }> = [];
  private bolts: Array<{ pts: Array<[number, number]>; born: number; x: number; y: number; color?: RGB }> = [];
  flash = 0;
  flashColor: RGB = [1, 1, 1];
  lastTargetId = -1;
  lastTargetUntil = 0;

  constructor(
    private world: WorldData,
    private audio: AudioEngine,
    private hud: Hud,
    private overlay: Overlay,
    private camera: Camera,
  ) {
    this.trees = world.props.filter((p) => p.kind === 'tree' || p.kind === 'pine');
    this.bonfires = world.props.filter((p) => p.kind === 'bonfire');
    this.torches = world.props.filter((p) => p.kind === 'torch');
  }

  private isWater(x: number, y: number): boolean {
    const t = tileAt(this.world, x, y);
    return t === Tile.ShallowWater || t === Tile.DeepWater;
  }

  ripple(x: number, y: number, time: number, strength = 1): void {
    this.ripples.push(x, y, time, strength);
    if (this.ripples.length > 64) this.ripples.splice(0, 4);
  }

  handle(events: SimEvent[], me: number, byId: Map<number, EntitySnap>, time: number): void {
    const A = this.audio;
    for (const ev of events) {
      switch (ev.type) {
        case 'swing': {
          const heavy = /heavy|overhead|lunge|seismic/.test(ev.actionId);
          A.play(heavy ? 'heavySwing' : 'swing', ev.x, ev.y, ev.id === me ? 0.8 : 0.6);
          break;
        }
        case 'telegraph':
          A.play(ev.danger ? 'telegraphDanger' : 'telegraph', ev.x, ev.y);
          break;
        case 'hit': {
          if (ev.dot) {
            // poison / curse ticks: small rising numbers, no blood, no shake
            this.overlay.combat(ev.x + (rand() - 0.5) * 0.6, ev.y - 1.0, 'dot', `${ev.amount}`, ev.dot === 'poison' ? '#8dff5a' : ev.dot === 'burn' ? '#ff9a3d' : '#c98aff');
            this.particles.burst(4, ev.x, ev.y - 0.5, -Math.PI / 2, 1.2, 1.2, 1.5, 0.8, 0.06, ev.dot === 'poison' ? [0.4, 1, 0.3] : ev.dot === 'burn' ? [1, 0.5, 0.15] : [0.7, 0.35, 1], ev.dot === 'burn' ? Mat.Fire : Mat.Magic, rand, { emis: 0.8, grav: -0.6 });
            break;
          }
          const victim = byId.get(ev.target);
          const onMe = ev.target === me;
          const arcane = ev.dtype === 'arcane';
          const blood: RGB = victim?.kind === 'enemy' ? [0.34, 0.05, 0.04] : [0.62, 0.04, 0.04];
          this.particles.burst(arcane ? 8 : 14, ev.x, ev.y, ev.dir, 1.4, 4.5, 2.5, 0.9, 0.11, arcane ? [0.5, 0.75, 1] : blood, arcane ? Mat.Magic : Mat.Blood, rand, arcane ? { emis: 1, grav: 2 } : {});
          if (!arcane) for (let i = 0; i < 3; i++) this.particles.spawn(ev.x + (rand() - 0.5) * 0.8, ev.y + (rand() - 0.5) * 0.6, 0, 0, 0, 0, 7, 0.16, blood, Mat.Blood, { grav: 0 });
          A.play(arcane ? 'boltHit' : 'hitFlesh', ev.x, ev.y);
          const crit = ev.crit === 'riposte' ? 'CONTRA-GOLPE' : ev.crit === 'backstab' ? 'PELAS COSTAS' : ev.crit === 'critical' ? 'CRÍTICO' : '';
          const big = !!crit;
          this.overlay.combat(ev.x, ev.y - 0.9, big ? 'crit' : 'dmg', `${ev.amount}`, onMe ? '#ff5a46' : big ? '#ffa526' : '#ffffff', big && ev.crit !== 'critical' ? crit : undefined);
          if (onMe) {
            this.camera.addTrauma(0.45);
            this.flash = Math.max(this.flash, 0.14);
            this.flashColor = [0.5, 0, 0];
          } else if (ev.attacker === me) {
            this.camera.addTrauma(crit ? 0.35 : 0.18);
            this.lastTargetId = ev.target;
            this.lastTargetUntil = time + 6;
          }
          break;
        }
        case 'block':
          this.particles.burst(9, ev.x, ev.y - 0.3, 0, Math.PI * 2, 4, 3, 0.4, 0.07, [1, 0.85, 0.4], Mat.Spark, rand, { emis: 1 });
          A.play('block', ev.x, ev.y);
          if (ev.target === me) this.camera.addTrauma(0.15);
          this.overlay.float(ev.x, ev.y - 0.6, `bloqueado ${ev.amount}`, '#c9c2b0', 11);
          break;
        case 'parry':
          this.particles.burst(24, ev.x, ev.y - 0.3, 0, Math.PI * 2, 6, 3, 0.5, 0.08, [1, 0.95, 0.6], Mat.Spark, rand, { emis: 1 });
          this.tLights.push({ x: ev.x, y: ev.y, radius: 6, intensity: 1.6, color: [1, 0.9, 0.6], born: time, life: 0.35 });
          A.play('parry', ev.x, ev.y);
          this.overlay.float(ev.x, ev.y - 0.8, 'APARADO!', '#ffd34d', 16, 1.4);
          if (ev.target === me) {
            this.flash = 0.16;
            this.flashColor = [1, 0.95, 0.8];
            this.camera.addTrauma(0.25);
            this.hud.message('Aparo perfeito — contra-ataque agora!', 'good');
          }
          break;
        case 'guardBreak':
          A.play('guardBreak', ev.x, ev.y);
          this.overlay.float(ev.x, ev.y - 0.8, 'GUARDA QUEBRADA', '#ff8a4d', 13);
          if (ev.target === me) this.camera.addTrauma(0.4);
          break;
        case 'stagger':
          this.particles.burst(6, ev.x, ev.y - 0.5, -Math.PI / 2, 1.2, 2, 2, 0.5, 0.07, [1, 0.9, 0.5], Mat.Spark, rand, { emis: 0.8 });
          break;
        case 'evade':
          this.overlay.combat(ev.x, ev.y - 0.9, 'miss', 'MISS', '#9fd8ff');
          break;
        case 'dodge':
          this.particles.burst(8, ev.x, ev.y, ev.dir + Math.PI, 1.6, 2.2, 0.8, 0.5, 0.12, [0.45, 0.4, 0.32], Mat.Dust, rand, { grav: 1.5 });
          A.play('dodge', ev.x, ev.y, 0.7);
          if (this.isWater(ev.x, ev.y)) this.ripple(ev.x, ev.y, time, 1.2);
          break;
        case 'shockwave':
          this.particles.burst(36, ev.x, ev.y, 0, Math.PI * 2, 8, 4, 0.8, 0.12, [0.45, 0.4, 0.33], Mat.Stone, rand, {});
          this.particles.burst(24, ev.x, ev.y, 0, Math.PI * 2, 5, 1, 0.9, 0.18, [0.5, 0.45, 0.35], Mat.Dust, rand, { grav: 1 });
          this.pulses.push({ x: ev.x, y: ev.y, t0: time, r: ev.radius });
          this.tLights.push({ x: ev.x, y: ev.y, radius: 7, intensity: 1.2, color: [1, 0.65, 0.3], born: time, life: 0.4 });
          A.play('shockwave', ev.x, ev.y);
          this.camera.addTrauma(ev.id === me ? 0.55 : 0.3);
          if (this.isWater(ev.x, ev.y)) this.ripple(ev.x, ev.y, time, 2);
          break;
        case 'projectile': {
          const name = byId.get(ev.id)?.name ?? byId.get(ev.ownerId)?.action ?? '';
          this.projNames.set(ev.id, name);
          A.play(projectileStyle(name).light ? 'cast' : 'swing', ev.x, ev.y, 0.8);
          break;
        }
        case 'projectileEnd': {
          const st = projectileStyle(this.projNames.get(ev.id) ?? '');
          this.projNames.delete(ev.id);
          if (st.light) {
            this.particles.burst(14, ev.x, ev.y - 0.4, 0, Math.PI * 2, 3.5, 2, 0.5, 0.09, st.core, Mat.Magic, rand, { emis: 1, grav: 1 });
            this.tLights.push({ x: ev.x, y: ev.y, radius: 4, intensity: 1.1, color: st.light, born: time, life: 0.3 });
          } else {
            this.particles.burst(6, ev.x, ev.y - 0.3, 0, Math.PI * 2, 2, 2, 0.4, 0.05, [0.7, 0.62, 0.5], Mat.Spark, rand, { emis: 0.3, grav: 2 });
          }
          if (this.isWater(ev.x, ev.y)) this.ripple(ev.x, ev.y, time, 1.5);
          break;
        }
        case 'death':
          if (ev.id === me) {
            A.play('playerDeath');
            this.hud.message('Você pereceu.', 'bad');
          } else {
            A.play('death', ev.x, ev.y);
          }
          for (let i = 0; i < 6; i++) this.particles.spawn(ev.x + (rand() - 0.5), ev.y + (rand() - 0.5) * 0.7, 0, 0, 0, 0, 9, 0.22, [0.3, 0.03, 0.03], Mat.Blood, { grav: 0 });
          break;
        case 'kill':
          if (ev.killer === me) this.hud.message(`${byId.get(ev.victim)?.name ?? 'Inimigo'} derrotado`, 'good');
          break;
        case 'respawn':
          if (ev.id === me) this.hud.message('Você despertou na fogueira.', 'info');
          break;
        case 'rest':
          A.play('rest', ev.x, ev.y);
          this.particles.burst(20, ev.x, ev.y - 0.3, -Math.PI / 2, 1.5, 1.5, 3, 1.2, 0.07, [1, 0.6, 0.2], Mat.Fire, rand, { emis: 1, grav: -0.5 });
          if (ev.id === me) this.hud.message('Fogueira: vida, stamina e mana restauradas. Ponto de retorno definido.', 'good');
          break;
        case 'xp':
          if (ev.id === me && ev.reason !== 'essence') this.overlay.float(byId.get(me)?.x ?? 0, (byId.get(me)?.y ?? 0) - 1.2, `+${ev.amount} XP`, '#e2c06a', 12, 1.4);
          break;
        case 'levelUp':
          if (ev.id === me) {
            A.play('levelUp');
            this.hud.message(`Nível ${ev.level}! +3 atributos (C) · +1 ponto na árvore de habilidades (K)`, 'good');
            this.hud.toast(`NÍVEL ${ev.level}`);
            this.flash = 0.12;
            this.flashColor = [1, 0.85, 0.45];
          }
          this.particles.burst(40, ev.x, ev.y, -Math.PI / 2, Math.PI * 2, 3, 4, 1.4, 0.08, [1, 0.85, 0.4], Mat.Spark, rand, { emis: 1, grav: 1 });
          this.tLights.push({ x: ev.x, y: ev.y, radius: 7, intensity: 1.4, color: [1, 0.85, 0.45], born: time, life: 0.9 });
          break;
        case 'discover':
          if (ev.id === me) {
            A.play('discover');
            this.hud.toast(`Descoberto: ${ev.name}`);
            this.hud.message(`Local descoberto: ${ev.name}${ev.xp ? ` (+${ev.xp} XP)` : ''}`, 'good');
          }
          break;
        case 'essenceDropped':
          if (ev.id === me) this.hud.message(`Sua essência (${ev.amount} XP) ficou onde você caiu. Volte para recuperá-la.`, 'bad');
          break;
        case 'essenceRecovered':
          if (ev.id === me) {
            A.play('essence', ev.x, ev.y);
            this.hud.message(`Essência recuperada (+${ev.amount} XP)`, 'good');
          }
          this.particles.burst(30, ev.x, ev.y, -Math.PI / 2, Math.PI * 2, 2.5, 4, 1.2, 0.08, [0.7, 1, 0.6], Mat.Magic, rand, { emis: 1, grav: -0.5 });
          break;
        case 'essenceLost':
          if (ev.id === me) this.hud.message(`Você morreu antes de recuperar a essência: ${ev.amount} XP perdidos.`, 'bad');
          break;
        case 'spikes': {
          this.spikes.push({ x: ev.x, y: ev.y, dir: ev.dir, born: time, r: ev.radius });
          this.particles.burst(7, ev.x, ev.y, 0, Math.PI * 2, 2.5, 3, 0.6, 0.06, [0.75, 0.9, 1], Mat.Splash, rand, { emis: 0.4 });
          if (ev.idx % 2 === 0) A.play('ice', ev.x, ev.y, 0.7);
          if (this.isWater(ev.x, ev.y)) this.ripple(ev.x, ev.y, time, 1.4);
          this.tLights.push({ x: ev.x, y: ev.y - 0.5, radius: 3, intensity: 0.7, color: [0.55, 0.8, 1], born: time, life: 0.6 });
          break;
        }
        case 'summon': {
          // fel portal: green fire bursts from the ground as the creature crawls out
          this.particles.burst(30, ev.x, ev.y - 0.3, -Math.PI / 2, 1.4, 4, 3, 0.9, 0.08, ev.enemyId === 'imp' ? [1, 0.55, 0.2] : [0.4, 1, 0.45], Mat.Magic, rand, { emis: 1, grav: -1.2 });
          this.pulses.push({ x: ev.x, y: ev.y, t0: time, r: ev.enemyId === 'voidguard' ? 2.4 : 1.2 });
          this.tLights.push({ x: ev.x, y: ev.y - 0.6, radius: 6, intensity: 1.6, color: [0.4, 1, 0.45], born: time, life: 0.6 });
          A.play('zone', ev.x, ev.y);
          if (ev.enemyId === 'voidguard') this.camera.addTrauma(0.35);
          break;
        }
        case 'unsummon':
          this.particles.burst(18, ev.x, ev.y - 0.5, 0, Math.PI * 2, 2, 2, 0.7, 0.08, [0.3, 0.25, 0.35], Mat.Dust, rand, { grav: -0.5, drag: 1 });
          break;
        case 'zone':
          A.play('zone', ev.x, ev.y);
          break;
        case 'seal':
          A.play('seal', ev.x, ev.y);
          this.particles.burst(18, ev.x, ev.y - 0.6, 0, Math.PI * 2, 1.8, 2, 0.8, 0.07, [1, 0.85, 0.4], Mat.Magic, rand, { emis: 1, grav: 0.5 });
          this.overlay.float(ev.x, ev.y - 1.6, 'PRESO', '#ffd34d', 12);
          break;
        case 'strikeWarn':
          {
            const cls = byId.get(ev.ownerId)?.classId;
            const el = ACTIONS[ev.actionId]?.element;
            const color: RGB = el ? ELEMENT_RGB[el] : cls === 'ranger' ? [0.85, 0.65, 0.35] : cls === 'warlock' ? [0.45, 0.95, 0.5] : [0.42, 0.55, 0.85];
            this.warns.push({ x: ev.x, y: ev.y, r: ev.radius, born: time, until: time + ev.ticks / 30, color });
          }
          break;
        case 'strike': {
          const owner = byId.get(ev.ownerId);
          const el = ACTIONS[ev.actionId]?.element;
          if (el === 'fire') {
            // meteor: a burning rock out of the sky, a ring of fire and embers
            this.bolts.push({ pts: [[ev.x + 3, ev.y - 12], [ev.x + 1.5, ev.y - 6], [ev.x, ev.y]], born: time, x: ev.x, y: ev.y, color: [1, 0.55, 0.2] });
            this.particles.burst(40, ev.x, ev.y - 0.2, -Math.PI / 2, 2.4, 7, 5, 1.0, 0.09, [1, 0.5, 0.15], Mat.Fire, rand, { emis: 1, grav: 1.5 });
            this.particles.burst(16, ev.x, ev.y, 0, Math.PI * 2, 3, 1, 1.4, 0.18, [0.2, 0.17, 0.15], Mat.Dust, rand, { grav: -0.2 });
            this.tLights.push({ x: ev.x, y: ev.y - 0.6, radius: 11, intensity: 2.8, color: [1, 0.5, 0.2], born: time, life: 0.6 });
            this.pulses.push({ x: ev.x, y: ev.y, t0: time, r: ev.radius });
            this.warns = this.warns.filter((w) => Math.hypot(w.x - ev.x, w.y - ev.y) > 0.05);
            this.camera.addTrauma(0.4);
            A.play('thunder', ev.x, ev.y, 0.8);
            break;
          }
          if (el === 'shadow') {
            this.voidClaws.push({ x: ev.x, y: ev.y, born: time, r: ev.radius });
            this.particles.burst(24, ev.x, ev.y - 0.4, -Math.PI / 2, 1.4, 5, 4, 0.9, 0.08, [0.65, 0.45, 1], Mat.Magic, rand, { emis: 1, grav: -1 });
            this.warns = this.warns.filter((w) => Math.hypot(w.x - ev.x, w.y - ev.y) > 0.05);
            A.play('thunder', ev.x, ev.y, 0.5);
            break;
          }
          if (el === 'nature' || (el === undefined && owner?.classId === 'ranger')) {
            // arrow rain: a volley of shafts slamming into the ground
            for (let i = 0; i < 4; i++) {
              const ax = ev.x + (rand() - 0.5) * ev.radius * 1.4;
              const ay = ev.y + (rand() - 0.5) * ev.radius;
              this.arrowsFalling.push({ x: ax, y: ay, born: time + i * 0.03 });
            }
            this.particles.burst(10, ev.x, ev.y, 0, Math.PI * 2, 3, 1.5, 0.6, 0.08, [0.45, 0.38, 0.3], Mat.Dust, rand, { grav: 2 });
            this.warns = this.warns.filter((w) => Math.hypot(w.x - ev.x, w.y - ev.y) > 0.05);
            A.play('hitFlesh', ev.x, ev.y, 0.4);
            break;
          }
          if (owner?.classId === 'warlock') {
            // void claws erupting from below
            this.voidClaws.push({ x: ev.x, y: ev.y, born: time, r: ev.radius });
            this.particles.burst(28, ev.x, ev.y - 0.4, -Math.PI / 2, 1.4, 5, 4, 0.9, 0.08, [0.45, 1, 0.5], Mat.Magic, rand, { emis: 1, grav: -1 });
            this.tLights.push({ x: ev.x, y: ev.y - 0.8, radius: 8, intensity: 2.0, color: [0.4, 1, 0.45], born: time, life: 0.45 });
            this.pulses.push({ x: ev.x, y: ev.y, t0: time, r: ev.radius });
            this.warns = this.warns.filter((w) => Math.hypot(w.x - ev.x, w.y - ev.y) > 0.05);
            this.camera.addTrauma(0.3);
            A.play('thunder', ev.x, ev.y, 0.6);
            break;
          }
          // jagged bolt from the sky (12 m above, i.e. off the top of the screen) to the impact point
          const pts: Array<[number, number]> = [];
          let x = ev.x + (rand() - 0.5) * 2;
          const top = ev.y - 12;
          for (let i = 0; i <= 14; i++) {
            const t = i / 14;
            x += (rand() - 0.5) * 0.9 * (1 - t * 0.6);
            pts.push([i === 14 ? ev.x : x + (ev.x - x) * t * t, top + (ev.y - top) * t]);
          }
          this.bolts.push({ pts, born: time, x: ev.x, y: ev.y, color: el ? ELEMENT_RGB[el] : undefined });
          this.warns = this.warns.filter((w) => Math.hypot(w.x - ev.x, w.y - ev.y) > 0.05);
          A.play('thunder', ev.x, ev.y);
          this.particles.burst(26, ev.x, ev.y, 0, Math.PI * 2, 6, 5, 0.6, 0.07, [0.75, 0.85, 1], Mat.Spark, rand, { emis: 1 });
          this.particles.burst(14, ev.x, ev.y, 0, Math.PI * 2, 3, 1, 1.2, 0.16, [0.25, 0.22, 0.2], Mat.Dust, rand, { grav: 1 });
          this.tLights.push({ x: ev.x, y: ev.y - 0.8, radius: 10, intensity: 2.6, color: [0.7, 0.8, 1], born: time, life: 0.35 });
          this.pulses.push({ x: ev.x, y: ev.y, t0: time, r: ev.radius });
          this.flash = Math.max(this.flash, 0.22);
          this.flashColor = [0.75, 0.85, 1];
          this.camera.addTrauma(0.35);
          if (this.isWater(ev.x, ev.y)) this.ripple(ev.x, ev.y, time, 2.5);
          break;
        }
        case 'status':
          if (ev.status === 'slow') this.overlay.float(ev.x, ev.y - 1.9, 'LENTO', '#9fd4ff', 11, 0.9);
          if (ev.status === 'poison') this.overlay.float(ev.x, ev.y - 1.9, 'ENVENENADO', '#8dff5a', 11, 0.9);
          if (ev.status === 'curse') this.overlay.float(ev.x, ev.y - 1.9, 'AMALDIÇOADO', '#c98aff', 11, 0.9);
          if (ev.status === 'burn') this.overlay.float(ev.x, ev.y - 1.9, 'QUEIMANDO', '#ff9a3d', 11, 0.9);
          if (ev.status === 'empower') {
            A.play('buff', ev.x, ev.y);
            this.overlay.float(ev.x, ev.y - 2.0, 'FÚRIA', '#ff7a4d', 13);
            this.particles.burst(16, ev.x, ev.y - 0.5, -Math.PI / 2, 1.6, 3, 2, 0.6, 0.07, [1, 0.4, 0.15], Mat.Fire, rand, { emis: 1, grav: -1 });
          }
          if (ev.status === 'stealth') {
            this.overlay.float(ev.x, ev.y - 2.0, 'FURTIVO', '#b8a8d8', 12);
            this.particles.burst(30, ev.x, ev.y - 0.3, 0, Math.PI * 2, 2.5, 1.5, 1.6, 0.25, [0.32, 0.3, 0.34], Mat.Dust, rand, { grav: -0.3, drag: 1.2 });
          }
          if (ev.status === 'ironguard') {
            A.play('buff', ev.x, ev.y);
            this.overlay.float(ev.x, ev.y - 2.0, 'GUARDA DE FERRO', '#ffd77a', 12);
          }
          if (ev.status === 'counter' && ev.target === me) this.hud.toast('Contra-ataque liberado! (3)');
          break;
        case 'heal': {
          const t = byId.get(ev.target);
          this.overlay.combat(ev.x, ev.y - 1.2, 'heal', `+${ev.amount}`, '#6dff8a');
          this.particles.burst(10, ev.x, ev.y - 0.3, -Math.PI / 2, 0.9, 1.6, 3, 1.0, 0.07, [0.75, 1, 0.6], Mat.Magic, rand, { emis: 1, grav: -0.8, drag: 0.6 });
          this.tLights.push({ x: ev.x, y: ev.y - 0.6, radius: 4, intensity: 0.9, color: [0.8, 1, 0.6], born: time, life: 0.5 });
          if (ev.target === me && ev.source !== me) this.hud.message(`Curado por ${byId.get(ev.source)?.name ?? 'aliado'} (+${ev.amount})`, 'good');
          if (t && ev.amount > 40) A.play('heal', ev.x, ev.y, 0.7);
          break;
        }
        case 'cleanse':
          this.particles.burst(16, ev.x, ev.y - 0.5, 0, Math.PI * 2, 2.2, 2, 0.7, 0.07, [1, 1, 0.85], Mat.Spark, rand, { emis: 1, grav: -0.4 });
          this.overlay.float(ev.x, ev.y - 1.9, 'PURIFICADO', '#fff2b0', 11);
          break;
        case 'lootDrop':
          if (ev.rarity === 'legendary' || ev.rarity === 'epic') {
            const c: [number, number, number] = ev.rarity === 'legendary' ? [1, 0.6, 0.15] : [0.78, 0.45, 1];
            this.particles.burst(ev.rarity === 'legendary' ? 40 : 20, ev.x, ev.y - 0.3, -Math.PI / 2, 1.2, 2.5, 4, 1.2, 0.08, c, Mat.Spark, rand, { emis: 1, grav: -0.3 });
            this.tLights.push({ x: ev.x, y: ev.y, radius: 5, intensity: 1.2, color: c, born: time, life: 1.6 });
          }
          break;
        case 'pickup':
          if (ev.id === me) {
            const legendary = ev.rarity === 'legendary';
            A.play(legendary ? 'discover' : 'ui');
            this.overlay.float(ev.x, ev.y - 0.6, ev.name, { common: '#cfcfc8', uncommon: '#73e666', rare: '#669eff', epic: '#c773ff', legendary: '#ff9926' }[ev.rarity] ?? '#ddd', legendary ? 14 : 11, 1.6);
            if (legendary) this.hud.toast(`LENDÁRIO: ${ev.name}`);
            this.hud.message(`Pegou: ${ev.name} (I abre o inventário)`, legendary ? 'good' : 'info');
          }
          break;
        case 'bagFull':
          if (ev.id === me) this.hud.toast('Mochila cheia — largue algo (I, botão direito)');
          break;
        case 'chest':
          A.play('essence', ev.x, ev.y);
          this.particles.burst(18 + ev.tier * 14, ev.x, ev.y - 0.4, -Math.PI / 2, 1.6, 2, 3, 1, 0.07, ev.tier === 2 ? [1, 0.8, 0.3] : [0.9, 0.85, 0.7], Mat.Spark, rand, { emis: 1, grav: 0.6 });
          if (ev.id === me) this.hud.message(['Baú de madeira aberto', 'Baú de ferro aberto', 'Baú dourado aberto!'][ev.tier] ?? 'Baú aberto', 'good');
          break;
        case 'equip':
          if (ev.id === me) this.hud.message(`Equipado: ${ev.name}`, 'info');
          break;
        case 'imbue': {
          const c: Record<string, [number, number, number]> = { fire: [1, 0.45, 0.1], frost: [0.5, 0.8, 1], shadow: [0.6, 0.3, 1], holy: [1, 0.9, 0.5], poison: [0.45, 1, 0.3], lightning: [0.7, 0.85, 1] };
          A.play('levelUp');
          this.particles.burst(40, ev.x, ev.y - 0.6, -Math.PI / 2, Math.PI * 2, 2, 3, 1.2, 0.08, c[ev.element] ?? [1, 1, 1], Mat.Magic, rand, { emis: 1, grav: -0.4 });
          if (ev.id === me) this.hud.message('Arma imbuída! Seus golpes agora carregam o elemento.', 'good');
          break;
        }
        case 'portal':
          A.play('portal', ev.x, ev.y);
          this.particles.burst(30, ev.fromX, ev.fromY - 0.5, 0, Math.PI * 2, 2.5, 3, 0.9, 0.08, [0.6, 0.45, 1], Mat.Magic, rand, { emis: 1, grav: -0.6 });
          this.particles.burst(30, ev.x, ev.y - 0.5, 0, Math.PI * 2, 2.5, 3, 0.9, 0.08, [0.6, 0.45, 1], Mat.Magic, rand, { emis: 1, grav: -0.6 });
          if (ev.id === me) {
            this.flash = 0.5;
            this.flashColor = [0.05, 0.02, 0.1];
            this.hud.message(ev.name, 'info');
          }
          break;
        case 'fail':
          if (ev.id === me) {
            if (ev.reason === 'stamina') this.hud.flash('stamina');
            if (ev.reason === 'mana') this.hud.flash('mana');
            this.hud.toast(ev.reason === 'stamina' ? 'Sem stamina' : ev.reason === 'mana' ? 'Sem mana' : ev.reason === 'requires' ? 'Contra-ataque: apare ou esquive no tempo certo primeiro' : 'Em recarga');
            A.play('fail');
          }
          break;
      }
    }
  }

  /** Footsteps, wading ripples, projectile trails, falling leaves, embers. */
  ambient(dt: number, time: number, ents: EntitySnap[], me: number, view: { x0: number; y0: number; x1: number; y1: number }, windDir: readonly [number, number], wind: number): void {
    for (const e of ents) {
      if (e.kind === 'projectile') {
        const st = projectileStyle(e.name);
        if (st.light && rand() < 0.8) this.particles.spawn(e.x, e.y - 0.5, 0.05, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6, 0.2, 0.35, 0.07, st.tail, Mat.Magic, { emis: 1, grav: 0 });
        else if (e.name === 'ranger_poison' && rand() < 0.5) this.particles.spawn(e.x, e.y - 0.5, 0.05, 0, 0, 0.4, 0.5, 0.05, [0.4, 1, 0.3], Mat.Magic, { emis: 0.8, grav: 1 });
        continue;
      }
      if (e.dead) continue;
      let s = this.stepAcc.get(e.id);
      if (!s) this.stepAcc.set(e.id, (s = { x: e.x, y: e.y, d: 0 }));
      const moved = Math.hypot(e.x - s.x, e.y - s.y);
      s.x = e.x;
      s.y = e.y;
      if (moved > 1) continue; // teleport
      s.d += moved;
      if (s.d > 0.85) {
        s.d = 0;
        const water = this.isWater(e.x, e.y);
        if (water) {
          this.ripple(e.x, e.y, time, 0.7);
          this.particles.burst(4, e.x, e.y, 0, Math.PI * 2, 1.2, 2, 0.4, 0.06, [0.6, 0.75, 0.8], Mat.Splash, rand, {});
        }
        if (e.id === me || Math.hypot(e.x - this.audio.listenerX, e.y - this.audio.listenerY) < 10) this.audio.play(water ? 'stepWater' : 'stepGrass', e.x, e.y, e.id === me ? 0.8 : 0.4);
      }
    }
    // leaves shaken loose by the wind
    if (rand() < wind * dt * 6) {
      for (let k = 0; k < 6; k++) {
        const t = this.trees[Math.floor(rand() * this.trees.length)];
        if (!t || t.x < view.x0 || t.x > view.x1 || t.y < view.y0 || t.y > view.y1) continue;
        const autumn = t.v > 0.88;
        this.particles.spawn(t.x + (rand() - 0.5) * t.size, t.y - 0.4, 1.2 * t.size, windDir[0] * 0.6, windDir[1] * 0.6, 0.3, 5, 0.09, autumn ? [0.6, 0.35, 0.1] : [0.22, 0.4, 0.12], Mat.Leaf, { grav: 0.35, drag: 0.6 });
        break;
      }
    }
    for (const b of this.bonfires) {
      if (b.x < view.x0 || b.x > view.x1 || b.y < view.y0 || b.y > view.y1) continue;
      if (rand() < dt * 6) this.particles.spawn(b.x + (rand() - 0.5) * 0.3, b.y - 0.2, 0.5, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.2, 1.2, 1.6, 0.05, [1, 0.6, 0.2], Mat.Spark, { emis: 1, grav: -0.4, drag: 0.5 });
    }
    this.particles.update(dt, windDir[0] * wind, windDir[1] * wind);
    this.flash = Math.max(0, this.flash - dt * 1.4);
    this.tLights = this.tLights.filter((l) => time - l.born < l.life);
    this.pulses = this.pulses.filter((p) => time - p.t0 < 0.7);
    this.ripples = this.compactRipples(time);
  }

  private compactRipples(time: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.ripples.length; i += 4) if (time - this.ripples[i + 2]! < 2.6) out.push(this.ripples[i]!, this.ripples[i + 1]!, this.ripples[i + 2]!, this.ripples[i + 3]!);
    return out;
  }

  /** Most recent ripples within the view (shader supports 16). */
  rippleUniforms(view: { x0: number; y0: number; x1: number; y1: number }): number[] {
    const out: number[] = [];
    for (let i = this.ripples.length - 4; i >= 0 && out.length < 64; i -= 4) {
      const x = this.ripples[i]!;
      const y = this.ripples[i + 1]!;
      if (x < view.x0 - 3 || x > view.x1 + 3 || y < view.y0 - 3 || y > view.y1 + 3) continue;
      out.push(x, y, this.ripples[i + 2]!, this.ripples[i + 3]!);
    }
    return out;
  }

  /** Grass benders: actors plus expanding shockwave fronts. */
  benders(ents: EntitySnap[], time: number): number[] {
    const out: number[] = [];
    for (const p of this.pulses) {
      const k = (time - p.t0) / 0.7;
      out.push(p.x, p.y, 0.6 + p.r * 1.6 * k, 1.4 * (1 - k));
    }
    for (const e of ents) {
      if (e.kind === 'projectile' || out.length >= 64) continue;
      const moving = Math.hypot(e.vx, e.vy) > 0.5;
      out.push(e.x, e.y, e.radius * 2.8, e.dead ? 0.4 : moving ? 0.9 : 0.55);
    }
    return out;
  }

  /** Portal circles (castle crypt and its way back up). */
  drawPortals(out: InstanceBatch, time: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    for (const p of this.world.portals) {
      if (p.x < view.x0 - 2 || p.x > view.x1 + 2 || p.y < view.y0 - 2 || p.y > view.y1 + 2) continue;
      const pulse = 0.8 + 0.2 * Math.sin(time * 3);
      out.push(Shape.Ring, p.x, p.y, p.r * pulse, p.r * 0.6 * pulse, [0.55, 0.4, 1.0], Mat.Magic, { depthY: -1e6, emis: 0.8, extra: 0.8, rot: time * 0.6 });
      out.push(Shape.Circle, p.x, p.y, p.r * 0.75, p.r * 0.45, [0.04, 0.02, 0.08], Mat.Rock, { depthY: -1e6 + 1, param: 0.1 });
      if (rand() < 0.4) this.particles.spawn(p.x + (rand() - 0.5) * p.r * 1.4, p.y + (rand() - 0.5) * p.r * 0.8, 0.1, 0, 0, 1.0, 1.1, 0.05, [0.65, 0.5, 1], Mat.Magic, { emis: 1, grav: -0.5, drag: 0.5 });
    }
  }

  nearestPortal(x: number, y: number): { name: string; x: number; y: number } | null {
    for (const p of this.world.portals) if (Math.hypot(p.x - x, p.y - y) <= p.r + 0.4) return p;
    return null;
  }

  drawFlames(out: InstanceBatch, time: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    for (const t of this.torches) {
      if (t.x < view.x0 - 2 || t.x > view.x1 + 2 || t.y < view.y0 - 3 || t.y > view.y1 + 2) continue;
      for (let k = 0; k < 3; k++) {
        const fl = 0.75 + 0.25 * Math.sin(time * (11 + k * 2.7) + t.v * 20 + k);
        const s = (0.16 - k * 0.04) * fl;
        out.push(Shape.Circle, t.x + Math.sin(time * 7 + k + t.v * 9) * 0.03 * k, t.y - 1.42 - k * 0.12, s, s * 1.3, [1, 0.82 - k * 0.2, 0.3 - k * 0.08], Mat.Fire, { depthY: t.y + 0.02 + k * 0.001, emis: 1 });
      }
    }
    for (const b of this.bonfires) {
      if (b.x < view.x0 - 2 || b.x > view.x1 + 2 || b.y < view.y0 - 2 || b.y > view.y1 + 2) continue;
      for (let k = 0; k < 5; k++) {
        const fl = 0.75 + 0.25 * Math.sin(time * (9 + k * 2.3) + k * 1.7);
        const s = (0.34 - k * 0.055) * fl;
        const c: RGB = [1, 0.85 - k * 0.15, 0.35 - k * 0.07];
        out.push(Shape.Circle, b.x + Math.sin(time * 6 + k) * 0.06 * k, b.y - 0.2 - k * 0.19, s, s * 1.2, c, Mat.Fire, { depthY: b.y + 0.01 + k * 0.001, emis: 1 });
      }
    }
  }

  /** Spell visuals: ice spike lines, lightning bolts + warnings, rune zones. */
  drawSpells(out: InstanceBatch, time: number, zones: ReadonlyArray<{ x: number; y: number; r: number; until: number; kind: string }>, tick: number): void {
    this.spikes = this.spikes.filter((s) => time - s.born < 1.5);
    for (const s of this.spikes) {
      const age = time - s.born;
      const grow = Math.min(1, age / 0.12);
      const sink = age > 1.1 ? 1 - (age - 1.1) / 0.4 : 1;
      const h = Math.max(0.05, grow * sink);
      for (let i = 0; i < 4; i++) {
        const a = s.dir + Math.PI / 2;
        const off = (i - 1.5) * 0.28;
        const tall = (0.9 + ((i * 37) % 5) * 0.12) * h;
        const x = s.x + Math.cos(a) * off;
        const y = s.y + Math.sin(a) * off * 0.6;
        out.push(Shape.Tri, x, y - tall * 0.6, 0.2, tall * 0.6, [0.62, 0.86, 1.0], Mat.Pine, { depthY: y, emis: 0.45 });
      }
    }
    this.warns = this.warns.filter((w) => time < w.until + 0.2);
    for (const w of this.warns) {
      const k = Math.min(1, (time - w.born) / Math.max(0.05, w.until - w.born));
      out.push(Shape.Sector, w.x, w.y, w.r, w.r * 0.6, w.color, Mat.Telegraph, { depthY: -1e6, param: k * 0.9, emis: 0.3, extra: Math.PI });
    }
    // arrow rain: shafts fall at a steep angle, then stick in the ground for a moment
    this.arrowsFalling = this.arrowsFalling.filter((a) => time - a.born < 1.2);
    for (const a of this.arrowsFalling) {
      const t = (time - a.born) / 0.18;
      if (t < 0) continue;
      const fall = Math.max(0, 1 - t);
      const hx = a.x - fall * 2.5;
      const hy = a.y - fall * 7;
      const ang = Math.atan2(7, 2.5);
      out.push(Shape.Blade, hx - Math.cos(ang) * 0.35, hy - Math.sin(ang) * 0.35 - (fall > 0 ? 0 : 0.3), 0.38, 0.035, [0.55, 0.38, 0.2], Mat.Blade, { rot: ang, depthY: a.y + 0.1 });
    }
    // void claws: three curved talons rising from the ground
    this.voidClaws = this.voidClaws.filter((c) => time - c.born < 0.9);
    for (const c of this.voidClaws) {
      const age = (time - c.born) / 0.9;
      const h = Math.sin(Math.min(1, age * 2.2) * Math.PI * 0.5) * (1 - Math.max(0, age - 0.6) / 0.4) * 1.6;
      for (let i = 0; i < 3; i++) {
        const x = c.x + (i - 1) * c.r * 0.45;
        out.push(Shape.Tri, x, c.y - h * 0.5, 0.18, h * 0.5, [0.25, 0.9, 0.35], Mat.Magic, { depthY: c.y + 0.2, emis: 0.9, rot: (i - 1) * 0.25 });
      }
      out.push(Shape.Ring, c.x, c.y, c.r, c.r * 0.6, [0.5, 0.2, 0.7], Mat.Magic, { depthY: -1e6, emis: 0.6 * (1 - age), extra: 0.8 });
    }
    this.bolts = this.bolts.filter((b) => time - b.born < 0.32);
    for (const b of this.bolts) {
      const f = 1 - (time - b.born) / 0.32;
      for (let i = 0; i < b.pts.length - 1; i++) {
        const [x0, y0] = b.pts[i]!;
        const [x1, y1] = b.pts[i + 1]!;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const bc: RGB = b.color ? [b.color[0] * 1.6, b.color[1] * 1.6, b.color[2] * 1.6] : [1.4, 1.5, 1.8];
        out.push(Shape.Blade, (x0 + x1) / 2, (y0 + y1) / 2, len / 2, 0.06 + f * 0.04, bc, Mat.Spark, { rot: Math.atan2(y1 - y0, x1 - x0), depthY: b.y + 0.5, emis: 1 });
      }
      const r = 0.35 + 0.35 * f;
      out.push(Shape.Circle, b.x, b.y - 0.3, r, r, b.color ? [b.color[0] * 1.3, b.color[1] * 1.3, b.color[2] * 1.3] : [1.2, 1.3, 1.6], Mat.Magic, { depthY: b.y + 0.6, emis: 1 });
    }
    for (const z of zones) {
      const left = (z.until - tick) / 30;
      const fadeIn = Math.min(1, left / 0.6);
      const rotA = time * 0.8;
      if (z.kind === 'smoke') {
        // smoke bomb: thick drifting puffs, no rune circle
        for (let i = 0; i < 2; i++) {
          const a = rand() * Math.PI * 2;
          const rr = Math.sqrt(rand()) * z.r;
          this.particles.spawn(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.62, 0.3, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.3, 0.3, 1.6, 0.35, [0.3, 0.29, 0.33], Mat.Dust, { grav: -0.15, drag: 0.8 });
        }
        continue;
      }
      if (z.kind === 'trap') {
        // spiked iron trap: jaws and a faint ring
        out.push(Shape.Ring, z.x, z.y, z.r * 0.7, z.r * 0.42, [0.55, 0.5, 0.42], Mat.Stone, { depthY: -1e6 + 1, extra: 0.7 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          out.push(Shape.Tri, z.x + Math.cos(a) * z.r * 0.6, z.y + Math.sin(a) * z.r * 0.36 - 0.12, 0.07, 0.12, [0.7, 0.66, 0.6], Mat.Blade, { depthY: z.y + Math.sin(a) * 0.3 });
        }
        continue;
      }
      const holy = z.kind === 'sanctuary';
      const fel = z.kind === 'soulwell';
      const zc = ZONE_COLORS[z.kind];
      const c1: RGB = zc ? zc[0] : holy ? [1.0, 0.85, 0.45] : fel ? [0.35, 0.95, 0.45] : [0.62, 0.38, 1.0];
      const c2: RGB = zc ? zc[1] : holy ? [1.0, 0.95, 0.7] : fel ? [0.55, 0.25, 0.75] : [0.75, 0.5, 1.0];
      if (z.kind === 'fire' && rand() < 0.9) {
        const a = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand()) * z.r;
        this.particles.spawn(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.62, 0.05, 0, 0, 1.6, 0.7, 0.07, [1, 0.45 + rand() * 0.3, 0.1], Mat.Fire, { emis: 1, grav: -1.2, drag: 0.6 });
      } else if (z.kind === 'poison' && rand() < 0.7) {
        const a = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand()) * z.r;
        this.particles.spawn(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.62, 0.2, 0, 0, 0.4, 1.4, 0.3, [0.35, 0.8, 0.25], Mat.Dust, { grav: -0.15, drag: 0.8 });
      } else if (z.kind === 'thorns' && rand() < 0.5) {
        const a = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand()) * z.r;
        out.push(Shape.Tri, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.62 - 0.15, 0.06, 0.22, [0.45, 0.6, 0.25], Mat.Blade, { depthY: z.y + Math.sin(a) * rr * 0.62 });
      }
      out.push(Shape.Ring, z.x, z.y, z.r, z.r * 0.62, c1, Mat.Magic, { depthY: -1e6, emis: 0.6 * fadeIn, extra: 0.9, rot: rotA });
      out.push(Shape.Ring, z.x, z.y, z.r * 0.6, z.r * 0.37, c2, Mat.Telegraph, { depthY: -1e6, emis: 0.45 * fadeIn, extra: 0.82, rot: -rotA * 1.5 });
      if (rand() < 0.5) {
        const a = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand()) * z.r;
        this.particles.spawn(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.62, 0.05, 0, 0, 1.2, 0.9, 0.05, holy ? [1, 0.9, 0.55] : fel ? [0.4, 1, 0.45] : [0.7, 0.45, 1], Mat.Magic, { emis: 1, grav: -0.4, drag: 0.5 });
      }
    }
  }

  /** Glowing essence left where the player died: a pulsing rune with rising motes. */
  drawEssence(out: InstanceBatch, m: { x: number; y: number }, time: number): void {
    const p = 0.75 + 0.25 * Math.sin(time * 4);
    out.push(Shape.Ring, m.x, m.y, 0.55 * p, 0.38 * p, [0.55, 0.95, 0.5], Mat.Magic, { depthY: m.y, emis: 0.8, extra: 0.55 });
    out.push(Shape.Circle, m.x, m.y - 0.35 - 0.08 * Math.sin(time * 2.3), 0.2, 0.26, [0.75, 1, 0.65], Mat.Magic, { depthY: m.y + 0.01, emis: 1, param: 0.5 / 16 });
    if (rand() < 0.3) this.particles.spawn(m.x + (rand() - 0.5) * 0.6, m.y, 0.2, 0, 0, 1.4, 1.2, 0.05, [0.6, 1, 0.55], Mat.Magic, { emis: 1, grav: -0.3, drag: 0.4 });
  }

  lights(time: number, view: { x0: number; y0: number; x1: number; y1: number }, ents: EntitySnap[], me: EntitySnap | null, night: number, essence: { x: number; y: number } | null = null): Light[] {
    const L: Light[] = [];
    if (essence) L.push({ x: essence.x, y: essence.y - 0.4, radius: 4.5, intensity: 0.9 + 0.3 * Math.sin(time * 4), color: [0.55, 1, 0.5] });
    for (const b of this.bonfires) {
      if (b.x < view.x0 - 8 || b.x > view.x1 + 8 || b.y < view.y0 - 8 || b.y > view.y1 + 8) continue;
      const fl = 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 7.3 + 1);
      L.push({ x: b.x, y: b.y - 0.3, radius: 9, intensity: 1.9 * fl, color: [1, 0.58, 0.25] });
    }
    for (const t of this.torches) {
      if (t.x < view.x0 - 6 || t.x > view.x1 + 6 || t.y < view.y0 - 6 || t.y > view.y1 + 6) continue;
      const fl = 0.85 + 0.15 * Math.sin(time * 13 + t.v * 30) * Math.sin(time * 8.1 + t.v * 11);
      L.push({ x: t.x, y: t.y - 1.2, radius: 7.5, intensity: 1.8 * fl, color: [1, 0.6, 0.28] });
    }
    for (const l of this.tLights) {
      const k = 1 - (time - l.born) / l.life;
      L.push({ ...l, intensity: l.intensity * k });
    }
    for (const e of ents) {
      if (e.kind === 'projectile') {
        const c = projectileStyle(e.name).light;
        if (c) L.push({ x: e.x, y: e.y - 0.4, radius: 4, intensity: 1.0, color: c });
      } else if (e.classId === 'warlock' && !e.dead) L.push({ x: e.x, y: e.y - 0.6, radius: 3, intensity: 0.4, color: [0.4, 1, 0.45] });
      else if (e.classId === 'healer' && !e.dead) L.push({ x: e.x, y: e.y - 0.8, radius: 3, intensity: 0.45, color: [1, 0.9, 0.6] });
      else if (e.classId === 'arcanist' && !e.dead) L.push({ x: e.x, y: e.y - 0.6, radius: 3, intensity: 0.45, color: [0.5, 0.65, 1] });
    }
    // carried torch at night
    if (me && night > 0.05 && !me.dead) L.push({ x: me.x, y: me.y - 0.4, radius: 7.5, intensity: 1.15 * night, color: [1, 0.72, 0.42] });
    return L;
  }

  nearestBonfire(x: number, y: number, range: number): Prop | null {
    for (const b of this.bonfires) if (Math.hypot(b.x - x, b.y - y) <= range) return b;
    return null;
  }

  ambienceLevels(x: number, y: number): { fire: number; water: number } {
    let fire = 0;
    for (const b of this.bonfires) fire = Math.max(fire, 1 - Math.hypot(b.x - x, b.y - y) / 10);
    for (const t of this.torches) fire = Math.max(fire, (1 - Math.hypot(t.x - x, t.y - y) / 5) * 0.5);
    let water = 0;
    for (let oy = -6; oy <= 6; oy += 2) for (let ox = -6; ox <= 6; ox += 2) if (this.isWater(x + ox, y + oy)) water += 1 / 49;
    return { fire: Math.max(0, fire), water: Math.min(1, water * 2.5) };
  }
}
