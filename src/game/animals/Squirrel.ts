import { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';

/** Белка быстро перемещается, собирает растительную пищу и избегает хищников. */
export class Squirrel extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'squirrel',
      x,
      z,
      rng,
      {
        health: 23,
        defense: 0,
        speed: 1.45,
        range: 7,
        radius: 0.34,
        mass: 2,
      },
      appearance,
    );
  }
}
