import { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { Predator } from './Predator';

/** Змея медленно перемещается и атакует с более долгой перезарядкой. */
export class Snake extends Predator {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'snake',
      x,
      z,
      rng,
      {
        swimSpeed: 1.3,
        health: 20,
        range: 5,
        runSpeed: 2.1,
        walkSpeed: 0.45,
        playerReach: 1.5,
        playerCooldown: 6,
        preyReach: 1.45,
        preyCooldown: 5,
        damage: 19,
        counterDamage: 12,
        dayRange: 7,
        alwaysHunts: true,
        radius: 0.28,
        mass: 3,
      },
      appearance,
    );
  }
}
