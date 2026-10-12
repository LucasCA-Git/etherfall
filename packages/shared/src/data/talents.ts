import type { ClassId, Entity } from '../sim/types';
import { ABILITY_SLOTS, type AbilitySlot } from '../sim/types';
import { ACTIONS } from './actions';
import { CLASSES } from './classes';

/**
 * Skill trees: one large free graph per class (Path-of-Exile style). The player starts at the
 * centre and spends one point per level on any node connected to what they already own. Three
 * long arms per class are three archetypes (e.g. Vanguarda → Paladino / Guardião / Gladiador);
 * a ring around the centre lets builds mix arms. Arms hold stat nodes, notables, two skill
 * nodes that unlock new active abilities, and a keystone at the tip.
 * Everything is plain data resolved into additive bonuses (see `talentBonus`) on the server.
 */
export type TalentStat =
  | 'dmg' | 'dmgPhysical' | 'dmgArcane' | 'maxHp' | 'maxStamina' | 'maxMana' | 'manaRegen' | 'staminaRegen'
  | 'cooldown' | 'healPower' | 'blockAbsorb' | 'poise' | 'critChance' | 'lifesteal' | 'berserk' | 'slowPower' | 'dotPower' | 'moveSpeed';

export type TalentEffects = Partial<Record<TalentStat, number>>;

export type NodeKind = 'start' | 'minor' | 'notable' | 'skill' | 'keystone';

export interface TalentNode {
  id: string;
  name: string;
  description: string;
  kind: NodeKind;
  /** Archetype (arm) this node belongs to; '' for the centre and the ring. */
  path: string;
  /** Layout position (tree units, centre = 0,0, y up). */
  x: number;
  y: number;
  links: string[];
  effects: TalentEffects;
  /** Active skill unlocked by this node. */
  skill?: string;
  /** Kept for the save format: every graph node has one rank. */
  maxRank: 1;
}

export interface Archetype {
  id: string;
  name: string;
  description: string;
  /** CSS colour of the arm in the tree view. */
  color: string;
  /** Arm direction in degrees (0 = right, 90 = up). */
  angle: number;
}

export interface TalentTree {
  start: string;
  archetypes: Archetype[];
  nodes: TalentNode[];
}

/** Points needed in one arm before its archetype becomes the character's title. */
export const TITLE_POINTS = 5;

// ------------------------------------------------------------------ descriptions
const STAT_TEXT: Record<TalentStat, (v: number) => string> = {
  dmg: (v) => `${sgn(v)}${pct(v)} de dano`,
  dmgPhysical: (v) => `${sgn(v)}${pct(v)} de dano físico`,
  dmgArcane: (v) => `${sgn(v)}${pct(v)} de dano mágico`,
  maxHp: (v) => `${sgn(v)}${pct(v)} de vida máxima`,
  maxStamina: (v) => `${sgn(v)}${pct(v)} de stamina máxima`,
  maxMana: (v) => `${sgn(v)}${pct(v)} de mana máxima`,
  manaRegen: (v) => `${sgn(v)}${pct(v)} de regeneração de mana`,
  staminaRegen: (v) => `${sgn(v)}${pct(v)} de regeneração de stamina`,
  cooldown: (v) => `${v > 0 ? '-' : '+'}${pct(v)} de recarga das habilidades`,
  healPower: (v) => `${sgn(v)}${pct(v)} de poder de cura`,
  blockAbsorb: (v) => `${sgn(v)}${pct(v)} de absorção ao bloquear`,
  poise: (v) => `${sgn(v)}${Math.round(v)} de equilíbrio`,
  critChance: (v) => `${sgn(v)}${pct(v)} de chance de crítico`,
  lifesteal: (v) => `${sgn(v)}${pct(v)} de roubo de vida`,
  berserk: (v) => `até ${sgn(v)}${pct(v)} de dano quanto menos vida`,
  slowPower: (v) => `lentidão ${sgn(v)}${pct(v)} mais forte`,
  dotPower: (v) => `venenos, queimaduras e maldições ${sgn(v)}${pct(v)} mais fortes`,
  moveSpeed: (v) => `${sgn(v)}${pct(v)} de velocidade`,
};
const sgn = (v: number) => (v >= 0 ? '+' : '-');
const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
export function describeEffects(e: TalentEffects): string {
  return (Object.keys(e) as TalentStat[]).map((k) => STAT_TEXT[k](e[k] ?? 0)).join(', ');
}
const MINOR_NAME: Record<TalentStat, string> = {
  dmg: 'Força', dmgPhysical: 'Golpe', dmgArcane: 'Poder Mágico', maxHp: 'Vitalidade', maxStamina: 'Fôlego', maxMana: 'Mente',
  manaRegen: 'Fluxo', staminaRegen: 'Recuperação', cooldown: 'Agilidade', healPower: 'Bênção', blockAbsorb: 'Guarda', poise: 'Equilíbrio',
  critChance: 'Precisão', lifesteal: 'Sede', berserk: 'Fúria', slowPower: 'Gelo', dotPower: 'Toxina', moveSpeed: 'Passos',
};

