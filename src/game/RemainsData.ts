import type { AppearanceTraits } from './AnimalAppearance';
import type { Genes } from './types';
import { CREATURE_OPTIONS, type CreatureKind } from './WorldConfig';
import { GenomeValidation } from './genetics/GenomeValidation';

export type RemainsKind = Exclude<CreatureKind, 'butterfly'>;
export interface RemainsData {
  id: number;
  kind: RemainsKind;
  diedAt: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  scale: { x: number; y: number; z: number };
  genes?: Genes;
  appearance?: AppearanceTraits;
}
export const HALF_DAY_MINUTES = 720;
export function remainsStage(clock: number, diedAt: number): 'body' | 'skeleton' | 'gone' {
  const age = clock - diedAt;
  return age < HALF_DAY_MINUTES ? 'body' : age < HALF_DAY_MINUTES * 2 ? 'skeleton' : 'gone';
}

/** Проверяет новые записи до передачи сохранения в визуализацию Three.js. */
export function validRemains(value: unknown): value is RemainsData[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<number>();
  return value.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const data = entry as Record<string, unknown>;
    if (
      !Number.isSafeInteger(data.id) ||
      typeof data.id !== 'number' ||
      data.id < 1 ||
      ids.has(data.id)
    )
      return false;
    ids.add(data.id);
    if (
      !CREATURE_OPTIONS.some(({ kind }) => kind !== 'butterfly' && kind === data.kind) ||
      !['x', 'y', 'z', 'heading', 'diedAt'].every(
        (key) => typeof data[key] === 'number' && Number.isFinite(data[key]),
      ) ||
      typeof data.diedAt !== 'number' ||
      data.diedAt < 0 ||
      !data.scale ||
      typeof data.scale !== 'object'
    )
      return false;
    const scale = data.scale as Record<string, unknown>;
    if (
      !['x', 'y', 'z'].every(
        (key) =>
          typeof scale[key] === 'number' &&
          Number.isFinite(scale[key]) &&
          scale[key] > 0 &&
          scale[key] <= 20,
      )
    )
      return false;
    if (data.genes !== undefined && !GenomeValidation.valid(data.genes)) return false;
    if (data.kind === 'rabbit' && !GenomeValidation.valid(data.genes)) return false;
    if (data.appearance !== undefined) {
      if (!data.appearance || typeof data.appearance !== 'object') return false;
      const appearance = data.appearance as Record<string, unknown>;
      if (
        ![
          'size',
          'bodyWidth',
          'bodyLength',
          'legLength',
          'headSize',
          'tailLength',
          'palette',
        ].every(
          (key) =>
            typeof appearance[key] === 'number' &&
            Number.isFinite(appearance[key]) &&
            appearance[key] >= 0 &&
            appearance[key] <= 20,
        )
      )
        return false;
    }
    return true;
  });
}
