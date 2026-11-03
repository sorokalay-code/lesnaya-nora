import type { DigNode } from './types';
import type { WaterSample } from './WaterMap';

export interface WaterTerrain {
  heightAt: (x: number, z: number) => number;
  waterAt: (x: number, z: number) => WaterSample | undefined;
}

export const SWIM_DEPTH = 0.38;
export const RABBIT_SWIM_SPEED = 1.8;
export const RABBIT_SWIM_IMMERSION = 0.43;

/** Разделяет дно и поверхность плавания, проверяет весь шаг и направляет сухопутных животных вдоль берега. */
export class WaterNavigation {
  constructor(readonly terrain: WaterTerrain) {}

  swimming(x: number, z: number): WaterSample | undefined {
    const water = this.terrain.waterAt(x, z);
    return water && water.depth > SWIM_DEPTH ? water : undefined;
  }

  height(x: number, z: number, immersion: number): number {
    const water = this.terrain.waterAt(x, z),
      ground = this.terrain.heightAt(x, z);
    return water ? Math.max(ground, water.level - immersion) : ground;
  }

  dryStep(from: DigNode, x: number, z: number): { x: number; z: number } {
    const dx = x - from.x,
      dz = z - from.z;
    for (const angle of [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57, 2.1, -2.1]) {
      const nx = from.x + dx * Math.cos(angle) - dz * Math.sin(angle);
      const nz = from.z + dx * Math.sin(angle) + dz * Math.cos(angle);
      if (this.clear(from, nx, nz)) return { x: nx, z: nz };
    }
    return from;
  }

  clear(from: { x: number; z: number }, x: number, z: number): boolean {
    const count = Math.max(1, Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.18));
    for (let i = 1; i <= count; i++)
      if (this.swimming(from.x + ((x - from.x) * i) / count, from.z + ((z - from.z) * i) / count))
        return false;
    return true;
  }

  nearestShore(x: number, z: number): DigNode {
    // Нужен при генерации/загрузке: животное могло оказаться на новом дне старого сохранения.
    for (let radius = 0.5; radius <= 16; radius += 0.5)
      for (let i = 0; i < 32; i++) {
        const angle = (i * Math.PI) / 16,
          nx = x + Math.cos(angle) * radius,
          nz = z + Math.sin(angle) * radius;
        if (!this.swimming(nx, nz)) return { x: nx, y: this.terrain.heightAt(nx, nz), z: nz };
      }
    return { x, y: this.terrain.heightAt(x, z), z };
  }
}
