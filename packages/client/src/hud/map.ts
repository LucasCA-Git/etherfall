import { Tile, type EntitySnap, type WorldData } from '@etherfall/shared';

const TILE_RGB: Record<number, [number, number, number]> = {
  [Tile.Grass]: [34, 62, 30],
  [Tile.TallGrass]: [52, 76, 34],
  [Tile.Dirt]: [78, 60, 38],
  [Tile.Sand]: [120, 108, 78],
  [Tile.ShallowWater]: [30, 78, 92],
  [Tile.DeepWater]: [14, 34, 70],
  [Tile.Rock]: [58, 58, 64],
  [Tile.RuinFloor]: [96, 88, 76],
  [Tile.CastleFloor]: [104, 104, 112],
  [Tile.DungeonFloor]: [70, 62, 56],
};

/** One pixel per meter: tiles, trees and walls, shared by the world map and the minimap. */
export function buildBaseMap(world: WorldData): HTMLCanvasElement {
  const base = document.createElement('canvas');
  base.width = world.width;
  base.height = world.height;
  const g = base.getContext('2d')!;
  const img = g.createImageData(world.width, world.height);
  for (let i = 0; i < world.tiles.length; i++) {
    const c = TILE_RGB[world.tiles[i]!] ?? [0, 0, 0];
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = 255;
  }
  for (const p of world.props) {
    const i = Math.floor(p.y) * world.width + Math.floor(p.x);
    if (p.kind === 'tree' || p.kind === 'pine') img.data.set([16, 40, 20], i * 4);
    else if (p.kind === 'castleWall' || p.kind === 'tower') img.data.set([170, 165, 150], i * 4);
  }
  g.putImageData(img, 0, 0);
  return base;
}

/** World map overlay (M) rendered from the same tile data the server uses. */
export class WorldMap {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  open = false;

  constructor(
    parent: HTMLElement,
    private world: WorldData,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'map hidden panel';
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.width * 4;
    this.canvas.height = world.height * 4;
    const title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = 'Floresta do Crepúsculo — M para fechar';
    this.root.append(title, this.canvas);
    parent.append(this.root);
    this.base = buildBaseMap(world);
  }

  toggle(): void {
    this.open = !this.open;
    this.root.classList.toggle('hidden', !this.open);
  }

  draw(entities: EntitySnap[], me: number): void {
    if (!this.open) return;
    const g = this.canvas.getContext('2d')!;
    const s = 4;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0, this.canvas.width, this.canvas.height);
    g.font = 'bold 14px "DejaVu Sans Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of this.world.props) {
      if (p.kind === 'bonfire') {
        g.fillStyle = '#ffae3d';
        g.fillText('▲', p.x * s, p.y * s);
      } else if (p.kind === 'ruinWall' || p.kind === 'pillar') {
        g.fillStyle = '#9b9183';
        g.fillRect(p.x * s - 2, p.y * s - 2, 4, 4);
      }
    }
    for (const pt of this.world.portals) {
      g.fillStyle = '#b48cff';
      g.fillText('◎', pt.x * s, pt.y * s);
    }
    g.font = 'bold 12px "DejaVu Sans Mono", monospace';
    for (const poi of this.world.pois) {
      if (!poi.xp) continue;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(poi.name, poi.x * s + 1, (poi.y - poi.r) * s + 1);
      g.fillStyle = '#e9d7ad';
      g.fillText(poi.name, poi.x * s, (poi.y - poi.r) * s);
    }
    g.font = 'bold 14px "DejaVu Sans Mono", monospace';
    for (const e of entities) {
      if (e.dead || e.kind === 'projectile') continue;
      g.fillStyle = e.id === me ? '#fff4d6' : e.kind === 'player' ? '#7cc0ff' : '#d0412f';
      g.fillText(e.id === me ? '@' : e.kind === 'player' ? '@' : '•', e.x * s, e.y * s);
    }
  }
}
