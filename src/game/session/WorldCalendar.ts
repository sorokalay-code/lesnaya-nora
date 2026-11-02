import { Random } from '../Random';
import { World } from '../World';
import { SeasonSystem } from '../systems';
import { type SaveData, type Season, type Weather } from '../types';

interface Context {
  save: SaveData;
  seasons: SeasonSystem;
  world: World;
  rng: Random;
  toast: (message: string) => void;
}

/** Обновляет игровые дни, сезоны, погоду и температуру в текущей точке мира. */
export class WorldCalendar {
  constructor(private readonly context: Context) {}

  advance(dt: number): void {
    const previousDay = this.context.save.day;
    this.context.save.clock += dt * 6;
    this.context.save.day = Math.floor(this.context.save.clock / 1440) + 1;
    this.context.save.player.age += (dt * 6) / 1440;
    if (this.context.save.day > previousDay) this.newDay();
  }

  isNight(): boolean {
    const t = this.context.save.clock % 1440;
    return t < 300 || t >= 1260;
  }

  season(): Season {
    return this.context.seasons.name(this.context.save.day);
  }

  airTemperature(): number {
    return (
      this.context.seasons.temperature(
        this.context.save.day,
        this.context.save.clock,
        this.context.save.weather,
      ) +
      this.context.world.temperatureOffset(this.context.save.player.x, this.context.save.player.z)
    );
  }

  private newDay(): void {
    const previous = this.context.save.weather;
    this.context.save.weather = this.context.rng.pick(
      this.season() === 'Зима'
        ? (['clear', 'mist', 'snow', 'snow'] as Weather[])
        : (['clear', 'clear', 'clear', 'mist', 'rain'] as Weather[]),
    );
    if (previous !== this.context.save.weather)
      this.context.toast(
        this.context.save.weather === 'rain'
          ? 'Пошёл дождь. В лесу пахнет мокрой листвой.'
          : this.context.save.weather === 'mist'
            ? 'Над лесом стелется туман.'
            : this.context.save.weather === 'snow'
              ? 'Начался снегопад. Пора искать тепло.'
              : 'Небо прояснилось.',
      );

    const grown = this.context.save.kits.filter((k) => k.alive && k.age >= 3).length;
    this.context.save.stats.survived = grown;
    this.context.toast(`Наступил день ${this.context.save.day}. ${this.season()} в лесу.`);
  }
}
