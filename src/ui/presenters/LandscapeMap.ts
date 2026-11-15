import { HIGHLAND_ELEVATION, LOWLAND_ELEVATION } from '../../game/Landform';
import type { Terrain } from '../../game/Terrain';
import type { Biome } from '../../game/types';
import type { WaterBody } from '../../game/WaterMap';

export type LandscapeCell = Biome | 'highland' | 'lowland';
export interface MapWater {
  id: string;
  kind: WaterBody['kind'];
  points: readonly { x: number; z: number }[];
  radius: number;
}

export function landscapeCell(
  terrain: Terrain | undefined,
  biome: Biome,
  x: number,
  z: number,
  elevation?: number,
): LandscapeCell {
  if (!terrain?.hasHighlands || biome === 'garden' || biome === 'swamp') return biome;
  const height = elevation ?? terrain.heightAt(x, z);
  if (height >= HIGHLAND_ELEVATION) return 'highland';
  if (height <= LOWLAND_ELEVATION) return 'lowland';
  return biome;
}

export function mapWater(terrain?: Terrain): MapWater[] {
  return (terrain?.water.bodies ?? []).map(({ id, kind, points, radius }) => ({
    id,
    kind,
    points,
    radius,
  }));
}
