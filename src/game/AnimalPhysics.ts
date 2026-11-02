export interface PhysicalBody {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  mass: number;
  sheltered: boolean;
  moveTo(x: number, z: number): boolean;
}

/** Разрешает столкновения через пространственную сетку с учётом высоты и подземных ходов. */

export class AnimalPhysics {
  constructor(private readonly cellSize = 3) {}

  resolve(bodies: PhysicalBody[]): void {
    for (let iteration = 0; iteration < 3; iteration++) {
      const cells = new Map<string, PhysicalBody[]>();
      const cell = (x: number, z: number) =>
        `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
      for (const body of bodies) {
        const key = cell(body.x, body.z),
          bucket = cells.get(key) ?? [];
        bucket.push(body);
        cells.set(key, bucket);
      }

      const checked = new Set<string>();
      let overlaps = 0;
      for (const body of bodies) {
        const cx = Math.floor(body.x / this.cellSize),
          cz = Math.floor(body.z / this.cellSize);
        for (let ox = -1; ox <= 1; ox++)
          for (let oz = -1; oz <= 1; oz++)
            for (const other of cells.get(`${cx + ox},${cz + oz}`) ?? []) {
              if (
                other === body ||
                other.sheltered !== body.sheltered ||
                Math.abs(other.y - body.y) > 1.2
              )
                continue;

              const key = body.id < other.id ? `${body.id}:${other.id}` : `${other.id}:${body.id}`;
              if (checked.has(key)) continue;
              checked.add(key);
              let dx = other.x - body.x,
                dz = other.z - body.z,
                distance = Math.hypot(dx, dz);
              const minimum = body.radius + other.radius;
              if (distance >= minimum) continue;

              overlaps++;
              if (distance < 0.0001) {
                const a = body.id * 2.399 + other.id * 0.73;
                dx = Math.cos(a) * 0.0001;
                dz = Math.sin(a) * 0.0001;
                distance = 0.0001;
              }

              const overlap = Math.min(minimum - distance, 0.7),
                mobilityA = 1 / body.mass,
                mobilityB = 1 / other.mass,
                total = mobilityA + mobilityB;
              if (total === 0) continue;

              const first = mobilityA / total,
                second = mobilityB / total;
              const nx = dx / distance,
                nz = dz / distance;
              if (
                first > 0 &&
                body.moveTo(body.x - nx * overlap * first, body.z - nz * overlap * first)
              ) {
                body.x -= nx * overlap * first;
                body.z -= nz * overlap * first;
              }

              if (
                second > 0 &&
                other.moveTo(other.x + nx * overlap * second, other.z + nz * overlap * second)
              ) {
                other.x += nx * overlap * second;
                other.z += nz * overlap * second;
              }
            }
      }

      if (overlaps === 0) break;
    }
  }
}
