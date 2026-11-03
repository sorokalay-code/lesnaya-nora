import { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { Predator } from './Predator';

/** Ласка активна и днём, быстро бегает и проникает в узкие ходы. */
export class Weasel extends Predator {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'weasel',
      x,
      z,
      rng,
      {
        health: 28,
        range: 9,
        runSpeed: 4.4,
        walkSpeed: 1.15,
        playerReach: 1.5,
        playerCooldown: 3,
        preyReach: 1.45,
        preyCooldown: 3,
        damage: 24,
        counterDamage: 12,
        dayRange: 7,
        alwaysHunts: true,
        radius: 0.62,
        mass: 3,
      },
      appearance,
    );
  }
}
