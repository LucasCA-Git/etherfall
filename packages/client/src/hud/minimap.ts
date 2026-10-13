import { zoneAt, type EntitySnap, type WorldData } from '@etherfall/shared';
import { buildBaseMap } from './map';

const RADIUS_M = 34;

/** Circular minimap (top-right): terrain, walls, bonfires, portals, enemies and allies around you. */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private label: HTMLDivElement;
  private root: HTMLDivElement;
  private base: HTMLCanvasElement;
  private lights: WorldData['props'];

  constructor(
    parent: HTMLElement,
    private world: WorldData,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'minimap';
    this.canvas = document.createElement('canvas');
    this.label = document.createElement('div');
    this.label.className = 'mm-label';
    this.root.append(this.canvas, this.label);
    parent.append(this.root);
    this.base = buildBaseMap(world);
    this.lights = world.props.filter((p) => p.kind === 'bonfire' || p.kind === 'torch');
  }

  draw(entities: EntitySnap[], me: number, hidden: boolean): void {
    const self = entities.find((e) => e.id === me);
    this.root.style.display = hidden || !self ? 'none' : '';
    if (hidden || !self) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = this.canvas.clientWidth || 176;
    const W = Math.round(css * dpr);
    if (this.canvas.width !== W) {
      this.canvas.width = W;
      this.canvas.height = W;
    }
    const g = this.canvas.getContext('2d')!;
    const s = W / (RADIUS_M * 2); // px per meter
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#050505';
    g.fillRect(0, 0, W, W);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.9;
    g.drawImage(this.base, self.x - RADIUS_M, self.y - RADIUS_M, RADIUS_M * 2, RADIUS_M * 2, 0, 0, W, W);
    g.globalAlpha = 1;
    const at = (x: number, y: number) => [(x - self.x + RADIUS_M) * s, (y - self.y + RADIUS_M) * s] as const;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(11 * dpr)}px "DejaVu Sans Mono", monospace`;
    for (const p of this.lights) {
      if (Math.abs(p.x - self.x) > RADIUS_M || Math.abs(p.y - self.y) > RADIUS_M) continue;
      const [x, y] = at(p.x, p.y);
      if (p.kind === 'bonfire') {
        g.fillStyle = '#ffae3d';
        g.fillText('▲', x, y);
      } else {
        g.fillStyle = 'rgba(255,170,80,0.7)';
        g.fillRect(x - dpr, y - dpr, 2 * dpr, 2 * dpr);
      }
    }
    for (const pt of this.world.portals) {
      const [x, y] = at(pt.x, pt.y);
      g.fillStyle = '#b48cff';
      g.fillText('◎', x, y);
    }
    for (const e of entities) {
      if (e.dead || e.kind === 'projectile' || e.id === me) continue;
      const [x, y] = at(e.x, e.y);
      const big = e.enemyId === 'giantspider' || e.enemyId === 'vampire' || e.enemyId === 'bonegiant';
      g.fillStyle = e.kind === 'player' ? '#7cc0ff' : e.team === 0 ? '#5fe07a' : e.enemyId === 'bonegiant' ? '#ff9a2a' : e.enemyId === 'vampire' ? '#c03aa0' : big ? '#ff3b2f' : '#d0412f';
      g.beginPath();
      g.arc(x, y, (big ? 3.2 : 2.2) * dpr, 0, Math.PI * 2);
      g.fill();
    }
    // you: an arrow pointing where you face
    g.translate(W / 2, W / 2);
    g.rotate(self.facing);
    g.fillStyle = '#fff4d6';
    g.beginPath();
    g.moveTo(7 * dpr, 0);
    g.lineTo(-4 * dpr, 4.5 * dpr);
    g.lineTo(-2 * dpr, 0);
    g.lineTo(-4 * dpr, -4.5 * dpr);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(214,170,90,0.75)';
    g.lineWidth = 2 * dpr;
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - dpr, 0, Math.PI * 2);
    g.stroke();
    const region = this.world.regions.find((r) => self.x >= r.x0 && self.x < r.x1 && self.y >= r.y0 && self.y < r.y1);
    const poi = this.world.pois.find((p) => Math.hypot(p.x - self.x, p.y - self.y) < p.r);
    const zone = zoneAt(this.world, self.x, self.y);
    const text = region?.name ?? poi?.name ?? (zone ? `${zone.name} · Nv ${zone.minLevel}–${zone.maxLevel}` : 'Floresta do Crepúsculo');
    if (this.label.textContent !== text) this.label.textContent = text;
  }
}
