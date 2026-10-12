import { angleDiff, type EntitySnap, type Snapshot } from '@etherfall/shared';

/**
 * Interpolates entity views between the last two authoritative snapshots so rendering
 * stays smooth at any frame rate while the simulation ticks at 30 Hz.
 */
export function interpolate(prev: Snapshot | null, cur: Snapshot, alpha: number): EntitySnap[] {
  if (!prev) return cur.entities;
  const before = new Map(prev.entities.map((e) => [e.id, e]));
  return cur.entities.map((e) => {
    const p = before.get(e.id);
    if (!p) return e;
    // teleports (respawn) should not smear across the map
    if (Math.hypot(e.x - p.x, e.y - p.y) > 4) return e;
    return {
      ...e,
      x: p.x + (e.x - p.x) * alpha,
      y: p.y + (e.y - p.y) * alpha,
      facing: p.facing + angleDiff(p.facing, e.facing) * alpha,
    };
  });
}
