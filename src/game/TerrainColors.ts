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
const swampMud = new THREE.Color(0x46584f);
const swampMoss = new THREE.Color(0x80916a);

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
  if (biome === 'swamp') {
    const wetness = smoothNoise(x / 5, z / 5, seed + 421);
    const mud = smoothNoise(x / 2, z / 2, seed + 613);
    const moss = smoothNoise(x / 9, z / 9, seed + 701);
    target.lerp(swampMud, 0.16 + wetness * 0.32 + mud * 0.08);
    target.lerp(swampMoss, moss * 0.16);
  }
  if (elevation !== undefined && elevation > HIGHLAND_ELEVATION && biome !== 'garden')
    target.lerp(highlandStone, smoothInfluence(1 - (elevation - HIGHLAND_ELEVATION) / 15) * 0.88);
}
