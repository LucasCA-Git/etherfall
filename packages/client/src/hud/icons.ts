import { ACTIONS, type Element, type TalentEffects, type TalentStat } from '@etherfall/shared';

/**
 * Skill icons drawn as ASCII art, in the same language as the world: a 9×9 grid of glyphs per
 * motif, coloured by the skill's element, with a soft glow on a dark tile. Rendered once per
 * (motif, colour, size) into a canvas / data URL and cached.
 */
const M = (rows: string[]): string[] => rows;
export const MOTIFS: Record<string, string[]> = {
  sword: M(['........*', '.......//', '......//.', '.....//..', '.\\..//...', '..\\//....', '..#\\.....', '.#..\\....', '#........']),
  swords: M(['*.......*', '\\\\.....//', '.\\\\...//.', '..\\\\.//..', '...\\X/...', '..//.\\\\..', '.#/...\\#.', '#.......#', '.........']),
  dagger: M(['......./.', '....../#.', '...../#..', '..../#...', '.../#....', '..X#.....', '..#X.....', '.#.......', '#........']),
  daggers: M(['/.......\\', '#/.....\\#', '.#/...\\#.', '..#/.\\#..', '...X.X...', '..#...#..', '.#.....#.', '#.......#', '.........']),
  axe: M(['...###...', '..#@@@#..', '.#@@|@@#.', '.#@@|@@#.', '..#@|@#..', '....|....', '....|....', '....|....', '....|....']),
  hammer: M(['.#######.', '.#@@@@@#.', '.#######.', '....|....', '....|....', '....|....', '....|....', '....|....', '...===...']),
  arrow: M(['.......^.', '......//.', '.....//..', '....//...', '...//....', '..//.....', '.\\/......', '=/.......', '.\\.......']),
  arrows: M(['..^..^..^', '..|..|..|', '..|..|..|', '..|..|..|', '..|..|..|', '..|..|..|', '.vv.vv.vv', '.........', '.........']),
  shield: M(['.#######.', '.#@@|@@#.', '.#@@|@@#.', '.#--+--#.', '.#@@|@@#.', '..#@|@#..', '..#@|@#..', '...#|#...', '....V....']),
  tower: M(['.#.#.#.#.', '.#######.', '.#|...|#.', '.#..#..#.', '.#.###.#.', '.#..#..#.', '.#.....#.', '.#..^..#.', '.#######.']),
  cross: M(['...###...', '...#@#...', '.#######.', '.#@@@@@#.', '.#######.', '...#@#...', '...#@#...', '...#@#...', '...###...']),
  fire: M(['....(....', '...((....', '..(@(.)..', '..(@@(.).', '.(@@@@)).', '.(@**@@).', '.(@****).', '..(****).', '...(@@)..']),
  comet: M(['\\\\.......', '.\\\\\\.....', '..\\\\\\....', '...\\\\\\...', '....\\@@..', '....@##@.', '....@##@.', '.....@@..', '.........']),
  snow: M(['....|....', '.\\..|../.', '..\\.|./..', '...\\|/...', '----*----', '.../|\\...', '../.|.\\..', './..|..\\.', '....|....']),
  cloud: M(['...@@@...', '.@@@@@@@.', '@@@@@@@@@', '.@@@@@@@.', '.........', '.*..*..*.', '...*..*..', '.*..*..*.', '.........']),
  star: M(['....*....', '....*....', '.\\..*../.', '..\\.*./..', '***@@@***', '../.*.\\..', './..*..\\.', '....*....', '....*....']),
  swirl: M(['..@@@@@..', '.@.....@.', '@..@@@..@', '@.@...@.@', '@.@.@.@.@', '@.@..@..@', '@..@@...@', '.@......@', '..@@@@@@.']),
  sun: M(['\\...|.../', '.\\..|../.', '...@@@...', '..@@@@@..', '-@@@@@@@-', '..@@@@@..', '...@@@...', './..|..\\.', '/...|...\\']),
  halo: M(['..@@@@@..', '.@.....@.', '..@@@@@..', '....o....', '...ooo...', '..ooooo..', '...ooo...', '...o.o...', '..o...o..']),
  chain: M(['.OO......', 'O..O.....', 'O..OOO...', '.OO...O..', '..O...O..', '...OOO..O', '.....O..O', '......OO.', '.........']),
  leaf: M(['......@@@', '....@@@@@', '...@@@/@@', '..@@@/@@.', '..@@/@@..', '.@@/@@...', '.@/@@....', './.......', '/........']),
  paw: M(['..@...@..', '.@@@.@@@.', '..@...@..', '@@.....@@', '@@.@@@.@@', '..@@@@@..', '.@@@@@@@.', '.@@@@@@@.', '..@@.@@..']),
  wing: M(['@@.......', '@@@@.....', '.@@@@@...', '..@@@@@@.', '...@@@@@@', '..@@@@@@.', '.@@@@@...', '@@@@.....', '@@.......']),
  drop: M(['....@....', '...@@@...', '...@@@...', '..@@@@@..', '.@@@@@@@.', '.@@@@@@@.', '.@@@@@.@.', '..@@@@@..', '...@@@...']),
  skull: M(['..@@@@@..', '.@@@@@@@.', '@@@@@@@@@', '@@..@..@@', '@@..@..@@', '.@@@.@@@.', '..@@@@@..', '..@.@.@..', '.........']),
  mask: M(['.........', '@@@@@@@@@', '@@@@@@@@@', '@..@@@..@', '@..@@@..@', '@@@@@@@@@', '.@@@.@@@.', '..@@@@@..', '....@....']),
  eye: M(['.........', '...@@@...', '.@@...@@.', '@..@@@..@', '@.@@#@@.@', '@..@@@..@', '.@@...@@.', '...@@@...', '.........']),
  flask: M(['...###...', '....#....', '....#....', '...#.#...', '..#...#..', '.#@@@@@#.', '#@@@@@@@#', '#@@@@@@@#', '.#######.']),
  flag: M(['|@@@@@@..', '|@@@@@@@.', '|@@@@@@..', '|@@@@@...', '|@@@@@@..', '|........', '|........', '|........', '|........']),
  horn: M(['.........', '.......@@', '.....@@.@', '...@@...@', '@@@.....@', '...@@...@', '.....@@.@', '.......@@', '.........']),
  bolt: M(['.....@@..', '....@@...', '...@@....', '..@@@@@@.', '.....@@..', '....@@...', '...@@....', '..@@.....', '.@.......']),
  ghost: M(['..@@@@@..', '.@@@@@@@.', '@@.@@@.@@', '@@.@@@.@@', '@@@@@@@@@', '@@@@@@@@@', '@@@@@@@@@', '@.@@.@@.@', '.........']),
  horns: M(['@.......@', '@@.....@@', '.@@...@@.', '..@@@@@..', '.@@@@@@@.', '.@.@@@.@.', '.@@@@@@@.', '..@@.@@..', '...@@@...']),
  scythe: M(['.@@@@@@..', '@@.....@@', '@.......@', '........|', '.......|.', '......|..', '.....|...', '....|....', '...|.....']),
  moon: M(['...@@@@..', '..@@@....', '.@@@.....', '.@@@.....', '.@@@.....', '.@@@.....', '..@@@....', '...@@@@..', '.........']),
  tentacle: M(['......@..', '.....@.@.', '.....@...', '....@....', '...@@....', '...@.....', '..@@.....', '.@@@.....', '@@@@.....']),
  fist: M(['.........', '.@@@@@@..', '@@@@@@@@.', '@@@@@@@@@', '@@@@@@@@@', '.@@@@@@@@', '..@@@@@@.', '..@@@@@..', '.........']),
  heart: M(['.........', '.@@...@@.', '@@@@.@@@@', '@@@@@@@@@', '@@@@@@@@@', '.@@@@@@@.', '..@@@@@..', '...@@@...', '....@....']),
  feet: M(['.........', '...@@.@@.', '..@@@@@..', '.@@@@....', '@@@.@@@..', '....@@@@.', '.....@@@@', '......@@.', '.........']),
  gem: M(['.........', '...@@@...', '..@@@@@..', '.@@@@@@@.', '@@@@@@@@@', '.@@@@@@@.', '..@@@@@..', '...@@@...', '....@....']),
  keystone: M(['....@....', '...@@@...', '..@@#@@..', '.@@###@@.', '@@##@##@@', '.@@###@@.', '..@@#@@..', '...@@@...', '....@....']),
};

