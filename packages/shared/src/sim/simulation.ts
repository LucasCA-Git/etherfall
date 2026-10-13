import { BAG_SIZE, RARITIES, canEquip, gearEffects, starterKit, itemName, itemSlot, rollChest, rollEnemyDrops, runeElement, type ChestTier, type Item, type ItemSlot } from '../data/items';
import { actionHits, actionPostTick, actionPreMove, DOT_INTERVAL, forceAction, isDead, resolveHit } from '../combat/combat';
import { getAction } from '../data/actions';
import { CLASSES } from '../data/classes';
import { ATTR_MAX, ATTR_POINTS_PER_LEVEL, deriveStats, scalingMul, ESSENCE_PICKUP_RANGE, MAX_LEVEL, PLAYER_RESPAWN_TICKS, STAMINA_REGEN_PER_SEC, xpToNext } from '../data/curves';
import { getEnemy } from '../data/enemies';
import { updateEnemy } from '../entities/enemyAI';
import { createEnemy, createPlayer, createProjectile, enemyXpMul } from '../entities/factory';
import { updatePlayer } from '../entities/playerControl';
import { Rng } from '../math/rng';
import type { Vec2 } from '../math/vec2';
import { moveWithCollisions, resolveCircleVsCircle, resolveCircleVsStatics, resolveCircleVsTiles } from '../physics/collision';
import { SpatialHash } from '../physics/spatialHash';
import { summonSignOf, tileAt, zoneAt, type WorldData } from '../world/worldgen';
import { PHANTOM_CLASSES } from '../data/creatures';
import { enemyHpMul } from '../entities/factory';
import { isWalkable, Tile } from '../world/tiles';
import type { DynamicItem, SimContext, StaticCollider } from './context';
import { ABILITY_SLOTS, DT, type AbilitySlot, type AttrKey, type ClassId, type Entity, type Gender, type InputCommand, type GroundLoot, type PendingStrike, type SimEvent, type StatusId, type Zone } from './types';
import { addStatus, expireStatuses } from '../combat/statuses';
import { canAllocateTalent, cleanLoadout, dominantArchetype, talentBonus, unlockedSkills } from '../data/talents';
import type { ActionDef } from '../data/actions';
import type { CharacterSave } from '../net/save';
import { LivingWorld } from './living';
import { angleTo } from '../math/vec2';

const PHANTOM_NAMES = ['Aldric', 'Sorena', 'Bran', 'Maelis', 'Garran', 'Ysolde', 'Corvin', 'Ilsa', 'Tormund', 'Neryss', 'Edrik', 'Vaela'];

export interface SimulationOptions {
  world: WorldData;
  seed?: number;
  spawnEnemies?: boolean;
}

/**
 * Authoritative, deterministic fixed-tick simulation. Runs unchanged on the server
 * (authority) and in the client (local play now; prediction in Etapa 5).
 * No rendering, no DOM, no Math.random, no wall-clock time.
 */
export class Simulation implements SimContext {
  readonly world: WorldData;
  readonly rng: Rng;
  readonly entities = new Map<number, Entity>();
  readonly statics = new SpatialHash<StaticCollider>(4);
  readonly dynamics = new SpatialHash<DynamicItem>(3);
  tick = 0;
  private nextId = 1;
  private events: SimEvent[] = [];
  private respawnQueue: Array<{ spawnIndex: number; at: number }> = [];
  readonly zones: Zone[] = [];
  private strikes: PendingStrike[] = [];
  private nextZoneId = 1;
  /** Items lying on the ground (enemy drops, chest contents, dropped by players). */
  readonly loot: GroundLoot[] = [];
  private nextLootId = 1;
  /** Cult rituals (and other world scripts) of the living world. */
  readonly living: LivingWorld;

  constructor(opts: SimulationOptions) {
    this.world = opts.world;
    this.rng = new Rng(opts.seed ?? opts.world.seed ^ 0x5eed);
    for (const p of this.world.props) if (p.solid) this.statics.insert({ x: p.x, y: p.y, r: p.r });
    this.living = new LivingWorld(this.world.rituals ?? []);
    if (opts.spawnEnemies !== false) {
      this.world.enemySpawns.forEach((s, i) => this.spawnEnemy(s.enemyId, s.x, s.y, i, s.level ?? 1));
    }
  }

