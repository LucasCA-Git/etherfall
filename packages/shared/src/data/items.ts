import type { ClassId, Entity } from '../sim/types';
import type { TalentEffects, TalentStat } from './talents';
import type { Rng } from '../math/rng';

/**
 * Items: equipment with rarities, random affixes, elemental imbuements and fixed legendaries.
 * Everything here is pure data + deterministic generation from the simulation RNG, so the server
 * rolls every item and re-validates every saved one (a tampered save can't forge power).
 */
export type ItemSlot = 'weapon' | 'offhand' | 'head' | 'chest' | 'hands' | 'legs' | 'feet' | 'ring' | 'amulet';
export const ITEM_SLOTS: readonly ItemSlot[] = ['weapon', 'offhand', 'head', 'chest', 'hands', 'legs', 'feet', 'ring', 'amulet'];
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export type ImbueElement = 'fire' | 'frost' | 'shadow' | 'holy' | 'poison' | 'lightning';
export const IMBUE_ELEMENTS: readonly ImbueElement[] = ['fire', 'frost', 'shadow', 'holy', 'poison', 'lightning'];
export const BAG_SIZE = 24;

export const RARITY_INFO: Record<Rarity, { name: string; color: [number, number, number]; affixes: number; mul: number }> = {
  common: { name: 'Comum', color: [0.72, 0.72, 0.7], affixes: 0, mul: 1 },
  uncommon: { name: 'Incomum', color: [0.45, 0.9, 0.4], affixes: 1, mul: 1.15 },
  rare: { name: 'Raro', color: [0.4, 0.62, 1.0], affixes: 2, mul: 1.3 },
  epic: { name: 'Épico', color: [0.78, 0.45, 1.0], affixes: 3, mul: 1.5 },
  legendary: { name: 'Lendário', color: [1.0, 0.6, 0.15], affixes: 4, mul: 1.8 },
};

export const IMBUE_INFO: Record<ImbueElement, { name: string; adj: string; desc: string }> = {
  fire: { name: 'Fogo', adj: 'Flamejante', desc: 'golpes queimam o alvo' },
  frost: { name: 'Gelo', adj: 'Glacial', desc: 'golpes deixam o alvo lento' },
  shadow: { name: 'Sombra', adj: 'Sombrio', desc: 'golpes amaldiçoam o alvo' },
  holy: { name: 'Sagrado', adj: 'Sagrado', desc: 'golpes curam você' },
  poison: { name: 'Veneno', adj: 'Venenoso', desc: 'golpes envenenam o alvo' },
  lightning: { name: 'Raio', adj: 'Trovejante', desc: 'golpes quebram a postura do alvo' },
};

export interface ItemBase {
  id: string;
  name: string;
  slot: ItemSlot;
  /** ASCII glyph shown in the bag / on the ground. */
  glyph: string;
  /** Weapons and off-hands are class gear; armour and jewels fit everyone. */
  classes?: ClassId[];
  /** Implicit stats at item level 1 (scaled by level and rarity). */
  implicit: TalentEffects;
}

