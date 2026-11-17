import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';
import type { DigNode } from '../types';

const PROFILE: WildlifeProfile = {
  swimSpeed: 1.6,
  swimImmersion: 0.14,
  health: 12,
  defense: 0,
  speed: 0.95,
  range: 4.5,
  radius: 0.17,
  mass: 0.16,
};

/** Лягушка держится у болотной воды, плавает на глубине и не питается наземными растениями. */
export class Frog extends ForestAnimal {
  private wintering = false;

  override get inShelter(): boolean {
    return this.wintering || super.inShelter;
  }

  restForWinter(winter: boolean, at: DigNode): void {
    if (winter === this.wintering) return;
    this.wintering = winter;
    if (winter) this.moveTo(at.x, at.z, at.y - 0.06);
  }

  override update(...args: Parameters<ForestAnimal['update']>): boolean {
    if (this.wintering) return false;
    return super.update(...args);
  }

  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('frog', x, z, rng, PROFILE, appearance);
  }
}