  // ---------------------------------------------------------------- API
  addPlayer(name: string, classId: ClassId, pos?: Vec2, gender: Gender = 'm'): Entity {
    const n = [...this.entities.values()].filter((e) => e.kind === 'player').length;
    const p = pos ?? { x: this.world.spawn.x + (n % 3) - 1, y: this.world.spawn.y + 1 + Math.floor(n / 3) };
    const e = createPlayer(this.nextId++, name, classId, p, this.tick);
    e.gender = gender;
    // every hero starts with a basic class kit already on
    e.equipment = starterKit(classId);
    e.gear = gearEffects(e.equipment);
    this.refreshStats(e, true);
    this.entities.set(e.id, e);
    return e;
  }

  /** A phantom hero of a random class answers the sign, at the level of the bonfire's region. */
  summonPhantom(owner: Entity, bonfire: { x: number; y: number }): boolean {
    if (owner.kind !== 'player' || isDead(owner)) return false;
    for (const old of [...this.entities.values()]) if (old.ownerId === owner.id && old.enemyId?.startsWith('phantom_')) this.unsummon(old);
    const cls = PHANTOM_CLASSES[Math.floor(this.rng.next() * PHANTOM_CLASSES.length)]! as ClassId;
    const zone = zoneAt(this.world, bonfire.x, bonfire.y);
    const level = zone ? Math.round((zone.minLevel + zone.maxLevel) / 2) : owner.level;
    const sign = summonSignOf(bonfire);
    const id = `phantom_${cls}`;
    this.summon(owner, id, 1, 30 * 600, 1, angleTo(owner.pos, sign));
    const ph = [...this.entities.values()].find((x) => x.ownerId === owner.id && x.enemyId === id);
    if (!ph) return false;
    ph.pos.x = ph.prevPos.x = sign.x;
    ph.pos.y = ph.prevPos.y = sign.y;
    ph.level = level;
    ph.gender = this.rng.next() < 0.5 ? 'f' : 'm';
    ph.name = `Fantasma de ${PHANTOM_NAMES[Math.floor(this.rng.next() * PHANTOM_NAMES.length)]}`;
    // attributes of a hero of that level who poured the points into the class stat
    const base = { ...CLASSES[cls].baseAttributes };
    const main = (['str', 'dex', 'int', 'wil'] as const).reduce((a, k) => (base[k] > base[a] ? k : a), 'str' as 'str' | 'dex' | 'int' | 'wil');
    base[main] += Math.round((level - 1) * ATTR_POINTS_PER_LEVEL * 0.6);
    base.vit += Math.round((level - 1) * ATTR_POINTS_PER_LEVEL * 0.4);
    ph.attrs = base;
    ph.maxHp = ph.hp = Math.round(getEnemy(id).hp * enemyHpMul(level));
    ph.mana = ph.maxMana = 999;
    return true;
  }

  /** Re-create a saved character (the save must already be validated with `validateSave`). */
  addPlayerFromSave(save: CharacterSave): Entity {
    const okSpot = (p: { x: number; y: number } | null) =>
      p && p.x > 1 && p.y > 1 && p.x < this.world.width - 1 && p.y < this.world.height - 1 && isWalkable(tileAt(this.world, p.x, p.y)) ? p : null;
    const start = okSpot(save.pos) ?? okSpot(save.respawn) ?? undefined;
    const e = this.addPlayer(save.name, save.classId, start ? { x: start.x, y: start.y } : undefined, save.gender === 'f' ? 'f' : 'm');
    e.level = save.level;
    e.xp = save.xp;
    e.unspent = save.unspent;
    e.attrs = { ...save.attrs };
    e.talents = { ...save.talents };
    e.loadout = { ...save.loadout };
    e.subclass = dominantArchetype(save.classId, e.talents);
    e.discovered = [...save.discovered];
    e.essenceMark = save.essenceMark ? { ...save.essenceMark } : null;
    e.inventory = (save.inventory ?? []).map((it) => ({ ...it, affixes: it.affixes.map((a) => ({ ...a })) }));
    e.equipment = {};
    for (const [slot, it] of Object.entries(save.equipment ?? {}) as [ItemSlot, Item][]) if (it && itemSlot(it) === slot && canEquip(e, it)) e.equipment[slot] = { ...it };
    // old saves (and anyone who never had gear) get the basic kit
    if (!Object.keys(e.equipment).length && !e.inventory.some((it) => itemSlot(it))) e.equipment = starterKit(save.classId);
    e.gear = gearEffects(e.equipment);
    e.openedChests = [...(save.openedChests ?? [])];
    const rp = okSpot(save.respawn);
    if (rp) e.respawnPoint = { x: rp.x, y: rp.y };
    this.refreshStats(e, true);
    return e;
  }

