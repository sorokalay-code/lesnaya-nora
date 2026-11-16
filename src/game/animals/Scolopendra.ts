import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { Predator } from './Predator';
import type { PredatorProfile } from './types';

const profile: PredatorProfile = {
  health: 35,
  range: 10,
  runSpeed: 3.6,
  walkSpeed: 1.15,
  playerReach: 1.05,
  playerCooldown: 5,
  preyReach: 1.35,
  preyCooldown: 5,
  damage: 16,
  counterDamage: 4,
  dayRange: 10,
  alwaysHunts: true,
  radius: 0.22,
  mass: 0.8,
};

/** Наземная сколопендра ищет только кроликов и мышей, сохраняя общую физику хищников. */
export class Scolopendra extends Predator {
  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('scolopendra', x, z, rng, profile, appearance);
  }

  override get huntsWildlife(): boolean {
    return false;
  }

  override get huntsRodents(): boolean {
    return true;
  }
}
