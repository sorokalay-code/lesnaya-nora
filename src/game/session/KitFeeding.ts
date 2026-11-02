import type { Excavation } from '../Excavation';
import { FOOD, type FoodKind, type KitData, type SaveData, type StashData } from '../types';

/** Подросшие малыши едят подходящую пищу из доступного склада, соблюдая команды матери. */
export class KitFeeding {
  private readonly targets = new Map<number, { stash?: StashData; until: number }>();
  constructor(
    private readonly save: SaveData,
    private readonly earth: Excavation,
  ) {}

  update(kit: KitData): StashData | undefined {
    if (
      kit.age < 0.8 ||
      kit.independent ||
      kit.hunger > 60 ||
      this.save.clock < (kit.nextMealAt ?? 0)
    )
      return;
    const position = { x: kit.x ?? kit.homeX, y: kit.y ?? kit.homeY, z: kit.z ?? kit.homeZ };
    const edible = (stash: StashData) =>
      (['carrot', 'cabbage', 'clover'] as FoodKind[]).find((kind) => (stash.food[kind] ?? 0) > 0);
    const previous = this.targets.get(kit.id);
    let stash = previous?.stash;
    if (
      !previous ||
      this.save.clock >= previous.until ||
      (stash && (!edible(stash) || !this.save.stashes.includes(stash)))
    ) {
      stash = this.save.stashes
        .filter((item) => edible(item) && Math.hypot(item.x - position.x, item.z - position.z) < 12)
        .sort(
          (a, b) =>
            Math.hypot(a.x - position.x, a.y - position.y, a.z - position.z) -
            Math.hypot(b.x - position.x, b.y - position.y, b.z - position.z),
        )
        .find((item) => this.earth.route(position, item).length > 0);
      this.targets.set(kit.id, { stash, until: this.save.clock + 12 });
    }
    if (!stash) return;
    if (Math.hypot(stash.x - position.x, stash.y - position.y, stash.z - position.z) < 1.45) {
      const kind = edible(stash)!;
      stash.food[kind]!--;
      kit.hunger = Math.min(100, kit.hunger + FOOD[kind].nutrition);
      kit.nextMealAt = this.save.clock + 45;
      return;
    }
    return kit.command === 'follow' || kit.command === 'stay' ? undefined : stash;
  }
}