export const ELEMENT_COLOR: Record<Element, string> = {
  physical: '#dcdcdc', holy: '#ffd76a', fire: '#ff7a33', frost: '#8fdcff', arcane: '#b48cff', shadow: '#a37be0',
  nature: '#7fd36a', poison: '#8dff5a', blood: '#e8473f', lightning: '#9fd0ff', illusion: '#e2a8ff', spirit: '#7fe0d6',
};

/** Icon and element for the class kits (the tree skills carry their own in ActionDef). */
const BASE: Record<string, [string, Element]> = {
  dodge: ['feet', 'physical'], block: ['shield', 'physical'],
  longsword_light: ['sword', 'physical'], longsword_heavy: ['fist', 'physical'], staff_light: ['star', 'arcane'], staff_heavy: ['swirl', 'arcane'],
  bow_shot: ['arrow', 'physical'], bow_power: ['arrow', 'physical'], dagger_light: ['dagger', 'physical'], dagger_heavy: ['daggers', 'physical'],
  axe_light: ['axe', 'physical'], axe_heavy: ['axe', 'blood'], warlock_heavy: ['swirl', 'shadow'],
  vanguard_seismic: ['fist', 'physical'], vanguard_charge: ['feet', 'physical'], vanguard_rising: ['sword', 'physical'], vanguard_ironguard: ['shield', 'physical'], vanguard_counter: ['swords', 'physical'], vanguard_fury: ['swirl', 'blood'],
  arcanist_bolt: ['star', 'arcane'], arcanist_step: ['swirl', 'arcane'], arcanist_icelance: ['snow', 'frost'], arcanist_rupture: ['swirl', 'arcane'], arcanist_seal: ['chain', 'arcane'], arcanist_collapse: ['comet', 'arcane'],
  healer_light: ['cross', 'holy'], healer_aegis: ['shield', 'holy'], healer_smite: ['sun', 'holy'], healer_sanctuary: ['halo', 'holy'], healer_purify: ['drop', 'holy'], healer_dawn: ['sun', 'holy'],
  ranger_volley: ['arrows', 'physical'], ranger_leap: ['feet', 'nature'], ranger_poison: ['arrow', 'poison'], ranger_trap: ['chain', 'physical'], ranger_rain: ['arrows', 'nature'], ranger_hawkeye: ['eye', 'nature'],
  rogue_venom: ['dagger', 'poison'], rogue_shadowstep: ['feet', 'shadow'], rogue_knives: ['daggers', 'physical'], rogue_smoke: ['cloud', 'shadow'], rogue_assassinate: ['skull', 'blood'], rogue_dance: ['swords', 'physical'],
  barb_warcry: ['horn', 'blood'], barb_leap: ['feet', 'physical'], barb_whirl: ['swirl', 'physical'], barb_stun: ['fist', 'physical'], barb_throw: ['axe', 'physical'], barb_rage: ['horns', 'blood'],
  warlock_bolt: ['star', 'shadow'], warlock_step: ['swirl', 'shadow'], warlock_drain: ['drop', 'blood'], warlock_well: ['swirl', 'shadow'], warlock_hex: ['skull', 'shadow'], warlock_abyss: ['tentacle', 'shadow'],
  warlock_imps: ['horns', 'fire'], warlock_guardian: ['ghost', 'shadow'],
};

