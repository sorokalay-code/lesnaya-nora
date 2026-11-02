import type { Excavation } from './Excavation';
import type { DigNode } from './types';

/** Ведёт существо по сохранённым точкам, учитывает пол и делает паузу при тесноте. */
export class GroundNavigator {
  private route: DigNode[] = [];
  private index = 0;
  private destination?: DigNode;
  private revision = -1;
  private expected?: DigNode;
  private retryAt = 0;
  private plannedAt = -Infinity;

  step(
    from: DigNode,
    target: DigNode,
    earth: Excavation,
    dt: number,
    time: number,
    speed: number,
    stop = 0.3,
  ): { point: DigNode; moving: boolean } {
    if (this.expected && Math.hypot(from.x - this.expected.x, from.z - this.expected.z) > 0.09) {
      this.retryAt = time + 0.45;
      this.expected = undefined;
    }
    if (time < this.retryAt) return { point: from, moving: false };
    const changed =
      !this.destination ||
      Math.hypot(
        target.x - this.destination.x,
        target.y - this.destination.y,
        target.z - this.destination.z,
      ) > 0.85;
    if (this.revision !== earth.revision || (changed && time - this.plannedAt > 0.6)) {
      this.route = earth.route(from, target);
      this.index = 0;
      this.destination = { ...target };
      this.revision = earth.revision;
      this.plannedAt = time;
    }
    if (
      Math.hypot(target.x - from.x, target.z - from.z) < stop &&
      Math.abs(target.y - from.y) < 0.7
    )
      return { point: from, moving: false };
    while (
      this.index < this.route.length - 1 &&
      Math.hypot(this.route[this.index].x - from.x, this.route[this.index].z - from.z) < 0.28
    )
      this.index++;
    const waypoint = this.index === this.route.length - 1 ? target : this.route[this.index];
    if (!waypoint) return { point: from, moving: false };
    const dx = waypoint.x - from.x,
      dz = waypoint.z - from.z;
    const distance = Math.hypot(dx, dz);
    const final = this.index === this.route.length - 1;
    const amount = Math.min(speed * dt, Math.max(0, distance - (final ? stop : 0)));
    if (amount < 0.001 || distance < 0.001) return { point: from, moving: false };
    const x = from.x + (dx / distance) * amount,
      z = from.z + (dz / distance) * amount;
    const sheltered = earth.isSheltered(from.x, from.y, from.z);
    const y = earth.floorAt(x, z, from.y);
    if (!earth.canMoveTo(x, z, from.y, sheltered) || Math.abs(y - from.y) > 1.1) {
      this.retryAt = time + 0.8;
      this.destination = undefined;
      return { point: from, moving: false };
    }
    const point = { x, y, z };
    this.expected = point;
    return { point, moving: true };
  }

  reset(): void {
    this.destination = undefined;
    this.expected = undefined;
    this.revision = -1;
    this.retryAt = 0;
  }
}