// ------------------------------------------------------------------ arm specs
interface Notable {
  name: string;
  effects: TalentEffects;
}
interface ArmSpec extends Archetype {
  /** Stats cycled through by the arm's minor nodes. */
  pool: TalentEffects[];
  skills: [string, string];
  notables: [Notable, Notable, Notable];
  keystone: Notable;
}

/** Ring stats around the start (shared by all classes, one per ring slot). */
const RING: TalentEffects[] = [{ maxHp: 0.03 }, { dmg: 0.03 }, { maxStamina: 0.04 }, { maxMana: 0.04 }, { critChance: 0.02 }, { cooldown: 0.02 }];

const ARMS: Record<ClassId, [ArmSpec, ArmSpec, ArmSpec]> = {
  vanguard: [
    {
      id: 'paladin', name: 'Paladino', angle: 90, color: '#f2cf6b',
      description: 'Cavaleiro sagrado: cura a si e aos aliados e golpeia com luz.',
      pool: [{ healPower: 0.05 }, { maxHp: 0.03 }, { dmgArcane: 0.04 }, { manaRegen: 0.06 }],
      skills: ['pal_light', 'pal_hammer'],
      notables: [
        { name: 'Fé Inabalável', effects: { healPower: 0.1, maxHp: 0.05 } },
        { name: 'Escudo da Luz', effects: { blockAbsorb: 0.08, healPower: 0.08 } },
        { name: 'Martírio', effects: { lifesteal: 0.04, maxHp: 0.06 } },
      ],
      keystone: { name: 'Juramento Sagrado', effects: { healPower: 0.25, dmgArcane: 0.15, lifesteal: 0.03 } },
    },
    {
      id: 'guardian', name: 'Guardião', angle: 210, color: '#b8c4d6',
      description: 'Muralha de aço: aguenta tudo e protege o grupo.',
      pool: [{ maxHp: 0.04 }, { blockAbsorb: 0.03 }, { poise: 6 }, { staminaRegen: 0.05 }],
      skills: ['grd_bash', 'grd_bulwark'],
      notables: [
        { name: 'Couraça', effects: { maxHp: 0.08, poise: 10 } },
        { name: 'Postura Firme', effects: { blockAbsorb: 0.1, poise: 15 } },
        { name: 'Inquebrável', effects: { maxHp: 0.1 } },
      ],
      keystone: { name: 'Bastião Vivo', effects: { blockAbsorb: 0.15, maxHp: 0.15, moveSpeed: -0.05 } },
    },
    {
      id: 'gladiator', name: 'Gladiador', angle: 330, color: '#e0584f',
      description: 'Lutador de arena: golpes rápidos, críticos e sangue.',
      pool: [{ dmgPhysical: 0.04 }, { critChance: 0.02 }, { staminaRegen: 0.05 }, { lifesteal: 0.01 }],
      skills: ['gla_flurry', 'gla_execute'],
      notables: [
        { name: 'Sede de Sangue', effects: { lifesteal: 0.03, dmgPhysical: 0.05 } },
        { name: 'Instinto Assassino', effects: { critChance: 0.06 } },
        { name: 'Adrenalina', effects: { cooldown: 0.08, staminaRegen: 0.1 } },
      ],
      keystone: { name: 'Campeão da Arena', effects: { dmg: 0.15, critChance: 0.08, berserk: 0.3 } },
    },
  ],
  arcanist: [
    {
      id: 'cryomancer', name: 'Criomante', angle: 90, color: '#8fd8ff',
      description: 'Mestre do gelo: congela, desacelera e controla.',
      pool: [{ dmgArcane: 0.04 }, { slowPower: 0.06 }, { maxMana: 0.04 }, { maxHp: 0.03 }],
      skills: ['cryo_nova', 'cryo_blizzard'],
      notables: [
        { name: 'Coração Gélido', effects: { slowPower: 0.2, dmgArcane: 0.05 } },
        { name: 'Armadura de Gelo', effects: { maxHp: 0.08, blockAbsorb: 0.05 } },
        { name: 'Inverno Eterno', effects: { slowPower: 0.2, cooldown: 0.05 } },
      ],
      keystone: { name: 'Era do Gelo', effects: { slowPower: 0.4, dmgArcane: 0.15 } },
    },
    {
      id: 'pyromancer', name: 'Piromante', angle: 210, color: '#ff8a3d',
      description: 'Fogo puro: bolas de fogo, meteoros e queimaduras.',
      pool: [{ dmgArcane: 0.05 }, { dotPower: 0.06 }, { critChance: 0.02 }, { manaRegen: 0.05 }],
      skills: ['pyro_fireball', 'pyro_meteor'],
      notables: [
        { name: 'Chama Interior', effects: { dmgArcane: 0.08 } },
        { name: 'Combustão', effects: { dotPower: 0.2, critChance: 0.03 } },
        { name: 'Fênix', effects: { maxHp: 0.06, manaRegen: 0.1 } },
      ],
      keystone: { name: 'Inferno', effects: { dmgArcane: 0.2, dotPower: 0.3, maxHp: -0.05 } },
    },
    {
      id: 'archmage', name: 'Mestre Arcano', angle: 330, color: '#b48cff',
      description: 'Energia arcana pura: mísseis, teleporte e recarga rápida.',
      pool: [{ maxMana: 0.05 }, { manaRegen: 0.06 }, { dmgArcane: 0.04 }, { cooldown: 0.03 }],
      skills: ['arc_missiles', 'arc_blink'],
      notables: [
        { name: 'Mente Afiada', effects: { maxMana: 0.1, manaRegen: 0.1 } },
        { name: 'Fluxo Arcano', effects: { cooldown: 0.08 } },
        { name: 'Sobrecarga', effects: { dmgArcane: 0.1, critChance: 0.04 } },
      ],
      keystone: { name: 'Arquimago', effects: { dmgArcane: 0.2, cooldown: 0.1, maxMana: 0.15 } },
    },
  ],
  healer: [
    {
      id: 'dawnpriest', name: 'Sacerdotisa da Aurora', angle: 90, color: '#ffe08a',
      description: 'Curas fortes, áreas de luz e bênçãos para o grupo.',
      pool: [{ healPower: 0.05 }, { manaRegen: 0.06 }, { maxMana: 0.04 }, { maxHp: 0.03 }],
      skills: ['dawn_renew', 'dawn_halo'],
      notables: [
        { name: 'Graça', effects: { healPower: 0.12 } },
        { name: 'Devoção', effects: { manaRegen: 0.15, maxMana: 0.08 } },
        { name: 'Luz Eterna', effects: { healPower: 0.1, maxHp: 0.05 } },
      ],
      keystone: { name: 'Avatar da Aurora', effects: { healPower: 0.35, manaRegen: 0.2, dmg: -0.1 } },
    },
    {
      id: 'inquisitor', name: 'Inquisidora', angle: 210, color: '#fff4cf',
      description: 'Luz que pune: pilares sagrados, correntes e críticos.',
      pool: [{ dmgArcane: 0.05 }, { critChance: 0.02 }, { lifesteal: 0.01 }, { maxHp: 0.03 }],
      skills: ['inq_judgment', 'inq_chains'],
      notables: [
        { name: 'Zelo', effects: { dmgArcane: 0.08, critChance: 0.03 } },
        { name: 'Penitência', effects: { lifesteal: 0.03 } },
        { name: 'Fogo Purificador', effects: { dotPower: 0.15, dmgArcane: 0.06 } },
      ],
      keystone: { name: 'Grande Inquisidora', effects: { dmgArcane: 0.2, critChance: 0.08 } },
    },
    {
      id: 'druid', name: 'Druida', angle: 330, color: '#7fd36a',
      description: 'Natureza viva: espinhos, raízes e lobos espirituais.',
      pool: [{ maxHp: 0.04 }, { healPower: 0.04 }, { dotPower: 0.05 }, { staminaRegen: 0.05 }],
      skills: ['dru_thorns', 'dru_wolves'],
      notables: [
        { name: 'Seiva', effects: { healPower: 0.06, maxHp: 0.06 } },
        { name: 'Raízes', effects: { poise: 15, slowPower: 0.15 } },
        { name: 'Matilha', effects: { dotPower: 0.15, moveSpeed: 0.05 } },
      ],
      keystone: { name: 'Coração da Floresta', effects: { maxHp: 0.15, healPower: 0.15, dotPower: 0.2 } },
    },
  ],
  ranger: [
    {
      id: 'sharpshooter', name: 'Atirador de Elite', angle: 90, color: '#d9d2bd',
      description: 'Flechas pesadas e precisas a longa distância.',
      pool: [{ dmgPhysical: 0.04 }, { critChance: 0.025 }, { staminaRegen: 0.04 }, { cooldown: 0.02 }],
      skills: ['snp_pierce', 'snp_multishot'],
      notables: [
        { name: 'Olho Treinado', effects: { critChance: 0.06 } },
        { name: 'Mão Firme', effects: { dmgPhysical: 0.08 } },
        { name: 'Precisão Letal', effects: { critChance: 0.05, dmg: 0.05 } },
      ],
      keystone: { name: 'Sniper', effects: { dmgPhysical: 0.2, critChance: 0.1, moveSpeed: -0.05 } },
    },
    {
      id: 'beastmaster', name: 'Mestre das Feras', angle: 210, color: '#c99a5b',
      description: 'Luta ao lado de lobos e falcões.',
      pool: [{ maxHp: 0.03 }, { moveSpeed: 0.02 }, { dmgPhysical: 0.03 }, { staminaRegen: 0.05 }],
      skills: ['bst_wolf', 'bst_hawk'],
      notables: [
        { name: 'Vínculo', effects: { maxHp: 0.06, moveSpeed: 0.04 } },
        { name: 'Instinto', effects: { critChance: 0.04, staminaRegen: 0.1 } },
        { name: 'Alfa', effects: { dmg: 0.08 } },
      ],
      keystone: { name: 'Senhor das Feras', effects: { dmg: 0.1, maxHp: 0.1, moveSpeed: 0.06 } },
    },
    {
      id: 'warden', name: 'Guardião da Mata', angle: 330, color: '#6fcf5f',
      description: 'Venenos, raízes e mobilidade na floresta.',
      pool: [{ dotPower: 0.05 }, { moveSpeed: 0.02 }, { slowPower: 0.05 }, { maxStamina: 0.04 }],
      skills: ['wdn_entangle', 'wdn_toxic'],
      notables: [
        { name: 'Veneno Natural', effects: { dotPower: 0.15 } },
        { name: 'Passos Leves', effects: { moveSpeed: 0.06, staminaRegen: 0.1 } },
        { name: 'Espinhos', effects: { dotPower: 0.1, slowPower: 0.15 } },
      ],
      keystone: { name: 'Espírito da Mata', effects: { dotPower: 0.35, moveSpeed: 0.08 } },
    },
  ],
  rogue: [
    {
      id: 'assassin', name: 'Assassina', angle: 90, color: '#9b6bd6',
      description: 'Ataques das sombras e golpes fatais.',
      pool: [{ critChance: 0.025 }, { dmgPhysical: 0.04 }, { moveSpeed: 0.02 }, { staminaRegen: 0.05 }],
      skills: ['asn_shadowstrike', 'asn_mark'],
      notables: [
        { name: 'Sangue Frio', effects: { critChance: 0.07 } },
        { name: 'Sombras', effects: { cooldown: 0.08, moveSpeed: 0.04 } },
        { name: 'Golpe Preciso', effects: { dmg: 0.1 } },
      ],
      keystone: { name: 'Mestre Assassino', effects: { critChance: 0.12, dmg: 0.15, maxHp: -0.08 } },
    },
    {
      id: 'illusionist', name: 'Ilusionista', angle: 210, color: '#d7a4ff',
      description: 'Magia de ilusão: cópias de si mesma, invisibilidade e confusão.',
      pool: [{ cooldown: 0.03 }, { maxMana: 0.04 }, { dmgArcane: 0.04 }, { moveSpeed: 0.02 }],
      skills: ['ilu_mirror', 'ilu_blur'],
      notables: [
        { name: 'Truques', effects: { cooldown: 0.1 } },
        { name: 'Desorientar', effects: { slowPower: 0.2 } },
        { name: 'Miragem', effects: { maxMana: 0.1, manaRegen: 0.1 } },
      ],
      keystone: { name: 'Grande Ilusionista', effects: { cooldown: 0.15, dmgArcane: 0.15, maxHp: -0.05 } },
    },
    {
      id: 'poisoner', name: 'Envenenadora', angle: 330, color: '#8dff5a',
      description: 'Frascos, facas e venenos que derretem os inimigos.',
      pool: [{ dotPower: 0.06 }, { critChance: 0.02 }, { lifesteal: 0.01 }, { maxStamina: 0.04 }],
      skills: ['psn_flask', 'psn_fan'],
      notables: [
        { name: 'Toxinas', effects: { dotPower: 0.2 } },
        { name: 'Antídoto', effects: { maxHp: 0.06, lifesteal: 0.02 } },
        { name: 'Necrose', effects: { dotPower: 0.15, critChance: 0.03 } },
      ],
      keystone: { name: 'Rainha dos Venenos', effects: { dotPower: 0.5, lifesteal: 0.03 } },
    },
  ],
  barbarian: [
    {
      id: 'warchief', name: 'Chefe de Guerra', angle: 90, color: '#d6a35b',
      description: 'Lidera o grupo com estandartes e brados.',
      pool: [{ maxHp: 0.04 }, { poise: 6 }, { staminaRegen: 0.05 }, { blockAbsorb: 0.02 }],
      skills: ['wch_banner', 'wch_shout'],
      notables: [
        { name: 'Líder', effects: { maxHp: 0.08 } },
        { name: 'Moral', effects: { staminaRegen: 0.15, poise: 10 } },
        { name: 'Comandante', effects: { dmg: 0.06, blockAbsorb: 0.05 } },
      ],
      keystone: { name: 'Rei Guerreiro', effects: { maxHp: 0.15, poise: 30, dmg: 0.08 } },
    },
    {
      id: 'bloodrager', name: 'Fúria Sangrenta', angle: 210, color: '#c8322b',
      description: 'Quanto mais ferido, mais forte; vive do sangue dos inimigos.',
      pool: [{ lifesteal: 0.015 }, { dmgPhysical: 0.04 }, { berserk: 0.08 }, { critChance: 0.02 }],
      skills: ['bld_frenzy', 'bld_slam'],
      notables: [
        { name: 'Sede', effects: { lifesteal: 0.04 } },
        { name: 'Dor é Força', effects: { berserk: 0.25 } },
        { name: 'Sangue Fervente', effects: { dmg: 0.08, critChance: 0.03 } },
      ],
      keystone: { name: 'Avatar da Fúria', effects: { berserk: 0.6, lifesteal: 0.06, maxHp: -0.05 } },
    },
    {
      id: 'shaman', name: 'Xamã Ancestral', angle: 330, color: '#6fd6d0',
      description: 'Tempestades e espíritos dos antepassados.',
      pool: [{ dmg: 0.03 }, { maxHp: 0.03 }, { cooldown: 0.02 }, { poise: 5 }],
      skills: ['sha_storm', 'sha_spirits'],
      notables: [
        { name: 'Trovão', effects: { dmg: 0.06, critChance: 0.03 } },
        { name: 'Pele de Pedra', effects: { maxHp: 0.08, poise: 10 } },
        { name: 'Ritual', effects: { cooldown: 0.08, maxMana: 0.1 } },
      ],
      keystone: { name: 'Voz dos Ancestrais', effects: { dmg: 0.12, cooldown: 0.1, maxHp: 0.06 } },
    },
  ],
  warlock: [
    {
      id: 'demonologist', name: 'Demonologista', angle: 90, color: '#ff6a3d',
      description: 'Pactos com o inferno: cães de fogo e chão em chamas.',
      pool: [{ dmgArcane: 0.04 }, { dotPower: 0.04 }, { maxMana: 0.04 }, { cooldown: 0.02 }],
      skills: ['dem_felhound', 'dem_hellfire'],
      notables: [
        { name: 'Pacto', effects: { dmgArcane: 0.08, lifesteal: 0.02 } },
        { name: 'Legião', effects: { cooldown: 0.08 } },
        { name: 'Fogo do Inferno', effects: { dotPower: 0.15 } },
      ],
      keystone: { name: 'Senhor dos Demônios', effects: { dmgArcane: 0.15, cooldown: 0.12 } },
    },
    {
      id: 'soulreaper', name: 'Ceifador de Almas', angle: 210, color: '#7dff8a',
      description: 'Rouba a vida e a alma de quem estiver perto.',
      pool: [{ lifesteal: 0.015 }, { dotPower: 0.05 }, { dmgArcane: 0.04 }, { maxHp: 0.03 }],
      skills: ['rea_scythe', 'rea_harvest'],
      notables: [
        { name: 'Almas', effects: { maxMana: 0.1, lifesteal: 0.02 } },
        { name: 'Ceifa', effects: { dotPower: 0.15 } },
        { name: 'Necromancia', effects: { lifesteal: 0.04, dmgArcane: 0.05 } },
      ],
      keystone: { name: 'Anjo da Morte', effects: { lifesteal: 0.08, dotPower: 0.3 } },
    },
    {
      id: 'shadowmaster', name: 'Mestre das Sombras', angle: 330, color: '#8f6bff',
      description: 'Tentáculos, invisibilidade e medo.',
      pool: [{ dmgArcane: 0.04 }, { cooldown: 0.025 }, { moveSpeed: 0.02 }, { slowPower: 0.04 }],
      skills: ['shd_tendrils', 'shd_veil'],
      notables: [
        { name: 'Escuridão', effects: { dmgArcane: 0.06, cooldown: 0.04 } },
        { name: 'Sombra Viva', effects: { moveSpeed: 0.05, maxHp: 0.05 } },
        { name: 'Pavor', effects: { slowPower: 0.15, dotPower: 0.1 } },
      ],
      keystone: { name: 'Senhor das Sombras', effects: { dmgArcane: 0.18, cooldown: 0.1, maxHp: -0.05 } },
    },
  ],
};

