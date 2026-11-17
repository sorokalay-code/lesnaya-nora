/** Кэширует неизменяемые целочисленные вершины рельефа в плотной сетке без строковых ключей. */
export class GroundHeightCache {
  private readonly size: number;
  private readonly values: Float64Array;

  constructor(
    private readonly radius: number,
    private readonly sample: (x: number, z: number) => number,
  ) {
    this.size = radius * 2 + 1;
    this.values = new Float64Array(this.size * this.size).fill(NaN);
  }

  get(x: number, z: number): number {
    if (Math.abs(x) > this.radius || Math.abs(z) > this.radius) return this.sample(x, z);
    const index = (z + this.radius) * this.size + x + this.radius;
    let value = this.values[index];
    if (Number.isNaN(value)) {
      value = this.sample(x, z);
      this.values[index] = value;
    }
    return value;
  }
}
