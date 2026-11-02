import { bodyContact } from './BodyContact';

export interface PhysicalBody {
  heading?: number;
  halfLength?: number;
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
    for (let iteration = 0; iteration < 6; iteration++) {
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
              let { dx, dz, distance } = bodyContact(body, other);
              const minimum = body.radius + other.radius;
              if (distance >= minimum) continue;

              overlaps++;
              if (distance < 0.0001) {
                // При пересечении осей капсул выбираем направление между центрами;
                // одинаковые центры разводим детерминированно, без дрожания от RNG.
                const a = body.id * 2.399 + other.id * 0.73;
                const centerDistance = Math.hypot(other.x - body.x, other.z - body.z);
                dx =
                  centerDistance > 0.0001
                    ? ((other.x - body.x) / centerDistance) * 0.0001
                    : Math.cos(a) * 0.0001;
                dz =
                  centerDistance > 0.0001
                    ? ((other.z - body.z) / centerDistance) * 0.0001
                    : Math.sin(a) * 0.0001;
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
              const movedA =
                first > 0 &&
                body.moveTo(body.x - nx * overlap * first, body.z - nz * overlap * first);
              if (movedA) {
                body.x -= nx * overlap * first;
                body.z -= nz * overlap * first;
              }

              const shareB = movedA ? second : 1;
              const movedB =
                second > 0 &&
                other.moveTo(other.x + nx * overlap * shareB, other.z + nz * overlap * shareB);
              if (movedB) {
                other.x += nx * overlap * shareB;
                other.z += nz * overlap * shareB;
              } else if (
                movedA &&
                second > 0 &&
                body.moveTo(body.x - nx * overlap * second, body.z - nz * overlap * second)
              ) {
                body.x -= nx * overlap * second;
                body.z -= nz * overlap * second;
              }
            }
      }

      if (overlaps === 0) break;
    }
  }
}
