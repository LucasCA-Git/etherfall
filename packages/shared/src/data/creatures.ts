import type { ActionDef } from './actions';
import type { EnemyDef } from './enemies';

/**
 * Creatures drawn with the Flare art (client/render3d/sprites3d.ts): goblins, skeletons, ants,
 * wyverns and the cursed grave. Data only — the generic enemy AI picks attacks by range and weight.
 */
const deg = (d: number) => (d * Math.PI) / 180;
const phys = { physical: 0.1, arcane: 0 };

export const CREATURE_ENEMIES: Record<string, EnemyDef> = {
  goblin: {
    id: 'goblin', name: 'Goblin', hp: 90, poise: 15, radius: 0.34, mass: 0.8, speed: 4.4, aggroRange: 10, leashRange: 24,
    preferredDist: 1.2, xp: 25, absorb: { physical: 0, arcane: 0 },
    attacks: [{ action: 'goblin_stab', weight: 3, minRange: 0, maxRange: 1.2 }, { action: 'goblin_hop', weight: 1, minRange: 1.6, maxRange: 4 }],
    attackCooldown: [16, 36], respawnTicks: 30 * 35,
  },
  goblin_chief: {
    id: 'goblin_chief', name: 'Chefe Goblin', hp: 280, poise: 60, radius: 0.42, mass: 1.4, speed: 4.0, aggroRange: 11, leashRange: 26,
    preferredDist: 1.5, xp: 95, absorb: phys,
    attacks: [
      { action: 'goblin_cleave', weight: 3, minRange: 0, maxRange: 1.6 },
      { action: 'goblin_leap', weight: 1.4, minRange: 2, maxRange: 6 },
      { action: 'goblin_horn', weight: 0.8, minRange: 0, maxRange: 9 },
    ],
    attackCooldown: [22, 48], respawnTicks: 30 * 60,
  },
  skeleton: {
    id: 'skeleton', name: 'Esqueleto Soldado', hp: 150, poise: 40, radius: 0.4, mass: 1.1, speed: 3.4, aggroRange: 10, leashRange: 24,
    preferredDist: 1.4, xp: 40, absorb: { physical: 0.15, arcane: -0.1 },
    attacks: [{ action: 'skel_slash', weight: 3, minRange: 0, maxRange: 1.5 }, { action: 'skel_bash', weight: 1, minRange: 0, maxRange: 1.2 }],
    attackCooldown: [22, 46], respawnTicks: 30 * 40,
  },
  skeleton_archer: {
    id: 'skeleton_archer', name: 'Esqueleto Arqueiro', hp: 110, poise: 25, radius: 0.38, mass: 1, speed: 3.2, aggroRange: 13, leashRange: 26,
    preferredDist: 7, xp: 45, absorb: { physical: 0.1, arcane: -0.1 },
    attacks: [{ action: 'skel_arrow', weight: 3, minRange: 2.5, maxRange: 12 }, { action: 'skel_volley', weight: 1.2, minRange: 3, maxRange: 10 }, { action: 'skel_slash', weight: 1, minRange: 0, maxRange: 1.4 }],
    attackCooldown: [26, 52], respawnTicks: 30 * 40,
  },
  skeleton_mage: {
    id: 'skeleton_mage', name: 'Esqueleto Necromante', hp: 120, poise: 20, radius: 0.38, mass: 1, speed: 3.0, aggroRange: 12, leashRange: 26,
    preferredDist: 6.5, xp: 55, absorb: { physical: 0, arcane: 0.2 },
    attacks: [{ action: 'mage_frost', weight: 3, minRange: 2, maxRange: 11 }, { action: 'mage_hex', weight: 1.5, minRange: 2, maxRange: 10 }, { action: 'mage_bones', weight: 1, minRange: 0, maxRange: 9 }],
    attackCooldown: [30, 60], respawnTicks: 30 * 45,
  },
  fire_ant: {
    id: 'fire_ant', name: 'Formiga de Fogo', hp: 150, poise: 30, radius: 0.5, mass: 1.3, speed: 4.2, aggroRange: 10, leashRange: 24,
    preferredDist: 1.4, xp: 50, absorb: { physical: 0.15, arcane: 0.1 },
    attacks: [{ action: 'ant_fire_bite', weight: 3, minRange: 0, maxRange: 1.3 }, { action: 'ant_fire_spit', weight: 1.4, minRange: 2.5, maxRange: 8 }],
    attackCooldown: [20, 44], respawnTicks: 30 * 40,
  },
  ice_ant: {
    id: 'ice_ant', name: 'Formiga Glacial', hp: 150, poise: 30, radius: 0.5, mass: 1.3, speed: 4.0, aggroRange: 10, leashRange: 24,
    preferredDist: 1.4, xp: 50, absorb: { physical: 0.15, arcane: 0.1 },
    attacks: [{ action: 'ant_ice_bite', weight: 3, minRange: 0, maxRange: 1.3 }, { action: 'ant_ice_spit', weight: 1.4, minRange: 2.5, maxRange: 8 }],
    attackCooldown: [20, 44], respawnTicks: 30 * 40,
  },
  fire_dragon: {
    id: 'fire_dragon', name: 'Dragão das Cinzas', hp: 3400, poise: 320, radius: 1.6, mass: 22, speed: 4.2, aggroRange: 14, leashRange: 34,
    preferredDist: 2.6, xp: 1400, absorb: { physical: 0.25, arcane: 0.15 },
    attacks: [
      { action: 'dragon_bite', weight: 3, minRange: 0, maxRange: 2.4 },
      { action: 'dragon_breath', weight: 2, minRange: 1.5, maxRange: 9 },
      { action: 'dragon_charge', weight: 1.2, minRange: 4, maxRange: 11 },
      { action: 'dragon_tail', weight: 1.2, minRange: 0, maxRange: 2.2 },
    ],
    attackCooldown: [34, 70], respawnTicks: 30 * 300,
  },
  frost_wyvern: {
    id: 'frost_wyvern', name: 'Serpe Glacial', hp: 1800, poise: 200, radius: 1.3, mass: 14, speed: 4.5, aggroRange: 13, leashRange: 30,
    preferredDist: 2.4, xp: 700, absorb: { physical: 0.15, arcane: 0.2 },
    attacks: [
      { action: 'wyvern_bite', weight: 3, minRange: 0, maxRange: 2.2 },
      { action: 'frost_breath', weight: 2, minRange: 1.5, maxRange: 9 },
      { action: 'wyvern_dash', weight: 1.2, minRange: 4, maxRange: 10 },
    ],
    attackCooldown: [32, 64], respawnTicks: 30 * 200,
  },
  // ---------- wildlife (team 2: grazes, flees; everyone may hunt it) ----------
  deer: {
    id: 'deer', name: 'Cervo', hp: 70, poise: 10, radius: 0.42, mass: 1.2, speed: 6.4, aggroRange: 0, leashRange: 40,
    preferredDist: 0, xp: 12, absorb: { physical: 0, arcane: 0 }, attacks: [], attackCooldown: [60, 90], respawnTicks: 30 * 60,
    behavior: 'passive', team: 2, fleeRange: 9,
  },
  rabbit: {
    id: 'rabbit', name: 'Coelho', hp: 20, poise: 2, radius: 0.22, mass: 0.3, speed: 6.0, aggroRange: 0, leashRange: 30,
    preferredDist: 0, xp: 4, absorb: { physical: 0, arcane: 0 }, attacks: [], attackCooldown: [60, 90], respawnTicks: 30 * 40,
    behavior: 'passive', team: 2, fleeRange: 6,
  },
  boar: {
    id: 'boar', name: 'Javali', hp: 160, poise: 50, radius: 0.45, mass: 2, speed: 5.0, aggroRange: 0, leashRange: 24,
    preferredDist: 1.2, xp: 30, absorb: { physical: 0.1, arcane: 0 },
    attacks: [{ action: 'boar_gore', weight: 3, minRange: 0, maxRange: 1.3 }, { action: 'boar_charge', weight: 1.5, minRange: 2, maxRange: 6 }],
    attackCooldown: [24, 50], respawnTicks: 30 * 60, behavior: 'passive', team: 2, fleeRange: 4,
  },
  // ---------- villagers (the players' side) ----------
  villager: {
    id: 'villager', name: 'Aldeão', hp: 120, poise: 10, radius: 0.36, mass: 1, speed: 3.8, aggroRange: 0, leashRange: 30,
    preferredDist: 0, xp: 0, absorb: { physical: 0, arcane: 0 }, attacks: [], attackCooldown: [60, 90], respawnTicks: 30 * 30,
    behavior: 'villager', team: 0, fleeRange: 8,
  },
  // ---------- the Abyss cult and what it calls ----------
  cultist: {
    id: 'cultist', name: 'Cultista do Abismo', hp: 140, poise: 25, radius: 0.38, mass: 1, speed: 3.6, aggroRange: 6, leashRange: 22,
    preferredDist: 5, xp: 60, absorb: { physical: 0, arcane: 0.15 },
    attacks: [{ action: 'cult_bolt', weight: 3, minRange: 1.5, maxRange: 10 }, { action: 'cult_hex', weight: 1, minRange: 1.5, maxRange: 9 }, { action: 'goblin_stab', weight: 1, minRange: 0, maxRange: 1.2 }],
    attackCooldown: [28, 56], respawnTicks: 30 * 300, behavior: 'cultist',
  },
  cult_leader: {
    id: 'cult_leader', name: 'Arauto do Abismo', hp: 320, poise: 60, radius: 0.42, mass: 1.3, speed: 3.6, aggroRange: 6, leashRange: 22,
    preferredDist: 5, xp: 160, absorb: { physical: 0.05, arcane: 0.25 },
    attacks: [{ action: 'cult_bolt', weight: 2, minRange: 1.5, maxRange: 10 }, { action: 'demon_fire', weight: 1, minRange: 1, maxRange: 9 }, { action: 'cult_hex', weight: 1, minRange: 1.5, maxRange: 9 }],
    attackCooldown: [26, 52], respawnTicks: 30 * 300, behavior: 'cultist',
  },
  demon: {
    id: 'demon', name: 'Demônio do Abismo', hp: 2600, poise: 280, radius: 1.1, mass: 14, speed: 4.4, aggroRange: 16, leashRange: 30,
    preferredDist: 2, xp: 900, absorb: { physical: 0.2, arcane: 0.2 },
    attacks: [
      { action: 'demon_cleave', weight: 3, minRange: 0, maxRange: 2.4 },
      { action: 'demon_fire', weight: 1.5, minRange: 1, maxRange: 10 },
      { action: 'demon_roar', weight: 1, minRange: 0, maxRange: 3 },
    ],
    attackCooldown: [30, 60], respawnTicks: 0,
  },
  cursed_grave: {
    id: 'cursed_grave', name: 'Túmulo Amaldiçoado', hp: 420, poise: 9999, radius: 0.7, mass: 999, speed: 0, aggroRange: 10, leashRange: 12,
    preferredDist: 0, xp: 130, absorb: { physical: 0.3, arcane: -0.2 },
    attacks: [{ action: 'grave_raise', weight: 2, minRange: 0, maxRange: 10 }, { action: 'grave_curse', weight: 1.5, minRange: 1, maxRange: 10 }],
    attackCooldown: [60, 110], respawnTicks: 30 * 90,
  },
};

