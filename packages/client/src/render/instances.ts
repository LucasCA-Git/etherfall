/** Instance layout shared by every shape draw (16 floats = 64 bytes). See SHAPE_VS. */
export const FLOATS_PER_INSTANCE = 16;

export const Shape = {
  Circle: 0,
  Rect: 1,
  Tri: 2,
  Ring: 3,
  Sector: 4,
  Canopy: 5,
  Blade: 6,
  Capsule: 7,
  /** Painted cutout from the sprite atlas: param = sprite index, extra = flip bits. */
  Sprite: 8,
} as const;

export type RGB = readonly [number, number, number];

export interface ShapeOpts {
  rot?: number;
  depthY?: number;
  sway?: number;
  /** Phase for wind sway, or caster height in shadow batches. */
  phase?: number;
  /** Fixed glyph column in [0,1); negative = procedural per-cell variation. */
  param?: number;
  emis?: number;
  extra?: number;
}

/** Growable CPU-side instance array; uploaded once (static chunks) or per frame (dynamic). */
export class InstanceBatch {
  data: Float32Array;
  count = 0;
  constructor(capacity = 256) {
    this.data = new Float32Array(capacity * FLOATS_PER_INSTANCE);
  }
  clear(): void {
    this.count = 0;
  }
  private ensure(): void {
    if ((this.count + 1) * FLOATS_PER_INSTANCE <= this.data.length) return;
    const next = new Float32Array(this.data.length * 2);
    next.set(this.data);
    this.data = next;
  }
  push(shape: number, x: number, y: number, hw: number, hh: number, color: RGB, mat: number, o: ShapeOpts = {}): void {
    this.ensure();
    const d = this.data;
    let i = this.count * FLOATS_PER_INSTANCE;
    d[i++] = x;
    d[i++] = y;
    d[i++] = hw;
    d[i++] = hh;
    d[i++] = o.rot ?? 0;
    d[i++] = o.depthY ?? y;
    d[i++] = o.sway ?? 0;
    d[i++] = o.phase ?? 0;
    d[i++] = color[0];
    d[i++] = color[1];
    d[i++] = color[2];
    d[i++] = mat;
    d[i++] = o.param ?? -1;
    d[i++] = shape;
    d[i++] = o.emis ?? 0;
    d[i++] = o.extra ?? 0;
    this.count++;
  }
  /** Shadow blob at a caster's foot; `height` drives the sun-direction offset in the shader. */
  shadow(x: number, y: number, hw: number, hh: number, strength: number, height: number): void {
    this.push(Shape.Circle, x, y, hw, hh, [0, 0, 0], 0, { phase: height, emis: strength });
  }
  view(): Float32Array {
    return this.data.subarray(0, this.count * FLOATS_PER_INSTANCE);
  }
}
