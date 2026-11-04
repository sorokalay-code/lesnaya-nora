import { Random } from '../Random';
import type { SaveData } from '../types';
import type { RabbitActor } from '../animals/RabbitActor';
import { AnimalRestraint } from '../animals/AnimalRestraint';

const CHECK_INTERVAL_SECONDS = 12;
const CONTACT_DISTANCE = 1.25;
const MUTANT_ATTACK_CHANCE = 0.07;
const FANGED_ATTACK_CHANCE = 0.18;

/** Проверяет редкое нападение при близком контакте и сохраняет отцовство без сцен случки. */
export class RabbitReproductiveThreat {
  private readonly rng: Random;
  private nextCheck = 0;

  constructor(private readonly save: SaveData) {
    this.rng = new Random(save.seed + 63491);
  }

  update(
    time: number,
    actors: readonly RabbitActor[],
    playerSheltered: boolean,
  ): string | undefined {
    if (time < this.nextCheck || this.save.pregnancy) return;
    this.nextCheck = time + CHECK_INTERVAL_SECONDS;
    const player = this.save.player;
    if (player.health <= 0 || playerSheltered) return;

    for (const actor of actors) {
      const father = actor.data;
      const anatomy = father.genes.anatomy;
      const mutation =
        anatomy.fangs || anatomy.legs !== 4 || anatomy.ears !== 2 || anatomy.eyes !== 2;
      if (
        !mutation ||
        !actor.alive ||
        actor.root.userData.conversing ||
        AnimalRestraint.active(actor.root)
      )
        continue;
      if (
        Math.hypot(actor.x - player.x, actor.root.position.y - player.y, actor.z - player.z) >
        CONTACT_DISTANCE
      )
        continue;
      if (!this.rng.chance(anatomy.fangs ? FANGED_ATTACK_CHANCE : MUTANT_ATTACK_CHANCE)) continue;

      this.save.pregnancy = { fatherId: father.id, progress: 0, trauma: true };
      return `Крол ${father.name} напал на крольчиху. Она забеременела от него. Риск отклонений у потомства повышен.`;
    }
  }
}
