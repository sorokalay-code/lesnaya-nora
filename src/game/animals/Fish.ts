import type { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';
import type { GroundHeight } from './types';

/** Мирная рыба держится под поверхностью и не выходит на сушу. */
export class Fish extends ForestAnimal {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'fish',
      x,
      z,
      rng,
      { swimSpeed: 1.1, health: 18, defense: 0, speed: 0.95, range: 5, radius: 0.14, mass: 0.25 },
      appearance,
    );
  }

  protected override surfaceStep(x: number, z: number, _dt: number, groundAt: GroundHeight): void {
    const next = this.waterNavigation?.swimming(x, z);
    if (next) this.moveTo(x, z, Math.max(groundAt(x, z) + 0.15, next.level - 0.42));
    this.root.userData.swimming = true;
  }
}