export const ITEM_BASES: Readonly<Record<string, ItemBase>> = Object.fromEntries(
  ([
    // weapons (one family per class)
    { id: 'longsword', name: 'Espada Longa', slot: 'weapon', glyph: '†', classes: ['vanguard'], implicit: { dmg: 0.06 } },
    { id: 'greatstaff', name: 'Cajado Arcano', slot: 'weapon', glyph: '‡', classes: ['arcanist'], implicit: { dmgArcane: 0.07 } },
    { id: 'rod', name: 'Cetro da Aurora', slot: 'weapon', glyph: '¥', classes: ['healer'], implicit: { healPower: 0.07 } },
    { id: 'longbow', name: 'Arco Longo', slot: 'weapon', glyph: ')', classes: ['ranger'], implicit: { dmgPhysical: 0.07 } },
    { id: 'daggers', name: 'Adagas Gêmeas', slot: 'weapon', glyph: '/', classes: ['rogue'], implicit: { critChance: 0.03 } },
    { id: 'battleaxe', name: 'Machado de Guerra', slot: 'weapon', glyph: 'P', classes: ['barbarian'], implicit: { dmgPhysical: 0.08 } },
    { id: 'wand', name: 'Varinha de Osso', slot: 'weapon', glyph: '!', classes: ['warlock'], implicit: { dotPower: 0.08 } },
    // off-hands
    { id: 'kiteshield', name: 'Escudo Pipa', slot: 'offhand', glyph: '0', classes: ['vanguard', 'healer'], implicit: { blockAbsorb: 0.04, armor: 0.02 } },
    { id: 'grimoire', name: 'Grimório', slot: 'offhand', glyph: '=', classes: ['arcanist', 'warlock'], implicit: { maxMana: 0.06 } },
    { id: 'quiver', name: 'Aljava', slot: 'offhand', glyph: '"', classes: ['ranger'], implicit: { critChance: 0.02 } },
    { id: 'parrydagger', name: 'Adaga de Aparar', slot: 'offhand', glyph: '-', classes: ['rogue'], implicit: { staminaRegen: 0.06 } },
    { id: 'trophy', name: 'Troféu de Caça', slot: 'offhand', glyph: '&', classes: ['barbarian'], implicit: { berserk: 0.08 } },
    // armour (everyone)
    { id: 'helm', name: 'Elmo', slot: 'head', glyph: '^', implicit: { armor: 0.025, maxHp: 0.02 } },
    { id: 'hood', name: 'Capuz', slot: 'head', glyph: 'n', implicit: { armor: 0.012, manaRegen: 0.05 } },
    { id: 'cuirass', name: 'Couraça', slot: 'chest', glyph: '#', implicit: { armor: 0.045, maxHp: 0.03 } },
    { id: 'robe', name: 'Túnica', slot: 'chest', glyph: 'H', implicit: { armor: 0.02, maxMana: 0.05 } },
    { id: 'gloves', name: 'Manoplas', slot: 'hands', glyph: 'w', implicit: { armor: 0.015, dmg: 0.02 } },
    { id: 'greaves', name: 'Grevas', slot: 'legs', glyph: 'Π', implicit: { armor: 0.03, maxStamina: 0.03 } },
    { id: 'boots', name: 'Botas', slot: 'feet', glyph: 'L', implicit: { armor: 0.012, moveSpeed: 0.02 } },
    // jewels
    { id: 'ring', name: 'Anel', slot: 'ring', glyph: 'o', implicit: { critChance: 0.01 } },
    { id: 'amulet', name: 'Amuleto', slot: 'amulet', glyph: '♀', implicit: { maxHp: 0.02, maxMana: 0.02 } },
  ] as ItemBase[]).map((b) => [b.id, b]),
);

/** Random affixes: stat, display name, range at item level 1 (scaled with level, capped). */
export const AFFIXES: ReadonlyArray<{ stat: TalentStat; name: string; min: number; max: number; cap: number; slots?: ItemSlot[] }> = [
  { stat: 'dmg', name: 'Dano', min: 0.02, max: 0.05, cap: 0.25, slots: ['weapon', 'offhand', 'hands', 'ring', 'amulet'] },
  { stat: 'dmgPhysical', name: 'Dano físico', min: 0.03, max: 0.06, cap: 0.3, slots: ['weapon', 'hands', 'ring'] },
  { stat: 'dmgArcane', name: 'Dano arcano', min: 0.03, max: 0.06, cap: 0.3, slots: ['weapon', 'offhand', 'amulet', 'head'] },
  { stat: 'critChance', name: 'Chance de crítico', min: 0.01, max: 0.03, cap: 0.15, slots: ['weapon', 'hands', 'ring', 'amulet'] },
  { stat: 'maxHp', name: 'Vida máxima', min: 0.03, max: 0.06, cap: 0.3 },
  { stat: 'maxStamina', name: 'Vigor máximo', min: 0.03, max: 0.06, cap: 0.3 },
  { stat: 'maxMana', name: 'Mana máxima', min: 0.03, max: 0.06, cap: 0.3 },
  { stat: 'staminaRegen', name: 'Recuperação de vigor', min: 0.04, max: 0.08, cap: 0.4 },
  { stat: 'manaRegen', name: 'Recuperação de mana', min: 0.04, max: 0.08, cap: 0.4 },
  { stat: 'cooldown', name: 'Recarga das habilidades', min: 0.02, max: 0.04, cap: 0.15, slots: ['head', 'amulet', 'offhand', 'ring'] },
  { stat: 'lifesteal', name: 'Roubo de vida', min: 0.01, max: 0.02, cap: 0.08, slots: ['weapon', 'ring', 'amulet'] },
  { stat: 'armor', name: 'Armadura', min: 0.01, max: 0.025, cap: 0.12, slots: ['head', 'chest', 'hands', 'legs', 'feet', 'offhand'] },
  { stat: 'moveSpeed', name: 'Velocidade', min: 0.02, max: 0.04, cap: 0.15, slots: ['feet', 'legs', 'amulet'] },
  { stat: 'healPower', name: 'Poder de cura', min: 0.03, max: 0.06, cap: 0.3, slots: ['weapon', 'offhand', 'amulet', 'ring'] },
  { stat: 'dotPower', name: 'Dano contínuo', min: 0.04, max: 0.08, cap: 0.4, slots: ['weapon', 'offhand', 'ring', 'amulet'] },
  { stat: 'blockAbsorb', name: 'Absorção de bloqueio', min: 0.02, max: 0.04, cap: 0.15, slots: ['offhand', 'hands', 'chest'] },
];
const AFFIX_BY_STAT = new Map(AFFIXES.map((a) => [a.stat, a]));

