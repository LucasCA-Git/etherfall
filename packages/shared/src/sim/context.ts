import type { Rng } from '../math/rng';
import type { SpatialHash } from '../physics/spatialHash';
import type { WorldData } from '../world/worldgen';
import type { Entity, SimEvent, StatusId, Zone } from './types';
import type { ActionDef } from '../data/actions';

export interface StaticCollider {
  x: number;
  y: number;
  r: number;
}

export interface DynamicItem {
  x: number;
  y: number;
  r: number;
  e: Entity;
}

/**
 * What gameplay systems (combat, player control, AI) may touch.
 * Keeps systems decoupled from the Simulation class and easy to unit test.
 */
export interface SimContext {
  readonly tick: number;
  readonly rng: Rng;
  readonly world: WorldData;
  readonly entities: Map<number, Entity>;
  readonly statics: SpatialHash<StaticCollider>;
  /** Broadphase of live, non-projectile entities rebuilt every tick. */
  readonly dynamics: SpatialHash<DynamicItem>;
  emit(ev: SimEvent): void;
  spawnProjectile(owner: Entity, actionId: string, dir: number, chargeMul: number): Entity;
  kill(target: Entity, killer: Entity | null): void;
  /** Apply a status for `ticks` ticks from now (emits a 'status' event). */
  applyStatus(e: Entity, id: StatusId, ticks: number, power: number, source: number): void;
  addZone(owner: Entity, def: ActionDef, x: number, y: number): void;
  scheduleStrike(owner: Entity, actionId: string, x: number, y: number, at: number): void;
  /** Restore hp (capped at max); emits a 'heal' event when anything was restored. */
  heal(source: Entity, target: Entity, amount: number): number;
  /** Call `count` allied creatures next to `owner` for `ticks` ticks (keeps at most `max` of that kind). */
  summon(owner: Entity, enemyId: string, count: number, ticks: number, max: number, dir: number): void;
  readonly zones: Zone[];
}