/**
 * Arm layout, tier by tier from the ring outwards. m = minor, n0..n2 = notables, s0/s1 = skills,
 * k = keystone. Two entries in a tier make a fork (two parallel choices).
 */
const ARM: ReadonlyArray<ReadonlyArray<'m' | 'n0' | 'n1' | 'n2' | 's0' | 's1' | 'k'>> = [
  ['m'], ['m', 'm'], ['s0'], ['m', 'n0'], ['m'], ['m', 'm'], ['s1'], ['n1', 'm'], ['m'], ['m', 'm'], ['n2'], ['m', 'm'], ['m'], ['m', 'm'], ['k'],
];

function buildTree(cls: ClassId): TalentTree {
  const p = PREFIX[cls];
  const nodes: TalentNode[] = [];
  const byId = new Map<string, TalentNode>();
  const add = (n: Omit<TalentNode, 'links' | 'maxRank'>): TalentNode => {
    const node: TalentNode = { ...n, links: [], maxRank: 1 };
    nodes.push(node);
    byId.set(node.id, node);
    return node;
  };
  const link = (a: TalentNode, b: TalentNode) => {
    if (!a.links.includes(b.id)) a.links.push(b.id);
    if (!b.links.includes(a.id)) b.links.push(a.id);
  };
  const start = add({ id: `${p}.start`, name: CLASSES[cls].name, description: 'Ponto de partida: comece por qualquer lado do anel.', kind: 'start', path: '', x: 0, y: 0, effects: {} });
  // ring of six nodes around the start; the arms leave from slots 0, 2 and 4
  const ring: TalentNode[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((90 + i * 60) * Math.PI) / 180;
    const fx = RING[i]!;
    ring.push(add({ id: `${p}.r${i}`, name: MINOR_NAME[Object.keys(fx)[0] as TalentStat], description: describeEffects(fx), kind: 'minor', path: '', x: Math.cos(a) * 1.4, y: Math.sin(a) * 1.4, effects: fx }));
  }
  for (let i = 0; i < 6; i++) link(ring[i]!, ring[(i + 1) % 6]!);
  for (const i of [0, 2, 4]) link(start, ring[i]!);
  const arms = ARMS[cls];
  arms.forEach((arm, ai) => {
    const ang = (arm.angle * Math.PI) / 180;
    const dir = { x: Math.cos(ang), y: Math.sin(ang) };
    const side = { x: -dir.y, y: dir.x };
    let prev: TalentNode[] = [ring[ai * 2]!];
    let minorIdx = 0;
    ARM.forEach((tier, t) => {
      const r = 2.6 + t * 1.05;
      const cur = tier.map((kind, j) => {
        const off = tier.length === 2 ? (j === 0 ? -0.75 : 0.75) : 0;
        const x = dir.x * r + side.x * off;
        const y = dir.y * r + side.y * off;
        const id = `${p}.${arm.id}.${t}${tier.length === 2 ? (j === 0 ? 'a' : 'b') : ''}`;
        if (kind === 'm') {
          const fx = arm.pool[minorIdx++ % arm.pool.length]!;
          return add({ id, name: MINOR_NAME[Object.keys(fx)[0] as TalentStat], description: describeEffects(fx), kind: 'minor', path: arm.id, x, y, effects: fx });
        }
        if (kind === 's0' || kind === 's1') {
          const skill = arm.skills[kind === 's0' ? 0 : 1];
          const a = ACTIONS[skill];
          return add({ id, name: a?.name ?? skill, description: `Habilidade nova: ${a?.desc ?? ''} Equipe em um atalho na aba Habilidades.`, kind: 'skill', path: arm.id, x, y, effects: {}, skill });
        }
        const nb = kind === 'k' ? arm.keystone : arm.notables[Number(kind[1])]!;
        return add({ id, name: nb.name, description: describeEffects(nb.effects), kind: kind === 'k' ? 'keystone' : 'notable', path: arm.id, x, y, effects: nb.effects });
      });
      // connect tiers: 1↔2 fan out / in, 2↔2 run in parallel
      if (prev.length === cur.length) prev.forEach((a, i) => link(a, cur[i]!));
      else for (const a of prev) for (const b of cur) link(a, b);
      prev = cur;
    });
  });
  // bridges between neighbouring arms near the middle (hybrid builds): arm tier 4 ↔ next arm's tier 4
  for (let ai = 0; ai < 3; ai++) {
    const a = byId.get(`${p}.${arms[ai]!.id}.4`);
    const b = byId.get(`${p}.${arms[(ai + 1) % 3]!.id}.4`);
    if (!a || !b) continue;
    const mid = add({
      id: `${p}.bridge${ai}`, name: `${arms[ai]!.name} + ${arms[(ai + 1) % 3]!.name}`, description: describeEffects({ ...arms[ai]!.pool[0], ...arms[(ai + 1) % 3]!.pool[0] }),
      kind: 'notable', path: '', x: (a.x + b.x) / 2 * 0.92, y: (a.y + b.y) / 2 * 0.92, effects: { ...arms[ai]!.pool[0], ...arms[(ai + 1) % 3]!.pool[0] },
    });
    link(a, mid);
    link(mid, b);
  }
  return { start: start.id, archetypes: arms.map(({ id, name, description, color, angle }) => ({ id, name, description, color, angle })), nodes };
}

