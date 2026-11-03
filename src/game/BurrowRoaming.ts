import type { Excavation } from './Excavation';
import { Random } from './Random';
import type { DigNode } from './types';

interface Target {
  point: DigNode;
  home: DigNode;
  until: number;
  revision: number;
}

/** Выбирает долговременные цели во всей связной норе, учитывая уклон и время пути до дальней комнаты. */
export class BurrowRoaming {
  private readonly targets = new Map<number, Target>();

  constructor(private readonly rng: Random) {}

  target(
    id: number,
    from: DigNode,
    home: DigNode,
    time: number,
    earth: Excavation,
    speed: number,
  ): DigNode | undefined {
    const previous = this.targets.get(id);
    if (
      previous &&
      previous.revision === earth.revision &&
      time < previous.until &&
      Math.hypot(previous.home.x - home.x, previous.home.y - home.y, previous.home.z - home.z) <
        0.8 &&
      Math.hypot(from.x - previous.point.x, from.y - previous.point.y, from.z - previous.point.z) >
        0.45
    )
      return previous.point;
    const floors = earth.roamingFloors?.(home);
    if (!floors?.length) return;
    const floor = this.rng.pick(floors);
    const x = floor.x + this.rng.range(-0.4, 0.4),
      z = floor.z + this.rng.range(-0.4, 0.4);
    const y = earth.floorAt(x, z, floor.y);
    const point = earth.isSheltered(x, y, z) ? { x, y, z } : { ...floor };
    this.targets.set(id, {
      point,
      home: { ...home },
      revision: earth.revision,
      until:
        time +
        this.rng.range(5, 9) +
        Math.hypot(from.x - point.x, from.y - point.y, from.z - point.z) / Math.max(0.3, speed),
    });
    return point;
  }

  forget(id: number): void {
    this.targets.delete(id);
  }
}
