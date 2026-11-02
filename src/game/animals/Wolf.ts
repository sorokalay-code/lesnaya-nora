import { Random } from '../Random';
import { Predator } from './Predator';

/** Волк быстро преследует добычу и опасен на открытых тропах. */
export class Wolf extends Predator {
  constructor(x: number, z: number, rng: Random) {
    super('wolf', x, z, rng, {
      health: 75,
      range: 15,
      runSpeed: 3.7,
      walkSpeed: 0.75,
      playerReach: 1.5,
      playerCooldown: 3,
      preyReach: 1.9,
      preyCooldown: 3,
      damage: 38,
      counterDamage: 22,
      dayRange: 7,
      alwaysHunts: false,
      radius: 0.77,
      mass: 3,
    });
  }
}