const PREFIX: Record<ClassId, string> = { vanguard: 'vg', arcanist: 'ar', healer: 'he', ranger: 'ra', rogue: 'ro', barbarian: 'ba', warlock: 'wl' };

export const TALENT_TREES: Readonly<Record<ClassId, TalentTree>> = Object.fromEntries(
  (Object.keys(ARMS) as ClassId[]).map((c) => [c, buildTree(c)]),
) as Record<ClassId, TalentTree>;

const NODE_INDEX = new Map<string, { cls: ClassId; node: TalentNode }>();
for (const cls of Object.keys(TALENT_TREES) as ClassId[]) for (const n of TALENT_TREES[cls].nodes) NODE_INDEX.set(n.id, { cls, node: n });

export function findTalent(id: string): { cls: ClassId; node: TalentNode } | undefined {
  return NODE_INDEX.get(id);
}

export function archetypeOf(cls: ClassId, id: string | null | undefined): Archetype | undefined {
  return id ? TALENT_TREES[cls].archetypes.find((a) => a.id === id) : undefined;
}

export const talentPointsTotal = (e: Entity): number => Math.max(0, e.level - 1);
export const talentPointsSpent = (e: Entity): number => Object.keys(e.talents).filter((id) => (e.talents[id] ?? 0) > 0).length;
export const talentPointsFree = (e: Entity): number => talentPointsTotal(e) - talentPointsSpent(e);

