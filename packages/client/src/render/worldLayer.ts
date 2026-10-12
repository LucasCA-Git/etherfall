import { Tile, bonfireSeats, tileAt, type Prop, type WorldData } from '@etherfall/shared';
import { InstanceBatch, Shape, type RGB } from './instances';
import { Mat } from './materials';

export const CHUNK_SIZE = 16;

export interface StaticChunk {
  cx: number;
  cy: number;
  normal: InstanceBatch;
  shadow: InstanceBatch;
  reflect: InstanceBatch;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Mirror helper: parts are drawn relative to the prop base; reflections flip around it. */
class PropPainter {
  constructor(
    private out: InstanceBatch,
    private baseY: number,
    private mirror: boolean,
  ) {}
  part(shape: number, x: number, y: number, hw: number, hh: number, color: RGB, mat: number, o: { rot?: number; sway?: number; phase?: number; param?: number; extra?: number; depthOff?: number } = {}): void {
    const py = this.mirror ? this.baseY + (this.baseY - y) + 0.15 : y;
    const rot = this.mirror && shape === Shape.Tri ? Math.PI + (o.rot ?? 0) : o.rot ?? 0;
    this.out.push(shape, x, py, hw, hh, color, mat, { rot, depthY: this.baseY + (o.depthOff ?? 0), sway: o.sway, phase: o.phase, param: o.param, extra: o.extra });
  }
}

/** Trees are drawn much taller than their trunk collider so characters read at human scale. */
const TREE_SCALE = 1.5;

export function paintProp(p: Prop, out: InstanceBatch, shadows: InstanceBatch | null, mirror = false): void {
  const { x, y, v } = p;
  const s = p.kind === 'tree' || p.kind === 'pine' ? p.size * TREE_SCALE : p.size;
  const P = new PropPainter(out, y, mirror);
  switch (p.kind) {
    case 'tree': {
      shadows?.shadow(x, y + 0.05, s * 0.85, s * 0.45, 0.6, s * 1.4);
      P.part(Shape.Rect, x, y - 0.42 * s, 0.1 + 0.04 * s, 0.44 * s, [0.24, 0.15, 0.08], Mat.Trunk);
      const autumn = v > 0.88;
      const dark: RGB = autumn ? [0.36, 0.18, 0.06] : [0.08, 0.27, 0.11];
      const midC: RGB = autumn ? [0.52, 0.28, 0.07] : mix([0.13, 0.38, 0.14], [0.2, 0.4, 0.09], v);
      const light: RGB = autumn ? [0.66, 0.42, 0.12] : [0.27, 0.52, 0.18];
      const sw = 0.14 * s;
      P.part(Shape.Canopy, x - 0.45 * s, y - 1.0 * s, 0.7 * s, 0.7 * s, dark, Mat.Canopy, { sway: sw, phase: v, extra: v, depthOff: 0.001 });
      P.part(Shape.Canopy, x + 0.45 * s, y - 1.05 * s, 0.7 * s, 0.7 * s, dark, Mat.Canopy, { sway: sw, phase: v, extra: v + 0.13, depthOff: 0.002 });
      P.part(Shape.Canopy, x, y - 1.35 * s, 0.95 * s, 0.9 * s, midC, Mat.Canopy, { sway: sw, phase: v, extra: v + 0.26, depthOff: 0.003 });
      P.part(Shape.Canopy, x - 0.15 * s, y - 1.62 * s, 0.55 * s, 0.5 * s, light, Mat.Canopy, { sway: sw * 1.2, phase: v, extra: v + 0.39, depthOff: 0.004 });
      break;
    }
    case 'pine': {
      shadows?.shadow(x, y + 0.05, s * 0.6, s * 0.35, 0.6, s * 1.8);
      P.part(Shape.Rect, x, y - 0.25 * s, 0.08 + 0.03 * s, 0.27 * s, [0.2, 0.13, 0.08], Mat.Trunk);
      const sw = 0.1 * s;
      P.part(Shape.Tri, x, y - 0.95 * s, 0.85 * s, 0.7 * s, [0.06, 0.24, 0.17], Mat.Pine, { sway: sw, phase: v, depthOff: 0.001 });
      P.part(Shape.Tri, x, y - 1.45 * s, 0.65 * s, 0.55 * s, [0.09, 0.3, 0.2], Mat.Pine, { sway: sw * 1.2, phase: v, depthOff: 0.002 });
      P.part(Shape.Tri, x, y - 1.9 * s, 0.45 * s, 0.42 * s, [0.13, 0.37, 0.23], Mat.Pine, { sway: sw * 1.4, phase: v, depthOff: 0.003 });
      break;
    }
    case 'rock': {
      shadows?.shadow(x, y + 0.05, s * 0.8, s * 0.45, 0.5, s * 0.6);
      P.part(Shape.Circle, x, y - 0.12, s * 0.75, s * 0.58, mix([0.27, 0.27, 0.29], [0.33, 0.31, 0.28], v), Mat.Stone);
      P.part(Shape.Circle, x - 0.15 * s, y - 0.3 * s, s * 0.32, s * 0.24, [0.42, 0.41, 0.4], Mat.Stone, { depthOff: 0.001 });
      break;
    }
    case 'bush': {
      P.part(Shape.Circle, x - 0.2 * s, y - 0.2, s * 0.5, s * 0.42, [0.08, 0.23, 0.09], Mat.Bush, { sway: 0.06, phase: v });
      P.part(Shape.Circle, x + 0.22 * s, y - 0.28, s * 0.45, s * 0.4, [0.12, 0.29, 0.1], Mat.Bush, { sway: 0.07, phase: v, depthOff: 0.001 });
      break;
    }
    case 'ruinWall': {
      const h = 0.5 + 0.7 * v;
      shadows?.shadow(x, y + 0.2, 0.62, 0.5, 0.55, h);
      P.part(Shape.Rect, x, y + 0.05, 0.5, 0.42, [0.21, 0.2, 0.19], Mat.Stone, { depthOff: 0.5 });
      P.part(Shape.Rect, x, y - 0.37 - h * 0.35, 0.5, 0.18 + h * 0.35, [0.35, 0.33, 0.3], Mat.Stone, { depthOff: 0.5 });
      break;
    }
    case 'pillar': {
      shadows?.shadow(x, y + 0.1, 0.45, 0.32, 0.6, 2.2);
      P.part(Shape.Rect, x, y - 0.75, 0.3, 1.05, [0.28, 0.27, 0.25], Mat.Stone, { depthOff: 0.35 });
      P.part(Shape.Circle, x, y - 1.8, 0.42, 0.3, [0.42, 0.4, 0.36], Mat.Stone, { depthOff: 0.36 });
      break;
    }
    case 'castleWall': {
      // 2.8 m curtain wall block: masonry face, lighter coping and merlons on alternate blocks
      shadows?.shadow(x, y + 0.3, 0.75, 0.55, 0.65, 2.8);
      const tone = 0.9 + v * 0.2;
      P.part(Shape.Rect, x, y - 0.9, 0.5, 1.4, [0.3 * tone, 0.29 * tone, 0.28 * tone], Mat.Ruin, { depthOff: 0.5, extra: 1 });
      P.part(Shape.Rect, x, y - 2.36, 0.52, 0.1, [0.46, 0.44, 0.4], Mat.Stone, { depthOff: 0.5, extra: 1, param: 0.5 / 16 });
      if (Math.floor(x) % 2 === 0) P.part(Shape.Rect, x, y - 2.66, 0.38, 0.22, [0.38, 0.36, 0.34], Mat.Stone, { depthOff: 0.5, extra: 1 });
      break;
    }
    case 'tower': {
      shadows?.shadow(x, y + 0.4, 1.9, 1.1, 0.7, 5.5);
      P.part(Shape.Rect, x, y - 1.9, 1.5, 2.4, [0.31, 0.3, 0.29], Mat.Ruin, { depthOff: 1.2, extra: 1 });
      P.part(Shape.Rect, x, y - 4.4, 1.68, 0.16, [0.44, 0.42, 0.38], Mat.Stone, { depthOff: 1.2, extra: 1, param: 0.5 / 16 });
      for (const ox of [-1.2, -0.4, 0.4, 1.2]) P.part(Shape.Rect, x + ox, y - 4.72, 0.22, 0.2, [0.38, 0.36, 0.33], Mat.Stone, { depthOff: 1.2, extra: 1 });
      P.part(Shape.Tri, x, y - 5.9, 1.75, 1.15, [0.18, 0.15, 0.2], Mat.Rock, { depthOff: 1.21, extra: 1 });
      // arrow slits glowing faintly
      for (const oy of [-1.2, -2.8]) P.part(Shape.Rect, x, y + oy, 0.07, 0.3, [0.9, 0.55, 0.25], Mat.Fire, { depthOff: 1.22, param: 0.5 / 16 });
      break;
    }
    case 'torch': {
      shadows?.shadow(x, y + 0.05, 0.2, 0.1, 0.4, 1.4);
      P.part(Shape.Rect, x, y - 0.65, 0.05, 0.68, [0.25, 0.16, 0.08], Mat.Trunk);
      P.part(Shape.Rect, x, y - 1.3, 0.12, 0.06, [0.3, 0.28, 0.26], Mat.Stone, { depthOff: 0.001 });
      break;
    }
    case 'bonfire': {
      P.part(Shape.Ring, x, y, 0.55, 0.42, [0.32, 0.31, 0.3], Mat.Stone, { extra: 0.62 });
      P.part(Shape.Rect, x, y - 0.05, 0.42, 0.08, [0.2, 0.12, 0.06], Mat.Trunk, { rot: 0.6, depthOff: 0.001 });
      P.part(Shape.Rect, x, y - 0.05, 0.42, 0.08, [0.22, 0.13, 0.06], Mat.Trunk, { rot: -0.6, depthOff: 0.002 });
      // log benches around the fire: interact to sit on the nearest free one
      for (const seat of bonfireSeats(p)) {
        const along = seat.facing + Math.PI / 2;
        shadows?.shadow(seat.x, seat.y + 0.12, 0.6, 0.2, 0.45, 1.2);
        P.part(Shape.Rect, seat.x, seat.y - 0.1, 0.6, 0.2, [0.5, 0.32, 0.16], Mat.Trunk, { rot: along, depthOff: -0.3 });
        P.part(Shape.Rect, seat.x, seat.y - 0.2, 0.58, 0.06, [0.68, 0.48, 0.26], Mat.Trunk, { rot: along, depthOff: -0.299 });
        for (const end of [-1, 1]) {
          P.part(Shape.Circle, seat.x + Math.cos(along) * 0.58 * end, seat.y - 0.1 + Math.sin(along) * 0.58 * end, 0.19, 0.19, [0.82, 0.62, 0.36], Mat.Trunk, { depthOff: -0.298, param: -1 });
        }
      }
      break;
    }
  }
}

function nearWater(w: WorldData, x: number, y: number, r: number): boolean {
  for (let oy = -r; oy <= r; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      const t = tileAt(w, x + ox, y + oy);
      if (t === Tile.ShallowWater || t === Tile.DeepWater) return true;
    }
  }
  return false;
}

/** Static props are batched per 16x16 m chunk once; only visible chunks are drawn each frame. */
export function buildChunks(world: WorldData): StaticChunk[] {
  const map = new Map<string, StaticChunk>();
  const sorted = [...world.props].sort((a, b) => a.y - b.y);
  for (const p of sorted) {
    const cx = Math.floor(p.x / CHUNK_SIZE);
    const cy = Math.floor(p.y / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    let ch = map.get(key);
    if (!ch) map.set(key, (ch = { cx, cy, normal: new InstanceBatch(512), shadow: new InstanceBatch(128), reflect: new InstanceBatch(64) }));
    paintProp(p, ch.normal, ch.shadow);
    if (p.kind !== 'bush' && nearWater(world, p.x, p.y, 3)) paintProp(p, ch.reflect, null, true);
  }
  return [...map.values()];
}
