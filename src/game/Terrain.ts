import { smoothNoise } from './Random';
import { WaterMap } from './WaterMap';
import { WorldLayout } from './WorldLayout';

/** Вычисляет рельеф мира и влияние высоты и низин на температуру. */

export class Terrain {
  readonly water: WaterMap;

  constructor(
    private readonly seed: number,
    private readonly scale = 1,
    water = 1,
    private readonly layout = new WorldLayout(seed),
  ) {
    this.water = new WaterMap((x, z) => this.naturalHeightAt(x, z), scale, water, layout.water);
  }

  heightAt(x: number, z: number): number {
    return this.water.carve(x, z, this.naturalHeightAt(x, z));
  }

  private naturalHeightAt(x: number, z: number): number {
    x /= this.scale;
    z /= this.scale;
    const broad = (smoothNoise(x / 38, z / 38, this.seed + 211) - 0.5) * 9;
    const ridges = (smoothNoise(x / 18, z / 18, this.seed + 251) - 0.5) * 3.2;
    const detail = (smoothNoise(x / 7, z / 7, this.seed + 283) - 0.5) * 0.7;
    let height = (broad + ridges + detail) * this.layout.settings.relief;
    const flatten = (cx: number, cz: number, r: number, strength: number) =>
      Math.max(0, 1 - Math.hypot(x - cx, z - cz) / r) * strength;
    height *= 1 - flatten(0, 0, 13, 1);
    for (const garden of this.layout.gardens)
      height *= 1 - flatten(garden.x, garden.z, garden.radius + 3, 0.8);
    for (const swamp of this.layout.swamps) {
      const depression = flatten(swamp.x, swamp.z, swamp.radius, 1);
      height = height * (1 - depression) - depression * 1.7 * this.layout.settings.relief;
    }
    return height;
  }

  temperatureOffset(x: number, z: number): number {
    const elevation = this.heightAt(x, z);
    const lowCold = elevation < -1.5 ? (elevation + 1.5) * 0.45 : 0;
    return -Math.max(0, elevation) * 0.65 + lowCold;
  }
}
