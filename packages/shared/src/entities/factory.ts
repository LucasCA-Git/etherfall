import { CLASSES } from '../data/classes';
import { deriveStats } from '../data/curves';
import { getEnemy } from '../data/enemies';
import type { Vec2 } from '../math/vec2';
import type { ClassId, Entity } from '../sim/types';

const ZERO_ATTRS = { str: 10, dex: 10, vit: 10, end: 10, int: 10, wil: 10, lck: 10 };

function base(id: number, kind: Entity['kind'], name: string, pos: Vec2, tick: number): Entity {
  return {
    id, kind, name, team: 0,
    pos: { x: pos.x, y: pos.y }, prevPos: { x: pos.x, y: pos.y }, vel: { x: 0, y: 0 },
    facing: 0, radius: 0.4, mass: 1,
    level: 1, attrs: { ...ZERO_ATTRS },
    hp: 1, maxHp: 1, stamina: 0, maxStamina: 0, mana: 0, maxMana: 0, poise: 0, maxPoise: 0,
    staminaRegenAt: tick, poiseRegenAt: tick,
    action: null, cooldowns: {}, blocking: false, lastBlockRaise: -1000, parryUntil: -1,
    buffered: null, lastLightTick: -1000, comboIdx: 0, prevButtons: 0,
    input: { seq: 0, mx: 0, my: 0, aim: 0, buttons: 0 },
    sprinting: false, lastHitTick: -1000, respawnPoint: { x: pos.x, y: pos.y }, deadUntil: 0,
    xp: 0, unspent: 0, essenceMark: null, discovered: [], statuses: [], talents: {}, loadout: {}, subclass: null,
    inventory: [], equipment: {}, gear: {}, openedChests: [],
  };
}

export function createPlayer(id: number, name: string, classId: ClassId, pos: Vec2, tick: number, level = 1): Entity {
  const cls = CLASSES[classId];
  const e = base(id, 'player', name, pos, tick);
  e.classId = classId;
  e.team = 0;
  e.radius = cls.radius;
  e.mass = cls.mass;
  e.level = level;
  e.attrs = { ...cls.baseAttributes };
  const s = deriveStats(e.attrs, level, cls.poiseBonus);
  e.maxHp = e.hp = s.maxHp;
  e.maxStamina = e.stamina = s.maxStamina;
  e.maxMana = e.mana = s.maxMana;
  e.maxPoise = e.poise = s.maxPoise;
  return e;
}

export function createEnemy(id: number, enemyId: string, pos: Vec2, tick: number, spawnIndex = -1): Entity {
  const d = getEnemy(enemyId);
  const e = base(id, 'enemy', d.name, pos, tick);
  e.enemyId = enemyId;
  e.team = 1;
  e.radius = d.radius;
  e.mass = d.mass;
  e.maxHp = e.hp = d.hp;
  e.maxPoise = e.poise = d.poise;
  e.maxStamina = e.stamina = 100;
  e.facing = Math.PI / 2;
  e.ai = {
    mode: 'idle', targetId: -1, home: { x: pos.x, y: pos.y }, wanderTo: null, nextThink: tick,
    strafeDir: 1, attackReadyAt: tick + 20, avoidUntil: -1, avoidSign: 1, spawnIndex, lastSpeed: 0,
  };
  return e;
}

export function createProjectile(id: number, owner: Entity, actionId: string, pos: Vec2, dir: number, speed: number, radius: number, ttl: number, tick: number, mul = 1): Entity {
  const e = base(id, 'projectile', actionId, pos, tick);
  e.team = owner.team;
  e.radius = radius;
  e.mass = 0;
  e.facing = dir;
  e.vel = { x: Math.cos(dir) * speed, y: Math.sin(dir) * speed };
  e.proj = { ownerId: owner.id, defId: actionId, ttl, mul };
  return e;
}
