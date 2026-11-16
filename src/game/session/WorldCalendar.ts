import { Random } from '../Random';
import { World } from '../World';
import { SeasonSystem } from '../systems';
import { type SaveData, type Season, type Weather } from '../types';

export const GAME_MINUTES_PER_SECOND = 6;

export function isNightAt(clock: number): boolean {
  const timeOfDay = clock % 1440;
  return timeOfDay < 300 || timeOfDay >= 1260;
}

const WINTER_WEATHER: readonly Weather[] = [
  'clear',
  'cloudy',
  'mist',
  'mist',
  'snow',
  'snow',
  'snow',
  'snow',
];
const MILD_WEATHER: readonly Weather[] = ['clear', 'clear', 'cloudy', 'mist', 'rain'];
const WEATHER_CHANGE: Record<Weather, string> = {
  clear: 'Небо прояснилось.',
  cloudy: 'Небо затянуло облаками.',
  rain: 'Пошёл дождь. В лесу пахнет мокрой листвой.',
  mist: 'Над лесом стелется туман.',
  snow: 'Начался снегопад. Пора искать тепло.',
};

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
    const minutes = dt * GAME_MINUTES_PER_SECOND;
    this.context.save.clock += minutes;
    this.context.save.day = Math.floor(this.context.save.clock / 1440) + 1;
    this.context.save.player.age += minutes / 1440;
    if (this.context.save.day > previousDay) this.newDay();
  }

  isNight(): boolean {
    return isNightAt(this.context.save.clock);
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
      this.season() === 'Зима' ? WINTER_WEATHER : MILD_WEATHER,
    );
    if (previous !== this.context.save.weather)
      this.context.toast(WEATHER_CHANGE[this.context.save.weather]);

    const grown = this.context.save.kits.filter((k) => k.alive && k.age >= 3).length;
    this.context.save.stats.survived = grown;
    this.context.toast(`Наступил день ${this.context.save.day}. ${this.season()} в лесу.`);
  }
}
