import { CLASSES } from '../data/classes';
import { ATTR_MAX, ATTR_POINTS_PER_LEVEL, MAX_LEVEL } from '../data/curves';
import { cleanLoadout, dominantArchetype, pruneTalents } from '../data/talents';
import type { AbilitySlot, AttrKey, Attributes, ClassId, Entity, Gender } from '../sim/types';
import { BAG_SIZE, ITEM_SLOTS, itemSlot, sanitizeItem, type Item, type ItemSlot } from '../data/items';

/**
 * Persistent character record (server accounts and offline browser saves share it).
 * Everything here is re-validated on load, so a tampered file can't grant power.
 */
export interface CharacterSave {
  v: 1;
  id: string;
  name: string;
  classId: ClassId;
  /** Hero body (optional in older saves: 'm'). */
  gender?: Gender;
  level: number;
  xp: number;
  unspent: number;
  attrs: Attributes;
  talents: Record<string, number>;
  /** Skills chosen for the ability slots (optional in older saves). */
  loadout?: Partial<Record<AbilitySlot, string>>;
  /** Title from the dominant skill-tree path (derived). */
  subclass: string | null;
  /** Bag and equipped items (optional in older saves). */
  inventory?: Item[];
  equipment?: Partial<Record<ItemSlot, Item>>;
  /** Chest prop ids already opened by this character. */
  openedChests?: number[];
  discovered: string[];
  essenceMark: { x: number; y: number; amount: number } | null;
  /** Last bonfire rested at. */
  respawn: { x: number; y: number } | null;
  /** Where the character logged out. */
  pos: { x: number; y: number } | null;
  createdAt: number;
  updatedAt: number;
}

/** Short public view for character lists. */
export interface CharacterSummary {
  id: string;
  name: string;
  classId: ClassId;
  gender?: Gender;
  level: number;
  subclass: string | null;
  updatedAt: number;
}

export const MAX_NAME_LEN = 16;
const ATTR_KEYS: AttrKey[] = ['str', 'dex', 'vit', 'end', 'int', 'wil', 'lck'];

/** Allowed characters for player-facing names (letters, digits, space, _ and -). */
export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
}

export const isClassId = (v: unknown): v is ClassId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, v);

export const isGender = (v: unknown): v is Gender => v === 'm' || v === 'f';

export function newCharacter(id: string, name: string, classId: ClassId, now: number, gender: Gender = 'm'): CharacterSave {
  return {
    v: 1, id, name, classId, gender, level: 1, xp: 0, unspent: 0, attrs: { ...CLASSES[classId].baseAttributes },
    talents: {}, loadout: {}, subclass: null, discovered: [], essenceMark: null, respawn: null, pos: null, createdAt: now, updatedAt: now,
  };
}

export function summarize(c: CharacterSave): CharacterSummary {
  return { id: c.id, name: c.name, classId: c.classId, gender: c.gender ?? 'm', level: c.level, subclass: c.subclass, updatedAt: c.updatedAt };
}

