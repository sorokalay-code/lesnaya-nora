import type { ForestAnimal, RabbitActor } from '../animals';
import type { Excavation } from '../Excavation';
import type { KitData, NestData, PartnerTraits, SaveData, StashData } from '../types';
import type { World } from '../World';
import type { FamilyLifecycle } from './FamilyLifecycle';
interface QueryContext {
  save: SaveData;
  world: World;
  earth: Excavation;
  rabbits: RabbitActor[];
  wildlife: ForestAnimal[];
  family: FamilyLifecycle;
}
/** Запросы ближайших доступных объектов учитывают расстояние, высоту и подземное положение. */
export class SessionQueries {
  constructor(private readonly context: QueryContext) {}

  nest(radius = 3): NestData | undefined {
    const p = this.context.save.player;
    return this.context.save.nests
      .filter((n) => Math.hypot(n.x - p.x, n.y - p.y, n.z - p.z) < radius)
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) - Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z),
      )[0];
  }

  stash(radius = 2.5): StashData | undefined {
    const p = this.context.save.player;
    return this.context.save.stashes
      .filter((s) => Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z) < radius)
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) - Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z),
      )[0];
  }

  partner(radius = 3): PartnerTraits | undefined {
    const p = this.context.save.player;
    return this.context.save.partners
      .filter((r) => {
        const actor = this.context.rabbits.find((a) => a.data.id === r.id);
        return (
          Math.hypot(r.x - p.x, r.z - p.z) < radius &&
          Math.abs((actor?.rig.root.position.y ?? this.context.world.heightAt(r.x, r.z)) - p.y) <
            1.5
        );
      })
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  }

  kit(radius = 2.5): KitData | undefined {
    const x = this.context.save.player.x,
      z = this.context.save.player.z;
    return this.context.save.kits
      .filter((k) => k.alive && !k.independent)
      .find((k) => {
        const mesh = this.context.family.rigs.get(k.id)?.root;
        return (
          mesh?.visible &&
          Math.abs(mesh.position.y - this.context.save.player.y) < 1.5 &&
          Math.hypot(mesh.position.x - x, mesh.position.z - z) < radius
        );
      });
  }

  animal(radius = 3): ForestAnimal | undefined {
    const p = this.context.save.player;
    if (this.context.earth.isSheltered(p.x, p.y, p.z)) return;

    return this.context.wildlife
      .filter(
        (a) =>
          a.alive &&
          Math.hypot(a.x - p.x, a.z - p.z) < radius &&
          Math.abs(a.root.position.y - p.y) < 1.5,
      )
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  }
}
