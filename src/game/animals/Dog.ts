import { Random } from '../Random';
import { Predator } from './Predator';

/** Сторожевой пёс активно защищает огород независимо от времени суток. */
export class Dog extends Predator {
  constructor(x: number, z: number, rng: Random) {
    super('dog', x, z, rng, {
      health: 70,
      range: 13,
      runSpeed: 3.3,
      walkSpeed: 0.75,
      playerReach: 1.5,
      playerCooldown: 3,
      preyReach: 1.45,
      preyCooldown: 3,
      damage: 32,
      counterDamage: 12,
      dayRange: 7,
      alwaysHunts: true,
      radius: 0.62,
      mass: 3,
    });
  }
}
