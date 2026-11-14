import * as THREE from 'three';
import { smoothNoise } from './Random';
import type { Biome } from './types';
import { HIGHLAND_ELEVATION, smoothInfluence } from './Landform';

const GROUND_COLORS: Record<Biome, number> = {
  forest: 0x568255,
  meadow: 0x90b672,
  swamp: 0x77966e,
  garden: 0xab9268,
};
const highlandStone = new THREE.Color(0x918b7e);

/** Одинаковая палитра у основной земли и дальнего ландшафта предотвращает цветовой шов. */
export function groundColor(
  target: THREE.Color,
  x: number,
  z: number,
  seed: number,
  biome: Biome,
  elevation?: number,
): void {
  const base = GROUND_COLORS[biome];
  const variation =
    smoothNoise(x / 7, z / 7, seed + 101) * 0.22 + smoothNoise(x / 2.3, z / 2.3, seed + 311) * 0.1;
  target.setHex(base).multiplyScalar(0.84 + variation);
  if (elevation !== undefined && elevation > HIGHLAND_ELEVATION && biome !== 'garden')
    target.lerp(highlandStone, smoothInfluence(1 - (elevation - HIGHLAND_ELEVATION) / 15) * 0.88);
}
