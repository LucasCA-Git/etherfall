import type { Entity, StatusId } from '../sim/types';

/** Status effects are plain data on the entity; every rule that reads them lives here. */
export function hasStatus(e: Entity, id: StatusId, tick: number): boolean {
  return e.statuses.some((s) => s.id === id && s.until > tick);
}

export function statusPower(e: Entity, id: StatusId, tick: number): number {
  let p = 0;
  for (const s of e.statuses) if (s.id === id && s.until > tick) p = Math.max(p, s.power);
  return p;
}

/** Movement multiplier from crowd control (root = 0, slow = 1 - power). */
export function statusMoveMul(e: Entity, tick: number): number {
  if (hasStatus(e, 'root', tick)) return 0;
  return 1 - Math.min(0.9, statusPower(e, 'slow', tick));
}

/** Refresh-or-add: re-applying keeps the longer duration and the stronger power. */
export function addStatus(e: Entity, id: StatusId, until: number, power: number, source: number): void {
  const cur = e.statuses.find((s) => s.id === id);
  if (cur) {
    cur.until = Math.max(cur.until, until);
    cur.power = Math.max(cur.power, power);
    cur.source = source;
  } else {
    e.statuses.push({ id, until, power, source });
  }
}

export function removeStatus(e: Entity, id: StatusId): void {
  e.statuses = e.statuses.filter((s) => s.id !== id);
}

export function expireStatuses(e: Entity, tick: number): void {
  if (e.statuses.length) e.statuses = e.statuses.filter((s) => s.until > tick);
}