export interface Affix {
  stat: TalentStat;
  value: number;
}

export interface Item {
  /** Unique id (per world/save). */
  uid: string;
  /** Base id, or `rune_<element>` for runes (consumed to imbue a weapon). */
  base: string;
  rarity: Rarity;
  level: number;
  affixes: Affix[];
  imbue: { element: ImbueElement; power: number } | null;
  /** Legendary id (fixed name and stats) or null. */
  legend: string | null;
}

/** Unique legendaries: fixed name, base and stats (scaled by their item level). */
export const LEGENDARIES: Readonly<Record<string, { name: string; base: string; affixes: Affix[]; imbue?: ImbueElement; lore: string; from?: string[] }>> = {
  vaelmor_oath: { name: 'Juramento de Vaelmor', base: 'longsword', affixes: [{ stat: 'dmg', value: 0.12 }, { stat: 'lifesteal', value: 0.04 }, { stat: 'maxHp', value: 0.08 }], imbue: 'holy', lore: 'A lâmina do último rei ainda lembra a promessa.', from: ['bonegiant', 'vampire'] },
  ash_crown: { name: 'Coroa das Cinzas', base: 'helm', affixes: [{ stat: 'maxHp', value: 0.12 }, { stat: 'dotPower', value: 0.25 }, { stat: 'armor', value: 0.04 }], lore: 'Arrancada da cabeça de um dragão que se dizia rei.', from: ['fire_dragon'] },
  wyrm_fang: { name: 'Presa da Serpe', base: 'daggers', affixes: [{ stat: 'critChance', value: 0.08 }, { stat: 'dmgPhysical', value: 0.1 }], imbue: 'frost', lore: 'Ainda gela a mão de quem a segura.', from: ['frost_wyvern'] },
  necro_mantle: { name: 'Manto do Necromante', base: 'robe', affixes: [{ stat: 'maxMana', value: 0.15 }, { stat: 'cooldown', value: 0.08 }, { stat: 'dmgArcane', value: 0.1 }], lore: 'Costurado com os nomes de quem ele levantou.', from: ['skeleton_mage', 'cursed_grave'] },
  sevaraen_bow: { name: 'Arco de Sevaraen', base: 'longbow', affixes: [{ stat: 'dmgPhysical', value: 0.14 }, { stat: 'moveSpeed', value: 0.06 }, { stat: 'critChance', value: 0.04 }], imbue: 'lightning', lore: 'A corda vibra antes da tempestade.' },
  wanderer_ring: { name: 'Anel do Errante', base: 'ring', affixes: [{ stat: 'staminaRegen', value: 0.3 }, { stat: 'maxStamina', value: 0.12 }], lore: 'Quem o usa nunca para de andar.' },
  broken_oath: { name: 'Amuleto do Juramento Partido', base: 'amulet', affixes: [{ stat: 'berserk', value: 0.35 }, { stat: 'dmg', value: 0.08 }], lore: 'Mais forte quanto mais perto da morte.' },
  dawn_scepter: { name: 'Cetro da Primeira Aurora', base: 'rod', affixes: [{ stat: 'healPower', value: 0.2 }, { stat: 'manaRegen', value: 0.2 }], imbue: 'holy', lore: 'Brilha mesmo nas criptas.' },
  goblin_king_axe: { name: 'Machado do Rei Goblin', base: 'battleaxe', affixes: [{ stat: 'dmgPhysical', value: 0.14 }, { stat: 'berserk', value: 0.2 }], imbue: 'poison', lore: 'Nunca foi lavado. Nunca.', from: ['goblin_chief'] },
  abyss_wand: { name: 'Varinha do Abismo', base: 'wand', affixes: [{ stat: 'dotPower', value: 0.25 }, { stat: 'lifesteal', value: 0.03 }], imbue: 'shadow', lore: 'Sussurra nomes de demônios.', from: ['demon', 'cult_leader'] },
  storm_staff: { name: 'Cajado da Tempestade', base: 'greatstaff', affixes: [{ stat: 'dmgArcane', value: 0.15 }, { stat: 'cooldown', value: 0.06 }], imbue: 'lightning', lore: 'O céu responde quando ele aponta.' },
  bulwark: { name: 'Muralha de Ferro', base: 'kiteshield', affixes: [{ stat: 'blockAbsorb', value: 0.12 }, { stat: 'armor', value: 0.06 }, { stat: 'maxHp', value: 0.06 }], lore: 'Nenhum portão caiu enquanto ela esteve de pé.' },
};

