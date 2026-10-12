import { InstanceBatch, Shape, type RGB } from '../render/instances';

/**
 * Pooled particles (structure of arrays, no per-frame allocation). Particles have
 * a height axis with gravity so blood, sparks and debris arc and bounce on the ground.
 */
export class Particles {
  readonly cap: number;
  private n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private z: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private col: Float32Array;
  private mat: Uint8Array;
  private emis: Float32Array;
  limit: number;

  constructor(cap = 4096) {
    this.cap = cap;
    this.limit = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.col = new Float32Array(cap * 3);
    this.mat = new Uint8Array(cap);
    this.emis = new Float32Array(cap);
  }

  get count(): number {
    return this.n;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: RGB, mat: number, opts: { grav?: number; drag?: number; emis?: number } = {}): void {
    if (this.n >= Math.min(this.cap, this.limit)) return;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.grav[i] = opts.grav ?? 9.8;
    this.drag[i] = opts.drag ?? 1.5;
    this.col[i * 3] = color[0];
    this.col[i * 3 + 1] = color[1];
    this.col[i * 3 + 2] = color[2];
    this.mat[i] = mat;
    this.emis[i] = opts.emis ?? 0;
  }

  burst(n: number, x: number, y: number, dir: number, spread: number, speed: number, up: number, life: number, size: number, color: RGB, mat: number, rand: () => number, opts: { grav?: number; drag?: number; emis?: number } = {}): void {
    for (let k = 0; k < n; k++) {
      const a = dir + (rand() - 0.5) * spread;
      const s = speed * (0.4 + rand() * 0.8);
      this.spawn(x, y, 0.3 + rand() * 0.3, Math.cos(a) * s, Math.sin(a) * s, up * (0.5 + rand()), life * (0.6 + rand() * 0.8), size * (0.6 + rand() * 0.8), color, mat, opts);
    }
  }

  update(dt: number, windX: number, windY: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        this.kill(i);
        continue;
      }
      const g = this.grav[i]!;
      const drag = Math.exp(-this.drag[i]! * dt);
      // lightweight particles (leaves, embers) drift with the wind
      if (g < 3) {
        this.vx[i]! += windX * dt * 1.5;
        this.vy[i]! += windY * dt * 1.5;
      }
      this.vx[i]! *= drag;
      this.vy[i]! *= drag;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
      this.vz[i]! -= g * dt;
      this.z[i]! += this.vz[i]! * dt;
      if (this.z[i]! < 0) {
        this.z[i] = 0;
        this.vz[i] = -this.vz[i]! * 0.25;
        this.vx[i]! *= 0.5;
        this.vy[i]! *= 0.5;
      }
      i++;
    }
  }

  private kill(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.z[i] = this.z[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.vz[i] = this.vz[last]!;
    this.life[i] = this.life[last]!;
    this.max[i] = this.max[last]!;
    this.size[i] = this.size[last]!;
    this.grav[i] = this.grav[last]!;
    this.drag[i] = this.drag[last]!;
    this.col[i * 3] = this.col[last * 3]!;
    this.col[i * 3 + 1] = this.col[last * 3 + 1]!;
    this.col[i * 3 + 2] = this.col[last * 3 + 2]!;
    this.mat[i] = this.mat[last]!;
    this.emis[i] = this.emis[last]!;
  }

  /** Emit visible particles into the dynamic batch (culled to the view rect). */
  draw(out: InstanceBatch, vx0: number, vy0: number, vx1: number, vy1: number): number {
    let drawn = 0;
    for (let i = 0; i < this.n; i++) {
      const x = this.x[i]!;
      const y = this.y[i]!;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const t = this.life[i]! / this.max[i]!;
      const s = this.size[i]! * (0.4 + 0.6 * Math.min(1, t * 2));
      const c: RGB = [this.col[i * 3]!, this.col[i * 3 + 1]!, this.col[i * 3 + 2]!];
      out.push(Shape.Circle, x, y - this.z[i]!, s, s, c, this.mat[i]!, { depthY: y + 0.3, emis: this.emis[i]! * t, param: -1, extra: i * 0.37 });
      drawn++;
    }
    return drawn;
  }

  clear(): void {
    this.n = 0;
  }
}
