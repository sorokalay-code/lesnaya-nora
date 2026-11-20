import type { WildlifeKind } from './animals/types';
import type { PredatorKind } from './types';
import type { SurfaceTexture } from './SurfaceMaterials';

type GroundShelterShape =
  | 'burrow'
  | 'molehills'
  | 'leaf-nest'
  | 'roots'
  | 'cave'
  | 'crevice'
  | 'beaver-lodge'
  | 'duck-nest';

export type ShelterSurface = Extract<SurfaceTexture, 'earth' | 'leaf-litter' | 'straw' | 'wood'>;

export interface WildlifeShelterProfile {
  shape: GroundShelterShape | 'tree-nest';
  radius: number;
  height: number;
  earth: number;
  edge: number;
}

const profiles = {
  badger: { shape: 'burrow', radius: 1.04, height: 0.68, earth: 0x856348, edge: 0x65533d },
  marmot: { shape: 'burrow', radius: 0.91, height: 0.49, earth: 0x957553, edge: 0xa3916d },
  mouse: { shape: 'burrow', radius: 0.39, height: 0.28, earth: 0x584532, edge: 0x7b694a },
  chipmunk: { shape: 'burrow', radius: 0.56, height: 0.34, earth: 0x785842, edge: 0x8f6648 },
  mole: { shape: 'molehills', radius: 0.76, height: 0.26, earth: 0x5e4131, edge: 0x92715b },
  hedgehog: { shape: 'leaf-nest', radius: 0.72, height: 0.48, earth: 0x6e5840, edge: 0xb98a48 },
  squirrel: { shape: 'tree-nest', radius: 0.68, height: 0.56, earth: 0x67593b, edge: 0x897353 },
  fox: { shape: 'burrow', radius: 1.19, height: 0.71, earth: 0x926a47, edge: 0xbd925c },
  lynx: { shape: 'roots', radius: 1.52, height: 0.85, earth: 0x554434, edge: 0x735941 },
  bear: { shape: 'cave', radius: 2.32, height: 1.57, earth: 0x646861, edge: 0x818477 },
  weasel: { shape: 'burrow', radius: 0.42, height: 0.22, earth: 0x534334, edge: 0x796850 },
  snake: { shape: 'crevice', radius: 0.72, height: 0.36, earth: 0x60675d, edge: 0x89887a },
  rabbit: { shape: 'burrow', radius: 0.74, height: 0.51, earth: 0x74543a, edge: 0x9d7953 },
  beaver: { shape: 'beaver-lodge', radius: 1.58, height: 1.14, earth: 0x61503d, edge: 0x9b7853 },
  duck: { shape: 'duck-nest', radius: 0.6, height: 0.25, earth: 0x726955, edge: 0xb3a370 },
  pheasant: { shape: 'duck-nest', radius: 0.57, height: 0.1, earth: 0x64533a, edge: 0xba9e60 },
  spider: { shape: 'roots', radius: 0.7, height: 0.4, earth: 0x534236, edge: 0xd4c9b3 },
  'jumping-spider': {
    shape: 'crevice',
    radius: 0.65,
    height: 0.37,
    earth: 0x77786d,
    edge: 0xd4c9b3,
  },
} as const satisfies Partial<
  Record<WildlifeKind | PredatorKind | 'rabbit', WildlifeShelterProfile>
>;

export type ShelteredWildlife = keyof typeof profiles;

export function isShelteredWildlife(value: unknown): value is ShelteredWildlife {
  return typeof value === 'string' && Object.hasOwn(profiles, value);
}

export function wildlifeShelterProfile(kind: ShelteredWildlife): WildlifeShelterProfile {
  return profiles[kind];
}

export function wildlifeShelterSurface(kind: ShelteredWildlife): ShelterSurface {
  const { shape } = wildlifeShelterProfile(kind);
  if (shape === 'leaf-nest') return 'leaf-litter';
  if (shape === 'beaver-lodge' || shape === 'tree-nest') return 'wood';
  if (shape === 'duck-nest') return 'straw';
  return 'earth';
}
