import { SAFE_RADIUS, zoneAt, type EntitySnap, type WorldData } from '@etherfall/shared';
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
    this.lights = world.props.filter((p) => p.kind === 'bonfire' || p.kind === 'torch' || p.kind === 'ritual' || p.kind === 'chest');
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
    g.fillStyle = '#07090c';
    g.fillRect(0, 0, W, W);
    // terrain: softened, slightly warm, darker toward the rim like an old lantern-lit chart
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.globalAlpha = 0.92;
    g.drawImage(this.base, self.x - RADIUS_M, self.y - RADIUS_M, RADIUS_M * 2, RADIUS_M * 2, 0, 0, W, W);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(70,45,15,0.12)';
    g.fillRect(0, 0, W, W);
    const vig = g.createRadialGradient(W / 2, W / 2, W * 0.18, W / 2, W / 2, W / 2);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.75, 'rgba(0,0,0,0.18)');
    vig.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, W);
    const at = (x: number, y: number) => [(x - self.x + RADIUS_M) * s, (y - self.y + RADIUS_M) * s] as const;
    const near = (x: number, y: number, pad = 0) => Math.abs(x - self.x) <= RADIUS_M + pad && Math.abs(y - self.y) <= RADIUS_M + pad;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const t = performance.now() / 1000;
    const opened = self.openedChests ?? [];
    // sanctuaries first (soft halos under everything)
    for (const p of this.lights) {
      if (p.kind !== 'bonfire' || !near(p.x, p.y, SAFE_RADIUS)) continue;
      const [x, y] = at(p.x, p.y);
      const halo = g.createRadialGradient(x, y, 0, x, y, SAFE_RADIUS * s);
      halo.addColorStop(0, 'rgba(255,170,70,0.35)');
      halo.addColorStop(0.7, 'rgba(255,140,50,0.12)');
      halo.addColorStop(1, 'rgba(255,140,50,0)');
      g.fillStyle = halo;
      g.beginPath();
      g.arc(x, y, SAFE_RADIUS * s, 0, Math.PI * 2);
      g.fill();
    }
    for (const p of this.lights) {
      if (!near(p.x, p.y)) continue;
      const [x, y] = at(p.x, p.y);
      if (p.kind === 'bonfire') {
        g.font = `bold ${Math.round(12 * dpr)}px "DejaVu Sans Mono", monospace`;
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillText('▲', x + dpr, y + dpr);
        g.fillStyle = `rgb(255,${170 + Math.round(30 * Math.sin(t * 6 + p.x))},70)`;
        g.fillText('▲', x, y);
      } else if (p.kind === 'ritual') {
        g.font = `bold ${Math.round(13 * dpr)}px "DejaVu Sans Mono", monospace`;
        g.fillStyle = `rgba(255,60,40,${0.65 + 0.35 * Math.sin(t * 2.5)})`;
        g.fillText('✶', x, y);
      } else if (p.kind === 'chest') {
        if (opened.includes(p.id)) continue;
        g.fillStyle = p.size >= 2 ? '#ffd45a' : p.size >= 1 ? '#c9d2dc' : '#b98a52';
        g.fillRect(x - 2 * dpr, y - 1.5 * dpr, 4 * dpr, 3 * dpr);
        g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.lineWidth = dpr * 0.8;
        g.strokeRect(x - 2 * dpr, y - 1.5 * dpr, 4 * dpr, 3 * dpr);
      } else {
        g.fillStyle = 'rgba(255,170,80,0.75)';
        g.fillRect(x - dpr, y - dpr, 2 * dpr, 2 * dpr);
      }
    }
    g.font = `bold ${Math.round(12 * dpr)}px "DejaVu Sans Mono", monospace`;
    for (const pt of this.world.portals) {
      if (!near(pt.x, pt.y)) continue;
      const [x, y] = at(pt.x, pt.y);
      g.fillStyle = `rgba(190,150,255,${0.7 + 0.3 * Math.sin(t * 3)})`;
      g.fillText('◎', x, y);
    }
    const BOSS = new Set(['giantspider', 'vampire', 'bonegiant', 'demon', 'fire_dragon', 'frost_wyvern', 'goblin_chief', 'cult_leader']);
    for (const e of entities) {
      if (e.dead || e.kind === 'projectile' || e.id === me) continue;
      const [x, y] = at(e.x, e.y);
      const big = !!e.enemyId && BOSS.has(e.enemyId);
      let col: string;
      let r = 2.2;
      if (e.kind === 'player') col = '#7cc0ff';
      else if (e.enemyId === 'villager') (col = '#e8d9a8'), (r = 1.8);
      else if (e.team === 0) col = '#5fe07a';
      else if (e.team === 2) (col = '#c8b48a'), (r = e.enemyId === 'rabbit' ? 1.3 : 1.8);
      else col = big ? '#ff5a2a' : '#d0412f';
      if (big) r = 3.4;
      g.beginPath();
      g.arc(x, y, (r + 0.9) * dpr, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.fill();
      g.beginPath();
      g.arc(x, y, r * dpr, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
    }
    // you: a glowing arrow pointing where you face
    g.translate(W / 2, W / 2);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, 12 * dpr);
    glow.addColorStop(0, 'rgba(255,240,200,0.35)');
    glow.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = glow;
    g.fillRect(-12 * dpr, -12 * dpr, 24 * dpr, 24 * dpr);
    g.rotate(self.facing);
    g.beginPath();
    g.moveTo(8 * dpr, 0);
    g.lineTo(-4.5 * dpr, 5 * dpr);
    g.lineTo(-2 * dpr, 0);
    g.lineTo(-4.5 * dpr, -5 * dpr);
    g.closePath();
    g.lineWidth = 2 * dpr;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.stroke();
    g.fillStyle = '#fff4d6';
    g.fill();
    g.restore();
    // frame: double gilded ring with compass ticks and a north mark
    const R = W / 2 - 1.5 * dpr;
    g.lineWidth = 3 * dpr;
    g.strokeStyle = 'rgba(30,20,8,0.95)';
    g.beginPath();
    g.arc(W / 2, W / 2, R, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.5 * dpr;
    g.strokeStyle = 'rgba(214,170,90,0.9)';
    g.beginPath();
    g.arc(W / 2, W / 2, R, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(214,170,90,0.35)';
    g.lineWidth = dpr;
    g.beginPath();
    g.arc(W / 2, W / 2, R - 4 * dpr, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const l = k % 4 === 0 ? 7 : 3.5;
      g.strokeStyle = k % 4 === 0 ? 'rgba(235,200,120,0.95)' : 'rgba(214,170,90,0.5)';
      g.lineWidth = (k % 4 === 0 ? 1.6 : 1) * dpr;
      g.beginPath();
      g.moveTo(W / 2 + Math.cos(a) * R, W / 2 + Math.sin(a) * R);
      g.lineTo(W / 2 + Math.cos(a) * (R - l * dpr), W / 2 + Math.sin(a) * (R - l * dpr));
      g.stroke();
    }
    g.font = `bold ${Math.round(10 * dpr)}px "DejaVu Sans Mono", monospace`;
    g.fillStyle = 'rgba(10,8,4,0.9)';
    g.beginPath();
    g.arc(W / 2, 9 * dpr, 7 * dpr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f0cf86';
    g.fillText('N', W / 2, 9.5 * dpr);
    const region = this.world.regions.find((r) => self.x >= r.x0 && self.x < r.x1 && self.y >= r.y0 && self.y < r.y1);
    const poi = this.world.pois.find((p) => Math.hypot(p.x - self.x, p.y - self.y) < p.r);
    const zone = zoneAt(this.world, self.x, self.y);
    const text = region?.name ?? poi?.name ?? (zone ? `${zone.name} · Nv ${zone.minLevel}–${zone.maxLevel}` : 'Floresta do Crepúsculo');
    if (this.label.textContent !== text) this.label.textContent = text;
  }
}
