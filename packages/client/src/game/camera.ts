import { valueNoise2 } from '@etherfall/shared';

export const BASE_PPM = 44;

/** Smooth follow camera with aim look-ahead, trauma-based shake, zoom and world bounds. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1.05;
  targetZoom = 1.05;
  private trauma = 0;
  private t = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(
    private worldW: number,
    private worldH: number,
  ) {}

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  addTrauma(a: number): void {
    this.trauma = Math.min(1, this.trauma + a);
  }

  get ppm(): number {
    return BASE_PPM * this.zoom;
  }

  update(dt: number, tx: number, ty: number, aimX: number, aimY: number, viewW: number, viewH: number, shakeScale = 1): void {
    this.t += dt;
    // look-ahead toward the cursor, capped
    let lx = (aimX - tx) * 0.12;
    let ly = (aimY - ty) * 0.12;
    const l = Math.hypot(lx, ly);
    if (l > 1.6) {
      lx *= 1.6 / l;
      ly *= 1.6 / l;
    }
    const k = 1 - Math.exp(-dt * 7);
    this.x += (tx + lx - this.x) * k;
    this.y += (ty + ly - this.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-dt * 10));

    const hw = viewW / 2 / this.ppm;
    const hh = viewH / 2 / this.ppm;
    this.x = Math.min(this.worldW - hw, Math.max(hw, this.x));
    this.y = Math.min(this.worldH - hh, Math.max(hh, this.y));

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 0.35 * shakeScale;
    this.shakeX = (valueNoise2(this.t * 28, 1, 9) - 0.5) * 2 * s;
    this.shakeY = (valueNoise2(this.t * 28, 7, 9) - 0.5) * 2 * s;
  }

  zoomBy(steps: number): void {
    this.targetZoom = Math.min(1.7, Math.max(0.6, this.targetZoom * Math.pow(0.9, steps)));
  }
}