const STAT_ICON: Record<TalentStat, [string, Element]> = {
  dmg: ['fist', 'blood'], dmgPhysical: ['sword', 'physical'], dmgArcane: ['star', 'arcane'], maxHp: ['heart', 'blood'], maxStamina: ['feet', 'nature'],
  maxMana: ['swirl', 'frost'], manaRegen: ['drop', 'frost'], staminaRegen: ['feet', 'nature'], cooldown: ['swirl', 'lightning'], healPower: ['cross', 'holy'],
  blockAbsorb: ['shield', 'physical'], poise: ['tower', 'physical'], critChance: ['eye', 'fire'], lifesteal: ['drop', 'blood'], berserk: ['skull', 'blood'],
  slowPower: ['snow', 'frost'], dotPower: ['flask', 'poison'], moveSpeed: ['wing', 'spirit'], armor: ['shield', 'physical'],
};

/** Motif + colour of an action (tree skills carry them; kits use the table above). */
export function actionIcon(actionId: string): { motif: string; color: string } {
  const a = ACTIONS[actionId];
  if (a?.icon && MOTIFS[a.icon]) return { motif: a.icon, color: ELEMENT_COLOR[a.element ?? 'physical'] };
  const b = BASE[actionId];
  if (b) return { motif: b[0], color: ELEMENT_COLOR[b[1]] };
  return { motif: a?.projectile ? 'star' : 'sword', color: ELEMENT_COLOR.physical };
}

