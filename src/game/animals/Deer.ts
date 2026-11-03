import { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';

/** Олень далеко гуляет по лесу и быстро убегает от опасности. */
export class Deer extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'deer',
      x,
      z,
      rng,
      {
        health: 65,
        defense: 5,
        speed: 1.55,
        range: 11,
        radius: 0.74,
        mass: 2,
      },
      appearance,
    );
  }
}
