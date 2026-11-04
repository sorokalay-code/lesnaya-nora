import type { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';

/** Утка перемещается по берегу и плавает на поверхности. */
export class Duck extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'duck',
      x,
      z,
      rng,
      { swimSpeed: 1.8, health: 28, defense: 0, speed: 1.1, range: 7, radius: 0.23, mass: 0.45 },
      appearance,
    );
  }
}
