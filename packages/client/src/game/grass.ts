/**
 * Grass physics: a damped-spring deflection field around the camera.
 * Actors push blades away from them (and along their motion); blasts kick them radially.
 * Blades overshoot and wobble back instead of snapping upright. Presentation only.
 */
export class GrassField {
  readonly size: number;
  readonly cell: number;
  x0 = 0;
  y0 = 0;
  readonly data: Uint8Array;
  private dx: Float32Array;
  private dy: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private ready = false;

  constructor(size = 96, cell = 0.5) {
    this.size = size;
    this.cell = cell;
    const n = size * size;
    this.dx = new Float32Array(n);
    this.dy = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.data = new Uint8Array(n * 2).fill(128);
  }

  /** Keep the field centered on the camera, scrolling the simulation state by whole cells. */
  private recenter(cx: number, cy: number): void {
    const S = this.size;
    const nx0 = Math.floor((cx - (S * this.cell) / 2) / this.cell) * this.cell;
    const ny0 = Math.floor((cy - (S * this.cell) / 2) / this.cell) * this.cell;
    if (this.ready && nx0 === this.x0 && ny0 === this.y0) return;
    const sx = Math.round((nx0 - this.x0) / this.cell);
    const sy = Math.round((ny0 - this.y0) / this.cell);
    this.x0 = nx0;
    this.y0 = ny0;
    if (!this.ready || Math.abs(sx) >= S || Math.abs(sy) >= S) {
      this.dx.fill(0);
      this.dy.fill(0);
      this.vx.fill(0);
      this.vy.fill(0);
      this.ready = true;
      return;
    }
    for (const arr of [this.dx, this.dy, this.vx, this.vy]) {
      const copy = arr.slice();
      arr.fill(0);
      for (let y = 0; y < S; y++) {
        const oy = y + sy;
        if (oy < 0 || oy >= S) continue;
        for (let x = 0; x < S; x++) {
          const ox = x + sx;
          if (ox < 0 || ox >= S) continue;
          arr[y * S + x] = copy[oy * S + ox]!;
        }
      }
    }
  }

  private range(x: number, y: number, r: number): [number, number, number, number] {
    const S = this.size;
    const c = this.cell;
    return [
      Math.max(0, Math.floor((x - r - this.x0) / c)),
      Math.min(S - 1, Math.ceil((x + r - this.x0) / c)),
      Math.max(0, Math.floor((y - r - this.y0) / c)),
      Math.min(S - 1, Math.ceil((y + r - this.y0) / c)),
    ];
  }

  /** Push from an actor at (x, y) moving with (mvx, mvy). */
  stamp(x: number, y: number, r: number, mvx: number, mvy: number, strength: number, dt: number): void {
    const S = this.size;
    const c = this.cell;
    const [gx0, gx1, gy0, gy1] = this.range(x, y, r);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const ddx = this.x0 + (gx + 0.5) * c - x;
        const ddy = this.y0 + (gy + 0.5) * c - y;
        const d = Math.hypot(ddx, ddy);
        if (d > r) continue;
        const infl = (1 - d / r) * strength;
        const i = gy * S + gx;
        const nx = ddx / Math.max(d, 1e-3);
        const ny = ddy / Math.max(d, 1e-3);
        this.vx[i]! += (nx * 9 + mvx * 2.2) * infl * dt;
        this.vy[i]! += (ny * 9 + mvy * 2.2) * infl * dt;
        // blades right under the feet are pressed down toward the push direction
        const hold = Math.min(1, infl * 6 * dt);
        this.dx[i]! += (nx * 0.85 - this.dx[i]!) * hold;
        this.dy[i]! += (ny * 0.85 - this.dy[i]!) * hold;
      }
    }
  }

  /** Radial kick (shockwaves, lightning, explosions). */
  blast(x: number, y: number, r: number, power: number): void {
    const S = this.size;
    const c = this.cell;
    const [gx0, gx1, gy0, gy1] = this.range(x, y, r);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const ddx = this.x0 + (gx + 0.5) * c - x;
        const ddy = this.y0 + (gy + 0.5) * c - y;
        const d = Math.hypot(ddx, ddy);
        if (d > r) continue;
        const k = (1 - d / r) * power;
        const i = gy * S + gx;
        this.vx[i]! += (ddx / Math.max(d, 0.05)) * k * 7;
        this.vy[i]! += (ddy / Math.max(d, 0.05)) * k * 7;
      }
    }
  }

  /** Integrate the springs (semi-implicit Euler) and pack into RG8 for the GPU. */
  update(dt: number, camX: number, camY: number): void {
    this.recenter(camX, camY);
    const h = Math.min(dt, 1 / 30);
    const K = 42; // stiffness: blades want to stand back up
    const C = 3.6; // damping: low enough to overshoot and wobble
    const n = this.size * this.size;
    const { dx, dy, vx, vy } = this;
    const out = this.data;
    for (let i = 0; i < n; i++) {
      vx[i] = vx[i]! + (-K * dx[i]! - C * vx[i]!) * h;
      vy[i] = vy[i]! + (-K * dy[i]! - C * vy[i]!) * h;
      let x = dx[i]! + vx[i]! * h;
      let y = dy[i]! + vy[i]! * h;
      const m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m;
      }
      dx[i] = x;
      dy[i] = y;
      out[i * 2] = Math.max(0, Math.min(255, Math.round(128 + x * 127)));
      out[i * 2 + 1] = Math.max(0, Math.min(255, Math.round(128 + y * 127)));
    }
  }
}
