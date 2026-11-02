import type { Excavation } from './Excavation';
import { Random } from './Random';
import { Predator, RabbitActor } from './animals';
import type { PredatorKind, SaveData } from './types';

export type TunnelEvent = {
  type: 'predator-entered' | 'predator-attack' | 'kit-attack';
  kind: PredatorKind;
  name?: string;
};

/** Управляет проникновением животных в открытые ходы и угрозами подземной семье. */

export class ExcavationTraffic {
  private visits = new Map<Predator, { x: number; z: number; until: number; lastHit: number }>();

  constructor(private readonly rng: Random) {}

  update(
    dt: number,
    time: number,
    night: boolean,
    predators: Predator[],
    rabbits: RabbitActor[],
    save: SaveData,
    earth: Excavation,
    combatAllowed = true,
  ): TunnelEvent[] {
    const events: TunnelEvent[] = [];
    for (const actor of rabbits) {
      if (actor.data.id === save.mateId || actor.rig.root.userData.conversing) continue;

      if (
        actor.data.trust < 55 ||
        !earth.isSheltered(save.player.x, save.player.y, save.player.z)
      ) {
        actor.leaveTunnel();
        continue;
      }

      const opening = earth.openings.find(
        (o) => Math.hypot(actor.data.x - o.x, actor.data.z - o.z) < 2,
      );
      if (!opening) {
        actor.leaveTunnel();
        continue;
      }

      actor.enterTunnel(opening.x + 0.25, opening.y - 0.95, opening.z + 0.25);
    }

    for (const predator of predators) {
      if (predator.kind !== 'fox' && predator.kind !== 'weasel') continue;

      const visit = this.visits.get(predator);
      if (visit) {
        if (time > visit.until) {
          this.visits.delete(predator);
          predator.leaveTunnel();
          continue;
        }

        const opening = earth.openings.find((o) => Math.hypot(o.x - visit.x, o.z - visit.z) < 0.3);
        if (!opening) continue;

        predator.enterTunnel(
          opening.x + Math.sin(time) * 0.25,
          opening.y - 0.95,
          opening.z + Math.cos(time) * 0.25,
        );
        if (
          combatAllowed &&
          earth.isSheltered(save.player.x, save.player.y, save.player.z) &&
          earth.depthAt(save.player.x, save.player.y, save.player.z) <
            (predator.kind === 'weasel' ? 8 : 5) &&
          Math.hypot(save.player.x - opening.x, save.player.z - opening.z) < 2.3 &&
          time - visit.lastHit > 4
        ) {
          visit.lastHit = time;
          events.push({ type: 'predator-attack', kind: predator.kind });
        }

        const kit = save.kits.find(
          (k) =>
            k.alive &&
            k.age < 3 &&
            k.command !== 'follow' &&
            Math.hypot(k.homeX - opening.x, k.homeZ - opening.z) < 2.5 &&
            Math.abs(k.homeY - (opening.y - 0.95)) < 2.5,
        );
        if (combatAllowed && kit && time - visit.lastHit > 5) {
          visit.lastHit = time;
          kit.health = Math.max(0, kit.health - 12 * 0.8);
          events.push({ type: 'kit-attack', kind: predator.kind, name: kit.name });
        }

        continue;
      }

      if (!night && predator.kind !== 'weasel') continue;

      const opening = earth.openings.find(
        (o) =>
          Math.hypot(predator.x - o.x, predator.z - o.z) < 2.6 &&
          (save.kits.some(
            (k) => k.alive && k.age < 3 && Math.hypot(k.homeX - o.x, k.homeZ - o.z) < 4,
          ) ||
            save.waste.some((w) => Math.hypot(w.x - o.x, w.z - o.z) < 4)),
      );
      if (opening && this.rng.chance(dt * 0.12)) {
        this.visits.set(predator, { x: opening.x, z: opening.z, until: time + 15, lastHit: time });
        events.push({ type: 'predator-entered', kind: predator.kind });
      }
    }

    return events;
  }
}
