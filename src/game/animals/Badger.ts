import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';

const profile: WildlifeProfile = {
  health: 85,
  defense: 15,
  speed: 2.9,
  range: 20,
  radius: 0.43,
  mass: 10,
};

/** Барсук держится леса и защищается, если на него напали. */
export class Badger extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('badger', x, z, rng, profile, appearance);
  }
}
