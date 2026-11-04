export const SHRUB_SPECIES = ['hazel', 'dogrose', 'viburnum', 'juniper', 'spiraea'] as const;
export type ShrubSpecies = (typeof SHRUB_SPECIES)[number];

export function isShrubSpecies(name: string): name is ShrubSpecies {
  return SHRUB_SPECIES.some((species) => species === name);
}
