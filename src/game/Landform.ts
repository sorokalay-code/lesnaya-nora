import { hash2, Random, smoothNoise } from './Random';

interface Massif {
  x: number;
  z: number;
  cos: number;
  sin: number;
  halfLength: number;
  halfWidth: number;
  height: number;
}

export const HIGHLAND_ELEVATION = 10;
export const LOWLAND_ELEVATION = -3;

export function smoothInfluence(distance: number): number {
  const t = Math.max(0, Math.min(1, 1 - distance));
  return t * t * (3 - 2 * t);
}

/** Задаёт хребты и широкие понижения в координатах базовой карты. */
export class Landform {
  private readonly massifs: readonly Massif[];

  constructor(private readonly seed: number) {
    const rng = new Random(Math.floor(hash2(seed, seed, 66531) * 0xffffffff));
    const direction = rng.range(0, Math.PI * 2);
    const count = rng.int(2, 3);
    this.massifs = Array.from({ length: count }, (_, index) => {
      const bearing = direction + index * ((2 * Math.PI) / count) + rng.range(-0.4, 0.4);
      const distance = rng.range(54, 83);
      const axis = bearing + rng.range(0.5, 2.3);
      return {
        x: Math.cos(bearing) * distance,
        z: Math.sin(bearing) * distance,
        cos: Math.cos(axis),
        sin: Math.sin(axis),
        halfLength: rng.range(32, 54),
        halfWidth: rng.range(19, 32),
        height: rng.range(19, 29),
      };
    });
  }

  heightAt(x: number, z: number): number {
    const basin = (smoothNoise(x / 53, z / 53, this.seed + 211) - 0.62) * 15;
    const hills = (smoothNoise(x / 20, z / 20, this.seed + 251) - 0.5) * 6;
    const detail = (smoothNoise(x / 7, z / 7, this.seed + 283) - 0.5) * 1.1;
    let mountains = 0;
    for (const massif of this.massifs) {
      const dx = x - massif.x;
      const dz = z - massif.z;
      if (Math.abs(dx) >= massif.halfLength || Math.abs(dz) >= massif.halfLength) continue;

      const along = dx * massif.cos + dz * massif.sin;
      const across = -dx * massif.sin + dz * massif.cos;
      const falloff = (along / massif.halfLength) ** 2 + (across / massif.halfWidth) ** 2;
      const saddles = 0.78 + smoothNoise(x / 12, z / 12, this.seed + 905) * 0.27;
      mountains = Math.max(mountains, massif.height * smoothInfluence(falloff) * saddles);
    }
    return basin + hills + detail + mountains;
  }
}
