export interface WaterBody {
  id: string;
  kind: 'pond' | 'river';
  points: readonly { x: number; z: number }[];
  radius: number;
  depth: number;
  level: number;
}

export interface WaterSample {
  body: WaterBody;
  level: number;
  depth: number;
}

const smooth = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};

/** Единая гидрология: форма водоёмов, вырезанное дно и уровень воды для графики и движения. */
export class WaterMap {
  readonly bodies: readonly WaterBody[];

  constructor(naturalHeight: (x: number, z: number) => number, scale = 1, amount = 1) {
    if (amount === 0) {
      this.bodies = [];
      return;
    }
    const definitions = [
      {
        id: 'meadow-pond',
        kind: 'pond' as const,
        points: [{ x: 9, z: -7 }],
        radius: 4.4,
        depth: 2.2,
      },
      {
        id: 'swamp-pond',
        kind: 'pond' as const,
        points: [{ x: -28, z: -25 }],
        radius: 6,
        depth: 2.6,
      },
      {
        id: 'small-pond',
        kind: 'pond' as const,
        points: [{ x: -39, z: -18 }],
        radius: 3.5,
        depth: 1.7,
      },
      {
        id: 'forest-river',
        kind: 'river' as const,
        points: [
          { x: -48, z: -88 },
          { x: -40, z: -70 },
          { x: -44, z: -53 },
          { x: -35, z: -38 },
          { x: -28, z: -25 },
        ],
        radius: 3.4,
        depth: 2.1,
      },
    ];
    // Масштабируем расположение вместе с картой, количество воды — шириной водоёмов.
    // Квадратный корень сохраняет близкую к линейной зависимость площади прудов от настройки.
    for (const body of definitions) {
      body.points = body.points.map(({ x, z }) => ({ x: x * scale, z: z * scale }));
      body.radius *= scale * Math.sqrt(amount);
    }
    const levels = definitions.map((body) => {
      let level = Infinity;
      for (const point of body.points)
        for (let i = 0; i < 16; i++) {
          const angle = (i * Math.PI) / 8;
          level = Math.min(
            level,
            naturalHeight(
              point.x + Math.cos(angle) * (body.radius + 1),
              point.z + Math.sin(angle) * (body.radius + 1),
            ) - 0.22,
          );
        }
      return level;
    });
    // Река впадает в топь: обе поверхности имеют один уровень, без ступеньки в месте соединения.
    levels[1] = levels[3] = Math.min(levels[1], levels[3]);
    this.bodies = definitions.map((body, i) => ({ ...body, level: levels[i] }));
  }

  distance(body: WaterBody, x: number, z: number): number {
    let distance = Math.hypot(x - body.points[0].x, z - body.points[0].z);
    for (let i = 1; i < body.points.length; i++) {
      const a = body.points[i - 1],
        b = body.points[i];
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      distance = Math.min(distance, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return distance - body.radius;
  }

  carve(x: number, z: number, natural: number): number {
    let nearest: WaterBody | undefined,
      nearestDistance = 3;
    for (const body of this.bodies) {
      const distance = this.distance(body, x, z);
      if (distance < nearestDistance) {
        nearest = body;
        nearestDistance = distance;
      }
    }
    if (!nearest) return natural;
    const bed = nearest.level - nearest.depth * smooth(-nearestDistance / 2.2);
    const bank =
      nearest.level + 0.12 + (natural - nearest.level - 0.12) * smooth(nearestDistance / 3);
    return nearestDistance < 0 ? bed : bank;
  }

  sample(x: number, z: number, ground: number): WaterSample | undefined {
    for (const body of this.bodies)
      if (this.distance(body, x, z) < 0 && body.level - ground > 0.025)
        return { body, level: body.level, depth: body.level - ground };
  }

  near(x: number, z: number, radius: number): boolean {
    return this.bodies.some((body) => this.distance(body, x, z) < radius);
  }
}