/** Total additive bonus of one stat from allocated nodes and (tests/admin) overrides. */
export function talentBonus(e: Entity, stat: TalentStat): number {
  if (e.kind !== 'player') return 0;
  let v = e.talentOverride?.[stat] ?? 0;
  for (const id in e.talents) {
    if (!(e.talents[id]! > 0)) continue;
    const t = NODE_INDEX.get(id);
    if (t) v += t.node.effects[stat] ?? 0;
  }
  return v;
}

/** A node can be bought if it belongs to the class, is free, a point is left and it touches the owned area. */
export function canAllocateTalent(e: Entity, nodeId: string): boolean {
  const t = NODE_INDEX.get(nodeId);
  if (!t || e.kind !== 'player' || t.cls !== e.classId || t.node.kind === 'start') return false;
  if (talentPointsFree(e) <= 0 || (e.talents[nodeId] ?? 0) > 0) return false;
  const start = TALENT_TREES[t.cls].start;
  return t.node.links.some((l) => l === start || (e.talents[l] ?? 0) > 0);
}

/**
 * Keep only nodes of this class that are connected to the start through owned nodes, at most
 * `budget` of them (save sanitation and respec safety).
 */
export function pruneTalents(cls: ClassId, talents: Record<string, number>, budget: number): Record<string, number> {
  const tree = TALENT_TREES[cls];
  const owned = new Set(Object.keys(talents).filter((id) => (talents[id] ?? 0) > 0 && NODE_INDEX.get(id)?.cls === cls && id !== tree.start));
  const out: Record<string, number> = {};
  const queue = [tree.start];
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of NODE_INDEX.get(id)?.node.links ?? []) {
      if (seen.has(l) || !owned.has(l)) continue;
      seen.add(l);
      if (Object.keys(out).length >= budget) return out;
      out[l] = 1;
      queue.push(l);
    }
  }
  return out;
}

