import type { GroundHeight } from './types';

interface PounceProfile {
  range: number;
  distance: number;
  minimum: number;
  windup: number;
  duration: number;
  height: number;
}

/** Стратегия прыжка с фиксированной целью и подготовкой; владелец задаёт профиль и момент повторной атаки. */
export class PounceAttack {
  private launched = false;
  private quiet = 0;
  private progress = 0;
  private start?: { x: number; z: number; targetX: number; targetZ: number };

  constructor(
    private readonly profile: PounceProfile = {
      range: 9,
      distance: 8,
      minimum: 2.2,
      windup: 0.24,
      duration: 0.65,
      height: 1.5,
    },
  ) {}

  get active(): boolean {
    return this.start !== undefined;
  }

  consume(): void {
    this.launched = true;
    this.quiet = 0;
  }

  rearm(): void {
    if (!this.active) this.launched = false;
  }

  update(
    dt: number,
    chasing: boolean,
    position: { x: number; z: number },
    target: { x: number; z: number },
    groundAt: GroundHeight,
  ):
    | { x: number; y: number; z: number; landed: boolean; winding: boolean; started: boolean }
    | undefined {
    let started = false;
    if (!chasing && !this.start) {
      this.start = undefined;
      this.quiet += dt;
      if (this.quiet >= 8) this.launched = false;
      return;
    }
    this.quiet = 0;
    const distance = Math.hypot(target.x - position.x, target.z - position.z);
    if (
      !this.start &&
      !this.launched &&
      distance > this.profile.minimum &&
      distance <= this.profile.range
    ) {
      const scale = Math.min(1, this.profile.distance / distance);
      this.start = {
        x: position.x,
        z: position.z,
        targetX: position.x + (target.x - position.x) * scale,
        targetZ: position.z + (target.z - position.z) * scale,
      };
      this.progress = 0;
      this.launched = true;
      started = true;
    }
    if (!this.start) return;
    this.progress += dt;
    const fraction = Math.max(
      0,
      Math.min(1, (this.progress - this.profile.windup) / this.profile.duration),
    );
    const x = this.start.x + (this.start.targetX - this.start.x) * fraction;
    const z = this.start.z + (this.start.targetZ - this.start.z) * fraction;
    const result = {
      x,
      z,
      y: groundAt(x, z) + Math.sin(fraction * Math.PI) * this.profile.height,
      landed: fraction >= 1,
      winding: this.progress < this.profile.windup,
      started,
    };
    if (result.landed) this.start = undefined;
    return result;
  }
}