type Hit = NonNullable<ActionDef['hit']>;
const proj = (id: string, speed: number, radius: number, ttl: number, damage: number, type: Hit['type'], extra: Partial<Hit> = {}) => ({
  id, speed, radius, ttl, hit: { range: 0, arc: Math.PI, damage, poise: 10, knockback: 1.5, scaling: {}, type, parryable: false, ...extra } as Hit,
});

/**
 * Summon-sign phantoms (0.14): a hero of a random class answers the sign at a bonfire and fights at your side
 * (offline help, like the white signs of Dark Souls). They use the classes' own moves; the AI picks by range.
 */
type Atk = EnemyDef['attacks'][number];
const melee = (action: string, reach: number, weight = 3): Atk => ({ action, weight, minRange: 0, maxRange: reach });
const shot = (action: string, weight = 3, min = 1.5, max = 12): Atk => ({ action, weight, minRange: min, maxRange: max });
const PHANTOM_MOVES: Record<string, { attacks: Atk[]; preferredDist: number; hp: number; speed: number }> = {
  vanguard: { attacks: [melee('longsword_light', 1.5), melee('vanguard_rising', 1.6, 1)], preferredDist: 1.1, hp: 520, speed: 4.4 },
  arcanist: { attacks: [shot('arcanist_bolt', 4), melee('staff_light', 1.3, 1)], preferredDist: 6, hp: 340, speed: 4.4 },
  healer: { attacks: [melee('staff_light', 1.3, 2), melee('healer_light', 4, 1)], preferredDist: 1.3, hp: 420, speed: 4.4 },
  ranger: { attacks: [shot('bow_shot', 4), shot('ranger_volley', 1, 1.5, 9)], preferredDist: 7, hp: 360, speed: 4.8 },
  rogue: { attacks: [melee('dagger_light', 1.1, 4), melee('rogue_venom', 1.15, 1)], preferredDist: 0.9, hp: 380, speed: 5 },
  barbarian: { attacks: [melee('axe_light', 1.65, 4), melee('barb_warcry', 3, 0.5)], preferredDist: 1.2, hp: 560, speed: 4.5 },
  warlock: { attacks: [shot('warlock_bolt', 4), melee('staff_light', 1.3, 1)], preferredDist: 6, hp: 360, speed: 4.4 },
};
export const PHANTOM_CLASSES = Object.keys(PHANTOM_MOVES);
for (const [cls, m] of Object.entries(PHANTOM_MOVES)) {
  CREATURE_ENEMIES[`phantom_${cls}`] = {
    id: `phantom_${cls}`, name: 'Fantasma Aliado', hp: m.hp, poise: 45, radius: 0.4, mass: 1.1, speed: m.speed,
    aggroRange: 11, leashRange: 16, preferredDist: m.preferredDist, xp: 0, absorb: { physical: 0.1, arcane: 0.1 },
    attacks: m.attacks, attackCooldown: [12, 26], respawnTicks: 0,
  };
}

