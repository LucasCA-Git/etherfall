import { ATLAS_COLS, ATLAS_ROWS, GLYPH_ROWS } from './materials';

export const GLYPH_TILE = 32;

/**
 * Rasterizes every glyph into a single-channel atlas texture (white on black).
 * Glyphs are stretched horizontally to fill a square cell — this is what gives the
 * dense "pixel-art made of characters" look instead of sparse terminal text.
 */
export function buildGlyphCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ATLAS_COLS * GLYPH_TILE;
  c.height = ATLAS_ROWS * GLYPH_TILE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for glyph atlas');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontPx = Math.round(GLYPH_TILE * 0.86);
  ctx.font = `bold ${fontPx}px "DejaVu Sans Mono", "JetBrains Mono", "Noto Sans Mono", Menlo, Consolas, monospace`;
  const adv = ctx.measureText('M').width || fontPx * 0.6;
  const sx = Math.min(1.3, (GLYPH_TILE * 0.92) / adv);
  for (let row = 0; row < ATLAS_ROWS; row++) {
    const glyphs = GLYPH_ROWS[row];
    if (!glyphs) continue;
    for (let col = 0; col < ATLAS_COLS; col++) {
      const g = glyphs[col];
      if (!g || g === ' ') continue;
      const cx = col * GLYPH_TILE + GLYPH_TILE / 2;
      const cy = row * GLYPH_TILE + GLYPH_TILE / 2 + 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(col * GLYPH_TILE, row * GLYPH_TILE, GLYPH_TILE, GLYPH_TILE);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.scale(sx, 1);
      ctx.fillText(g, 0, 0);
      ctx.restore();
    }
  }
  return c;
}
