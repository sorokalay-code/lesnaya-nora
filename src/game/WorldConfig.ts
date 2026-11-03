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
  { kind: 'rabbit', label: 'Кролики-соседи', max: 120 },
  { kind: 'deer', label: 'Олени', max: 90 },
  { kind: 'squirrel', label: 'Белки', max: 90 },
  { kind: 'hedgehog', label: 'Ежи', max: 90 },
  { kind: 'beaver', label: 'Бобры', max: 90 },
  { kind: 'moose', label: 'Лоси', max: 60 },
  { kind: 'boar', label: 'Кабаны', max: 60 },
  { kind: 'fox', label: 'Лисы', max: 90 },
  { kind: 'wolf', label: 'Волки', max: 60 },
  { kind: 'dog', label: 'Собаки', max: 60 },
  { kind: 'lynx', label: 'Рыси', max: 60 },
  { kind: 'weasel', label: 'Ласки', max: 60 },
  { kind: 'bear', label: 'Медведи', max: 45 },
  { kind: 'snake', label: 'Змеи', max: 90 },
  { kind: 'spider', label: 'Пауки с паутиной', max: 45 },
  { kind: 'jumping-spider', label: 'Пауки-прыгуны', max: 45 },
  { kind: 'hawk', label: 'Соколы', max: 30 },
  { kind: 'pike', label: 'Щуки', max: 45 },
  { kind: 'butterfly', label: 'Бабочки', max: 240 },
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
  size: { min: 50, max: 300 },
  density: { min: 0, max: 5 },
  season: { min: 1, max: 365 },
  family: { min: 0, max: 10 },
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
    ['water', 'vegetation', 'food'].every((key) =>
      inRange(value[key], WORLD_LIMITS.density.min, WORLD_LIMITS.density.max),
    ) &&
    BIOME_OPTIONS.some((option) => option.value === value.biome) &&
    inRange(value.neighborFamilySize, WORLD_LIMITS.family.min, WORLD_LIMITS.family.max, true) &&
    CREATURE_OPTIONS.every(({ kind, max }) => inRange(creatures[kind], 0, max, true)) &&
    SEASONS.every((season) =>
      inRange(seasons[season], WORLD_LIMITS.season.min, WORLD_LIMITS.season.max, true),
    )
  );
}
