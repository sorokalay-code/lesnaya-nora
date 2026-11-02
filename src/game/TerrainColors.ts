import * as THREE from 'three';
import { smoothNoise } from './Random';
import type { Biome, Season } from './types';

const GROUND_COLORS: Record<Biome, number> = {
  forest: 0x568255,
  meadow: 0x90b672,
  swamp: 0x77966e,
  garden: 0xab9268,
};

/** Одинаковая палитра у основной земли и дальнего ландшафта предотвращает цветовой шов. */
export function groundColor(
  target: THREE.Color,
  x: number,
  z: number,
  seed: number,
  biome: Biome,
): void {
  const base = GROUND_COLORS[biome];
  const variation =
    smoothNoise(x / 7, z / 7, seed + 101) * 0.22 + smoothNoise(x / 2.3, z / 2.3, seed + 311) * 0.1;
  target.setHex(base).multiplyScalar(0.84 + variation);
}

export function seasonalGroundColor(color: THREE.Color, season: Season): void {
  const { r, g, b } = color;
  if (season === 'Зима') color.setRGB(r * 0.32 + 0.68, g * 0.34 + 0.66, b * 0.36 + 0.64);
  else if (season === 'Осень') color.setRGB(Math.min(1, r * 1.22), g * 0.88, b * 0.71);
  else if (season === 'Весна') color.setRGB(r * 0.9, Math.min(1, g * 1.1), b * 0.9);
}