  /** Refund every attribute and skill-tree point. Only while seated at a bonfire. */
  respec(playerId: number): boolean {
    const p = this.entities.get(playerId);
    if (!p || p.kind !== 'player' || !p.classId || p.action?.id !== 'sit') return false;
    p.attrs = { ...CLASSES[p.classId].baseAttributes };
    p.unspent = (p.level - 1) * ATTR_POINTS_PER_LEVEL;
    p.talents = {};
    p.loadout = {};
    p.subclass = null;
    this.refreshStats(p, false);
    p.hp = Math.min(p.hp, p.maxHp);
    return true;
  }

  spawnEnemy(enemyId: string, x: number, y: number, spawnIndex = -1, level = 1): Entity {
    const e = createEnemy(this.nextId++, enemyId, { x, y }, this.tick, spawnIndex, level);
    const anchor = spawnIndex >= 0 ? this.world.enemySpawns[spawnIndex]?.anchor : undefined;
    if (anchor && e.ai) e.ai.anchor = { x: anchor.x, y: anchor.y };
    this.entities.set(e.id, e);
    return e;
  }

  removeEntity(id: number): void {
    this.entities.delete(id);
  }

  setInput(id: number, cmd: InputCommand): void {
    const e = this.entities.get(id);
    if (e && e.kind === 'player') e.input = cmd;
  }

  /** Exposed for scripted encounters and tests. */
  startAction(e: Entity, actionId: string, dir: number): void {
    getAction(actionId);
    forceAction(e, actionId);
    e.action!.dir = dir;
    e.facing = dir;
    const def = getAction(actionId);
    e.action!.charging = false;
    if (def.telegraph && def.hit) {
      this.emit({ type: 'telegraph', id: e.id, actionId, danger: def.telegraph === 'danger', x: e.pos.x, y: e.pos.y, dir, range: def.hit.range + e.radius, arc: def.hit.arc, ticks: def.startup });
    }
  }

  // ------------------------------------------------------------ context
  emit(ev: SimEvent): void {
    this.events.push(ev);
  }

  spawnProjectile(owner: Entity, actionId: string, dir: number, chargeMul: number): Entity {
    const def = getAction(actionId).projectile!;
    const off = owner.radius + def.radius + 0.1;
    const pos = { x: owner.pos.x + Math.cos(dir) * off, y: owner.pos.y + Math.sin(dir) * off };
    const e = createProjectile(this.nextId++, owner, actionId, pos, dir, def.speed, def.radius, def.ttl, this.tick, chargeMul);
    this.entities.set(e.id, e);
    this.emit({ type: 'projectile', id: e.id, ownerId: owner.id, x: pos.x, y: pos.y, dir });
    return e;
  }

  applyStatus(e: Entity, id: StatusId, ticks: number, power: number, source: number): void {
    if (isDead(e)) return;
    addStatus(e, id, this.tick + ticks, power, source);
    this.emit({ type: 'status', target: e.id, status: id, until: this.tick + ticks, x: e.pos.x, y: e.pos.y });
  }

  addZone(owner: Entity, def: ActionDef, x: number, y: number): void {
    const z = def.zone!;
    const zone: Zone = { id: this.nextZoneId++, kind: z.kind, actionId: def.id, ownerId: owner.id, team: owner.team, x, y, r: z.radius, until: this.tick + z.ticks, nextPulse: this.tick };
    this.zones.push(zone);
    this.emit({ type: 'zone', id: zone.id, ownerId: owner.id, kind: z.kind, x, y, r: z.radius, until: zone.until });
  }

  scheduleStrike(owner: Entity, actionId: string, x: number, y: number, at: number): void {
    this.strikes.push({ actionId, ownerId: owner.id, x, y, at });
  }

