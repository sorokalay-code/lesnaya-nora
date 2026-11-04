import type { SeasonBlend } from '../SeasonalGround';
import { hash2 } from '../Random';
import { type FoodKind, type Season, type Weather } from '../types';
import { defaultWorldConfig, SEASONS, type SeasonLengths } from '../WorldConfig';
/** Определяет сезон, погоду, температуру и доступность растительной пищи по игровому календарю. */
export class SeasonSystem {
  private readonly yearLength: number;

  constructor(
    private readonly seed: number,
    private readonly lengths: SeasonLengths = defaultWorldConfig().seasonLengths,
  ) {
    this.yearLength = SEASONS.reduce((days, season) => days + lengths[season], 0);
  }

  startDay(seasonIndex: number): number {
    const index = Number.isFinite(seasonIndex)
      ? Math.max(0, Math.min(3, Math.floor(seasonIndex)))
      : 0;
    return 1 + SEASONS.slice(0, index).reduce((days, season) => days + this.lengths[season], 0);
  }

  private period(day: number): number {
    const elapsed = Math.max(0, Math.floor(day) - 1);
    let remaining = elapsed % this.yearLength;
    for (let index = 0; index < SEASONS.length; index++) {
      const season = SEASONS[index];
      if (remaining < this.lengths[season])
        return Math.floor(elapsed / this.yearLength) * 4 + index;

      remaining -= this.lengths[season];
    }
    return 0;
  }

  name(day: number): Season {
    return SEASONS[this.period(day) % 4];
  }

  visualBlend(day: number, clock: number): SeasonBlend {
    const index = this.period(day) % SEASONS.length;
    const current = SEASONS[index];
    const next = SEASONS[(index + 1) % SEASONS.length];
    const length = this.lengths[current];
    const elapsed = ((Math.floor(day) - 1) % this.yearLength) - (this.startDay(index) - 1);
    const age = elapsed + (clock % 1440) / 1440;
    const transitionDays = Math.min(3, length / 3);
    const t = Math.max(0, Math.min(1, (age - length + transitionDays) / transitionDays));
    return {
      current,
      next,
      mix: t * t * (3 - 2 * t),
      progress: Math.max(0, Math.min(1, age / length)),
    };
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
    return hash2(id, this.period(day), this.seed + 499) < chance;
  }

  predatorActivity(day: number): number {
    return this.name(day) === 'Зима' ? 1.25 : 1;
  }
}
