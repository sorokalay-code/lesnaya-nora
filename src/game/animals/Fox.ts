import { Random } from '../Random';
import { Predator } from './Predator';

/** Лиса охотится преимущественно в сумерках и может проникать в неглубокие ходы. */
export class Fox extends Predator {
  constructor(x: number, z: number, rng: Random) {
    super('fox', x, z, rng, {
      health: 45,
      range: 11,
      runSpeed: 3.3,
      walkSpeed: 0.75,
      playerReach: 1.5,
      playerCooldown: 3,
      preyReach: 1.45,
      preyCooldown: 3,
      damage: 24,
      counterDamage: 12,
      dayRange: 7,
      alwaysHunts: false,
      radius: 0.62,
      mass: 3,
    });
  }
}
