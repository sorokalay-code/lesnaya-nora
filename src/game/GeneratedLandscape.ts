import { Landform, smoothInfluence } from './Landform';
import { riverCount, type MapGeneration } from './MapGeneration';
import { hash2, Random } from './Random';
import type { LandscapeRegion } from './WorldLayout';
import { distanceToSegment, type WaterDefinition } from './WaterMap';

type Point = WaterDefinition['points'][number];
type HeightAt = (x: number, z: number) => number;

const START_RADIUS = 13;
const MAX_WATER_WIDTH = Math.sqrt(5);
const BANK_MARGIN = 3;
const RIVER_STEP = 8;
const START_LEVEL_RADIUS = 10;

/** Размещает обжитые области и водоёмы в понижениях одной и той же карты высот. */
export class GeneratedLandscape {
  private readonly relief: Landform;
  readonly gardens: LandscapeRegion[] = [];
  readonly swamps: LandscapeRegion[] = [];
  readonly water: WaterDefinition[] = [];
  private readonly rng: Random;
  private readonly gardenHeights: number[] = [];
  private readonly swampHeights: number[] = [];

  constructor(
    seed: number,
    private readonly settings: MapGeneration,
  ) {
    this.relief = new Landform(seed);
    this.rng = new Random(Math.floor(hash2(seed, seed, 33197) * 0xffffffff));
    const heading = this.rng.int(0, 7) * (Math.PI / 4);
    const rivers = riverCount(settings);
    if (rivers) this.makeRivers(rivers, heading);

    for (let i = 0; i < settings.gardens; i++) {
      const radius = i === 0 ? 16 : 13;
      const site = this.site(
        radius * Math.SQRT2,
        (x, z) => {
          const height = this.heightAt(x, z);
          const slope =
            Math.abs(height - this.heightAt(x + 8, z)) + Math.abs(height - this.heightAt(x, z + 8));
          return Math.abs(height) * 0.45 + slope;
        },
        (point, area) => this.clearance(point, area),
      );
      this.gardens.push({
        ...site,
        radius,
        biome: 'garden',
        label: ['Дачный огород', 'Старый огород'][i] ?? `Огород ${i + 1}`,
      });
      this.gardenHeights.push(this.relief.heightAt(site.x, site.z));
    }

    for (let i = 0; i < settings.swamps; i++) {
      const radius = this.rng.range(15, 20);
      const site = this.site(
        radius,
        (x, z) => this.heightAt(x, z),
        (point, area) =>
          Math.min(
            this.clearance(point, area, true),
            ...this.swamps.map((swamp) => Math.hypot(swamp.x - point.x, swamp.z - point.z) - 28),
          ),
      );
      this.swamps.push({
        ...site,
        radius,
        biome: 'swamp',
        label: i === 0 ? 'Тихая топь' : `Топь ${i + 1}`,
      });
      this.swampHeights.push(Math.min(-3.5, this.relief.heightAt(site.x, site.z) - 1));
    }

    for (let i = 0; i < (settings.lakes ?? 1); i++) this.makeLake(i);
    for (let i = 0; i < settings.ponds; i++) {
      const radius = this.rng.range(3.1, 5.4);
      const site = this.site(
        radius * MAX_WATER_WIDTH + BANK_MARGIN,
        (x, z) => this.heightAt(x, z),
        (point, area) => this.clearance(point, area),
      );
      this.water.push({
        id: `pond-${i}`,
        kind: 'pond',
        points: [site],
        radius,
        depth: this.rng.range(1.8, 3),
      });
    }
  }

  heightAt(x: number, z: number): number {
    const relief = this.settings.relief;
    if (relief === 0) return 0;

    const fromStart = Math.hypot(x, z);
    if (fromStart <= START_LEVEL_RADIUS) return 0;
    let height = this.relief.heightAt(x, z);
    for (let i = 0; i < this.gardens.length; i++) {
      const garden = this.gardens[i];
      const radius = Math.hypot(x - garden.x, z - garden.z) / garden.radius;
      const weight = smoothInfluence((radius - 0.72) / 1.05);
      height = height * (1 - weight) + this.gardenHeights[i] * weight;
    }
    for (let i = 0; i < this.swamps.length; i++) {
      const swamp = this.swamps[i];
      const radius = Math.hypot(x - swamp.x, z - swamp.z) / swamp.radius;
      const weight = smoothInfluence((radius - 0.45) / 0.85);
      height = height * (1 - weight) + this.swampHeights[i] * weight;
    }
    const clearing = smoothInfluence((fromStart - START_LEVEL_RADIUS) / 14);
    return height * (1 - clearing) * relief;
  }

  private makeRivers(count: number, heading: number): void {
    const transform = (along: number, across: number) => ({
      x: Math.cos(heading) * along - Math.sin(heading) * across,
      z: Math.sin(heading) * along + Math.cos(heading) * across,
    });
    const main = this.channel(-145, 145, 51, transform);
    this.water.push({
      id: 'forest-river',
      kind: 'river',
      points: main,
      radius: 3.1,
      depth: 2.2,
      bankWidth: 11,
    });
    if (count >= 2) {
      const join = main[this.rng.int(12, 24)];
      const along = join.x * Math.cos(heading) + join.z * Math.sin(heading);
      const across = -join.x * Math.sin(heading) + join.z * Math.cos(heading);
      const tributary = this.channel(145, across, along, (u, v) => transform(v, u), 6, true);
      tributary[tributary.length - 1] = join;
      this.water.push({
        id: 'tributary',
        kind: 'river',
        points: tributary,
        radius: 2.05,
        depth: 1.75,
        bankWidth: 9,
      });
    }
    if (count >= 3) {
      const points = this.channel(145, -145, 56, (u, v) => transform(u, -v));
      this.water.push({
        id: 'second-river',
        kind: 'river',
        points,
        radius: 2.45,
        depth: 2,
        bankWidth: 10,
      });
    }
  }

