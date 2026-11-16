import type { HabitatPoint } from './AnimalHabitats';
import { traceGround } from './GroundContact';
import type { DigNode } from './types';

const STRIDE = 2.5;
const MAX_VISITS = 120;
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
] as const;

interface RouteCell {
  point: DigNode;
  col: number;
  row: number;
  cost: number;
  score: number;
  previous?: RouteCell;
}

/** Ищет обход к логову по рельефу. Простая прямая проверяется до поиска по ячейкам. */
export class WolfDenRoute {
  private target?: HabitatPoint;
  private points: HabitatPoint[] = [];
  private nextPlan = 0;

  step(
    from: DigNode,
    target: HabitatPoint,
    time: number,
    heightAt: (x: number, z: number) => number | undefined,
  ): HabitatPoint {
    if (
      !this.target ||
      Math.hypot(this.target.x - target.x, this.target.z - target.z) > 0.65 ||
      time >= this.nextPlan
    ) {
      this.target = target;
      this.points = this.plan(from, target, heightAt);
      this.nextPlan = time + (this.points.length > 0 ? 5 : 2.5);
    }

    while (
      this.points[0] &&
      Math.hypot(this.points[0].x - from.x, this.points[0].z - from.z) < 0.32
    )
      this.points.shift();
    return this.points[0] ?? target;
  }

  private plan(
    from: DigNode,
    target: HabitatPoint,
    heightAt: (x: number, z: number) => number | undefined,
  ): HabitatPoint[] {
    const distance = (point: HabitatPoint) => Math.hypot(point.x - target.x, point.z - target.z);
    const walkable = (start: DigNode, end: HabitatPoint) => {
      const reached = traceGround(start, end.x, end.z, { heightAt });
      return Math.hypot(reached.x - end.x, reached.z - end.z) < 0.01;
    };
    if (walkable(from, target)) return [];

    const open: RouteCell[] = [{ point: from, col: 0, row: 0, cost: 0, score: distance(from) }];
    const best = new Map([['0,0', 0]]);
    for (let visit = 0; visit < MAX_VISITS && open.length; visit++) {
      open.sort((a, b) => b.score - a.score);
      const current = open.pop()!;
      if (current.cost > (best.get(`${current.col},${current.row}`) ?? Infinity)) continue;
      if (distance(current.point) < STRIDE * 3 && walkable(current.point, target)) {
        const route = [target];
        for (let cell = current; cell.previous; cell = cell.previous) route.push(cell.point);
        return route.reverse();
      }

      for (const [dx, dz] of DIRECTIONS) {
        const col = current.col + dx;
        const row = current.row + dz;
        const key = `${col},${row}`;
        const x = from.x + col * STRIDE;
        const z = from.z + row * STRIDE;
        const y = heightAt(x, z);
        if (y === undefined) continue;

        const point = { x, y, z };
        const cost = current.cost + Math.hypot(dx * STRIDE, dz * STRIDE, y - current.point.y);
        if (cost >= (best.get(key) ?? Infinity) || !walkable(current.point, point)) continue;

        best.set(key, cost);
        open.push({ point, col, row, cost, score: cost + distance(point), previous: current });
      }
    }
    return [];
  }
}
