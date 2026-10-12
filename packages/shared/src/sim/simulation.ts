import { actionHits, actionPostTick, actionPreMove, DOT_INTERVAL, forceAction, isDead, resolveHit } from '../combat/combat';
import { getAction } from '../data/actions';
import { CLASSES } from '../data/classes';
import { ATTR_MAX, ATTR_POINTS_PER_LEVEL, deriveStats, scalingMul, ESSENCE_PICKUP_RANGE, MAX_LEVEL, PLAYER_RESPAWN_TICKS, STAMINA_REGEN_PER_SEC, xpToNext } from '../data/curves';
import { getEnemy } from '../data/enemies';
import { updateEnemy } from '../entities/enemyAI';
import { createEnemy, createPlayer, createProjectile } from '../entities/factory';
import { updatePlayer } from '../entities/playerControl';
import { Rng } from '../math/rng';
import type { Vec2 } from '../math/vec2';
import { moveWithCollisions, resolveCircleVsCircle, resolveCircleVsStatics, resolveCircleVsTiles } from '../physics/collision';
import { SpatialHash } from '../physics/spatialHash';
import { tileAt, type WorldData } from '../world/worldgen';
import { isWalkable, Tile } from '../world/tiles';
import type { DynamicItem, SimContext, StaticCollider } from './context';
import { DT, type AttrKey, type ClassId, type Entity, type InputCommand, type PendingStrike, type SimEvent, type StatusId, type Zone } from './types';
import { addStatus, expireStatuses } from '../combat/statuses';
import { canAllocateTalent, SUBCLASS_LEVEL, SUBCLASSES, talentBonus } from '../data/talents';
import type { ActionDef } from '../data/actions';
import type { CharacterSave } from '../net/save';

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

  constructor(opts: SimulationOptions) {
    this.world = opts.world;
    this.rng = new Rng(opts.seed ?? opts.world.seed ^ 0x5eed);
    for (const p of this.world.props) if (p.solid) this.statics.insert({ x: p.x, y: p.y, r: p.r });
    if (opts.spawnEnemies !== false) {
      this.world.enemySpawns.forEach((s, i) => this.spawnEnemy(s.enemyId, s.x, s.y, i));
    }
  }

  // ---------------------------------------------------------------- API
  addPlayer(name: string, classId: ClassId, pos?: Vec2): Entity {
    const n = [...this.entities.values()].filter((e) => e.kind === 'player').length;
    const p = pos ?? { x: this.world.spawn.x + (n % 3) - 1, y: this.world.spawn.y + 1 + Math.floor(n / 3) };
    const e = createPlayer(this.nextId++, name, classId, p, this.tick);
    this.entities.set(e.id, e);
    return e;
  }

  /** Re-create a saved character (the save must already be validated with `validateSave`). */
  addPlayerFromSave(save: CharacterSave): Entity {
    const okSpot = (p: { x: number; y: number } | null) =>
      p && p.x > 1 && p.y > 1 && p.x < this.world.width - 1 && p.y < this.world.height - 1 && isWalkable(tileAt(this.world, p.x, p.y)) ? p : null;
    const start = okSpot(save.pos) ?? okSpot(save.respawn) ?? undefined;
    const e = this.addPlayer(save.name, save.classId, start ? { x: start.x, y: start.y } : undefined);
    e.level = save.level;
    e.xp = save.xp;
    e.unspent = save.unspent;
    e.attrs = { ...save.attrs };
    e.talents = { ...save.talents };
    e.subclass = save.subclass;
    e.discovered = [...save.discovered];
    e.essenceMark = save.essenceMark ? { ...save.essenceMark } : null;
    const rp = okSpot(save.respawn);
    if (rp) e.respawnPoint = { x: rp.x, y: rp.y };
    this.refreshStats(e, true);
    return e;
  }

  /** Refund every attribute and talent point. Only while seated at a bonfire. Subclass stays. */
  respec(playerId: number): boolean {
    const p = this.entities.get(playerId);
    if (!p || p.kind !== 'player' || !p.classId || p.action?.id !== 'sit') return false;
    p.attrs = { ...CLASSES[p.classId].baseAttributes };
    p.unspent = (p.level - 1) * ATTR_POINTS_PER_LEVEL;
    p.talents = {};
    this.refreshStats(p, false);
    p.hp = Math.min(p.hp, p.maxHp);
    return true;
  }

  spawnEnemy(enemyId: string, x: number, y: number, spawnIndex = -1): Entity {
    const e = createEnemy(this.nextId++, enemyId, { x, y }, this.tick, spawnIndex);
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
      this.emit({ type: 'strike', ownerId: s.ownerId, x: s.x, y: s.y, radius: def.radius });
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

  /** Spend one talent point (server-validated). */
  allocateTalent(playerId: number, nodeId: string): boolean {
    const p = this.entities.get(playerId);
    if (!p || !canAllocateTalent(p, nodeId)) return false;
    p.talents[nodeId] = (p.talents[nodeId] ?? 0) + 1;
    this.refreshStats(p, false);
    return true;
  }

  /** Pick the subclass once, from the player's class list, at SUBCLASS_LEVEL or above. */
  chooseSubclass(playerId: number, id: string): boolean {
    const p = this.entities.get(playerId);
    if (!p || p.kind !== 'player' || !p.classId || p.subclass || p.level < SUBCLASS_LEVEL) return false;
    if (!SUBCLASSES[p.classId].some((s) => s.id === id)) return false;
    p.subclass = id;
    this.refreshStats(p, false);
    return true;
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
      const xp = getEnemy(target.enemyId).xp;
      this.emit({ type: 'kill', killer: credit.id, victim: target.id, xp });
      this.grantXp(credit, xp, 'kill');
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
      if ((s.id !== 'poison' && s.id !== 'curse') || s.until <= this.tick) continue;
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
      if (s) this.spawnEnemy(s.enemyId, s.x, s.y, r.spawnIndex);
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
