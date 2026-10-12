import type { Attributes, ClassId } from '../sim/types';

export interface AbilitySlotDef {
  /** Action id executed by this slot. */
  action: string;
  label: string;
  description: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  fantasy: string;
  baseAttributes: Attributes;
  lightAction: string;
  heavyAction: string;
  /** Q and E for the first prototype; 1–4 and R arrive with Etapa 3. */
  abilities: { q: AbilitySlotDef; e: AbilitySlotDef; a1: AbilitySlotDef; a2: AbilitySlotDef; a3: AbilitySlotDef; a4: AbilitySlotDef; r?: AbilitySlotDef };
  radius: number;
  mass: number;
  moveSpeed: number;
  /** Fraction of damage absorbed while blocking (shield vs staff). */
  guardAbsorb: number;
  /** Stamina drained per point of blocked damage. */
  guardStaminaMul: number;
  poiseBonus: number;
  manaRegen: number;
  weaponName: string;
}

export const CLASSES: Readonly<Record<ClassId, ClassDef>> = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguarda',
    fantasy: 'Combatente corpo a corpo resistente que controla o ritmo da luta.',
    baseAttributes: { str: 16, dex: 11, vit: 15, end: 14, int: 6, wil: 8, lck: 8 },
    lightAction: 'longsword_light',
    heavyAction: 'longsword_heavy',
    abilities: {
      q: { action: 'vanguard_seismic', label: 'Impacto Sísmico', description: 'Golpe no chão: dano em área e desequilíbrio.' },
      e: { action: 'vanguard_charge', label: 'Investida', description: 'Avança e atinge o primeiro alvo válido.' },
      a1: { action: 'vanguard_rising', label: 'Corte Ascendente', description: 'Golpe de baixo para cima que quebra o equilíbrio.' },
      a2: { action: 'vanguard_ironguard', label: 'Guarda de Ferro', description: 'Reduz 60% do dano e impede atordoamento por 3,5 s.' },
      a3: { action: 'vanguard_counter', label: 'Contra-ataque', description: 'Só após um aparo ou esquiva perfeita: golpe devastador.' },
      a4: { action: 'vanguard_fury', label: 'Fúria do Bastião', description: 'Giro contínuo com armadura, atinge tudo ao redor várias vezes.' },
    },
    radius: 0.42,
    mass: 1.4,
    moveSpeed: 4.1,
    guardAbsorb: 0.88,
    guardStaminaMul: 0.55,
    poiseBonus: 20,
    manaRegen: 1,
    weaponName: 'Espada longa e escudo',
  },
  arcanist: {
    id: 'arcanist',
    name: 'Arcanista',
    fantasy: 'Combatente de média distância, móvel, que administra recursos mágicos.',
    baseAttributes: { str: 8, dex: 12, vit: 10, end: 11, int: 17, wil: 14, lck: 9 },
    lightAction: 'staff_light',
    heavyAction: 'staff_heavy',
    abilities: {
      q: { action: 'arcanist_bolt', label: 'Projétil Etéreo', description: 'Disparo mágico de baixo custo.' },
      e: { action: 'arcanist_step', label: 'Passo Espectral', description: 'Deslocamento curto e intangível.' },
      a1: { action: 'arcanist_icelance', label: 'Lança de Gelo', description: 'Espinhos de gelo brotam em linha e deixam os alvos lentos.' },
      a2: { action: 'arcanist_rupture', label: 'Campo de Ruptura', description: 'Zona arcana que fere e retarda quem estiver dentro.' },
      a3: { action: 'arcanist_seal', label: 'Selo de Contenção', description: 'Prende no lugar o inimigo mais próximo na mira.' },
      a4: { action: 'arcanist_collapse', label: 'Colapso Astral', description: 'Longa conjuração; raios caem do céu na área.' },
    },
    radius: 0.38,
    mass: 1.0,
    moveSpeed: 4.4,
    guardAbsorb: 0.6,
    guardStaminaMul: 0.9,
    poiseBonus: 0,
    manaRegen: 6,
    weaponName: 'Cajado de freixo',
  },
  healer: {
    id: 'healer',
    name: 'Curandeira',
    fantasy: 'Suporte sagrado: cura, protege e purifica o grupo, e pune com luz.',
    baseAttributes: { str: 9, dex: 10, vit: 13, end: 11, int: 12, wil: 18, lck: 9 },
    lightAction: 'staff_light',
    heavyAction: 'staff_heavy',
    abilities: {
      q: { action: 'healer_light', label: 'Luz Curativa', description: 'Cura você e os aliados ao redor.' },
      e: { action: 'healer_aegis', label: 'Égide', description: 'Barreira sagrada: aliados próximos recebem 35% menos dano.' },
      a1: { action: 'healer_smite', label: 'Sentença Radiante', description: 'Projétil de luz que fere inimigos.' },
      a2: { action: 'healer_sanctuary', label: 'Santuário', description: 'Círculo sagrado: cura aliados e queima inimigos dentro dele.' },
      a3: { action: 'healer_purify', label: 'Purificar', description: 'Remove lentidão e enraizamento dos aliados e cura um pouco.' },
      a4: { action: 'healer_dawn', label: 'Bênção da Aurora', description: 'Longa prece: grande cura em área e proteção.' },
    },
    radius: 0.38,
    mass: 1.0,
    moveSpeed: 4.3,
    guardAbsorb: 0.65,
    guardStaminaMul: 0.85,
    poiseBonus: 5,
    manaRegen: 5,
    weaponName: 'Cajado da Aurora',
  },
  ranger: {
    id: 'ranger',
    name: 'Patrulheiro',
    fantasy: 'Arqueiro das matas: mata de longe, arma armadilhas e envenena a presa.',
    baseAttributes: { str: 10, dex: 17, vit: 11, end: 13, int: 9, wil: 10, lck: 12 },
    lightAction: 'bow_shot',
    heavyAction: 'bow_power',
    abilities: {
      q: { action: 'ranger_volley', label: 'Rajada', description: 'Cinco flechas em leque.' },
      e: { action: 'ranger_leap', label: 'Salto Evasivo', description: 'Salta para trás, intangível, abrindo distância.' },
      a1: { action: 'ranger_poison', label: 'Flecha Envenenada', description: 'Veneno que corrói a vida do alvo por 5 s.' },
      a2: { action: 'ranger_trap', label: 'Armadilha de Espinhos', description: 'Armadilha no chão que fere e prende quem pisar.' },
      a3: { action: 'ranger_rain', label: 'Chuva de Flechas', description: 'Dez flechas caem do céu na área marcada.' },
      a4: { action: 'ranger_hawkeye', label: 'Olho do Falcão', description: '+35% de dano por 8 s.' },
    },
    radius: 0.38,
    mass: 1.0,
    moveSpeed: 4.5,
    guardAbsorb: 0.55,
    guardStaminaMul: 0.95,
    poiseBonus: 0,
    manaRegen: 3,
    weaponName: 'Arco longo de teixo',
  },
  rogue: {
    id: 'rogue',
    name: 'Ladina',
    fantasy: 'Assassina das sombras: some na fumaça, envenena e ataca pelas costas.',
    baseAttributes: { str: 10, dex: 18, vit: 10, end: 12, int: 9, wil: 9, lck: 14 },
    lightAction: 'dagger_light',
    heavyAction: 'dagger_heavy',
    abilities: {
      q: { action: 'rogue_venom', label: 'Lâmina Venenosa', description: 'Golpe que envenena por 6 s.' },
      e: { action: 'rogue_shadowstep', label: 'Passo Sombrio', description: 'Avanço rápido e intangível.' },
      a1: { action: 'rogue_knives', label: 'Leque de Facas', description: 'Três facas arremessadas em leque.' },
      a2: { action: 'rogue_smoke', label: 'Bomba de Fumaça', description: 'Some nas sombras: inimigos perdem você, o próximo golpe é uma emboscada (+60%).' },
      a3: { action: 'rogue_assassinate', label: 'Golpe Fatal', description: 'Estocada devastadora; mortal pelas costas ou saindo da fumaça.' },
      a4: { action: 'rogue_dance', label: 'Dança das Lâminas', description: 'Giro de facas intangível que corta tudo ao redor.' },
    },
    radius: 0.36,
    mass: 0.9,
    moveSpeed: 4.7,
    guardAbsorb: 0.5,
    guardStaminaMul: 1.0,
    poiseBonus: 0,
    manaRegen: 3,
    weaponName: 'Adagas gêmeas',
  },
  barbarian: {
    id: 'barbarian',
    name: 'Bárbaro',
    fantasy: 'Fúria pura: machado enorme, gritos de guerra e golpes que derrubam gigantes.',
    baseAttributes: { str: 18, dex: 10, vit: 17, end: 14, int: 5, wil: 7, lck: 8 },
    lightAction: 'axe_light',
    heavyAction: 'axe_heavy',
    abilities: {
      q: { action: 'barb_warcry', label: 'Grito de Guerra', description: 'Você e aliados próximos ganham +25% de dano e um pouco de vida.' },
      e: { action: 'barb_leap', label: 'Salto Brutal', description: 'Salta sobre os inimigos e esmaga ao aterrissar.' },
      a1: { action: 'barb_whirl', label: 'Redemoinho', description: 'Gira o machado com armadura, acertando tudo ao redor.' },
      a2: { action: 'barb_stun', label: 'Pancada Atordoante', description: 'Golpe que quebra o equilíbrio e prende o alvo.' },
      a3: { action: 'barb_throw', label: 'Machado Arremessado', description: 'Arremessa um machado pesado.' },
      a4: { action: 'barb_rage', label: 'Fúria Ancestral', description: '+50% de dano, -25% de dano recebido e cura por 12 s.' },
    },
    radius: 0.44,
    mass: 1.6,
    moveSpeed: 4.2,
    guardAbsorb: 0.7,
    guardStaminaMul: 0.7,
    poiseBonus: 30,
    manaRegen: 1,
    weaponName: 'Machado de guerra',
  },
  warlock: {
    id: 'warlock',
    name: 'Bruxo',
    fantasy: 'Pactuário do abismo: amaldiçoa, drena a vida e invoca o vazio.',
    baseAttributes: { str: 8, dex: 10, vit: 11, end: 10, int: 18, wil: 15, lck: 8 },
    lightAction: 'staff_light',
    heavyAction: 'warlock_heavy',
    abilities: {
      q: { action: 'warlock_bolt', label: 'Raio Sombrio', description: 'Projétil que amaldiçoa o alvo (dano contínuo).' },
      e: { action: 'warlock_step', label: 'Passo do Vazio', description: 'Deslocamento curto e intangível.' },
      a1: { action: 'warlock_drain', label: 'Dreno de Vida', description: 'Rouba 60% do dano causado como vida.' },
      a2: { action: 'warlock_imps', label: 'Invocar Diabretes', description: 'Dois diabretes de fogo lutam ao seu lado por 25 s.' },
      a3: { action: 'warlock_hex', label: 'Maldição', description: 'Maldição forte no inimigo mais próximo da mira (8 s).' },
      a4: { action: 'warlock_abyss', label: 'Chamado do Abismo', description: 'Garras do vazio irrompem do chão e drenam vida.' },
      r: { action: 'warlock_guardian', label: 'Guardião Abissal', description: 'Invoca um demônio gigante que protege você por 30 s.' },
    },
    radius: 0.38,
    mass: 1.0,
    moveSpeed: 4.3,
    guardAbsorb: 0.6,
    guardStaminaMul: 0.9,
    poiseBonus: 0,
    manaRegen: 6,
    weaponName: 'Grimório e cajado de osso',
  },
};

/** Display order on the class select screen. */
export const CLASS_ORDER: readonly ClassId[] = ['vanguard', 'barbarian', 'rogue', 'ranger', 'arcanist', 'warlock', 'healer'];