/** Motif for a passive node: the first stat it grants. */
export function statIcon(effects: TalentEffects): { motif: string; color: string } {
  const k = Object.keys(effects)[0] as TalentStat | undefined;
  const s: [string, Element] = k ? STAT_ICON[k] : ['gem', 'physical'];
  return { motif: s[0], color: ELEMENT_COLOR[s[1]] };
}

const cache = new Map<string, HTMLCanvasElement>();

/** A rendered icon tile (shared canvas: copy it with drawImage, or use iconUrl). */
export function iconCanvas(motif: string, color: string, size = 64, frame = true): HTMLCanvasElement {
  const key = `${motif}|${color}|${size}|${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  if (frame) {
    const bg = g.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.7);
    bg.addColorStop(0, 'rgba(40,44,60,1)');
    bg.addColorStop(1, 'rgba(6,7,12,1)');
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    g.strokeStyle = color;
    g.globalAlpha = 0.55;
    g.lineWidth = Math.max(1, size / 32);
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, size - g.lineWidth, size - g.lineWidth);
    g.globalAlpha = 1;
  }
  const rows = MOTIFS[motif] ?? MOTIFS.gem!;
  const pad = size * 0.1;
  const cw = (size - pad * 2) / 9;
  g.font = `bold ${Math.round(cw * 1.25)}px "DejaVu Sans Mono", Consolas, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = size / 12;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length && x < 9; x++) {
      const ch = row[x]!;
      if (ch === '.' || ch === ' ') continue;
      // highlights ('*', 'o') glow white; '#' is a dimmer outline
      g.fillStyle = ch === '*' || ch === 'o' || ch === 'O' ? '#ffffff' : color;
      g.globalAlpha = ch === '#' ? 0.75 : 1;
      g.fillText(ch, pad + (x + 0.5) * cw, pad + (y + 0.55) * cw);
    }
  });
  g.globalAlpha = 1;
  cache.set(key, c);
  return c;
}

const urls = new Map<string, string>();
export function iconUrl(motif: string, color: string, size = 64): string {
  const key = `${motif}|${color}|${size}`;
  let u = urls.get(key);
  if (!u) {
    u = iconCanvas(motif, color, size).toDataURL();
    urls.set(key, u);
  }
  return u;
}

export function actionIconUrl(actionId: string, size = 64): string {
  const i = actionIcon(actionId);
  return iconUrl(i.motif, i.color, size);
}
