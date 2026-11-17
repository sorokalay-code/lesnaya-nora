import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';

const profile: WildlifeProfile = {
  health: 26,
  defense: 0,
  speed: 2.1,
  range: 9,
  radius: 0.17,
  mass: 1.1,
};

/** Крот делает короткие вылазки около кротовин и скрывается от хищников. */
export class Mole extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('mole', x, z, rng, profile, appearance);
  }
}
