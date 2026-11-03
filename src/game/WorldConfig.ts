import type { WildlifeKind } from './animals/types';
import type { Biome, PredatorKind, Season } from './types';

export type CreatureKind = 'rabbit' | PredatorKind | WildlifeKind | 'hawk' | 'pike' | 'butterfly';
export type BiomePreference = 'mixed' | Biome;
export type SeasonLengths = Record<Season, number>;

export interface WorldConfig {
  /** Половина стороны квадратного мира, в метрах. */
  size: number;
  creatures: Record<CreatureKind, number>;
  water: number;
  vegetation: number;
  food: number;
  biome: BiomePreference;
  seasonLengths: SeasonLengths;
  neighborFamilySize: number;
}

export const CREATURE_OPTIONS: readonly { kind: CreatureKind; label: string; max: number }[] = [
  { kind: 'rabbit', label: 'Кролики-соседи', max: 40 },
  { kind: 'deer', label: 'Олени', max: 30 },
  { kind: 'squirrel', label: 'Белки', max: 30 },
  { kind: 'hedgehog', label: 'Ежи', max: 30 },
  { kind: 'beaver', label: 'Бобры', max: 30 },
  { kind: 'moose', label: 'Лоси', max: 20 },
  { kind: 'boar', label: 'Кабаны', max: 20 },
  { kind: 'fox', label: 'Лисы', max: 30 },
  { kind: 'wolf', label: 'Волки', max: 20 },
  { kind: 'dog', label: 'Собаки', max: 20 },
  { kind: 'lynx', label: 'Рыси', max: 20 },
  { kind: 'weasel', label: 'Ласки', max: 20 },
  { kind: 'bear', label: 'Медведи', max: 15 },
  { kind: 'snake', label: 'Змеи', max: 30 },
  { kind: 'spider', label: 'Пауки с паутиной', max: 15 },
  { kind: 'jumping-spider', label: 'Пауки-прыгуны', max: 15 },
  { kind: 'hawk', label: 'Соколы', max: 10 },
  { kind: 'pike', label: 'Щуки', max: 15 },
  { kind: 'butterfly', label: 'Бабочки', max: 80 },
];
export const SEASONS: readonly Season[] = ['Весна', 'Лето', 'Осень', 'Зима'];
export const BIOME_OPTIONS: readonly { value: BiomePreference; label: string }[] = [
  { value: 'mixed', label: 'Смешанный мир (как сейчас)' },
  { value: 'forest', label: 'Преимущественно леса' },
  { value: 'meadow', label: 'Преимущественно поля и луга' },
  { value: 'swamp', label: 'Преимущественно болота' },
  { value: 'garden', label: 'Преимущественно огороды' },
];
export const WORLD_LIMITS = {
  size: { min: 70, max: 150 },
  density: { min: 0, max: 2 },
  season: { min: 1, max: 120 },
  family: { min: 0, max: 5 },
} as const;

/** Семиметровый запас оставляет персонажей и раскопы внутри видимого края карты. */
export function playableWorldLimit(size = 110): number {
  return size - 7;
}

/** Каждый черновик и сохранение получают собственные вложенные объекты. */
export function defaultWorldConfig(): WorldConfig {
  return {
    size: 110,
    creatures: {
      rabbit: 16,
      deer: 6,
      squirrel: 9,
      hedgehog: 8,
      beaver: 5,
      moose: 3,
      boar: 4,
      fox: 6,
      wolf: 3,
      dog: 2,
      lynx: 3,
      weasel: 3,
      bear: 2,
      snake: 3,
      spider: 3,
      'jumping-spider': 2,
      hawk: 1,
      pike: 3,
      butterfly: 38,
    },
    water: 1,
    vegetation: 1,
    food: 1,
    biome: 'mixed',
    seasonLengths: { Весна: 30, Лето: 30, Осень: 30, Зима: 30 },
    neighborFamilySize: 5,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inRange(value: unknown, min: number, max: number, integer = false): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
  );
}

/** Проверка границы сохранения: повреждённые параметры нельзя молча заменить другим миром. */
export function validWorldConfig(value: unknown): value is WorldConfig {
  if (!record(value) || !record(value.creatures) || !record(value.seasonLengths)) return false;

  const creatures = value.creatures;
  const seasons = value.seasonLengths;
  return (
    inRange(value.size, WORLD_LIMITS.size.min, WORLD_LIMITS.size.max, true) &&
    ['water', 'vegetation', 'food'].every((key) => inRange(value[key], 0, 2)) &&
    BIOME_OPTIONS.some((option) => option.value === value.biome) &&
    inRange(value.neighborFamilySize, 0, 5, true) &&
    CREATURE_OPTIONS.every(({ kind, max }) => inRange(creatures[kind], 0, max, true)) &&
    SEASONS.every((season) => inRange(seasons[season], 1, 120, true))
  );
}
