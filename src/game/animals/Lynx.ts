import { Random } from '../Random';
import { Predator } from './Predator';

/** Рысь замечает добычу дальше днём и быстро сокращает дистанцию. */
export class Lynx extends Predator {
  constructor(x: number, z: number, rng: Random) {
    super('lynx', x, z, rng, {
      health: 60,
      range: 14,
      runSpeed: 4.15,
      walkSpeed: 0.75,
      playerReach: 1.5,
      playerCooldown: 3,
      preyReach: 1.45,
      preyCooldown: 3,
      damage: 31,
      counterDamage: 12,
      dayRange: 10,
      alwaysHunts: false,
      radius: 0.62,
      mass: 3,
    });
  }
}
