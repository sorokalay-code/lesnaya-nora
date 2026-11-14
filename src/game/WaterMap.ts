import { WorldLayout } from './WorldLayout';

export interface WaterBody {
  id: string;
  kind: 'pond' | 'lake' | 'river';
  points: readonly { x: number; z: number }[];
  radius: number;
  depth: number;
  level: number;
  bankWidth?: number;
}

export type WaterDefinition = Omit<WaterBody, 'level'>;

export interface WaterSample {
  body: WaterBody;
  level: number;
  depth: number;
}

const smooth = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};

type Point = WaterBody['points'][number];
type Segment = readonly [Point, Point];

export function distanceToSegment(x: number, z: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

function segments(points: readonly Point[]): Segment[] {
  if (points.length === 1) return [[points[0], points[0]]];
  return points.slice(1).map((point, i) => [points[i], point]);
}

function overlap(a: WaterDefinition, b: WaterDefinition): boolean {
  const margin = a.radius + b.radius;
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return segments(a.points).some(([p, q]) =>
    segments(b.points).some(([r, s]) => {
      if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true;
      return (
        Math.min(
          distanceToSegment(p.x, p.z, r, s),
          distanceToSegment(q.x, q.z, r, s),
          distanceToSegment(r.x, r.z, p, q),
          distanceToSegment(s.x, s.z, p, q),
        ) < margin
      );
    }),
  );
}

interface WaterBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Единая гидрология: форма водоёмов, вырезанное дно и уровень воды для графики и движения. */
export class WaterMap {
  readonly bodies: readonly WaterBody[];
  private readonly bounds = new WeakMap<WaterBody, WaterBounds>();

  constructor(
    naturalHeight: (x: number, z: number) => number,
    scale = 1,
    amount = 1,
    plan?: readonly WaterDefinition[],
  ) {
    if (amount === 0) {
      this.bodies = [];
      return;
    }
    // Масштабируем расположение вместе с картой, количество воды — шириной водоёмов.
    // Квадратный корень сохраняет близкую к линейной зависимость площади прудов от настройки.
    const definitions = (plan ?? new WorldLayout(0).water).map((body) => ({
      ...body,
      points: body.points.map(({ x, z }) => ({ x: x * scale, z: z * scale })),
      radius: body.radius * scale * Math.sqrt(amount),
      bankWidth: body.bankWidth === undefined ? undefined : body.bankWidth * scale,
    }));
    const levels = definitions.map((body) => {
      const samples = [];
      for (const point of body.points) {
        let shore = Infinity;
        for (let i = 0; i < 16; i++) {
          const angle = (i * Math.PI) / 8;
          shore = Math.min(
            shore,
            naturalHeight(
              point.x + Math.cos(angle) * (body.radius + 1),
              point.z + Math.sin(angle) * (body.radius + 1),
            ) - 0.22,
          );
        }
        samples.push(shore);
      }
      if (body.bankWidth === undefined) return Math.min(...samples);

      // Один уровень на связный водоём. Низкий квартиль не даёт одной локальной яме
      // чрезмерно опустить весь водоём, дно и берега формируются вокруг уровня.
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 4)];
    });
    const joins: [number, number][] = [];
    for (let i = 0; i < definitions.length; i++)
      for (let j = i + 1; j < definitions.length; j++) {
        const a = definitions[i];
        const b = definitions[j];
        // Для неизменяемых карт сохраняем исходное правило, чтобы высота не сместилась.
        const connected =
          a.bankWidth !== undefined || b.bankWidth !== undefined
            ? overlap(a, b)
            : a.points.some(
                (point) => this.distance({ ...b, level: 0 }, point.x, point.z) < a.radius,
              );
        if (connected) joins.push([i, j]);
      }
    for (let pass = 0; pass < definitions.length; pass++)
      for (const [i, j] of joins) levels[i] = levels[j] = Math.min(levels[i], levels[j]);
    this.bodies = definitions.map((body, i) => ({ ...body, level: levels[i] }));
    for (const body of this.bodies) {
      this.bounds.set(body, {
        minX: Math.min(...body.points.map((point) => point.x)) - body.radius,
        maxX: Math.max(...body.points.map((point) => point.x)) + body.radius,
        minZ: Math.min(...body.points.map((point) => point.z)) - body.radius,
        maxZ: Math.max(...body.points.map((point) => point.z)) + body.radius,
      });
    }
  }

  distance(body: WaterBody, x: number, z: number): number {
    let distance = Math.hypot(x - body.points[0].x, z - body.points[0].z);
    for (let i = 1; i < body.points.length; i++) {
      const a = body.points[i - 1],
        b = body.points[i];
      distance = Math.min(distance, distanceToSegment(x, z, a, b));
    }
    return distance - body.radius;
  }

  carve(x: number, z: number, natural: number): number {
    let nearest: WaterBody | undefined,
      nearestDistance = 3;
    let valley = natural;
    let dryEdge = -Infinity;
    for (const body of this.bodies) {
      const bankWidth = body.bankWidth ?? 3;
      if (!this.inBounds(body, x, z, bankWidth)) continue;
      const distance = this.distance(body, x, z);
      if (distance < nearestDistance) {
        nearest = body;
        nearestDistance = distance;
      }
      if (body.bankWidth !== undefined && distance >= 0 && distance < bankWidth) {
        const shore = body.level + 0.12;
        const blend = shore + (natural - shore) * smooth(distance / bankWidth);
        valley = Math.min(valley, blend);
        // Если естественный грунт ниже воды, поднимаем только узкую кромку.
        if (natural < shore) {
          const skirt = natural + (shore - natural) * smooth(1 - distance / 3);
          dryEdge = Math.max(dryEdge, skirt);
        }
      }
    }
    if (!nearest || (nearestDistance >= 0 && nearest.bankWidth !== undefined))
      return Math.max(valley, dryEdge);
    const bed = nearest.level - nearest.depth * smooth(-nearestDistance / 2.2);
    const bankHeight =
      nearest.level + 0.12 + (natural - nearest.level - 0.12) * smooth(nearestDistance / 3);
    return nearestDistance < 0 ? bed : Math.max(bankHeight - (natural - valley), dryEdge);
  }

  sample(x: number, z: number, ground: number): WaterSample | undefined {
    for (const body of this.bodies)
      if (
        this.inBounds(body, x, z, 0) &&
        this.distance(body, x, z) < 0 &&
        body.level - ground > 0.025
      )
        return { body, level: body.level, depth: body.level - ground };
  }

  near(x: number, z: number, radius: number): boolean {
    return this.bodies.some(
      (body) => this.inBounds(body, x, z, radius) && this.distance(body, x, z) < radius,
    );
  }

  private inBounds(body: WaterBody, x: number, z: number, margin: number): boolean {
    const bounds = this.bounds.get(body)!;
    return (
      x >= bounds.minX - margin &&
      x <= bounds.maxX + margin &&
      z >= bounds.minZ - margin &&
      z <= bounds.maxZ + margin
    );
  }
}
