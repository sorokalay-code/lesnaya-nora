export interface CarryPoint {
  x: number;
  y: number;
  z: number;
}
export type CarryPhase = 'lift' | 'carry' | 'fall';
export interface CarryStep extends CarryPoint {
  bird: CarryPoint;
  phase: CarryPhase;
  landed: boolean;
  fallHeight: number;
}

/** Независимая траектория подъёма, переноса и свободного падения; опорная высота читается на месте приземления. */
export class HawkCarry {
  private elapsed = 0;
  private readonly direction: { x: number; z: number };
  private readonly release: CarryPoint;

  constructor(
    private readonly start: CarryPoint,
    heading: number,
    private readonly bodyHeight: number,
  ) {
    this.direction = { x: -Math.sin(heading), z: -Math.cos(heading) };
    this.release = {
      x: this.clamp(start.x + this.direction.x * 2.3),
      y: start.y + 6,
      z: this.clamp(start.z + this.direction.z * 2.3),
    };
  }

  update(dt: number, floorAt: (x: number, z: number) => number): CarryStep {
    this.elapsed += Math.max(0, dt);
    let phase: CarryPhase = 'lift',
      x = this.start.x,
      z = this.start.z,
      y = this.start.y;
    if (this.elapsed < 1.6) {
      const t = this.elapsed / 1.6,
        ease = t * t * (3 - 2 * t);
      x = this.clamp(x + this.direction.x * 0.3 * ease);
      z = this.clamp(z + this.direction.z * 0.3 * ease);
      y += 6 * ease;
    } else if (this.elapsed < 2.4) {
      phase = 'carry';
      const distance = 0.3 + (2 * (this.elapsed - 1.6)) / 0.8;
      x = this.clamp(x + this.direction.x * distance);
      z = this.clamp(z + this.direction.z * distance);
      y = this.release.y;
    } else {
      phase = 'fall';
      const t = this.elapsed - 2.4;
      x = this.clamp(this.release.x + this.direction.x * t);
      z = this.clamp(this.release.z + this.direction.z * t);
      y = Math.max(floorAt(x, z), this.release.y - 7.5 * t * t);
    }
    const floor = floorAt(x, z);
    return {
      x,
      y,
      z,
      phase,
      landed: phase === 'fall' && y <= floor + 0.001,
      fallHeight: Math.max(0, this.release.y - floor),
      bird:
        phase === 'fall'
          ? {
              x: this.clamp(this.release.x + this.direction.x * (this.elapsed - 2.4) * 4),
              y: this.release.y + this.bodyHeight + 1 + (this.elapsed - 2.4) * 2,
              z: this.clamp(this.release.z + this.direction.z * (this.elapsed - 2.4) * 4),
            }
          : { x, y: y + this.bodyHeight + 0.18, z },
    };
  }

  dropFrom(point: CarryPoint): void {
    Object.assign(this.release, point);
    this.elapsed = 2.4;
  }

  private clamp(value: number): number {
    return Math.max(-96, Math.min(96, value));
  }
}
