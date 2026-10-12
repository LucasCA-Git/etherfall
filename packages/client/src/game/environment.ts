/**
 * Day/night and wind, derived purely from the authoritative tick time so every
 * client sees the same sky (server-synchronized by construction).
 */
export const DAY_LENGTH_SEC = 480;
/** Time-of-day at tick 0 (0 = midnight, 0.5 = noon). Starts in the late afternoon. */
export const DAY_START = 0.66;

export interface EnvState {
  timeOfDay: number;
  sun: number;
  sunLight: number;
  ambient: [number, number, number];
  sunOffset: [number, number];
  windDir: [number, number];
  windStrength: number;
  label: string;
  /** Rain intensity 0..1 (weather cycles of ~10 min; storms above 0.8). */
  rain: number;
  storm: boolean;
}

const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Deterministic weather from the authoritative clock (every client sees the same rain). */
export function rainAt(seconds: number): number {
  // starts dry; it rains ~30% of the time, mostly a light drizzle that only rarely builds into a storm
  const w = 0.5 + 0.35 * Math.sin(seconds * 0.0105 - Math.PI / 2) + 0.15 * Math.sin(seconds * 0.037 + 2.1);
  return smooth(0.68, 0.8, w) * 0.6 + smooth(0.88, 0.96, w) * 0.4;
}

export function environmentAt(seconds: number, dayOffset = 0, rainOverride: number | null = null): EnvState {
  const tod = (((seconds / DAY_LENGTH_SEC + DAY_START + dayOffset) % 1) + 1) % 1;
  const sun = Math.sin((tod - 0.25) * Math.PI * 2);
  const day = Math.min(1, Math.max(0, sun * 2.4 + 0.25));
  const night = [0.2, 0.24, 0.42];
  const noon = [1.02, 0.98, 0.9];
  let ambient = mix3(night, noon, day);
  const twilight = Math.max(0, 1 - Math.abs(sun) * 3.5);
  ambient = mix3(ambient, [1.0, 0.55, 0.33], twilight * 0.45);
  const sunLight = Math.min(1, Math.max(0, sun * 1.6));
  const a = tod * Math.PI * 2;
  const len = sun > 0 ? 0.35 + (1 - sun) * 1.1 : 0.25;
  const sunOffset: [number, number] = [Math.cos(a) * len, Math.abs(Math.sin(a)) * len * 0.4 + 0.15];
  const wa = 0.6 + Math.sin(seconds * 0.013) * 1.1;
  const rain = rainOverride ?? rainAt(seconds);
  const windStrength = Math.max(0.12, 0.5 + 0.3 * Math.sin(seconds * 0.05) + 0.2 * Math.sin(seconds * 0.31 + 1.3)) * (1 + rain * 0.9);
  // overcast: darker, colder light, softer shadows
  ambient = mix3(ambient, [ambient[0] * 0.62, ambient[1] * 0.68, ambient[2] * 0.8], rain);
  const h = Math.floor(tod * 24);
  const label = h >= 5 && h < 7 ? 'Alvorada' : h >= 7 && h < 17 ? 'Dia' : h >= 17 && h < 19 ? 'Crepúsculo' : 'Noite';
  const sky = rain > 0.8 ? 'Tempestade' : rain > 0.15 ? 'Chuva' : '';
  return {
    timeOfDay: tod, sun, sunLight: sunLight * (1 - rain * 0.6), ambient, sunOffset, windDir: [Math.cos(wa), Math.sin(wa)], windStrength,
    label: sky ? `${label} · ${sky}` : label, rain, storm: rain > 0.8,
  };
}
