import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';

const PROFILE: WildlifeProfile = {
  health: 48,
  defense: 0,
  speed: 1.9,
  range: 14,
  radius: 0.58,
  mass: 1.4,
};

/** Косуля — пугливое мирное животное, которое спасается бегством, а не вступает в бой. */
export class RoeDeer extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('roe-deer', x, z, rng, PROFILE, appearance);
  }
}
