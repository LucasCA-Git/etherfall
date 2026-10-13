/** Every knob of the ASCII pipeline. All are live-editable from the Esc menu. */
export interface RenderSettings {
  /** ASCII cell size in CSS pixels. */
  cellSize: number;
  /** Scene samples per cell per axis (internal resolution). */
  internalRes: number;
  /** Glyph density: >1 fills dark areas with more glyphs, <1 leaves them empty. */
  density: number;
  /** 0 color, 1 monochrome, 2 high contrast, 3 reference (muted layer palette, unfiltered characters). */
  palette: number;
  contrast: number;
  edgeIntensity: number;
  glow: number;
  /** Meters around the player before fog/fade. */
  renderDistance: number;
  grain: number;
  /** Meters after which glyph detail is simplified to the luminance ramp. */
  lodDistance: number;
  dither: number;
  animSpeed: number;
  /** Background fill under glyphs (0 = black void, higher = more solid). */
  bgLevel: number;
  vignette: number;
  particleLimit: number;
}

export type PresetId = 'reference' | 'color' | 'mono' | 'highContrast' | 'cinematic' | 'performance';

export const PRESETS: Record<PresetId, { label: string; s: RenderSettings }> = {
  // 0.15 default: small 6×10 cells, short muted palette by layer (navy void, slate ground, mint foliage, pale stone)
  // and characters drawn unfiltered over the ASCII world with a crisp outline
  reference: {
    label: 'ASCII referência (padrão)',
    s: { cellSize: 10, internalRes: 2, density: 1, palette: 3, contrast: 1.2, edgeIntensity: 0.8, glow: 1, renderDistance: 36, grain: 0, lodDistance: 26, dither: 0.3, animSpeed: 1, bgLevel: 0.1, vignette: 0.3, particleLimit: 1500 },
  },
  color: {
    label: 'ASCII colorido',
    s: { cellSize: 8, internalRes: 2, density: 1, palette: 0, contrast: 1.2, edgeIntensity: 0.5, glow: 1, renderDistance: 34, grain: 0.04, lodDistance: 26, dither: 0.35, animSpeed: 1, bgLevel: 0.14, vignette: 0.35, particleLimit: 1500 },
  },
  mono: {
    label: 'ASCII monocromático',
    s: { cellSize: 10, internalRes: 2, density: 1, palette: 1, contrast: 1.25, edgeIntensity: 0.6, glow: 0.8, renderDistance: 34, grain: 0.05, lodDistance: 26, dither: 0.5, animSpeed: 1, bgLevel: 0.06, vignette: 0.4, particleLimit: 1500 },
  },
  highContrast: {
    label: 'ASCII alto contraste',
    s: { cellSize: 10, internalRes: 2, density: 0.9, palette: 2, contrast: 1.6, edgeIntensity: 1, glow: 1.2, renderDistance: 34, grain: 0, lodDistance: 30, dither: 0.2, animSpeed: 1, bgLevel: 0, vignette: 0.15, particleLimit: 1500 },
  },
  cinematic: {
    label: 'ASCII denso cinematográfico',
    s: { cellSize: 8, internalRes: 2, density: 1.15, palette: 0, contrast: 1.15, edgeIntensity: 0.45, glow: 1.4, renderDistance: 36, grain: 0.07, lodDistance: 30, dither: 0.5, animSpeed: 1, bgLevel: 0.22, vignette: 0.55, particleLimit: 2500 },
  },
  performance: {
    label: 'ASCII simplificado (desempenho)',
    s: { cellSize: 14, internalRes: 1, density: 0.9, palette: 0, contrast: 1.1, edgeIntensity: 0, glow: 0.6, renderDistance: 24, grain: 0, lodDistance: 14, dither: 0, animSpeed: 1, bgLevel: 0.1, vignette: 0.2, particleLimit: 300 },
  },
};

export const SETTING_RANGES: Record<keyof RenderSettings, { min: number; max: number; step: number; label: string }> = {
  cellSize: { min: 1, max: 18, step: 1, label: 'Tamanho das células em px (7–9 = equilíbrio; 12+ = letras grandes; 1 = um ponto)' },
  internalRes: { min: 1, max: 4, step: 1, label: 'Resolução interna' },
  density: { min: 0.5, max: 1.6, step: 0.05, label: 'Densidade de caracteres' },
  palette: { min: 0, max: 3, step: 1, label: 'Paleta (cor / mono / contraste / referência)' },
  contrast: { min: 0.6, max: 2, step: 0.05, label: 'Contraste' },
  edgeIntensity: { min: 0, max: 1.5, step: 0.05, label: 'Intensidade dos contornos' },
  glow: { min: 0, max: 2.5, step: 0.05, label: 'Brilho de magia' },
  renderDistance: { min: 12, max: 60, step: 1, label: 'Distância de renderização (m)' },
  grain: { min: 0, max: 0.2, step: 0.01, label: 'Granulação' },
  lodDistance: { min: 6, max: 60, step: 1, label: 'Detalhe por distância (m)' },
  dither: { min: 0, max: 1, step: 0.05, label: 'Dithering' },
  animSpeed: { min: 0, max: 2.5, step: 0.05, label: 'Velocidade das animações' },
  bgLevel: { min: 0, max: 0.5, step: 0.01, label: 'Preenchimento de fundo' },
  vignette: { min: 0, max: 1, step: 0.05, label: 'Vinheta' },
  particleLimit: { min: 100, max: 4000, step: 100, label: 'Limite de partículas' },
};

export function loadSettings(): RenderSettings {
  const base = { ...PRESETS.reference.s };
  try {
    const raw = localStorage.getItem('etherfall.render');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RenderSettings> & { v?: number };
      // 0.10: legible glyphs by default — older saves had tiny 5 px cells (dotted noise)
      if ((parsed.v ?? 1) < 3) {
        delete parsed.cellSize;
        delete parsed.contrast;
      }
      // 0.15: the reference look becomes the default; older tweaks start over from it
      if ((parsed.v ?? 1) < 4) for (const k of Object.keys(parsed)) delete (parsed as Record<string, unknown>)[k];
      for (const k of Object.keys(base) as (keyof RenderSettings)[]) {
        const v = parsed[k];
        const range = SETTING_RANGES[k];
        if (typeof v === 'number' && Number.isFinite(v)) base[k] = Math.min(range.max, Math.max(range.min, v));
      }
    }
  } catch {
    /* storage unavailable: defaults */
  }
  return base;
}

export function saveSettings(s: RenderSettings): void {
  try {
    localStorage.setItem('etherfall.render', JSON.stringify({ ...s, v: 4 }));
  } catch {
    /* ignore */
  }
}
