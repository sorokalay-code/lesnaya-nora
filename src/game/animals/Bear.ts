import type { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';

/** Мирный медведь кормится и защищается только в ответ на нападение. */
export class Bear extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'bear',
      x,
      z,
      rng,
      { swimSpeed: 1.8, health: 160, defense: 35, speed: 0.8, range: 14, radius: 1.15, mass: 7 },
      appearance,
    );
  }
}
