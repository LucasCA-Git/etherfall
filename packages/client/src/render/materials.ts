/**
 * Material ids written by the scene pass (RT1.r) and the glyph table used to build the atlas.
 * Each material owns one atlas row of 16 glyphs; the scene shaders choose the column
 * ("param") from local context: wind bend for grass, wave phase for water, blade angle, etc.
 */
export const Mat = {
  None: 0,
  Grass: 1,
  TallGrass: 2,
  Dirt: 3,
  Sand: 4,
  Water: 5,
  DeepWater: 6,
  Rock: 7,
  Ruin: 8,
  Canopy: 9,
  Trunk: 10,
  Stone: 11,
  Bush: 12,
  Fire: 13,
  PlayerBody: 14,
  EnemyBody: 15,
  Blade: 16,
  Shield: 17,
  Magic: 18,
  Blood: 19,
  Telegraph: 20,
  Leaf: 21,
  Spark: 22,
  Reflection: 23,
  Splash: 24,
  Dust: 25,
  Cloth: 26,
  Eyes: 27,
  Pine: 28,
} as const;

export type MatId = (typeof Mat)[keyof typeof Mat];

export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 32;
export const RAMP_ROW = 31;
export const EDGE_ROW = 30;

const r = (s: string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < ATLAS_COLS; i++) out.push(s[i % s.length]!);
  return out;
};

/** Row index == material id. Glyphs repeat to fill 16 columns. */
export const GLYPH_ROWS: Record<number, string[]> = {
  [Mat.None]: r([' ']),
  // grass: [upright x4][lean right '/' x4][lean left '\' x4][flattened x4]
  [Mat.Grass]: r([',', "'", '"', ';', '/', '/', ',', "'", '\\', '\\', '`', ',', '_', '-', '~', '.']),
  [Mat.TallGrass]: r(['|', '¦', '!', 'ı', '/', '╱', '/', '/', '\\', '╲', '\\', '\\', '~', '-', '_', '=']),
  [Mat.Dirt]: r(['.', ',', ':', '·', "'", '`', '.', '∙', '·', ':', ';', '.', '°', ',', '·', '.']),
  [Mat.Sand]: r(['·', '.', '∙', ':', '·', '˙', '.', '∴', '·', '.', ':', '∙', '.', '·', '˙', '.']),
  [Mat.Water]: r(['~', '≈', '∼', '~', '-', '≈', '~', '∽', '~', '≈', '~', '-', '·', '°', '·', '~']),
  [Mat.DeepWater]: r(['≈', '≋', '~', '≈', '∼', '≈', '≋', '~', '≈', '~', '≋', '≈', '∼', '~', '≈', '≋']),
  [Mat.Rock]: r(['^', '▲', '▓', '▒', '#', '%', '░', '^', '▲', '▒', '#', '▓', '%', 'n', '░', 'A']),
  [Mat.Ruin]: r(['┼', '╬', '═', '║', '╪', '╫', '▫', '□', '┬', '┴', '├', '┤', '·', '.', '░', '▪']),
  [Mat.Canopy]: r(['♣', '♠', '&', '%', '♣', '@', '*', '♣', '♠', '#', '&', '♣', '%', '♠', '*', '§']),
  [Mat.Trunk]: r(['│', '║', '|', '┃', '│', '║', '|', '│']),
  [Mat.Stone]: r(['▓', '█', '▒', '▓', '■', '▪', '█', '▓', '▒', '░', '▓', '█', '▒', '▓', '■', '█']),
  [Mat.Bush]: r(['*', '%', '&', '♣', '¥', 'ж', '*', '%', '♠', '&', '*', '%']),
  [Mat.Fire]: r(['*', '+', '^', '#', "'", '`', '¨', '^', '*', '+', '^', '#', '°', '•', '*', '^']),
  // body: 0 '@' core, 1-3 fill, 4-7 armor/robe, 8+ alt
  // body ramps are ordered dark -> bright: capsule limbs pick the column from their shading
  [Mat.PlayerBody]: ['.', ':', '-', '=', '+', '*', 'o', 'a', 'e', 'd', 'Q', '#', '%', '&', '@', 'M'],
  [Mat.EnemyBody]: ['.', ',', ':', ';', 'i', 'l', '1', 't', 'I', 'H', '#', 'X', '%', '&', '@', 'W'],
  // blade: orientation buckets 0 '─', 1 '╲', 2 '│', 3 '╱' (screen y grows downward)
  [Mat.Blade]: r(['─', '╲', '│', '╱', '-', '\\', '|', '/', '─', '╲', '│', '╱', '=', '\\', '‖', '/']),
  [Mat.Shield]: r(['◘', '■', '█', '▣', '◙', '■', '█', '◘']),
  [Mat.Magic]: r(['✦', '✧', '*', '+', '◆', '◇', '○', '●', '•', '◦', '∗', '※', '¤', '°', '×', '✦']),
  [Mat.Blood]: r(['·', '*', ',', '.', "'", '`', ':', ';', '•', '∙', '*', ',', '.', '·', "'", '~']),
  [Mat.Telegraph]: r(['·', '∙', '•', '○', '◦', '!', '×', '+', '·', '∙', '•', '○', '◦', 'x', '+', '·']),
  [Mat.Leaf]: r(["'", ',', '`', '♣', '.', '♠', "'", ',']),
  [Mat.Spark]: r(['*', '+', '×', '·', "'", '`', '^', '•', '*', '+', '×', '·', '∙', '°', '*', '+']),
  [Mat.Reflection]: r(['~', '≈', '∽', '-', '~', '≈', '·', '~']),
  [Mat.Splash]: r(['·', '°', 'o', '.', "'", '`', '∙', 'º']),
  [Mat.Dust]: r(['.', '·', "'", '`', ',', '∙', ':', '.']),
  [Mat.Cloth]: ['.', ':', '-', '~', '=', '+', '*', 'x', 'z', 's', '%', '#', '&', '8', '@', 'B'],
  [Mat.Eyes]: r(['•', '●', '◉', '*', '•', '●', '◉', '*']),
  [Mat.Pine]: r(['▲', '^', 'Λ', '♠', '▲', '^', 'Λ', 'A', '▲', '^', '♠', 'Λ', '^', '▲', 'A', '♠']),
  // edge glyphs by gradient orientation (0 '─', 1 '╱', 2 '│', 3 '╲')
  [EDGE_ROW]: r(['─', '╱', '│', '╲', '-', '/', '|', '\\']),
  // luminance ramp, dark -> bright
  [RAMP_ROW]: [' ', '.', '·', ':', '-', '=', '+', '*', 'o', 'x', '%', '#', '&', '8', '@', '█'],
};
