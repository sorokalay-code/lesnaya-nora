import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';

const profile: WildlifeProfile = {
  health: 34,
  defense: 0,
  speed: 4.2,
  range: 23,
  radius: 0.28,
  mass: 2.1,
};

/** Фазан кормится и убегает по земле на опушках и лугах. */
export class Pheasant extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('pheasant', x, z, rng, profile, appearance);
  }
}
