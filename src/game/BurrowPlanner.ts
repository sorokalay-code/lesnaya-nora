import { BurrowSafety, NEST_ENTRANCE_MARGIN } from './BurrowSafety';
import type { BurrowLocation, BurrowNetwork } from './BurrowNetwork';
import type { Excavation } from './Excavation';
import type { BurrowMoisture } from './BurrowClimate';
import type { DigNode, SaveData } from './types';
import { stashItemCount } from './session/ShelterController';

export interface BurrowNest {
  id: number;
  insulated?: true;
  position: DigNode;
  depth: number;
  moisture: BurrowMoisture;
  entranceDistance: number;
  placement: 'exposed' | 'near' | 'interior' | 'sealed';
  stashDistance?: number;
}

export interface BurrowStash {
  id: number;
  position: DigNode;
  items: number;
  food: number;
}

export interface BurrowPlan {
  network: BurrowNetwork;
  player: DigNode;
  length: number;
  depth: number;
  nests: BurrowNest[];
  stashes: BurrowStash[];
}

/** Оценивает обустройство текущей норы по её настоящим ходам, гнёздам и кладовым. */
export class BurrowPlanner {
  static inspect(save: SaveData, earth: Excavation): BurrowPlan | undefined {
    const location = earth.burrowAt(save.player);
    if (!location) return;
    const network = location.network;
    const stashes: { data: BurrowStash; location: BurrowLocation }[] = [];
    for (const stash of save.stashes) {
      const point = this.inside(earth, network, stash);
      if (!point) continue;
      stashes.push({
        location: point,
        data: {
          id: stash.id,
          position: { x: stash.x, y: stash.y, z: stash.z },
          items: stashItemCount(stash),
          food: Object.values(stash.food).reduce((sum, count) => sum + (count ?? 0), 0),
        },
      });
    }
    const nests: BurrowNest[] = [];
    for (const nest of save.nests) {
      const point = this.inside(earth, network, nest);
      if (!point) continue;
      const entranceDistance = network.distanceToSurface(point);
      const exposed = earth.openings.some((opening) =>
        BurrowSafety.kitExposed(earth, opening, nest),
      );
      const stashDistance = Math.min(
        ...stashes.map((stash) => network.distanceBetween(point, stash.location)),
      );
      let placement: BurrowNest['placement'] = 'interior';
      if (!Number.isFinite(entranceDistance)) placement = 'sealed';
      else if (exposed) placement = 'exposed';
      else if (entranceDistance < NEST_ENTRANCE_MARGIN) placement = 'near';

      nests.push({
        id: nest.id,
        insulated: nest.insulated,
        position: { x: nest.x, y: nest.y, z: nest.z },
        depth: earth.depthAt(nest.x, nest.y, nest.z),
        moisture: earth.moistureAt(nest),
        entranceDistance,
        placement,
        stashDistance: Number.isFinite(stashDistance) ? stashDistance : undefined,
      });
    }
    const length = network.passages.reduce((sum, [a, b]) => {
      const from = network.floors[a];
      const to = network.floors[b];
      return sum + Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
    }, 0);
    return {
      network,
      player: { x: save.player.x, y: save.player.y, z: save.player.z },
      length,
      depth: Math.max(...network.floors.map((point) => earth.depthAt(point.x, point.y, point.z))),
      nests,
      stashes: stashes.map((stash) => stash.data),
    };
  }

  private static inside(
    earth: Excavation,
    network: BurrowNetwork,
    position: DigNode,
  ): BurrowLocation | undefined {
    if (!earth.isSheltered(position.x, position.y, position.z)) return;
    const location = earth.burrowAt(position);
    return location?.network === network ? location : undefined;
  }
}