/** Archetype with the most points (ties: the first), or null below TITLE_POINTS. */
export function dominantArchetype(cls: ClassId, talents: Record<string, number>): string | null {
  const count = new Map<string, number>();
  for (const id in talents) {
    const n = NODE_INDEX.get(id)?.node;
    if (n && n.path && (talents[id] ?? 0) > 0) count.set(n.path, (count.get(n.path) ?? 0) + 1);
  }
  let best: string | null = null;
  let bn = TITLE_POINTS - 1;
  for (const a of TALENT_TREES[cls].archetypes) {
    const c = count.get(a.id) ?? 0;
    if (c > bn) {
      bn = c;
      best = a.id;
    }
  }
  return best;
}

/** Every skill the character may equip: the class kit plus skills unlocked in the tree. */
export function unlockedSkills(cls: ClassId, talents: Record<string, number>): string[] {
  const k = CLASSES[cls].abilities;
  const out = [k.q.action, k.e.action, k.a1.action, k.a2.action, k.a3.action, k.a4.action];
  if (k.r) out.push(k.r.action);
  for (const id in talents) {
    const n = NODE_INDEX.get(id)?.node;
    if (n?.skill && (talents[id] ?? 0) > 0 && !out.includes(n.skill)) out.push(n.skill);
  }
  return out;
}

/** Action in a slot: the loadout choice when still unlocked, otherwise the class default. */
export function slotAction(cls: ClassId, loadout: Partial<Record<AbilitySlot, string>>, talents: Record<string, number>, slot: AbilitySlot): string | null {
  const chosen = loadout[slot];
  if (chosen && unlockedSkills(cls, talents).includes(chosen)) return chosen;
  return CLASSES[cls].abilities[slot]?.action ?? null;
}

/** Sanitize a loadout: only unlocked skills, each in at most one slot. */
export function cleanLoadout(cls: ClassId, raw: unknown, talents: Record<string, number>): Partial<Record<AbilitySlot, string>> {
  const out: Partial<Record<AbilitySlot, string>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  const ok = unlockedSkills(cls, talents);
  const used = new Set<string>();
  for (const s of ABILITY_SLOTS) {
    const v = (raw as Record<string, unknown>)[s];
    if (typeof v === 'string' && ok.includes(v) && !used.has(v)) {
      out[s] = v;
      used.add(v);
    }
  }
  return out;
}