export const CREATURE_ACTIONS: ActionDef[] = [
  // ---------- goblins ----------
  {
    id: 'goblin_stab', name: 'Estocada', startup: 9, active: 2, recovery: 12, moveMul: 0.2, lunge: { speed: 4.5, from: 6, to: 10 }, trackUntil: 6, turnRate: deg(18), telegraph: 'normal',
    hit: { range: 1.1, arc: deg(50), damage: 18, poise: 12, knockback: 1.5, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'goblin_hop', name: 'Pulo Traiçoeiro', startup: 12, active: 6, recovery: 16, moveMul: 0, lunge: { speed: 9, from: 12, to: 18 }, trackUntil: 10, turnRate: deg(14), telegraph: 'normal',
    hit: { range: 0.9, arc: deg(60), damage: 22, poise: 18, knockback: 2, scaling: {}, type: 'physical', parryable: true, once: true },
  },
  {
    id: 'goblin_cleave', name: 'Machadada', startup: 16, active: 3, recovery: 18, moveMul: 0.1, lunge: { speed: 4, from: 12, to: 16 }, trackUntil: 12, turnRate: deg(12), telegraph: 'normal', hyperArmor: [4, 18],
    hit: { range: 1.6, arc: deg(90), damage: 42, poise: 40, knockback: 4, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'goblin_leap', name: 'Salto do Chefe', startup: 20, active: 7, recovery: 22, moveMul: 0, lunge: { speed: 11, from: 20, to: 27 }, trackUntil: 16, turnRate: deg(10), telegraph: 'danger', hyperArmor: [6, 27], shockwave: 2,
    hit: { range: 1.4, arc: Math.PI, damage: 55, poise: 60, knockback: 5, scaling: {}, type: 'physical', parryable: false, once: true },
  },
  {
    id: 'goblin_horn', name: 'Corneta de Guerra', anim: 'shout', startup: 24, active: 1, recovery: 20, moveMul: 0, hyperArmor: [0, 24],
    summon: { enemyId: 'goblin', count: 2, ticks: 30 * 40, max: 3 },
  },
  // ---------- skeletons ----------
  {
    id: 'skel_slash', name: 'Lâmina Enferrujada', startup: 14, active: 3, recovery: 16, moveMul: 0.1, lunge: { speed: 3.5, from: 10, to: 15 }, trackUntil: 10, turnRate: deg(14), telegraph: 'normal',
    hit: { range: 1.5, arc: deg(80), damage: 30, poise: 26, knockback: 2.5, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'skel_bash', name: 'Golpe de Escudo', startup: 10, active: 2, recovery: 18, moveMul: 0, lunge: { speed: 5, from: 8, to: 12 }, telegraph: 'normal',
    hit: { range: 1.1, arc: deg(60), damage: 16, poise: 45, knockback: 4.5, scaling: {}, type: 'physical', parryable: false },
  },
  {
    id: 'skel_arrow', name: 'Flecha Óssea', anim: 'bow', startup: 18, active: 1, recovery: 14, moveMul: 0, trackUntil: 15, turnRate: deg(14), telegraph: 'normal',
    projectile: proj('arrow', 18, 0.15, 36, 22, 'physical'),
  },
  {
    id: 'skel_volley', name: 'Rajada de Flechas', anim: 'bow', startup: 24, active: 1, recovery: 20, moveMul: 0, trackUntil: 20, turnRate: deg(10), telegraph: 'danger',
    projectile: { ...proj('arrow', 17, 0.15, 34, 18, 'physical'), count: 3, spread: deg(12) },
  },
  {
    id: 'mage_frost', name: 'Seta Glacial', anim: 'cast', startup: 18, active: 1, recovery: 16, moveMul: 0, trackUntil: 15, turnRate: deg(14), telegraph: 'normal', element: 'frost',
    projectile: proj('frost_bolt', 12, 0.24, 40, 24, 'arcane', { status: { id: 'slow', ticks: 60, power: 0.45 } }),
  },
  {
    id: 'mage_hex', name: 'Maldição Óssea', anim: 'cast', startup: 22, active: 1, recovery: 18, moveMul: 0, trackUntil: 18, turnRate: deg(12), telegraph: 'normal', element: 'shadow',
    projectile: proj('shadow_bolt', 11, 0.26, 42, 18, 'arcane', { status: { id: 'curse', ticks: 120, power: 8 } }),
  },
  {
    id: 'mage_bones', name: 'Chuva de Ossos', anim: 'castSky', startup: 26, active: 1, recovery: 26, moveMul: 0, trackUntil: 20, turnRate: deg(10), telegraph: 'danger', element: 'shadow',
    strikes: { count: 3, dist: 4, spread: 1.6, radius: 1.3, delay: 26, interval: 9, hit: { range: 1.3, arc: Math.PI, damage: 38, poise: 30, knockback: 3, scaling: {}, type: 'arcane', parryable: false } },
  },
  // ---------- ants ----------
  {
    id: 'ant_fire_bite', name: 'Mandíbula Ardente', startup: 11, active: 3, recovery: 14, moveMul: 0.1, lunge: { speed: 4, from: 8, to: 12 }, trackUntil: 8, turnRate: deg(14), telegraph: 'normal', element: 'fire',
    hit: { range: 1.3, arc: deg(55), damage: 26, poise: 22, knockback: 2, scaling: {}, type: 'physical', parryable: true, status: { id: 'burn', ticks: 60, power: 6 } },
  },
  {
    id: 'ant_fire_spit', name: 'Cuspe de Fogo', anim: 'cast', startup: 16, active: 1, recovery: 16, moveMul: 0, trackUntil: 13, turnRate: deg(14), telegraph: 'normal', element: 'fire',
    projectile: proj('imp_fire', 12, 0.24, 34, 18, 'arcane', { status: { id: 'burn', ticks: 75, power: 6 } }),
  },
  {
    id: 'ant_ice_bite', name: 'Mandíbula Gélida', startup: 11, active: 3, recovery: 14, moveMul: 0.1, lunge: { speed: 4, from: 8, to: 12 }, trackUntil: 8, turnRate: deg(14), telegraph: 'normal', element: 'frost',
    hit: { range: 1.3, arc: deg(55), damage: 24, poise: 22, knockback: 2, scaling: {}, type: 'physical', parryable: true, status: { id: 'slow', ticks: 50, power: 0.4 } },
  },
  {
    id: 'ant_ice_spit', name: 'Cuspe de Gelo', anim: 'cast', startup: 16, active: 1, recovery: 16, moveMul: 0, trackUntil: 13, turnRate: deg(14), telegraph: 'normal', element: 'frost',
    projectile: proj('frost_bolt', 12, 0.24, 34, 16, 'arcane', { status: { id: 'slow', ticks: 75, power: 0.5 } }),
  },
  // ---------- dragons ----------
  {
    id: 'dragon_bite', name: 'Mordida Flamejante', startup: 18, active: 4, recovery: 22, moveMul: 0, lunge: { speed: 5, from: 14, to: 20 }, trackUntil: 14, turnRate: deg(10), telegraph: 'normal', hyperArmor: [0, 24], element: 'fire',
    hit: { range: 2.6, arc: deg(70), damage: 110, poise: 90, knockback: 7, scaling: {}, type: 'physical', parryable: false, status: { id: 'burn', ticks: 90, power: 12 } },
  },
  {
    id: 'dragon_breath', name: 'Sopro de Brasas', anim: 'cast', startup: 30, active: 1, recovery: 34, moveMul: 0, trackUntil: 24, turnRate: deg(8), telegraph: 'danger', hyperArmor: [0, 34], element: 'fire',
    projectile: { ...proj('fireball', 12, 0.4, 30, 55, 'arcane', { status: { id: 'burn', ticks: 120, power: 12 } }), count: 7, spread: deg(9) },
  },
  {
    id: 'dragon_charge', name: 'Investida do Dragão', startup: 26, active: 10, recovery: 30, moveMul: 0, lunge: { speed: 13, from: 26, to: 36 }, trackUntil: 22, turnRate: deg(8), telegraph: 'danger', hyperArmor: [0, 40],
    hit: { range: 2.0, arc: deg(80), damage: 130, poise: 120, knockback: 9, scaling: {}, type: 'physical', parryable: false, once: true },
  },
  {
    id: 'dragon_tail', name: 'Rabada', anim: 'spin', startup: 20, active: 6, recovery: 26, moveMul: 0, telegraph: 'danger', hyperArmor: [0, 30], shockwave: 3,
    hit: { range: 3.0, arc: Math.PI * 2, damage: 85, poise: 90, knockback: 8, scaling: {}, type: 'physical', parryable: false, once: true },
  },
  {
    id: 'wyvern_bite', name: 'Bote da Serpe', startup: 16, active: 4, recovery: 20, moveMul: 0, lunge: { speed: 5, from: 12, to: 18 }, trackUntil: 12, turnRate: deg(12), telegraph: 'normal', hyperArmor: [0, 20], element: 'frost',
    hit: { range: 2.3, arc: deg(65), damage: 80, poise: 70, knockback: 6, scaling: {}, type: 'physical', parryable: false, status: { id: 'slow', ticks: 60, power: 0.4 } },
  },
  {
    id: 'frost_breath', name: 'Sopro Glacial', anim: 'cast', startup: 28, active: 1, recovery: 30, moveMul: 0, trackUntil: 22, turnRate: deg(8), telegraph: 'danger', hyperArmor: [0, 30], element: 'frost',
    projectile: { ...proj('frost_bolt', 13, 0.36, 30, 40, 'arcane', { status: { id: 'slow', ticks: 90, power: 0.55 } }), count: 5, spread: deg(10) },
  },
  {
    id: 'wyvern_dash', name: 'Mergulho Gélido', startup: 22, active: 9, recovery: 26, moveMul: 0, lunge: { speed: 13, from: 22, to: 31 }, trackUntil: 18, turnRate: deg(9), telegraph: 'danger', hyperArmor: [0, 34],
    hit: { range: 1.8, arc: deg(80), damage: 95, poise: 100, knockback: 8, scaling: {}, type: 'physical', parryable: false, once: true },
  },
  // ---------- wildlife ----------
  { id: 'graze', name: 'Pastando', startup: 0, active: 0, recovery: 90, moveMul: 0 },
  {
    id: 'boar_gore', name: 'Chifrada', startup: 12, active: 3, recovery: 16, moveMul: 0.1, lunge: { speed: 5, from: 9, to: 13 }, trackUntil: 9, turnRate: deg(16), telegraph: 'normal',
    hit: { range: 1.2, arc: deg(60), damage: 28, poise: 30, knockback: 4, scaling: {}, type: 'physical', parryable: true },
  },
  {
    id: 'boar_charge', name: 'Investida do Javali', startup: 18, active: 8, recovery: 20, moveMul: 0, lunge: { speed: 11, from: 18, to: 26 }, trackUntil: 15, turnRate: deg(10), telegraph: 'danger',
    hit: { range: 1.0, arc: deg(70), damage: 40, poise: 60, knockback: 7, scaling: {}, type: 'physical', parryable: false, once: true },
  },
  // ---------- the Abyss cult ----------
  { id: 'ritual_chant', name: 'Cântico', anim: 'castSky', startup: 0, active: 0, recovery: 60, moveMul: 0 },
  {
    id: 'cult_bolt', name: 'Chama Profana', anim: 'cast', startup: 16, active: 1, recovery: 16, moveMul: 0, trackUntil: 13, turnRate: deg(16), telegraph: 'normal', element: 'fire',
    projectile: proj('imp_fire', 13, 0.26, 40, 26, 'arcane', { status: { id: 'burn', ticks: 75, power: 7 } }),
  },
  {
    id: 'cult_hex', name: 'Marca do Abismo', anim: 'cast', startup: 20, active: 1, recovery: 20, moveMul: 0, trackUntil: 16, turnRate: deg(14), telegraph: 'normal', element: 'shadow',
    projectile: proj('shadow_bolt', 11, 0.26, 42, 16, 'arcane', { status: { id: 'curse', ticks: 120, power: 8 } }),
  },
  {
    id: 'demon_cleave', name: 'Garra Infernal', startup: 18, active: 4, recovery: 22, moveMul: 0, lunge: { speed: 5, from: 14, to: 19 }, trackUntil: 14, turnRate: deg(10), telegraph: 'normal', hyperArmor: [0, 24], element: 'fire',
    hit: { range: 2.4, arc: deg(100), damage: 95, poise: 90, knockback: 7, scaling: {}, type: 'physical', parryable: false, status: { id: 'burn', ticks: 90, power: 10 } },
  },
  {
    id: 'demon_fire', name: 'Chuva de Enxofre', anim: 'castSky', startup: 26, active: 1, recovery: 28, moveMul: 0, trackUntil: 20, turnRate: deg(10), telegraph: 'danger', element: 'fire',
    strikes: { count: 4, dist: 4.5, spread: 2.2, radius: 1.5, delay: 26, interval: 8, hit: { range: 1.5, arc: Math.PI, damage: 60, poise: 40, knockback: 4, scaling: {}, type: 'arcane', parryable: false, status: { id: 'burn', ticks: 90, power: 9 } } },
  },
  {
    id: 'demon_roar', name: 'Rugido do Abismo', anim: 'shout', startup: 22, active: 2, recovery: 26, moveMul: 0, telegraph: 'danger', hyperArmor: [0, 28], shockwave: 3.2,
    hit: { range: 3.2, arc: Math.PI * 2, damage: 50, poise: 80, knockback: 8, scaling: {}, type: 'arcane', parryable: false, once: true, status: { id: 'slow', ticks: 75, power: 0.45 } },
  },
  // ---------- cursed grave ----------
  {
    id: 'grave_raise', name: 'Erguer os Mortos', anim: 'castRaise', startup: 30, active: 1, recovery: 30, moveMul: 0, telegraph: 'normal', element: 'shadow',
    summon: { enemyId: 'skeleton', count: 2, ticks: 30 * 45, max: 3 },
  },
  {
    id: 'grave_curse', name: 'Lamento do Túmulo', anim: 'cast', startup: 20, active: 1, recovery: 22, moveMul: 0, trackUntil: 16, turnRate: deg(30), telegraph: 'normal', element: 'shadow',
    projectile: proj('shadow_bolt', 10, 0.28, 50, 20, 'arcane', { status: { id: 'curse', ticks: 90, power: 6 } }),
  },
];
