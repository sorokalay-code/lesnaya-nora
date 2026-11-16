import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';

const profile: WildlifeProfile = {
  health: 25,
  defense: 0,
  speed: 4.5,
  range: 14,
  radius: 0.16,
  mass: 0.9,
};

/** Бурундук ищет еду на лесной подстилке и быстро скрывается от хищников. */
export class Chipmunk extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('chipmunk', x, z, rng, profile, appearance);
  }
}
