import { isDead, forceAction } from '../combat/combat';
import { angleTo } from '../math/vec2';
import type { RitualSite } from '../world/worldgen';
import type { Entity, SimEvent } from './types';

/**
 * The living world (0.13): cult rituals that play out around their summoning circle and villagers that
 * answer when spoken to. Deterministic (tick-driven, no randomness of its own) so it runs the same on the
 * server and in offline play.
 */

export type RitualPhase = 'idle' | 'chant' | 'summoned' | 'broken';

interface RitualState {
  site: RitualSite;
  phase: RitualPhase;
  /** Tick the current phase started. */
  since: number;
  line: number;
  demonId: number;
}

/** What the director needs from the simulation. */
export interface LivingHost {
  readonly tick: number;
  readonly entities: Map<number, Entity>;
  emit(ev: SimEvent): void;
  spawnEnemy(enemyId: string, x: number, y: number, spawnIndex?: number, level?: number): Entity;
}

const STEP = 15; // the director thinks twice a second
export const RITUAL_NOTICE = 13; // a player this close starts the chant
const RITUAL_LOSE = 34; // everyone this far away: the chant fizzles back to idle
export const LINE_TICKS = 75; // one line every 2.5 s
export const RITUAL_COOLDOWN = 30 * 300; // a summoned (or broken) circle rests for 5 minutes
const SPEECH_TICKS = 105;

/** [speaker ('leader' | 'cultist'), line] — the summoning, in order. */
export const CHANT: ReadonlyArray<readonly ['leader' | 'cultist', string]> = [
  ['leader', 'Irmãos, a hora chegou. Fechem o círculo!'],
  ['cultist', 'Sangue pela chama... chama pelo sangue...'],
  ['leader', 'Ó Senhor do Abismo, ouve a voz dos teus servos!'],
  ['cultist', "Ab'zhar... Ab'zhar... desperta!"],
  ['leader', 'Vejam, um intruso! Será a tua primeira oferenda!'],
  ['cultist', 'O véu se rasga! Ele vem!'],
];
export const SUMMON_LINE = "ERGUE-TE, AB'ZHAR, DEVORADOR DE JURAMENTOS!";
export const DEMON_LINE = 'QUEM OUSA ME CHAMAR... CARNE FRESCA.';
export const BROKEN_LINE = 'Não! O Arauto caiu... o círculo se rompeu!';

export const VILLAGER_LINES: readonly string[] = [
  'Bem-vindo a Pedravelha, viajante. A fogueira da praça é de todos.',
  'Goblins acamparam nas colinas. Andam roubando nossas cabras.',
  'Vi encapuzados acendendo velas no brejo. Coisa boa não é.',
  'Sente-se numa fogueira e teu espírito volta para lá quando cair.',
  'O Castelo de Vaelmor caiu há anos. Só ossos guardam os portões.',
  'Baús antigos ainda se escondem pela mata. Os melhores ficam longe daqui.',
  'Nos Picos Gélidos as serpes caçam ao entardecer. Leve fogo.',
  'Achou uma runa? Imbua a arma sentado à fogueira, como faziam os antigos.',
  'Os cervos fogem se você correr. Chegue andando, devagar.',
  'Dizem que um dragão dorme nas Cinzas. Eu é que não vou conferir.',
];

export class LivingWorld {
  private rituals: RitualState[];

  constructor(sites: readonly RitualSite[]) {
    this.rituals = sites.map((site) => ({ site, phase: 'idle', since: 0, line: 0, demonId: -1 }));
  }

  /** Phase of each circle (tests, debug). */
  phases(): Array<{ id: string; phase: RitualPhase }> {
    return this.rituals.map((r) => ({ id: r.site.id, phase: r.phase }));
  }

  step(sim: LivingHost): void {
    if (!this.rituals.length || sim.tick % STEP !== 0) return;
    for (const r of this.rituals) this.stepRitual(sim, r);
  }

