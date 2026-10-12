import type { Vec2 } from '../math/vec2';
import { isWalkable, TILE_PROPS, Tile } from '../world/tiles';
import { tileAt, type WorldData } from '../world/worldgen';
import type { HashItem, SpatialHash } from './spatialHash';

/** Push a circle out of every non-walkable tile it overlaps. Mutates `pos`. Returns true on contact. */
export function resolveCircleVsTiles(pos: Vec2, r: number, w: WorldData): boolean {
  let hit = false;
  const x0 = Math.floor(pos.x - r);
  const x1 = Math.floor(pos.x + r);
  const y0 = Math.floor(pos.y - r);
  const y1 = Math.floor(pos.y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isWalkable(tileAt(w, tx + 0.5, ty + 0.5))) continue;
      const cx = Math.max(tx, Math.min(pos.x, tx + 1));
      const cy = Math.max(ty, Math.min(pos.y, ty + 1));
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.y += (dy / d) * (r - d);
      } else {
        // center inside the tile: push out along the shallowest axis
        const left = pos.x - tx;
        const right = tx + 1 - pos.x;
        const up = pos.y - ty;
        const down = ty + 1 - pos.y;
        const m = Math.min(left, right, up, down);
        if (m === left) pos.x = tx - r;
        else if (m === right) pos.x = tx + 1 + r;
        else if (m === up) pos.y = ty - r;
        else pos.y = ty + 1 + r;
      }
    }
  }
  return hit;
}

/** Separate two overlapping circles, splitting the correction by inverse mass. Returns overlap depth. */
export function resolveCircleVsCircle(a: Vec2, ra: number, ma: number, b: Vec2, rb: number, mb: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = ra + rb;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 > 1e-12 ? dx / d : 1;
  const ny = d2 > 1e-12 ? dy / d : 0;
  const pen = rr - d;
  const ia = ma > 0 ? 1 / ma : 0;
  const ib = mb > 0 ? 1 / mb : 0;
  const sum = ia + ib || 1;
  a.x -= nx * pen * (ia / sum);
  a.y -= ny * pen * (ia / sum);
  b.x += nx * pen * (ib / sum);
  b.y += ny * pen * (ib / sum);
  return pen;
}

/** Push a circle out of static (immovable) circles. */
export function resolveCircleVsStatics<T extends HashItem>(pos: Vec2, r: number, statics: SpatialHash<T>): boolean {
  let hit = false;
  for (const s of statics.query(pos.x, pos.y, r)) {
    const tmp = { x: s.x, y: s.y };
    if (resolveCircleVsCircle(pos, r, 1, tmp, s.r, 0) > 0) hit = true;
  }
  return hit;
}

/**
 * Integrate velocity with sub-stepping so fast bodies (dodges, dashes, projectiles)
 * never move more than half their radius per sub-step — prevents tunneling.
 * Returns true if anything was hit.
 */
export function moveWithCollisions<T extends HashItem>(
  pos: Vec2,
  vel: Vec2,
  r: number,
  dt: number,
  w: WorldData,
  statics: SpatialHash<T>,
): boolean {
  const dist = Math.hypot(vel.x, vel.y) * dt;
  const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
  const sx = (vel.x * dt) / steps;
  const sy = (vel.y * dt) / steps;
  let hit = false;
  for (let i = 0; i < steps; i++) {
    pos.x += sx;
    pos.y += sy;
    if (resolveCircleVsStatics(pos, r, statics)) hit = true;
    if (resolveCircleVsTiles(pos, r, w)) hit = true;
  }
  return hit;
}

export function terrainSpeed(w: WorldData, x: number, y: number): number {
  return TILE_PROPS[tileAt(w, x, y) as Tile]?.speed ?? 1;
}
