import { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';

/** Ёж движется медленно, но способен нанести ответный урон. */
export class Hedgehog extends ForestAnimal {
  constructor(x: number, z: number, rng: Random) {
    super('hedgehog', x, z, rng, {
      health: 30,
      defense: 4,
      speed: 0.65,
      range: 4.5,
      radius: 0.34,
      mass: 2,
    });
  }
}
