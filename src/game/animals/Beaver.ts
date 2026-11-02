import { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';

/** Бобр кормится рядом с водой и может защититься от нападения. */
export class Beaver extends ForestAnimal {
  constructor(x: number, z: number, rng: Random) {
    super('beaver', x, z, rng, {
      health: 48,
      defense: 7,
      speed: 0.9,
      range: 6,
      radius: 0.52,
      mass: 2,
    });
  }
}
