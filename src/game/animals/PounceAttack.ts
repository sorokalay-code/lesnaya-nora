import type { GroundHeight } from './types';

/** Один прыжок на начало погони: цель фиксируется до отталкивания, поэтому рысью можно увернуться. */
export class PounceAttack {
  private launched = false;
  private quiet = 0;
  private progress = 0;
  private start?: { x: number; z: number; targetX: number; targetZ: number };

  get active(): boolean {
    return this.start !== undefined;
  }

  consume(): void {
    this.launched = true;
    this.quiet = 0;
  }

  update(
    dt: number,
    chasing: boolean,
    position: { x: number; z: number },
    target: { x: number; z: number },
    groundAt: GroundHeight,
  ): { x: number; y: number; z: number; landed: boolean; winding: boolean } | undefined {
    if (!chasing && !this.start) {
      this.start = undefined;
      this.quiet += dt;
      if (this.quiet >= 8) this.launched = false;
      return;
    }
    this.quiet = 0;
    const distance = Math.hypot(target.x - position.x, target.z - position.z);
    if (!this.start && !this.launched && distance > 2.2 && distance <= 9) {
      const scale = Math.min(1, 8 / distance);
      this.start = {
        x: position.x,
        z: position.z,
        targetX: position.x + (target.x - position.x) * scale,
        targetZ: position.z + (target.z - position.z) * scale,
      };
      this.progress = 0;
      this.launched = true;
    }
    if (!this.start) return;
    this.progress += dt;
    const fraction = Math.max(0, Math.min(1, (this.progress - 0.24) / 0.65));
    const x = this.start.x + (this.start.targetX - this.start.x) * fraction;
    const z = this.start.z + (this.start.targetZ - this.start.z) * fraction;
    const result = {
      x,
      z,
      y: groundAt(x, z) + Math.sin(fraction * Math.PI) * 1.5,
      landed: fraction >= 1,
      winding: this.progress < 0.24,
    };
    if (result.landed) this.start = undefined;
    return result;
  }
}
