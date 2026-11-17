import type { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';
import type { GroundHeight } from './types';
import { FISH_MIN_DEPTH, inWaterPath } from '../AquaticHabitats';

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

  protected override surfaceStep(
    x: number,
    z: number,
    _dt: number,
    groundAt: GroundHeight,
  ): boolean {
    const terrain = this.waterNavigation?.terrain;
    const next = terrain?.waterAt(x, z);
    const body = this.waterBody ?? next?.body.id;
    const clear =
      terrain &&
      next &&
      body &&
      inWaterPath((px, pz) => terrain.waterAt(px, pz), this, { x, z }, body, FISH_MIN_DEPTH);
    const moving = !!clear && (x !== this.x || z !== this.z);
    if (clear && next) this.moveTo(x, z, Math.max(groundAt(x, z) + 0.15, next.level - 0.42));
    this.root.userData.swimming = true;
    return moving;
  }
}
