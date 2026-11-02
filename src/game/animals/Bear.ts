import { Random } from '../Random';
import { Predator } from './Predator';

/** Медведь имеет большой запас здоровья, массу и дистанцию удара. */
export class Bear extends Predator {
  constructor(x: number, z: number, rng: Random) {
    super('bear', x, z, rng, {
      health: 160,
      range: 12,
      runSpeed: 2.8,
      walkSpeed: 0.75,
      playerReach: 2.3,
      playerCooldown: 3,
      preyReach: 2.5,
      preyCooldown: 3,
      damage: 55,
      counterDamage: 35,
      dayRange: 7,
      alwaysHunts: false,
      radius: 1.15,
      mass: 7,
    });
  }
}
