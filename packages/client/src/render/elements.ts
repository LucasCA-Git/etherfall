import type { Element } from '@etherfall/shared';
import type { RGB } from './instances';

/** Linear colours of the skill elements (projectiles, zones, strikes, lights). */
export const ELEMENT_RGB: Record<Element, RGB> = {
  physical: [0.85, 0.85, 0.88],
  holy: [1.0, 0.85, 0.45],
  fire: [1.0, 0.5, 0.15],
  frost: [0.55, 0.85, 1.0],
  arcane: [0.65, 0.45, 1.0],
  shadow: [0.6, 0.4, 0.95],
  nature: [0.45, 0.9, 0.35],
  poison: [0.45, 1.0, 0.3],
  blood: [1.0, 0.2, 0.18],
  lightning: [0.7, 0.85, 1.0],
  illusion: [0.9, 0.65, 1.0],
  spirit: [0.5, 0.95, 0.9],
};
