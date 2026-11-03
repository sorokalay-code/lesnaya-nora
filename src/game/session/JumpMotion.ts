/** Баллистический рывок: фиксирует направление отталкивания и плавную дугу до приземления. */
export class JumpMotion {
  static readonly duration = 0.58;
  static readonly distance = 7;
  private progress = 1;
  private direction = { x: 0, z: -1 };

  get active(): boolean {
    return this.progress < 1;
  }

  cancel(): void {
    this.progress = 1;
  }

  start(x: number, z: number): boolean {
    if (this.active) return false;
    const length = Math.hypot(x, z);
    if (!length) return false;
    this.direction = { x: x / length, z: z / length };
    this.progress = 0;
    return true;
  }

  advance(dt: number) {
    const previous = this.progress;
    this.progress = Math.min(1, this.progress + Math.max(0, dt) / JumpMotion.duration);
    const distance = (this.progress - previous) * JumpMotion.distance;
    return {
      x: this.direction.x * distance,
      z: this.direction.z * distance,
      height: 4 * 0.85 * this.progress * (1 - this.progress),
      pitch: Math.sin(this.progress * Math.PI * 2) * -0.16,
      landed: previous < 1 && !this.active,
    };
  }
}
