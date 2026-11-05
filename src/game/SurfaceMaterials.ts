import type { ModelName } from './ModelAssets';

export const SURFACE_TEXTURES = [
  'coat',
  'feather',
  'scales',
  'chitin',
  'rock_granite',
  'rock_moss',
  'rock_slate',
  'bark',
  'wood',
] as const;
export type SurfaceTexture = (typeof SURFACE_TEXTURES)[number];

/** Выбирает нейтральный рисунок, сохраняя окрасы вида, генетические узоры и цветовые вариации. */
export function animalSurface(model: ModelName, material: string): SurfaceTexture | undefined {
  if (/eye|pupil|shine|tooth|teeth|tusk|beak|horn|antler|pink|claw/i.test(material)) return;
  if (model === 'hawk' || model === 'duck') return 'feather';
  if (model === 'snake' || model === 'fish' || model === 'pike') return 'scales';
  if (model === 'spider' || model === 'jumping-spider') return 'chitin';
  return 'coat';
}
