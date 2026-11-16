import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';

const profile: WildlifeProfile = {
  health: 46,
  defense: 3,
  speed: 3.3,
  range: 17,
  radius: 0.29,
  mass: 4,
};

/** Сурок — осторожный житель лугов с короткими быстрыми перебежками. */
export class Marmot extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('marmot', x, z, rng, profile, appearance);
  }
}
