import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';

const PROFILE: WildlifeProfile = {
  swimSpeed: 1.6,
  swimImmersion: 0.14,
  health: 12,
  defense: 0,
  speed: 0.95,
  range: 4.5,
  radius: 0.17,
  mass: 0.16,
};

/** Лягушка держится у болотной воды, плавает на глубине и не питается наземными растениями. */
export class Frog extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('frog', x, z, rng, PROFILE, appearance);
  }
}
