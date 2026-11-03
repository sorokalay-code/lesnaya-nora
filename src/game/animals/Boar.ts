import type { AppearanceOptions } from '../AnimalAppearance';
import { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';

/** Мирный кабан пасётся в лесу и отвечает на нападение; сам не охотится на кроликов. */
export class Boar extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'boar',
      x,
      z,
      rng,
      { health: 105, defense: 17, speed: 1.25, range: 10, radius: 0.8, mass: 4 },
      appearance,
    );
  }
}
