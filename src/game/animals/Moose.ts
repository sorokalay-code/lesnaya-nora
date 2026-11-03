import { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';

/** Лось — крупное мирное животное с сильной ответной защитой. */
export class Moose extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'moose',
      x,
      z,
      rng,
      {
        swimSpeed: 2.2,
        health: 130,
        defense: 25,
        speed: 1.05,
        range: 10,
        radius: 1.1,
        mass: 6,
      },
      appearance,
    );
  }
}
