import type { FoodKind } from './types';

/** Гарантированные грядки дополняют случайные растения: на каждом огороде есть капуста и морковь. */
export class GardenCrops {
  static plant(add: (x: number, z: number, kind: FoodKind) => void, scale = 1, amount = 1): void {
    for (const [x, z] of [
      [34, 31],
      [-35, 29],
    ]) {
      for (let row = 0; row < Math.round(3 * amount); row++)
        for (let column = 0; column < 6; column++)
          add(
            (x - 4 + column * 1.5) * scale,
            (z - 3 + row * 2) * scale,
            row % 3 === 1 ? 'carrot' : 'cabbage',
          );
    }
  }
}