export const RUNE_BASE_PREFIX = 'rune_';
export const isRune = (it: Item) => it.base.startsWith(RUNE_BASE_PREFIX);
export const runeElement = (it: Item): ImbueElement | null => {
  const el = it.base.slice(RUNE_BASE_PREFIX.length) as ImbueElement;
  return isRune(it) && IMBUE_ELEMENTS.includes(el) ? el : null;
};

const scale = (level: number) => 1 + Math.min(59, Math.max(0, level - 1)) * 0.035;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
/** Legendary stats are defined at item level 20 and scale from there (never below half). */
const legendScale = (level: number) => Math.max(0.5, scale(level) / scale(20));
const legendValue = (a: Affix, level: number) => round3(Math.min((AFFIX_BY_STAT.get(a.stat)?.cap ?? 0.6) * 1.5, a.value * legendScale(level)));

/** Total stat bonuses of an item (implicit + affixes). */
export function itemEffects(it: Item): TalentEffects {
  const out: TalentEffects = {};
  if (isRune(it)) return out;
  const base = ITEM_BASES[it.base];
  if (!base) return out;
  const m = scale(it.level) * RARITY_INFO[it.rarity].mul;
  for (const [k, v] of Object.entries(base.implicit) as [TalentStat, number][]) out[k] = (out[k] ?? 0) + v * m;
  for (const a of it.affixes) out[a.stat] = (out[a.stat] ?? 0) + a.value;
  for (const k of Object.keys(out) as TalentStat[]) out[k] = round3(out[k]!);
  return out;
}

export function itemName(it: Item): string {
  if (isRune(it)) return `Runa de ${IMBUE_INFO[runeElement(it) ?? 'fire'].name}`;
  if (it.legend && LEGENDARIES[it.legend]) return LEGENDARIES[it.legend]!.name;
  const base = ITEM_BASES[it.base]?.name ?? 'Item';
  return it.imbue ? `${base} ${IMBUE_INFO[it.imbue.element].adj}` : base;
}

export function itemGlyph(it: Item): string {
  return isRune(it) ? '◊' : ITEM_BASES[it.base]?.glyph ?? '?';
}

export function itemSlot(it: Item): ItemSlot | null {
  return isRune(it) ? null : ITEM_BASES[it.base]?.slot ?? null;
}

/** Item level may exceed the character level by up to 5. */
export function canEquip(e: Pick<Entity, 'classId' | 'level'>, it: Item): boolean {
  const b = ITEM_BASES[it.base];
  if (!b || isRune(it)) return false;
  if (b.classes && (!e.classId || !b.classes.includes(e.classId))) return false;
  return it.level <= e.level + 5;
}

export function newUid(rng: Rng): string {
  return `${Math.floor(rng.next() * 2 ** 31).toString(36)}${Math.floor(rng.next() * 2 ** 31).toString(36)}`;
}

function rollAffixes(rng: Rng, slot: ItemSlot, count: number, level: number): Affix[] {
  const out: Affix[] = [];
  const pool = AFFIXES.filter((a) => !a.slots || a.slots.includes(slot));
  for (let i = 0; i < count && pool.length; i++) {
    const a = pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!;
    out.push({ stat: a.stat, value: round3(Math.min(a.cap, rng.range(a.min, a.max) * scale(level))) });
  }
  return out;
}

export interface DropOptions {
  level: number;
  /** Favour weapons/off-hands of this class. */
  forClass?: ClassId;
  rarity: Rarity;
  legend?: string;
}

export function makeLegendary(rng: Rng, id: string, level: number): Item {
  const L = LEGENDARIES[id]!;
  return {
    uid: newUid(rng), base: L.base, rarity: 'legendary', level,
    affixes: L.affixes.map((a) => ({ stat: a.stat, value: legendValue(a, level) })),
    imbue: L.imbue ? { element: L.imbue, power: 0.25 } : null, legend: id,
  };
}

