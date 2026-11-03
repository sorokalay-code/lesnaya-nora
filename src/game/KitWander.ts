import type { GroundHeight } from './animals';
import type { Excavation } from './Excavation';
import { Random } from './Random';
import { BurrowRoaming } from './BurrowRoaming';
import type { KitData } from './types';

type Point = { x: number; y: number; z: number };

/** Выбирает отдельные достижимые цели крольчат в выкопанных ходах и на поверхности. */

export class KitWander {
  private readonly tunnels: BurrowRoaming;
  private readonly targets = new Map<number, { point: Point; until: number; revision: number }>();

  constructor(private readonly rng: Random) {
    this.tunnels = new BurrowRoaming(rng);
  }

  target(
    kit: KitData,
    home: Point,
    time: number,
    earth: Excavation,
    groundAt: GroundHeight,
  ): Point {
    const current = { x: kit.x ?? home.x, y: kit.y ?? home.y, z: kit.z ?? home.z };
    if (!kit.independent) {
      const target = this.tunnels.target(
        kit.id,
        current,
        home,
        time,
        earth,
        kit.age < 0.7 ? 0.55 : 1.2,
      );
      if (target) return target;
    }
    const previous = this.targets.get(kit.id);
    if (
      previous &&
      time < previous.until &&
      previous.revision === earth.revision &&
      Math.hypot(
        current.x - previous.point.x,
        current.y - previous.point.y,
        current.z - previous.point.z,
      ) > 0.45
    )
      return previous.point;

    let point = home;
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2),
        radius = this.rng.range(0.5, kit.independent ? 7 : 3.1);
      const x = home.x + Math.cos(angle) * radius,
        z = home.z + Math.sin(angle) * radius;
      const y = kit.independent ? groundAt(x, z) : earth.floorAt(x, z, home.y);
      if (
        !kit.independent &&
        earth.isSheltered(home.x, home.y, home.z) &&
        !earth.isSheltered(x, y, z)
      )
        continue;

      if (
        !kit.independent &&
        !earth.canMoveTo(x, z, current.y, earth.isSheltered(current.x, current.y, current.z))
      )
        continue;

      point = { x, y, z };
      break;
    }

    this.targets.set(kit.id, {
      point,
      until: time + this.rng.range(3, 8),
      revision: earth.revision,
    });
    return point;
  }

  forget(id: number): void {
    this.targets.delete(id);
    this.tunnels.forget(id);
  }
}
