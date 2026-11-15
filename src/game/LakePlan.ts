import { hash2 } from './Random';
import type { WaterDefinition, WaterPoint } from './WaterMap';

const MAP_EDGE = 110;
const DRY_CORE = 0.145;
const OUTER_SHORE = 0.997;
const WEDGE_GAP = 0.012;

function perimeter(turn: number, radius: number): WaterPoint {
  const side = (turn - Math.floor(turn)) * 4;
  const offset = (side % 1) * 2 - 1;
  const scale = radius * MAP_EDGE;
  if (side < 1) return { x: offset * scale, z: -scale };
  if (side < 2) return { x: scale, z: offset * scale };
  if (side < 3) return { x: -offset * scale, z: scale };
  return { x: -scale, z: -offset * scale };
}

function shore(start: number, width: number, inner: number, outer: number): WaterPoint[] {
  const steps = Math.max(4, Math.ceil(width * 32));
  const turns = Array.from({ length: steps + 1 }, (_, i) => start + (width * i) / steps);
  // Точки на углах квадрата сохраняют точную площадь сектора и не срезают границу карты.
  for (let corner = Math.floor(start * 4) + 1; corner / 4 < start + width; corner++)
    turns.push(corner / 4);
  turns.sort((a, b) => a - b);
  const roundness = Math.min(0.12, (0.3 - Math.min(0.3, width)) / 2);
  const bend = (turn: number) =>
    (1 - Math.sin((Math.PI * (turn - start)) / width)) * (outer - inner) * roundness;
  return [
    ...turns.map((turn) => perimeter(turn, outer - bend(turn))),
    ...turns.reverse().map((turn) => {
      const ray = perimeter(turn, 1);
      const radius = ((inner + bend(turn)) * MAP_EDGE) / Math.hypot(ray.x, ray.z);
      return { x: ray.x * radius, z: ray.z * radius };
    }),
  ];
}

function area(points: readonly WaterPoint[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.z - a.z * b.x;
  }
  return Math.abs(twice) / 2 / (2 * MAP_EDGE) ** 2;
}

/**
 * Делит пространство вокруг сухой поляны на независимые сектора с проходами.
 * Подбирает ширину каждого по площади контура, поэтому масштаб мира долю не меняет.
 */
export class LakePlan {
  static build(seed: number, percentages: readonly number[]): WaterDefinition[] {
    if (!percentages.length) return [];

    const total = percentages.reduce((sum, percent) => sum + percent, 0) / 100;
    const packing = Math.max(0, Math.min(1, (total - 0.15) / 0.75));
    const inner = 0.35 + (DRY_CORE - 0.35) * packing;
    const outer = 0.87 + (OUTER_SHORE - 0.87) * packing;
    const capacity = outer ** 2 - inner ** 2;
    // У небольших озёр округляем узкие концы. Этот запас в ширине помещает и 50% + 40%.
    const widths = percentages.map((percent) => (percent / 100 / capacity) * 1.13);
    const maxWidths = widths.reduce((sum, width) => sum + width, 0);
    const fraction = Math.min(1, (1 - percentages.length * WEDGE_GAP) / maxWidths);
    const spare = (1 - maxWidths * fraction) / percentages.length;
    let start = hash2(seed, seed, 81833);
    return percentages.map((percent, index) => {
      const slot = widths[index] * fraction;
      let low = 0;
      let high = slot;
      for (let i = 0; i < 18; i++) {
        const mid = (low + high) / 2;
        if (area(shore(start, mid, inner, outer)) < percent / 100) low = mid;
        else high = mid;
      }
      const outline = shore(start, low, inner, outer);
      const stations = Math.max(3, Math.ceil(low * 24));
      const points = Array.from({ length: stations }, (_, i) =>
        perimeter(start + (low * (i + 0.5)) / stations, (inner + outer) / 2),
      );
      start += slot + spare;
      return {
        id: `lake-${index}`,
        kind: 'lake',
        outline,
        points,
        radius: 0,
        depth: 3.8,
        bankWidth: 16,
        fixedLevel: -0.35,
      };
    });
  }
}