  private members(sim: LivingHost, r: RitualState): { leader?: Entity; cultists: Entity[]; nearest: number } {
    let leader: Entity | undefined;
    const cultists: Entity[] = [];
    let nearest = Infinity;
    const { x, y } = r.site;
    for (const e of sim.entities.values()) {
      if (isDead(e)) continue;
      if (e.kind === 'player') nearest = Math.min(nearest, Math.hypot(e.pos.x - x, e.pos.y - y));
      else if (e.ai?.anchor && Math.abs(e.ai.anchor.x - x) < 0.5 && Math.abs(e.ai.anchor.y - y) < 0.5) {
        if (e.enemyId === 'cult_leader') leader = e;
        else if (e.enemyId === 'cultist') cultists.push(e);
      }
    }
    return { leader, cultists, nearest };
  }

  private setPhase(sim: LivingHost, r: RitualState, phase: RitualPhase): void {
    r.phase = phase;
    r.since = sim.tick;
    r.line = 0;
    sim.emit({ type: 'ritual', site: r.site.id, phase, x: r.site.x, y: r.site.y });
  }

  private stepRitual(sim: LivingHost, r: RitualState): void {
    const { leader, cultists, nearest } = this.members(sim, r);
    switch (r.phase) {
      case 'idle':
        if (leader && nearest < RITUAL_NOTICE) this.setPhase(sim, r, 'chant');
        return;
      case 'chant': {
        if (!leader) {
          const voice = cultists[0];
          if (voice) say(sim, voice, BROKEN_LINE);
          this.setPhase(sim, r, 'broken');
          return;
        }
        if (nearest > RITUAL_LOSE) {
          this.setPhase(sim, r, 'idle');
          return;
        }
        // the ones not fighting keep chanting with their arms raised
        for (const c of [leader, ...cultists]) {
          if (!c.action && (c.ai?.targetId ?? -1) < 0) {
            forceAction(c, 'ritual_chant');
            c.facing = angleTo(c.pos, r.site);
            c.action!.dir = c.facing;
          }
        }
        if (sim.tick - r.since < r.line * LINE_TICKS) return;
        if (r.line < CHANT.length) {
          const [who, text] = CHANT[r.line]!;
          const voice = who === 'leader' ? leader : (cultists[r.line % Math.max(1, cultists.length)] ?? leader);
          say(sim, voice, text);
          r.line++;
          return;
        }
        say(sim, leader, SUMMON_LINE);
        const demon = sim.spawnEnemy('demon', r.site.x, r.site.y, -1, r.site.level + 2);
        if (demon.ai) demon.ai.anchor = { x: r.site.x, y: r.site.y };
        r.demonId = demon.id;
        sim.emit({ type: 'summon', id: demon.id, ownerId: leader.id, enemyId: 'demon', x: r.site.x, y: r.site.y });
        say(sim, demon, DEMON_LINE, SPEECH_TICKS + 30);
        this.setPhase(sim, r, 'summoned');
        return;
      }
      case 'summoned': {
        const demon = sim.entities.get(r.demonId);
        if (demon && !isDead(demon)) return;
        r.demonId = -1;
        this.setPhase(sim, r, 'broken');
        return;
      }
      case 'broken':
        if (sim.tick - r.since >= RITUAL_COOLDOWN) this.setPhase(sim, r, 'idle');
        return;
    }
  }
}

export function say(sim: { emit(ev: SimEvent): void }, who: Entity, text: string, ticks = SPEECH_TICKS): void {
  sim.emit({ type: 'speech', id: who.id, text, ticks, x: who.pos.x, y: who.pos.y });
}

/** A villager answers whoever spoke to them. */
export function villagerLine(villager: Entity, tick: number): string {
  return VILLAGER_LINES[(villager.id * 3 + Math.floor(tick / 90)) % VILLAGER_LINES.length]!;
}
