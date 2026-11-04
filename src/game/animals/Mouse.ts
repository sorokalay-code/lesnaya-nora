import type { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';

/** Мышь быстро бегает и прячется от опасности. */
export class Mouse extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'mouse',
      x,
      z,
      rng,
      { health: 12, defense: 0, speed: 1.65, range: 6, radius: 0.105, mass: 0.15 },
      appearance,
    );
  }
}