/** Snapshot of a live player into its save record. */
export function exportCharacter(e: Entity, prev: CharacterSave, now: number): CharacterSave {
  return {
    ...prev,
    level: e.level,
    xp: e.xp,
    unspent: e.unspent,
    attrs: { ...e.attrs },
    talents: { ...e.talents },
    loadout: { ...e.loadout },
    subclass: e.subclass,
    discovered: [...e.discovered],
    inventory: (e.inventory ?? []).map(cloneItem),
    equipment: Object.fromEntries(Object.entries(e.equipment ?? {}).filter(([, it]) => it).map(([k, it]) => [k, cloneItem(it!)])),
    openedChests: [...(e.openedChests ?? [])],
    essenceMark: e.essenceMark ? { ...e.essenceMark } : null,
    respawn: { x: e.respawnPoint.x, y: e.respawnPoint.y },
    pos: { x: e.pos.x, y: e.pos.y },
    updatedAt: now,
  };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const cloneItem = (it: Item): Item => ({ ...it, affixes: it.affixes.map((a) => ({ ...a })), imbue: it.imbue ? { ...it.imbue } : null });

/** Items in a save are rebuilt through `sanitizeItem` (unknown or impossible items are dropped). */
function validateItems(r: Record<string, unknown>): Pick<CharacterSave, 'inventory' | 'equipment' | 'openedChests'> {
  const seen = new Set<string>();
  const ok = (raw: unknown): Item | null => {
    const it = sanitizeItem(raw);
    if (!it || seen.has(it.uid)) return null;
    seen.add(it.uid);
    return it;
  };
  const equipment: Partial<Record<ItemSlot, Item>> = {};
  const eq = (typeof r.equipment === 'object' && r.equipment) || {};
  for (const slot of ITEM_SLOTS) {
    const it = ok((eq as Record<string, unknown>)[slot]);
    if (it && itemSlot(it) === slot) equipment[slot] = it;
  }
  const inventory = (Array.isArray(r.inventory) ? r.inventory : []).map(ok).filter((x): x is Item => !!x).slice(0, BAG_SIZE);
  const openedChests = (Array.isArray(r.openedChests) ? r.openedChests : []).filter((v): v is number => Number.isInteger(v) && v >= 0).slice(0, 4096);
  return { inventory, equipment, openedChests };
}
const point = (v: unknown): { x: number; y: number } | null => {
  const r = v as { x?: unknown; y?: unknown } | null;
  return r && finite(r.x) && finite(r.y) ? { x: r.x, y: r.y } : null;
};

/**
 * Parse and sanitize an untrusted save. Points that don't add up are clamped: attributes can't
 * exceed what the level granted, talents must belong to the class and respect the point total.
 */
export function validateSave(raw: unknown): CharacterSave | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.id !== 'string' || !isClassId(r.classId)) return null;
  const name = cleanName(r.name);
  if (!name) return null;
  const classId = r.classId;
  const cls = CLASSES[classId];
  const level = finite(r.level) ? Math.max(1, Math.min(MAX_LEVEL, Math.floor(r.level))) : 1;
  const base = cls.baseAttributes;
  const attrsIn = (r.attrs ?? {}) as Record<string, unknown>;
  const attrs = { ...base };
  let spentAttr = 0;
  for (const k of ATTR_KEYS) {
    const v = attrsIn[k];
    attrs[k] = finite(v) ? Math.max(base[k], Math.min(ATTR_MAX, Math.floor(v))) : base[k];
    spentAttr += attrs[k] - base[k];
  }
  const totalAttr = (level - 1) * ATTR_POINTS_PER_LEVEL;
  if (spentAttr > totalAttr) {
    // over-spent (tampered): fall back to the class base and refund everything
    Object.assign(attrs, base);
    spentAttr = 0;
  }
  const unspent = totalAttr - spentAttr;
  // skill tree: only nodes of this class, connected to the start, within the level's points
  const talentsIn = (typeof r.talents === 'object' && r.talents !== null ? r.talents : {}) as Record<string, unknown>;
  const owned: Record<string, number> = {};
  for (const [id, v] of Object.entries(talentsIn)) if (finite(v) && v > 0) owned[id] = 1;
  const talents = pruneTalents(classId, owned, level - 1);
  const loadout = cleanLoadout(classId, r.loadout, talents);
  const subclass = dominantArchetype(classId, talents);
  const em = r.essenceMark as Record<string, unknown> | null;
  const essenceMark = em && finite(em.x) && finite(em.y) && finite(em.amount) && em.amount > 0 ? { x: em.x, y: em.y, amount: Math.floor(em.amount) } : null;
  const discovered = Array.isArray(r.discovered) ? r.discovered.filter((d): d is string => typeof d === 'string').slice(0, 64) : [];
  return {
    v: 1,
    id: r.id.slice(0, 64),
    name,
    classId,
    gender: isGender(r.gender) ? r.gender : 'm',
    level,
    xp: finite(r.xp) ? Math.max(0, Math.floor(r.xp)) : 0,
    unspent,
    attrs,
    talents,
    loadout,
    subclass,
    discovered,
    ...validateItems(r),
    essenceMark,
    respawn: point(r.respawn),
    pos: point(r.pos),
    createdAt: finite(r.createdAt) ? r.createdAt : 0,
    updatedAt: finite(r.updatedAt) ? r.updatedAt : 0,
  };
}
