import type { EntitySnap } from '@etherfall/shared';

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
  life: number;
  size: number;
  kind: FloatKind;
  /** Horizontal drift in px/s (damage numbers spread out like in Ragnarok Online). */
  vx: number;
  label?: string;
}

/** 'dmg' / 'crit' / 'heal' / 'miss' are bold popping combat numbers; 'text' is a plain caption. */
export type FloatKind = 'text' | 'dmg' | 'crit' | 'heal' | 'miss' | 'dot';

/** 2D canvas over the ASCII view: names, enemy health, floating combat text, prompts. */
export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private floaters: Floater[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext('2d');
    if (!c) throw new Error('2D overlay unavailable');
    this.ctx = c;
  }

  float(x: number, y: number, text: string, color: string, size = 13, life = 1.1, kind: FloatKind = 'text', label?: string): void {
    const vx = kind === 'dmg' || kind === 'crit' ? (Math.random() - 0.5) * 70 : 0;
    this.floaters.push({ x, y, text, color, born: performance.now() / 1000, life, size, kind, vx, label });
    if (this.floaters.length > 80) this.floaters.shift();
  }

  /** Ragnarok-style combat number: big, outlined, pops, hops up and falls away. */
  combat(x: number, y: number, kind: Exclude<FloatKind, 'text'>, text: string, color: string, label?: string): void {
    const size = kind === 'crit' ? 30 : kind === 'dmg' ? 21 : kind === 'heal' ? 19 : kind === 'dot' ? 15 : 17;
    this.float(x, y, text, color, size, kind === 'crit' ? 1.35 : 1.15, kind, label);
  }

  draw(
    entities: EntitySnap[],
    me: number,
    toScreen: (x: number, y: number) => { x: number; y: number },
    ppm: number,
    tick: number,
    prompt: { x: number; y: number; text: string } | null,
    /** Name/health-bar height above the feet; defaults to the ASCII rig heights. */
    head?: (e: EntitySnap) => number,
  ): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.floor(this.canvas.clientWidth * dpr);
    const H = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.font = '600 11px "DejaVu Sans Mono", Menlo, monospace';

    for (const e of entities) {
      if (e.kind === 'projectile' || e.dead) continue;
      const p = toScreen(e.x, e.y - (head ? head(e) : e.enemyId === 'ashwolf' ? 1.3 : e.enemyId === 'giantspider' ? 1.7 : 2.15));
      if (e.kind === 'enemy' && e.team === 0) {
        // summoned ally: green name, small health bar
        const w = Math.max(20, ppm * 0.8);
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(p.x - w / 2 - 1, p.y - 7, w + 2, 5);
        g.fillStyle = '#4fd36a';
        g.fillRect(p.x - w / 2, p.y - 6, w * Math.max(0, e.hp / e.maxHp), 3);
        g.fillStyle = 'rgba(150,255,170,0.8)';
        g.fillText(e.name, p.x, p.y - 9);
        continue;
      }
      if (e.kind === 'player') {
        g.fillStyle = e.id === me ? 'rgba(235,225,200,0.85)' : 'rgba(150,200,255,0.9)';
        g.fillText(e.name, p.x, p.y - 4);
      } else {
        const recently = tick - e.hitTick < 150 || e.hp < e.maxHp;
        if (!recently) continue;
        const w = Math.max(26, ppm * 1.1);
        const k = Math.max(0, e.hp / e.maxHp);
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(p.x - w / 2 - 1, p.y - 7, w + 2, 5);
        g.fillStyle = '#b3261e';
        g.fillRect(p.x - w / 2, p.y - 6, w * k, 3);
        g.fillStyle = 'rgba(220,200,180,0.75)';
        g.fillText(e.name, p.x, p.y - 9);
        if (e.action === 'stagger' || e.action === 'parried' || e.action === 'guardbreak') {
          g.fillStyle = '#ffd34d';
          g.fillText(e.action === 'parried' ? 'VULNERÁVEL' : '!', p.x, p.y - 21);
        }
      }
    }

    const now = performance.now() / 1000;
    this.floaters = this.floaters.filter((f) => now - f.born < f.life);
    for (const f of this.floaters) {
      const t = (now - f.born) / f.life;
      const p = toScreen(f.x, f.y);
      if (f.kind === 'text') {
        g.globalAlpha = 1 - t * t;
        g.font = `700 ${f.size}px "DejaVu Sans Mono", Menlo, monospace`;
        g.fillStyle = 'rgba(0,0,0,0.8)';
        g.fillText(f.text, p.x + 1, p.y - 18 - t * 26 + 1);
        g.fillStyle = f.color;
        g.fillText(f.text, p.x, p.y - 18 - t * 26);
        continue;
      }
      const sec = now - f.born;
      let dx = 0;
      let dy: number;
      if (f.kind === 'heal' || f.kind === 'miss' || f.kind === 'dot') dy = -16 - sec * 42;
      else {
        dx = f.vx * sec;
        dy = -18 - (190 * sec - 210 * sec * sec); // hop up, then fall
      }
      const pop = 1 + (f.kind === 'crit' ? 0.9 : 0.45) * Math.max(0, 1 - sec / 0.14);
      const size = f.size * pop;
      g.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      g.font = `900 ${size.toFixed(1)}px Impact, "Arial Black", "DejaVu Sans", sans-serif`;
      g.lineJoin = 'round';
      g.lineWidth = Math.max(3, size * 0.2);
      g.strokeStyle = 'rgba(10,6,4,0.95)';
      const X = p.x + dx;
      const Y = p.y + dy;
      g.strokeText(f.text, X, Y);
      if (f.kind === 'crit') {
        const grad = g.createLinearGradient(0, Y - size, 0, Y);
        grad.addColorStop(0, '#fff3a0');
        grad.addColorStop(0.55, f.color);
        grad.addColorStop(1, '#c4400c');
        g.fillStyle = grad;
      } else g.fillStyle = f.color;
      g.fillText(f.text, X, Y);
      if (f.label) {
        g.font = `800 11px "DejaVu Sans", sans-serif`;
        g.lineWidth = 3;
        g.strokeText(f.label, X, Y - size * 0.95);
        g.fillStyle = '#ffd34d';
        g.fillText(f.label, X, Y - size * 0.95);
      }
    }
    g.globalAlpha = 1;
    g.lineWidth = 1;

    if (prompt) {
      const p = toScreen(prompt.x, prompt.y);
      g.font = '600 12px "DejaVu Sans Mono", Menlo, monospace';
      const w = g.measureText(prompt.text).width + 16;
      g.fillStyle = 'rgba(10,8,6,0.75)';
      g.fillRect(p.x - w / 2, p.y - 46, w, 20);
      g.strokeStyle = 'rgba(214,170,90,0.6)';
      g.strokeRect(p.x - w / 2 + 0.5, p.y - 45.5, w - 1, 19);
      g.fillStyle = '#e9d7ad';
      g.fillText(prompt.text, p.x, p.y - 30);
    }
  }
}
