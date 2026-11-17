import type { WildlifeKind } from './animals/types';
import type { Biome, FoodKind, PredatorKind } from './types';

export type HabitatMode = 'den' | 'burrow' | 'shore' | 'roaming' | 'water' | 'range';
export interface HabitatProfile {
  mode: HabitatMode;
  radius: number;
  biomes: readonly Biome[];
  activeDuring?: 'day' | 'night' | 'twilight' | 'brief-outings';
  groupSize?: number;
  feedNearWater?: boolean;
}

interface WildlifeHabitat extends HabitatProfile {
  food: readonly FoodKind[];
}

const woodland = ['forest'] as const;
const grassland = ['meadow'] as const;
const cover = ['forest', 'meadow'] as const;
const wetland = ['swamp', 'forest'] as const;
const browse = ['clover', 'berries', 'cabbage', 'carrot'] as const;
const seeds = ['acorn', 'berries', 'clover'] as const;
const roots = ['carrot', 'acorn', 'berries', 'mushroom'] as const;

export const WILDLIFE_HABITATS: Readonly<Record<WildlifeKind, WildlifeHabitat>> = {
  deer: {
    mode: 'roaming',
    radius: 44,
    biomes: cover,
    food: ['clover', 'berries', 'cabbage', 'carrot'],
    activeDuring: 'twilight',
    groupSize: 4,
  },
  'roe-deer': {
    mode: 'roaming',
    radius: 28,
    biomes: cover,
    food: browse,
    activeDuring: 'twilight',
  },
  moose: {
    mode: 'roaming',
    radius: 54,
    biomes: wetland,
    food: ['berries', 'clover', 'mushroom'],
    feedNearWater: true,
  },
  boar: { mode: 'roaming', radius: 30, biomes: woodland, food: roots, groupSize: 3 },
  bear: {
    mode: 'den',
    radius: 38,
    biomes: woodland,
    food: ['berries', 'acorn', 'mushroom', 'carrot'],
  },
  badger: { mode: 'burrow', radius: 16, biomes: woodland, food: roots, activeDuring: 'night' },
  mole: { mode: 'burrow', radius: 9, biomes: grassland, food: [], activeDuring: 'brief-outings' },
  marmot: { mode: 'burrow', radius: 14, biomes: grassland, food: browse, activeDuring: 'day' },
  mouse: { mode: 'burrow', radius: 9, biomes: cover, food: seeds, activeDuring: 'night' },
  chipmunk: { mode: 'burrow', radius: 11, biomes: woodland, food: seeds, activeDuring: 'day' },
  squirrel: { mode: 'range', radius: 16, biomes: woodland, food: seeds, activeDuring: 'day' },
  hedgehog: {
    mode: 'range',
    radius: 14,
    biomes: cover,
    food: ['berries', 'mushroom'],
    activeDuring: 'night',
  },
  pheasant: { mode: 'range', radius: 19, biomes: grassland, food: seeds, activeDuring: 'day' },
  beaver: {
    mode: 'shore',
    radius: 16,
    biomes: wetland,
    food: ['bitterleaf', 'clover', 'carrot', 'berries'],
    activeDuring: 'twilight',
  },
  duck: {
    mode: 'shore',
    radius: 17,
    biomes: ['swamp', 'meadow'],
    food: seeds,
    activeDuring: 'day',
  },
  frog: { mode: 'water', radius: 12, biomes: ['swamp'], food: [] },
  fish: { mode: 'water', radius: 12, biomes: ['swamp'], food: [] },
};

export const PREDATOR_HABITATS: Readonly<Partial<Record<PredatorKind, HabitatProfile>>> = {
  wolf: { mode: 'den', radius: 39, biomes: woodland },
  fox: { mode: 'burrow', radius: 30, biomes: cover, activeDuring: 'twilight' },
  lynx: { mode: 'den', radius: 33, biomes: woodland, activeDuring: 'twilight' },
  weasel: { mode: 'burrow', radius: 17, biomes: cover, activeDuring: 'brief-outings' },
  dog: { mode: 'range', radius: 22, biomes: ['garden', 'meadow'] },
  snake: { mode: 'range', radius: 16, biomes: ['swamp', 'meadow'], activeDuring: 'day' },
};

export const RABBIT_HABITAT: HabitatProfile = {
  mode: 'burrow',
  radius: 15,
  biomes: cover,
  activeDuring: 'twilight',
};
