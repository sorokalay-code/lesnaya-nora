import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { FlyingRaptor } from './FlyingRaptor';

/** Сокол патрулирует открытые места, хватает добычу и поднимает её в воздух. */
export class Hawk extends FlyingRaptor {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('hawk', x, z, rng, { height: 13, diveCooldown: 35, cruiseSpeed: 5.5 }, appearance);
  }
}
