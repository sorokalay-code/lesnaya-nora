/** Считает отдельные нажатия при освобождении; удержание и слишком частые события не дают прогресс. */
export class WebEscape {
  static readonly required = 14;
  static readonly grace = 8;
  hits = 0;
  elapsed = 0;
  private lastPress = -Infinity;

  reset(): void {
    this.hits = 0;
    this.elapsed = 0;
    this.lastPress = -Infinity;
  }

  update(dt: number): void {
    this.elapsed += dt;
  }

  press(inputSeconds = this.elapsed): boolean {
    if (inputSeconds - this.lastPress < 0.09) return false;
    this.lastPress = inputSeconds;
    this.hits++;
    return this.hits >= WebEscape.required;
  }
}