export function makeRune(rng: Rng, element: ImbueElement, level: number): Item {
  return { uid: newUid(rng), base: `${RUNE_BASE_PREFIX}${element}`, rarity: 'rare', level, affixes: [], imbue: null, legend: null };
}

/** Roll one item of the given rarity. */
export function rollItem(rng: Rng, o: DropOptions): Item {
  const lvl = Math.max(1, Math.min(60, Math.round(o.level)));
  if (o.rarity === 'legendary') {
    const ids = o.legend ? [o.legend] : Object.keys(LEGENDARIES);
    const fits = (id: string) => {
      const b = ITEM_BASES[LEGENDARIES[id]!.base]!;
      return !b.classes || !o.forClass || b.classes.includes(o.forClass);
    };
    const pool = ids.filter(fits).length ? ids.filter(fits) : ids;
    return makeLegendary(rng, pool[Math.floor(rng.next() * pool.length)]!, lvl);
  }
  const bases = Object.values(ITEM_BASES);
  const candidates = o.forClass && rng.next() < 0.7 ? bases.filter((b) => !b.classes || b.classes.includes(o.forClass!)) : bases;
  const base = candidates[Math.floor(rng.next() * candidates.length)]!;
  const item: Item = { uid: newUid(rng), base: base.id, rarity: o.rarity, level: lvl, affixes: rollAffixes(rng, base.slot, RARITY_INFO[o.rarity].affixes, lvl), imbue: null, legend: null };
  // epic weapons sometimes come already imbued
  if (base.slot === 'weapon' && o.rarity === 'epic' && rng.next() < 0.4) item.imbue = { element: IMBUE_ELEMENTS[Math.floor(rng.next() * IMBUE_ELEMENTS.length)]!, power: 0.15 };
  return item;
}

/** Pick a rarity from weights (common → legendary). */
export function rollRarity(rng: Rng, weights: readonly [number, number, number, number, number]): Rarity {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < 5; i++) {
    r -= weights[i]!;
    if (r < 0) return RARITIES[i]!;
  }
  return 'common';
}

const randomElement = (rng: Rng) => IMBUE_ELEMENTS[Math.floor(rng.next() * IMBUE_ELEMENTS.length)]!;

/** Loot of a slain creature (tiered by its XP value), biased toward the killer's class. */
export function rollEnemyDrops(rng: Rng, enemyId: string, xp: number, level: number, forClass?: ClassId): Item[] {
  const out: Item[] = [];
  const boss = xp >= 400;
  const elite = xp >= 90;
  const chance = boss ? 1 : elite ? 0.55 : 0.16;
  const count = boss ? 2 + (rng.next() < 0.5 ? 1 : 0) : 1;
  for (let i = 0; i < count; i++) {
    if (rng.next() >= chance) continue;
    const rarity = boss
      ? rollRarity(rng, [0, 2, 5, 4, enemyId === 'fire_dragon' ? 3 : 1.2])
      : elite ? rollRarity(rng, [3, 5, 3, 1, 0.12]) : rollRarity(rng, [10, 5, 1.5, 0.3, 0.02]);
    const own = Object.keys(LEGENDARIES).filter((id) => LEGENDARIES[id]!.from?.includes(enemyId));
    const legend = rarity === 'legendary' && own.length && rng.next() < 0.7 ? own[Math.floor(rng.next() * own.length)] : undefined;
    out.push(rollItem(rng, { level, forClass, rarity, legend }));
  }
  if (rng.next() < (boss ? 0.8 : elite ? 0.2 : 0.05)) out.push(makeRune(rng, randomElement(rng), level));
  return out;
}

export type ChestTier = 0 | 1 | 2;
export const CHEST_NAMES = ['Baú de Madeira', 'Baú de Ferro', 'Baú Dourado'] as const;
const CHEST_WEIGHTS: ReadonlyArray<readonly [number, number, number, number, number]> = [[6, 5, 2, 0.4, 0.03], [1, 4, 4, 2, 0.25], [0, 1, 4, 4, 1.4]];

/** Contents of a chest of the given tier. */
export function rollChest(rng: Rng, tier: ChestTier, level: number, forClass?: ClassId): Item[] {
  const out: Item[] = [];
  for (let i = 0; i <= tier; i++) out.push(rollItem(rng, { level: level + tier * 2, forClass, rarity: rollRarity(rng, CHEST_WEIGHTS[tier]!) }));
  if (tier >= 1 && rng.next() < (tier === 2 ? 0.8 : 0.35)) out.push(makeRune(rng, randomElement(rng), level));
  return out;
}