  heal(source: Entity, target: Entity, amount: number): number {
    if (isDead(target)) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + Math.round(amount));
    const gained = target.hp - before;
    if (gained > 0) this.emit({ type: 'heal', source: source.id, target: target.id, amount: gained, x: target.pos.x, y: target.pos.y });
    return gained;
  }

  summon(owner: Entity, enemyId: string, count: number, ticks: number, max: number, dir: number): void {
    const mine = [...this.entities.values()].filter((e) => e.ownerId === owner.id && e.enemyId === enemyId && !isDead(e)).sort((a, b) => a.id - b.id);
    for (const old of mine.slice(0, Math.max(0, mine.length + count - max))) this.unsummon(old);
    for (let i = 0; i < count; i++) {
      // flank the caster, slightly behind the aim direction
      const side = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
      const a = dir + Math.PI + side * 1.1;
      const x = owner.pos.x + Math.cos(a) * 1.2;
      const y = owner.pos.y + Math.sin(a) * 1.2;
      const e = createEnemy(this.nextId++, enemyId, { x, y }, this.tick, -1);
      e.team = owner.team;
      e.ownerId = owner.id;
      e.expiresAt = this.tick + ticks;
      e.level = owner.level;
      e.attrs = { ...owner.attrs };
      e.maxHp = e.hp = Math.round(e.maxHp * (1 + 0.06 * (owner.level - 1)));
      e.facing = dir;
      e.ai!.home = { x: owner.pos.x, y: owner.pos.y };
      e.ai!.attackReadyAt = this.tick + 10;
      this.entities.set(e.id, e);
      this.emit({ type: 'summon', id: e.id, ownerId: owner.id, enemyId, x, y });
    }
  }

  private unsummon(e: Entity): void {
    this.emit({ type: 'unsummon', id: e.id, x: e.pos.x, y: e.pos.y });
    this.entities.delete(e.id);
  }

  /** Ground zones pulse on a fixed cadence; delayed strikes land on their tick. */
  private stepAreaEffects(): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]!;
      if (this.tick >= z.until) {
        this.zones.splice(i, 1);
        continue;
      }
      if (this.tick < z.nextPulse) continue;
      const def = getAction(z.actionId).zone!;
      z.nextPulse = this.tick + def.pulseEvery;
      const owner = this.entities.get(z.ownerId);
      if (!owner) continue;
      const healAmt = def.heal ? def.heal.amount * scalingMul(owner.attrs, def.heal.scaling) * (1 + talentBonus(owner, 'healPower')) : 0;
      for (const c of this.dynamics.query(z.x, z.y, z.r)) {
        if (isDead(c.e)) continue;
        if (c.e.team === z.team) {
          if (healAmt > 0) this.heal(owner, c.e, healAmt);
          continue;
        }
        resolveHit(this, owner, c.e, def.hit, { x: z.x, y: z.y }, 1, false);
      }
    }
    if (!this.strikes.length) return;
    const keep: PendingStrike[] = [];
    for (const s of this.strikes) {
      if (this.tick < s.at) {
        keep.push(s);
        continue;
      }
      const def = getAction(s.actionId).strikes!;
      const owner = this.entities.get(s.ownerId);
      this.emit({ type: 'strike', ownerId: s.ownerId, actionId: s.actionId, x: s.x, y: s.y, radius: def.radius });
      if (!owner) continue;
      for (const c of this.dynamics.query(s.x, s.y, def.radius)) {
        if (c.e.team === owner.team || isDead(c.e)) continue;
        resolveHit(this, owner, c.e, def.hit, { x: s.x, y: s.y - 0.01 }, 1, false);
      }
    }
    this.strikes = keep;
  }

  /** Server-side XP grant: handles multi-level jumps, the level cap and attribute points. */
  grantXp(p: Entity, amount: number, reason: string): void {
    if (p.kind !== 'player' || amount <= 0 || p.level >= MAX_LEVEL) return;
    p.xp += Math.floor(amount);
    this.emit({ type: 'xp', id: p.id, amount: Math.floor(amount), reason });
    while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      p.unspent += ATTR_POINTS_PER_LEVEL;
      this.refreshStats(p, true);
      this.emit({ type: 'levelUp', id: p.id, level: p.level, x: p.pos.x, y: p.pos.y });
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
  }

  /** Spend one attribute point. Returns false (and changes nothing) when the request is invalid. */
  allocate(playerId: number, attr: AttrKey): boolean {
    const p = this.entities.get(playerId);
    if (!p || p.kind !== 'player' || p.unspent <= 0) return false;
    if (!Object.prototype.hasOwnProperty.call(p.attrs, attr)) return false;
    if (p.attrs[attr] >= ATTR_MAX) return false;
    p.attrs[attr]++;
    p.unspent--;
    this.refreshStats(p, false);
    return true;
  }

  /** Buy one skill-tree node (server-validated: connected, affordable, of the class). */
  allocateTalent(playerId: number, nodeId: string): boolean {
    const p = this.entities.get(playerId);
    if (!p || !p.classId || !canAllocateTalent(p, nodeId)) return false;
    p.talents[nodeId] = 1;
    p.subclass = dominantArchetype(p.classId, p.talents);
    this.refreshStats(p, false);
    return true;
  }

  /**
   * Put an unlocked skill in an ability slot (`action` null = back to the class default).
   * A skill lives in one slot at a time: equipping it elsewhere moves it.
   */
  equipSkill(playerId: number, slot: AbilitySlot, action: string | null): boolean {
    const p = this.entities.get(playerId);
    if (!p || p.kind !== 'player' || !p.classId || !ABILITY_SLOTS.includes(slot)) return false;
    if (action === null) {
      delete p.loadout[slot];
      return true;
    }
    if (!unlockedSkills(p.classId, p.talents).includes(action)) return false;
    for (const s of ABILITY_SLOTS) if (p.loadout[s] === action) delete p.loadout[s];
    p.loadout[slot] = action;
    p.loadout = cleanLoadout(p.classId, p.loadout, p.talents);
    return true;
  }

  // ------------------------------------------------------------ items
  /** Equip a bag item (the one in that slot goes back to the bag). */
  equipItem(playerId: number, uid: string): boolean {
    const p = this.entities.get(playerId);
    if (!p || p.kind !== 'player' || isDead(p) || !p.inventory || !p.equipment) return false;
    const i = p.inventory.findIndex((it) => it.uid === uid);
    const it = p.inventory[i];
    const slot = it ? itemSlot(it) : null;
    if (!it || !slot || !canEquip(p, it)) return false;
    p.inventory.splice(i, 1);
    const old = p.equipment[slot];
    if (old) p.inventory.splice(i, 0, old);
    p.equipment[slot] = it;
    this.gearChanged(p);
    this.emit({ type: 'equip', id: p.id, slot, name: itemName(it) });
    return true;
  }

  /** Move an equipped item back to the bag (needs a free bag slot). */
  unequipItem(playerId: number, slot: ItemSlot): boolean {
    const p = this.entities.get(playerId);
    if (!p || p.kind !== 'player' || !p.inventory || !p.equipment?.[slot]) return false;
    if (p.inventory.length >= BAG_SIZE) {
      this.emit({ type: 'bagFull', id: p.id });
      return false;
    }
    p.inventory.push(p.equipment[slot]!);
    delete p.equipment[slot];
    this.gearChanged(p);
    return true;
  }

  /** Drop a bag item on the ground (anyone may take it). */
  dropItem(playerId: number, uid: string): boolean {
    const p = this.entities.get(playerId);
    if (!p || p.kind !== 'player' || !p.inventory) return false;
    const i = p.inventory.findIndex((it) => it.uid === uid);
    if (i < 0) return false;
    const [it] = p.inventory.splice(i, 1);
    this.addLoot(it!, p.pos.x + Math.cos(p.facing) * 0.8, p.pos.y + Math.sin(p.facing) * 0.8, -1, 30 * 60 * 5);
    return true;
  }

  /** Seated at a bonfire: consume a rune to imbue the equipped weapon with its element. */
  imbueWeapon(playerId: number, runeUid: string): boolean {
    const p = this.entities.get(playerId);
    const w = p?.equipment?.weapon;
    if (!p || !w || p.action?.id !== 'sit' || !p.inventory) return false;
    const i = p.inventory.findIndex((it) => it.uid === runeUid);
    const el = i >= 0 ? runeElement(p.inventory[i]!) : null;
    if (!el) return false;
    p.inventory.splice(i, 1);
    // stronger on better weapons; legendaries keep their own element unless re-imbued
    w.imbue = { element: el, power: Math.min(0.3, 0.12 + RARITIES.indexOf(w.rarity) * 0.03) };
    this.gearChanged(p);
    this.emit({ type: 'imbue', id: p.id, element: el, x: p.pos.x, y: p.pos.y });
    return true;
  }

  gearChanged(p: Entity): void {
    p.gear = gearEffects(p.equipment ?? {});
    this.refreshStats(p, false);
  }

  addLoot(item: Item, x: number, y: number, owner: number, ttl = 30 * 60 * 3): GroundLoot {
    const l: GroundLoot = { id: this.nextLootId++, item, x, y, owner, freeAt: this.tick + (owner >= 0 ? 30 * 45 : 0), until: this.tick + ttl };
    this.loot.push(l);
    this.emit({ type: 'lootDrop', id: l.id, x, y, rarity: item.rarity });
    return l;
  }

  /** Scatter items around a point. */
  private scatterLoot(items: Item[], x: number, y: number, owner: number): void {
    items.forEach((it, k) => {
      const a = (k / Math.max(1, items.length)) * Math.PI * 2 + this.rng.next() * 0.8;
      const r = 0.7 + this.rng.next() * 0.6;
      let lx = x + Math.cos(a) * r;
      let ly = y + Math.sin(a) * r;
      if (!isWalkable(tileAt(this.world, lx, ly))) {
        lx = x;
        ly = y;
      }
      this.addLoot(it, lx, ly, owner);
    });
  }

  openChest(e: Entity, propId: number): boolean {
    const prop = this.world.props.find((p) => p.id === propId && p.kind === 'chest');
    if (!prop || e.kind !== 'player' || !e.openedChests || e.openedChests.includes(propId)) return false;
    e.openedChests.push(propId);
    const tier = Math.max(0, Math.min(2, Math.round(prop.size))) as ChestTier;
    this.emit({ type: 'chest', id: e.id, prop: propId, tier, x: prop.x, y: prop.y });
    this.scatterLoot(rollChest(this.rng, tier, prop.lvl ?? e.level, e.classId), prop.x, prop.y + 0.9, e.id);
    return true;
  }

  /** Walk over an item to take it (if it is yours or free); expired items vanish. */
  private stepLoot(): void {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i]!;
      if (this.tick >= l.until) {
        this.loot.splice(i, 1);
        continue;
      }
      for (const p of this.entities.values()) {
        if (p.kind !== 'player' || isDead(p) || !p.inventory) continue;
        if (l.owner >= 0 && l.owner !== p.id && this.tick < l.freeAt) continue;
        if ((p.pos.x - l.x) ** 2 + (p.pos.y - l.y) ** 2 > 0.9 * 0.9) continue;
        if (p.inventory.length >= BAG_SIZE) {
          if (this.tick % 60 === 0) this.emit({ type: 'bagFull', id: p.id });
          continue;
        }
        p.inventory.push(l.item);
        this.loot.splice(i, 1);
        this.emit({ type: 'pickup', id: p.id, name: itemName(l.item), rarity: l.item.rarity, x: l.x, y: l.y });
        break;
      }
    }
  }

  private refreshStats(p: Entity, fullHeal: boolean): void {
    if (!p.classId) return;
    const base = deriveStats(p.attrs, p.level, CLASSES[p.classId].poiseBonus);
    const d = {
      maxHp: Math.round(base.maxHp * (1 + talentBonus(p, 'maxHp'))),
      maxStamina: Math.round(base.maxStamina * (1 + talentBonus(p, 'maxStamina'))),
      maxMana: Math.round(base.maxMana * (1 + talentBonus(p, 'maxMana'))),
      maxPoise: Math.round(base.maxPoise + talentBonus(p, 'poise')),
    };
    const gain = (cur: number, oldMax: number, newMax: number) => (fullHeal ? newMax : Math.min(newMax, cur + Math.max(0, newMax - oldMax)));
    p.hp = gain(p.hp, p.maxHp, d.maxHp);
    p.stamina = gain(p.stamina, p.maxStamina, d.maxStamina);
    p.mana = gain(p.mana, p.maxMana, d.maxMana);
    p.maxHp = d.maxHp;
    p.maxStamina = d.maxStamina;
    p.maxMana = d.maxMana;
    p.maxPoise = d.maxPoise;
    p.poise = Math.min(p.poise, d.maxPoise);
  }

  kill(target: Entity, killer: Entity | null): void {
    if (target.kind === 'player') this.dropEssence(target);
    target.hp = 0;
    forceAction(target, 'dead');
    target.vel.x *= 0.3;
    target.vel.y *= 0.3;
    target.deadUntil = this.tick + (target.kind === 'player' ? PLAYER_RESPAWN_TICKS : 60);
    this.emit({ type: 'death', id: target.id, killer: killer?.id ?? -1, x: target.pos.x, y: target.pos.y });
    // a summon's kill belongs to its caster
    const credit = killer?.ownerId !== undefined ? this.entities.get(killer.ownerId) ?? null : killer;
    if (target.kind === 'enemy' && target.ownerId === undefined && credit && credit.kind === 'player' && target.enemyId) {
      const xp = Math.round(getEnemy(target.enemyId).xp * enemyXpMul(target.level));
      this.emit({ type: 'kill', killer: credit.id, victim: target.id, xp });
      this.grantXp(credit, xp, 'kill');
      // wildlife only gives XP (no armour inside a rabbit)
      const drops = target.team === 2 ? [] : rollEnemyDrops(this.rng, target.enemyId, getEnemy(target.enemyId).xp, Math.max(target.level, Math.min(credit.level, target.level + 3)) + (getEnemy(target.enemyId).xp >= 400 ? 2 : 0), credit.classId);
      if (drops.length) this.scatterLoot(drops, target.pos.x, target.pos.y, credit.id);
    }
  }

  /**
   * Death rule: the XP progress of the current level becomes a mark at the death spot.
   * Only one mark exists: dying again before recovering it loses the old one.
   * (Levels and attribute points are never lost.)
   */
  private dropEssence(p: Entity): void {
    if (p.essenceMark) this.emit({ type: 'essenceLost', id: p.id, amount: p.essenceMark.amount });
    p.essenceMark = null;
    if (p.xp > 0) {
      p.essenceMark = { x: p.pos.x, y: p.pos.y, amount: p.xp };
      this.emit({ type: 'essenceDropped', id: p.id, amount: p.xp, x: p.pos.x, y: p.pos.y });
      p.xp = 0;
    }
  }

  private explore(p: Entity): void {
    if (isDead(p)) return;
    const m = p.essenceMark;
    if (m && Math.hypot(m.x - p.pos.x, m.y - p.pos.y) <= ESSENCE_PICKUP_RANGE) {
      p.essenceMark = null;
      this.emit({ type: 'essenceRecovered', id: p.id, amount: m.amount, x: m.x, y: m.y });
      this.grantXp(p, m.amount, 'essence');
    }
    if ((this.tick + p.id) % 10 !== 0) return;
    for (const poi of this.world.pois) {
      if (p.discovered.includes(poi.id)) continue;
      if (Math.hypot(poi.x - p.pos.x, poi.y - p.pos.y) > poi.r) continue;
      p.discovered.push(poi.id);
      this.emit({ type: 'discover', id: p.id, poi: poi.id, name: poi.name, xp: poi.xp, x: poi.x, y: poi.y });
      this.grantXp(p, poi.xp, 'discover');
    }
  }

  // --------------------------------------------------------------- step
  step(): SimEvent[] {
    // Events emitted between ticks (scripted actions, admin XP grants) ship with this tick.
    const list = [...this.entities.values()];

    for (const e of list) {
      e.prevPos.x = e.pos.x;
      e.prevPos.y = e.pos.y;
    }
    this.rebuildDynamics(list);

    // 1) intentions
    for (const e of list) {
      if (e.kind === 'player') updatePlayer(this, e);
      else if (e.kind === 'enemy') updateEnemy(this, e);
    }
    // 2) action pre-move (lunges, tracking, spawns)
    for (const e of list) if (e.kind !== 'projectile') actionPreMove(this, e);

    // 3) integrate + collide
    for (const e of [...this.entities.values()]) {
      if (e.kind === 'projectile') this.stepProjectile(e);
      else moveWithCollisions(e.pos, e.vel, e.radius, DT, this.world, this.statics);
    }
    this.separateBodies();
    this.rebuildDynamics([...this.entities.values()]);

    // 4) hits during active frames
    for (const e of list) if (e.kind !== 'projectile' && this.entities.has(e.id)) actionHits(this, e);

    this.stepAreaEffects();

    // 5) clocks, regen, death/respawn
    for (const e of [...this.entities.values()]) {
      if (e.kind === 'projectile') continue;
      if (e.ownerId !== undefined) {
        const owner = this.entities.get(e.ownerId);
        if (this.tick >= (e.expiresAt ?? Infinity) || !owner || isDead(owner)) {
          this.unsummon(e);
          continue;
        }
      }
      actionPostTick(this, e);
      this.regen(e);
      this.lifecycle(e);
      if (e.kind === 'player') this.explore(e);
    }
    this.processRespawns();
    if (this.loot.length) this.stepLoot();
    this.living.step(this);

    this.tick++;
    const out = this.events;
    this.events = [];
    return out;
  }

  // ------------------------------------------------------------ helpers
  private rebuildDynamics(list: Entity[]): void {
    this.dynamics.clear();
    for (const e of list) {
      if (e.kind === 'projectile' || isDead(e)) continue;
      this.dynamics.insert({ x: e.pos.x, y: e.pos.y, r: e.radius, e });
    }
  }

  private separateBodies(): void {
    const tmp: DynamicItem[] = [];
    for (const e of this.entities.values()) {
      if (e.kind === 'projectile' || isDead(e)) continue;
      tmp.length = 0;
      this.dynamics.query(e.pos.x, e.pos.y, e.radius + 0.6, tmp);
      for (const o of tmp) {
        const b = o.e;
        if (b.id <= e.id || b.kind === 'projectile' || isDead(b)) continue;
        resolveCircleVsCircle(e.pos, e.radius, e.mass, b.pos, b.radius, b.mass);
      }
    }
    for (const e of this.entities.values()) {
      if (e.kind === 'projectile') continue;
      resolveCircleVsStatics(e.pos, e.radius, this.statics);
      resolveCircleVsTiles(e.pos, e.radius, this.world);
    }
  }

  private stepProjectile(p: Entity): void {
    const st = p.proj!;
    const owner = this.entities.get(st.ownerId);
    const def = getAction(st.defId).projectile!;
    const steps = Math.max(1, Math.ceil((Math.hypot(p.vel.x, p.vel.y) * DT) / (p.radius * 0.8)));
    for (let i = 0; i < steps; i++) {
      p.pos.x += (p.vel.x * DT) / steps;
      p.pos.y += (p.vel.y * DT) / steps;
      const tile = tileAt(this.world, p.pos.x, p.pos.y);
      const hitWall = !isWalkable(tile) && tile !== Tile.DeepWater; // projectiles fly over water
      const hitProp = this.statics.query(p.pos.x, p.pos.y, p.radius).length > 0;
      if (hitWall || hitProp) {
        this.endProjectile(p);
        return;
      }
      for (const c of this.dynamics.query(p.pos.x, p.pos.y, p.radius)) {
        const t = c.e;
        if (t.team === p.team || isDead(t)) continue;
        if (owner) resolveHit(this, owner, t, def.hit, p.pos, st.mul, false);
        this.endProjectile(p);
        return;
      }
    }
    if (--st.ttl <= 0) this.endProjectile(p);
  }

  private endProjectile(p: Entity): void {
    this.emit({ type: 'projectileEnd', id: p.id, x: p.pos.x, y: p.pos.y });
    this.entities.delete(p.id);
  }

  private regen(e: Entity): void {
    expireStatuses(e, this.tick);
    if (isDead(e)) return;
    this.damageOverTime(e);
    if (isDead(e)) return;
    if (this.tick >= e.staminaRegenAt && !e.sprinting) {
      const rate = STAMINA_REGEN_PER_SEC * (e.blocking ? 0.35 : 1) * (e.action ? 0.5 : 1) * (1 + talentBonus(e, 'staminaRegen'));
      e.stamina = Math.min(e.maxStamina, e.stamina + rate * DT);
    }
    if (e.classId) e.mana = Math.min(e.maxMana, e.mana + CLASSES[e.classId].manaRegen * (1 + talentBonus(e, 'manaRegen')) * DT);
    if (this.tick >= e.poiseRegenAt) e.poise = e.maxPoise;
  }

  /** Poison and curses tick on a fixed cadence (deterministic: tick-aligned, sorted by status order). */
  private damageOverTime(e: Entity): void {
    if (this.tick % DOT_INTERVAL !== 0) return;
    for (const s of e.statuses) {
      if ((s.id !== 'poison' && s.id !== 'curse' && s.id !== 'burn') || s.until <= this.tick) continue;
      const amount = Math.max(1, Math.round((s.power * DOT_INTERVAL) / 30));
      e.hp -= amount;
      e.lastHitTick = this.tick;
      this.emit({ type: 'hit', attacker: s.source, target: e.id, amount, crit: 'none', x: e.pos.x, y: e.pos.y, dir: 0, dtype: s.id === 'poison' ? 'physical' : 'arcane', dot: s.id });
      if (e.hp <= 0) {
        this.kill(e, this.entities.get(s.source) ?? null);
        return;
      }
    }
  }

  private lifecycle(e: Entity): void {
    if (!isDead(e) || this.tick < e.deadUntil) return;
    if (e.kind === 'player') {
      e.action = null;
      e.hp = e.maxHp;
      e.stamina = e.maxStamina;
      e.mana = e.maxMana;
      e.poise = e.maxPoise;
      e.pos.x = e.prevPos.x = e.respawnPoint.x;
      e.pos.y = e.prevPos.y = e.respawnPoint.y;
      e.vel.x = e.vel.y = 0;
      this.emit({ type: 'respawn', id: e.id, x: e.pos.x, y: e.pos.y });
    } else {
      this.entities.delete(e.id);
      const idx = e.ai?.spawnIndex ?? -1;
      if (idx >= 0 && e.enemyId) this.respawnQueue.push({ spawnIndex: idx, at: this.tick + getEnemy(e.enemyId).respawnTicks });
    }
  }

  private processRespawns(): void {
    if (!this.respawnQueue.length) return;
    const keep: typeof this.respawnQueue = [];
    for (const r of this.respawnQueue) {
      if (this.tick < r.at) {
        keep.push(r);
        continue;
      }
      const s = this.world.enemySpawns[r.spawnIndex];
      if (s) this.spawnEnemy(s.enemyId, s.x, s.y, r.spawnIndex, s.level ?? 1);
    }
    this.respawnQueue = keep;
  }

  /** Order-dependent FNV-style hash of the gameplay state — used for determinism tests and desync detection. */
  stateHash(): number {
    let h = 2166136261 ^ this.tick;
    const mix = (n: number) => {
      h ^= Math.round(n * 1000) | 0;
      h = Math.imul(h, 16777619);
    };
    mix(this.rng.state);
    for (const e of this.entities.values()) {
      mix(e.id);
      mix(e.pos.x);
      mix(e.pos.y);
      mix(e.hp);
      mix(e.stamina);
      mix(e.action ? e.action.t + e.action.id.length * 1000 : -1);
    }
    return h >>> 0;
  }
}
