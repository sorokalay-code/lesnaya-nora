import type { WildlifeKind } from './animals/types';
import type { Biome, FoodKind, PredatorKind } from './types';

export type HabitatMode = 'den' | 'burrow' | 'shore' | 'roaming' | 'water' | 'range';
export interface HabitatProfile {
  mode: HabitatMode;
  radius: number;
  biomes: readonly Biome[];
  activeDuring?: 'day' | 'night';
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
  deer: { mode: 'roaming', radius: 42, biomes: cover, food: browse },
  'roe-deer': { mode: 'roaming', radius: 28, biomes: cover, food: browse },
  moose: { mode: 'roaming', radius: 50, biomes: wetland, food: browse },
  boar: { mode: 'roaming', radius: 36, biomes: woodland, food: roots },
  bear: { mode: 'den', radius: 38, biomes: woodland, food: roots },
  badger: { mode: 'burrow', radius: 16, biomes: woodland, food: roots, activeDuring: 'night' },
  mole: { mode: 'burrow', radius: 9, biomes: grassland, food: [] },
  marmot: { mode: 'burrow', radius: 14, biomes: grassland, food: browse, activeDuring: 'day' },
  mouse: { mode: 'burrow', radius: 9, biomes: cover, food: seeds, activeDuring: 'night' },
  chipmunk: { mode: 'burrow', radius: 11, biomes: woodland, food: seeds, activeDuring: 'day' },
  squirrel: { mode: 'range', radius: 16, biomes: woodland, food: seeds, activeDuring: 'day' },
  hedgehog: { mode: 'range', radius: 14, biomes: cover, food: ['berries', 'mushroom'] },
  pheasant: { mode: 'range', radius: 19, biomes: grassland, food: seeds, activeDuring: 'day' },
  beaver: { mode: 'shore', radius: 16, biomes: wetland, food: browse },
  duck: { mode: 'shore', radius: 17, biomes: ['swamp', 'meadow'], food: seeds },
  frog: { mode: 'water', radius: 12, biomes: ['swamp'], food: [] },
  fish: { mode: 'water', radius: 12, biomes: ['swamp'], food: [] },
};

export const PREDATOR_HABITATS: Readonly<Partial<Record<PredatorKind, HabitatProfile>>> = {
  wolf: { mode: 'den', radius: 39, biomes: woodland },
  fox: { mode: 'burrow', radius: 30, biomes: cover },
  lynx: { mode: 'den', radius: 33, biomes: woodland },
  weasel: { mode: 'burrow', radius: 17, biomes: cover },
  dog: { mode: 'range', radius: 22, biomes: ['garden', 'meadow'] },
  snake: { mode: 'range', radius: 16, biomes: ['swamp', 'meadow'] },
  scolopendra: { mode: 'range', radius: 14, biomes: woodland },
};
