import { smoothNoise } from './Random';
import { WaterMap } from './WaterMap';

/** Вычисляет рельеф мира и влияние высоты и низин на температуру. */

export class Terrain {
  readonly water: WaterMap;

  constructor(private readonly seed: number) {
    this.water = new WaterMap((x, z) => this.naturalHeightAt(x, z));
  }

  heightAt(x: number, z: number): number {
    return this.water.carve(x, z, this.naturalHeightAt(x, z));
  }

  private naturalHeightAt(x: number, z: number): number {
    const broad = (smoothNoise(x / 38, z / 38, this.seed + 211) - 0.5) * 9;
    const ridges = (smoothNoise(x / 18, z / 18, this.seed + 251) - 0.5) * 3.2;
    const detail = (smoothNoise(x / 7, z / 7, this.seed + 283) - 0.5) * 0.7;
    let height = broad + ridges + detail;
    const flatten = (cx: number, cz: number, r: number, strength: number) =>
      Math.max(0, 1 - Math.hypot(x - cx, z - cz) / r) * strength;
    height *= 1 - flatten(0, 0, 13, 1);
    height *= 1 - flatten(34, 31, 19, 0.8);
    height *= 1 - flatten(-35, 29, 16, 0.8);
    const swamp = flatten(-31, -25, 20, 1);
    height = height * (1 - swamp) - swamp * 1.7;
    return height;
  }

  temperatureOffset(x: number, z: number): number {
    const elevation = this.heightAt(x, z);
    const lowCold = elevation < -1.5 ? (elevation + 1.5) * 0.45 : 0;
    return -Math.max(0, elevation) * 0.65 + lowCold;
  }
}