/** Summed bonuses of everything equipped (cached on the entity by the simulation). */
export function gearEffects(equipment: Partial<Record<ItemSlot, Item>>): TalentEffects {
  const out: TalentEffects = {};
  for (const it of Object.values(equipment)) {
    if (!it) continue;
    for (const [k, v] of Object.entries(itemEffects(it)) as [TalentStat, number][]) out[k] = round3((out[k] ?? 0) + v);
  }
  return out;
}

/**
 * Re-validate an item from a save: unknown bases or rarities are dropped, affix values are clamped
 * to their caps, legendaries are rebuilt from their table (a tampered save can't forge power).
 */
export function sanitizeItem(raw: unknown): Item | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const uid = typeof r.uid === 'string' ? r.uid.slice(0, 24) : '';
  const baseId = typeof r.base === 'string' ? r.base : '';
  const rarity = RARITIES.includes(r.rarity as Rarity) ? (r.rarity as Rarity) : null;
  const level = typeof r.level === 'number' && Number.isFinite(r.level) ? Math.max(1, Math.min(60, Math.floor(r.level))) : 1;
  if (!uid || !rarity) return null;
  if (baseId.startsWith(RUNE_BASE_PREFIX)) {
    const el = baseId.slice(RUNE_BASE_PREFIX.length) as ImbueElement;
    return IMBUE_ELEMENTS.includes(el) ? { uid, base: baseId, rarity: 'rare', level, affixes: [], imbue: null, legend: null } : null;
  }
  const base = ITEM_BASES[baseId];
  if (!base) return null;
  const imb = r.imbue as { element?: unknown; power?: unknown } | null | undefined;
  const imbue = imb && IMBUE_ELEMENTS.includes(imb.element as ImbueElement) && base.slot === 'weapon'
    ? { element: imb.element as ImbueElement, power: Math.max(0.05, Math.min(0.3, Number(imb.power) || 0.1)) } : null;
  if (rarity === 'legendary') {
    const id = typeof r.legend === 'string' && LEGENDARIES[r.legend]?.base === baseId ? r.legend : null;
    if (!id) return null;
    const L = LEGENDARIES[id]!;
    return { uid, base: baseId, rarity, level, legend: id, imbue: imbue ?? (L.imbue ? { element: L.imbue, power: 0.25 } : null),
      affixes: L.affixes.map((a) => ({ stat: a.stat, value: legendValue(a, level) })) };
  }
  const affixes: Affix[] = [];
  for (const a of (Array.isArray(r.affixes) ? r.affixes : []).slice(0, RARITY_INFO[rarity].affixes)) {
    const def = AFFIX_BY_STAT.get((a as Affix)?.stat);
    const v = Number((a as Affix)?.value);
    if (!def || !Number.isFinite(v) || affixes.some((x) => x.stat === def.stat) || (def.slots && !def.slots.includes(base.slot))) continue;
    affixes.push({ stat: def.stat, value: round3(Math.max(0, Math.min(def.cap, v))) });
  }
  return { uid, base: baseId, rarity, level, affixes, imbue, legend: null };
}

const STAT_NAMES: Partial<Record<TalentStat, string>> = { berserk: 'Fúria (dano com pouca vida)' };

/** Human-readable stat lines for tooltips. */
export function describeItem(it: Item): string[] {
  if (isRune(it)) {
    const el = runeElement(it)!;
    return [`Sente-se numa fogueira e imbua sua arma com ${IMBUE_INFO[el].name}: ${IMBUE_INFO[el].desc}.`];
  }
  const lines: string[] = [];
  for (const [k, v] of Object.entries(itemEffects(it)) as [TalentStat, number][]) {
    const name = AFFIX_BY_STAT.get(k)?.name ?? STAT_NAMES[k] ?? k;
    lines.push(`+${(v * 100).toFixed(k === 'critChance' || k === 'lifesteal' ? 1 : 0)}% ${name}`);
  }
  if (it.imbue) lines.push(`Imbuído: ${IMBUE_INFO[it.imbue.element].name} (${Math.round(it.imbue.power * 100)}%) — ${IMBUE_INFO[it.imbue.element].desc}`);
  if (it.legend) lines.push(`“${LEGENDARIES[it.legend]!.lore}”`);
  return lines;
}
