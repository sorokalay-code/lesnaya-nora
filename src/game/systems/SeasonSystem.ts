import { hash2 } from '../Random';
import { type FoodKind, type Season, type Weather } from '../types';
/** Определяет сезон, погоду, температуру и доступность растительной пищи по игровому календарю. */
export class SeasonSystem {
  constructor(private readonly seed: number) {}

  name(day: number): Season {
    return (['Весна', 'Лето', 'Осень', 'Зима'] as const)[Math.floor((day - 1) / 30) % 4];
  }

  temperature(day: number, clock: number, weather: Weather): number {
    const base = { Весна: 13, Лето: 25, Осень: 9, Зима: -3 }[this.name(day)];
    const hour = (clock % 1440) / 60;
    return (
      base +
      Math.cos(((hour - 14) / 24) * Math.PI * 2) * 5 +
      { clear: 0, rain: -4, mist: -2, snow: -6 }[weather]
    );
  }

  foodVisible(id: number, kind: FoodKind, day: number): boolean {
    const season = this.name(day);
    const chance =
      season === 'Зима'
        ? kind === 'mushroom' || kind === 'acorn'
          ? 0.28
          : kind === 'carrot' || kind === 'cabbage'
            ? 0.08
            : 0.14
        : season === 'Осень'
          ? kind === 'berries' || kind === 'acorn'
            ? 0.98
            : 0.78
          : season === 'Лето'
            ? 0.93
            : 0.82;
    return hash2(id, Math.floor((day - 1) / 30), this.seed + 499) < chance;
  }

  predatorActivity(day: number): number {
    return this.name(day) === 'Зима' ? 1.25 : 1;
  }
}
