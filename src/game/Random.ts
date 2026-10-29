export class Random {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
  pick<T>(items: readonly T[]): T { return items[Math.floor(this.next() * items.length)]; }
  chance(p: number): boolean { return this.next() < p; }
}

export function hash2(x: number, z: number, seed: number): number {
  let n = Math.imul(x + 374761393, 668265263) ^ Math.imul(z + 1442695041, 2246822519) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function smoothNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