  private channel(
    start: number,
    end: number,
    center: number,
    pointAt: (along: number, across: number) => Point,
    spread = 7,
    fixedEnd = false,
  ): Point[] {
    const rows = Math.ceil(Math.abs(end - start) / RIVER_STEP);
    const columns = spread * 2 + 1;
    const phase = this.rng.range(0, Math.PI * 2);
    const period = this.rng.range(29, 56);
    const offset = this.rng.range(8, 14);
    const costs: number[][] = [];
    const previous: number[][] = [];
    const cross = (column: number) => center + (column - spread) * 3.4;
    // Маршрут выбирается целиком. Отклонения помогают обойти возвышенности, ограничения
    // на соседние шаги не дают руслу телепортироваться между долинами.
    for (let row = 0; row <= rows; row++) {
      const along = end + ((start - end) * row) / rows;
      const guide = center + Math.sin(along / period + phase) * offset;
      const scores = Array<number>(columns).fill(Infinity);
      const parents = Array<number>(columns).fill(-1);
      for (let column = 0; column < columns; column++) {
        if (row === 0 && fixedEnd && column !== spread) continue;
        const across = cross(column);
        const point = pointAt(along, across);
        if (Math.hypot(point.x, point.z) < 25) continue;
        const ground = this.heightAt(point.x, point.z);
        const penalty = ground * 1.2 + Math.abs(across - guide) * 0.24;
        if (row === 0) scores[column] = penalty;
        else
          for (
            let from = Math.max(0, column - 2);
            from <= Math.min(columns - 1, column + 2);
            from++
          ) {
            const cost = costs[row - 1][from] + penalty + (column - from) ** 2 * 0.8;
            if (cost >= scores[column]) continue;
            scores[column] = cost;
            parents[column] = from;
          }
      }
      costs.push(scores);
      previous.push(parents);
    }
    let column = costs[rows].indexOf(Math.min(...costs[rows]));
    const points: Point[] = [];
    for (let row = rows; row >= 0; row--) {
      points.push(pointAt(end + ((start - end) * row) / rows, cross(column)));
      column = previous[row][column];
    }
    // Один проход сглаживает углы сетки, сохраняя берега, точки соединения и выходы.
    return points.map((point, index) => {
      const before = points[index - 1];
      const after = points[index + 1];
      if (!before || !after) return point;
      return {
        x: (before.x + point.x * 2 + after.x) / 4,
        z: (before.z + point.z * 2 + after.z) / 4,
      };
    });
  }

  private makeLake(index: number): void {
    const radius = this.rng.range(7, 9);
    const length = this.rng.range(6, 10);
    const area = radius * MAX_WATER_WIDTH + Math.hypot(length, 3) + 7;
    const main = this.water[0];
    let site: Point | undefined;
    if (index === 0 && main?.kind === 'river') {
      const candidates = main.points.filter(
        (point) =>
          Math.max(Math.abs(point.x), Math.abs(point.z)) < 103 - area &&
          this.clearance(point, area, true) >= 0,
      );
      site = candidates.sort((a, b) => this.heightAt(a.x, a.z) - this.heightAt(b.x, b.z))[0];
    }
    // Озеро может занимать пойму, поэтому близость русла здесь допустима.
    site ??= this.site(
      area,
      (x, z) => this.heightAt(x, z),
      (point, size) => this.clearance(point, size, true),
    );
    const angle = this.rng.range(0, Math.PI * 2);
    const points = [-1, -0.56, 0, 0.35, 0.78].map((step) => {
      const lateral = this.rng.range(-3, 3);
      return {
        x: site.x + Math.cos(angle) * length * step - Math.sin(angle) * lateral,
        z: site.z + Math.sin(angle) * length * step + Math.cos(angle) * lateral,
      };
    });
    this.water.push({
      id: `lake-${index}`,
      kind: 'lake',
      points,
      radius,
      depth: this.rng.range(3.4, 5.1),
      bankWidth: 7,
    });
  }

  private site(
    radius: number,
    score: HeightAt,
    clearanceAt: (point: Point, radius: number) => number,
  ): Point {
    let best: Point = { x: 0, z: 0 };
    let bestScore = Infinity;
    const extent = Math.floor(103 - radius);
    for (let z = -extent; z <= extent; z += 5)
      for (let x = -extent; x <= extent; x += 5) {
        if (Math.hypot(x, z) < START_RADIUS + radius) continue;
        const point = { x, z };
        const clearance = clearanceAt(point, radius);
        const cost = score(x, z) + this.rng.range(0, 5) - Math.min(0, clearance) * 100;
        if (cost >= bestScore) continue;
        best = point;
        bestScore = cost;
      }
    return best;
  }

  private clearance(point: Point, radius: number, allowRiver = false): number {
    let distance = Math.hypot(point.x, point.z) - START_RADIUS - radius;
    for (const garden of this.gardens)
      distance = Math.min(
        distance,
        Math.hypot(point.x - garden.x, point.z - garden.z) -
          garden.radius * Math.SQRT2 -
          radius -
          2,
      );
    for (const body of this.water) {
      if (allowRiver && body.kind === 'river') continue;
      const margin = body.radius * MAX_WATER_WIDTH + radius + BANK_MARGIN;
      for (let i = 0; i < body.points.length; i++) {
        const a = body.points[i];
        const b = body.points[i + 1] ?? a;
        distance = Math.min(distance, distanceToSegment(point.x, point.z, a, b) - margin);
      }
    }
    return distance;
  }
}
