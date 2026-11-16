import type { Excavation } from './Excavation';
import type { DigNode, KitData, NestData, SaveData } from './types';

export type PregnancyEvent = 'none' | 'warning' | 'birth';
export const GESTATION_DAYS = 1.2;
export const TRAUMA_MUTATION_RISK = 0.25;
const NURSING_HUNGER_GAIN = 35;
const NURSING_HEALTH_GAIN = 6;
const NURSING_REACH = 4;

export function kitPosition(kit: KitData): DigNode {
  return { x: kit.x ?? kit.homeX, y: kit.y ?? kit.homeY, z: kit.z ?? kit.homeZ };
}

/** Отслеживает беременность, предупреждение о родах и пригодность подземного гнезда. */

export class FamilyCare {
  constructor(
    private readonly save: SaveData,
    private readonly earth: Excavation,
  ) {}

  advance(minutes: number): PregnancyEvent {
    const pregnancy = this.save.pregnancy;
    if (!pregnancy) return 'none';

    pregnancy.progress += minutes / 1440;
    if (!pregnancy.warned && pregnancy.progress >= 0.9) {
      pregnancy.warned = true;
      // A long sleep cannot skip both the warning and the birth in one action.
      // Партнёрше после пробуждения нужно успеть физически добраться до гнезда.
      pregnancy.progress = Math.min(
        pregnancy.progress,
        pregnancy.motherId === undefined ? 1.18 : 0.9,
      );
      return 'warning';
    }

    return pregnancy.progress >= GESTATION_DAYS ? 'birth' : 'none';
  }

  birthNest(radius = 2.3): NestData | undefined {
    return this.birthNestAt(this.save.player, radius);
  }

  birthNestAt(p: DigNode, radius = 2.3): NestData | undefined {
    if (!this.earth.isSheltered(p.x, p.y, p.z)) return;

    return this.save.nests
      .filter(
        (n) =>
          this.earth.isSheltered(n.x, n.y, n.z) &&
          Math.hypot(n.x - p.x, n.y - p.y, n.z - p.z) <= radius,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) - Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z),
      )[0];
  }

  reachableNest(from: DigNode): NestData | undefined {
    return this.save.nests
      .filter((nest) => this.earth.isSheltered(nest.x, nest.y, nest.z))
      .sort(
        (a, b) =>
          Math.hypot(a.x - from.x, a.y - from.y, a.z - from.z) -
          Math.hypot(b.x - from.x, b.y - from.y, b.z - from.z),
      )
      .find((nest) => this.earth.route(from, nest).length > 0);
  }

  /** Кормление в связной норе охватывает гуляющих малышей, снаружи — только тех, кто рядом. */
  youngNear(
    from: DigNode,
    nest: NestData | undefined,
    eligible: (kit: KitData) => boolean,
  ): KitData[] {
    const network = nest ? this.earth.burrowAt(nest)?.network : undefined;
    const inNest = network !== undefined && this.earth.burrowAt(from)?.network === network;
    return this.save.kits.filter((kit) => {
      if (!kit.alive || kit.health <= 0 || kit.age >= 3 || !eligible(kit)) return false;

      const { x, y, z } = kitPosition(kit);
      if (!inNest) return Math.hypot(x - from.x, y - from.y, z - from.z) < NURSING_REACH;
      return (
        this.earth.isSheltered(x, y, z) && this.earth.burrowAt({ x, y, z })?.network === network
      );
    });
  }

  static nurse(kits: readonly KitData[]): void {
    for (const kit of kits) {
      kit.hunger = Math.min(100, kit.hunger + NURSING_HUNGER_GAIN);
      kit.health = Math.min(100, kit.health + NURSING_HEALTH_GAIN);
    }
  }

  static growth(kit: KitData): {
    progress: number;
    daysLeft: number;
    feedsNeeded: number;
    food: string;
  } {
    return {
      progress: Math.min(100, Math.round((kit.age / 3) * 100)),
      daysLeft: Math.max(0, Math.ceil(3 - kit.age)),
      feedsNeeded: Math.ceil(Math.max(0, 85 - kit.hunger) / (kit.age < 0.8 ? 35 : 26)),
      food: kit.age < 0.8 ? 'молоко' : 'молоко или овощи',
    };
  }
}
