import { FOOD, type FoodKind, type SaveData, type StashData } from '../types';
/** Переносит еду и материалы между ограниченным багажом крольчихи и семейными тайниками. */
export class FoodStore {
  readonly capacity = 18;

  constructor(private readonly save: SaveData) {}

  carried(): number {
    return (Object.keys(FOOD) as FoodKind[]).reduce(
      (sum, k) => sum + (this.save.inventory[k] ?? 0),
      0,
    );
  }

  deposit(stash: StashData): number {
    let total = 0;
    for (const kind of Object.keys(FOOD) as FoodKind[]) {
      const amount = this.save.inventory[kind] ?? 0;
      if (!amount) continue;

      stash.food[kind] = (stash.food[kind] ?? 0) + amount;
      this.save.inventory[kind] = 0;
      total += amount;
    }

    return total;
  }

  withdraw(stash: StashData): number {
    let total = 0;
    for (const kind of Object.keys(FOOD) as FoodKind[]) {
      const space = this.capacity - this.carried();
      if (space <= 0) break;

      const amount = Math.min(space, stash.food[kind] ?? 0);
      stash.food[kind] = (stash.food[kind] ?? 0) - amount;
      this.save.inventory[kind] += amount;
      total += amount;
    }

    if (stash.materials)
      for (const kind of ['grass', 'twigs', 'fur'] as const) {
        const amount = stash.materials[kind] ?? 0;
        this.save.materials[kind] += amount;
        stash.materials[kind] = 0;
        total += amount;
      }

    return total;
  }
}
