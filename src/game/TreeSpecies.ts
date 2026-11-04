export const TREE_SPECIES = [
  'oak',
  'pine',
  'spruce',
  'larch',
  'birch',
  'maple',
  'ash',
  'aspen',
  'linden',
  'rowan',
] as const;

export type TreeSpecies = (typeof TREE_SPECIES)[number];
export const NEEDLE_TREES = ['pine', 'spruce', 'larch'] as const;
export const BROADLEAF_TREES = [
  'oak',
  'birch',
  'maple',
  'ash',
  'aspen',
  'linden',
  'rowan',
] as const;

export function isTreeSpecies(name: string): name is TreeSpecies {
  return TREE_SPECIES.some((species) => species === name);
}

export function isEvergreen(name: string): boolean {
  return name === 'pine' || name === 'spruce';
}
