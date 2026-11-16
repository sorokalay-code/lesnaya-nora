import type { Predator } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import type { Excavation } from '../Excavation';
import type { World } from '../World';
import { HawkVictims, type HawkPopulation, type HawkVictim } from './HawkVictims';
import type { PlayerConsequences } from './PlayerConsequences';

const SEARCH_INTERVAL = 0.45;
const MAX_CONTACT_HEIGHT = 0.8;
const MAX_WATER_DEPTH = 0.2;

interface Context extends HawkPopulation {
  earth: Pick<Excavation, 'isSheltered'>;
  world: Pick<World, 'waterAt'>;
  consequences: Pick<PlayerConsequences, 'predatorAttack'>;
  toast: (text: string) => void;
}

/** Выбирает для сколопендры достижимых кроликов и мышей и проверяет контакт при укусе. */
export class RodentHunting {
  private readonly sources: HawkVictims;
  private pursuits = new WeakMap<Predator, { next: number; prey?: HawkVictim }>();

  constructor(private readonly context: Context) {
    this.sources = new HawkVictims(context);
  }

  resetTargets(): void {
    this.pursuits = new WeakMap();
  }

  target(predator: Predator, time: number, canAttackFamily: boolean): HawkVictim | undefined {
    if (predator.underground) return;
    let pursuit = this.pursuits.get(predator);
    if (!pursuit || time >= pursuit.next) {
      let closest = predator.range;
      pursuit = { next: time + SEARCH_INTERVAL };
      for (const prey of this.sources.rodents()) {
        const { x, z } = prey.root.position;
        const distance = Math.hypot(x - predator.x, z - predator.z);
        if (
          distance >= closest ||
          !predator.canPursue(x, z) ||
          !this.available(prey, canAttackFamily)
        )
          continue;
        closest = distance;
        pursuit.prey = prey;
      }
      this.pursuits.set(predator, pursuit);
    }

    const prey = pursuit.prey;
    if (
      prey &&
      predator.canPursue(prey.root.position.x, prey.root.position.z) &&
      this.available(prey, canAttackFamily)
    )
      return prey;
  }

  strike(predator: Predator, prey: HawkVictim, time: number): void {
    if (!predator.canMelee || predator.attackCooldown > 0) return;
    const { x, y, z } = prey.root.position;
    if (
      Math.abs(y - predator.root.position.y) > MAX_CONTACT_HEIGHT ||
      Math.hypot(x - predator.x, z - predator.z) > predator.profile.preyReach
    )
      return;

    predator.attackCooldown = predator.profile.preyCooldown;
    predator.playAttack(time);
    if (prey.player) {
      this.context.consequences.predatorAttack(predator.kind);
      return;
    }

    prey.hurt(predator.profile.damage);
    if (prey.related) this.context.toast(`Сколопендра укусила члена семьи: ${prey.name}.`);
  }

  private available(prey: HawkVictim, canAttackFamily: boolean): boolean {
    const { x, y, z } = prey.root.position;
    return (
      prey.alive() &&
      (canAttackFamily || !prey.related) &&
      !AnimalRestraint.active(prey.root) &&
      !prey.root.userData.conversing &&
      !this.context.earth.isSheltered(x, y, z) &&
      (this.context.world.waterAt?.(x, z)?.depth ?? 0) <= MAX_WATER_DEPTH
    );
  }
}
