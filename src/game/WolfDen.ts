import type { HabitatPoint } from './AnimalHabitats';
import type { DigNode } from './types';

export interface WolfDenSite extends HabitatPoint {
  angle: number;
}

export const DEN_DEPTH = 3.8;
export const DEN_HALF_WIDTH = 2.55;
export const DEN_HEIGHT = 2.2;
export const DEN_APPROACH = 2.4;
export const DEN_BED = 2.35;

/** Высота земляного пола в метрах относительно поверхности у входа. */
export function denFloor(depth: number): number {
  return 0.025 + 0.25 * Math.max(0, Math.min(depth / 1.08, 1));
}

/** Описывает вход, подход и камеру в одной системе координат с моделью логова. */
export class WolfDen {
  readonly entrance: DigNode;
  readonly approach: DigNode;
  private readonly sin: number;
  private readonly cos: number;

  constructor(
    readonly id: number,
    readonly site: WolfDenSite,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.sin = Math.sin(site.angle);
    this.cos = Math.cos(site.angle);
    this.entrance = this.point(0, 0);
    this.approach = this.point(0, -DEN_APPROACH);
  }

  point(side: number, depth: number): DigNode {
    const x = this.site.x + side * this.cos + depth * this.sin;
    const z = this.site.z - side * this.sin + depth * this.cos;
    return { x, y: this.heightAt(x, z), z };
  }

  chamberPoint(distance: number, member: number): DigNode {
    const point = this.point(member === 0 ? -0.67 : 0.67, distance);
    if (distance > 0) point.y = Math.max(point.y, this.entrance.y + denFloor(distance));
    return point;
  }

  /** Положительная глубина означает, что точка пересекла внешнюю границу модели. */
  penetration(x: number, z: number, margin = 0): number {
    const dx = x - this.site.x;
    const dz = z - this.site.z;
    const side = dx * this.cos - dz * this.sin;
    const depth = dx * this.sin + dz * this.cos;
    return Math.min(DEN_HALF_WIDTH - Math.abs(side), depth, DEN_DEPTH - depth) + margin;
  }
}
