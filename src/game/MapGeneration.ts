export interface MapGeneration {
  layout: 'classic' | 'generated';
  /** null выбирает новое зерно при запуске, число воспроизводит карту. */
  seed: number | null;
  relief: number;
  biomeScale: number;
  forestCover: number;
  gardens: number;
  swamps: number;
  ponds: number;
  river: boolean;
  /** Старые сохранения без этой версии восстанавливают прежний рельеф и воду. */
  revision?: 2;
  rivers?: number;
  lakes?: number;
}

export const MAP_LIMITS = {
  seed: { min: 0, max: 2_147_483_646 },
  relief: { min: 0, max: 2 },
  biomeScale: { min: 0.5, max: 2.5 },
  forestCover: { min: 0, max: 1 },
  gardens: { min: 0, max: 4 },
  swamps: { min: 0, max: 4 },
  ponds: { min: 0, max: 8 },
  rivers: { min: 0, max: 3 },
  lakes: { min: 0, max: 3 },
} as const;

export function defaultMapGeneration(): MapGeneration {
  return {
    layout: 'generated',
    seed: null,
    relief: 1,
    biomeScale: 1,
    forestCover: 0.47,
    gardens: 2,
    swamps: 1,
    ponds: 3,
    river: true,
    revision: 2,
    rivers: 2,
    lakes: 1,
  };
}

export function validMapGeneration(value: unknown): value is MapGeneration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const map = value as Record<string, unknown>;
  if ((map.layout !== 'classic' && map.layout !== 'generated') || typeof map.river !== 'boolean')
    return false;
  if (map.seed !== null && !bounded(map.seed, MAP_LIMITS.seed, true)) return false;
  if (map.revision !== undefined && map.revision !== 2) return false;
  if (map.rivers !== undefined && !bounded(map.rivers, MAP_LIMITS.rivers, true)) return false;
  if (map.lakes !== undefined && !bounded(map.lakes, MAP_LIMITS.lakes, true)) return false;

  return (['relief', 'biomeScale', 'forestCover', 'gardens', 'swamps', 'ponds'] as const).every(
    (key) => bounded(map[key], MAP_LIMITS[key], ['gardens', 'swamps', 'ponds'].includes(key)),
  );
}

export function riverCount(map: MapGeneration): number {
  if (!map.river) return 0;
  return map.revision === 2 && map.layout === 'generated' ? (map.rivers ?? 2) : 1;
}

function bounded(value: unknown, limits: { min: number; max: number }, integer: boolean): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= limits.min &&
    value <= limits.max &&
    (!integer || Number.isInteger(value))
  );
}
