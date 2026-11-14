import { Terrain } from '../../game/Terrain';
import { WorldLayout } from '../../game/WorldLayout';
import { validWorldConfig, type WorldConfig } from '../../game/WorldConfig';
import { landscapeCell, mapWater, type LandscapeCell } from './LandscapeMap';

type PreviewCell = LandscapeCell | 'water';

/** Готовит лёгкую схему из того же генератора без сцены, ресурсов и игровых объектов. */
export class WorldPreviewPresenter {
  static build(config: WorldConfig):
    | {
        cells: PreviewCell[];
        resolution: number;
        water: { id: string; points: string; width: number }[];
      }
    | undefined {
    if (!validWorldConfig(config)) return;
    const seed = config.map?.seed ?? 31415;
    const layout = new WorldLayout(seed, config.map);
    const terrain = new Terrain(seed, config.size / 110, config.water, layout);
    const resolution = 44;
    const cells: PreviewCell[] = [];
    for (let row = 0; row < resolution; row++)
      for (let column = 0; column < resolution; column++) {
        const x = (((column + 0.5) / resolution) * 2 - 1) * config.size;
        const z = (((row + 0.5) / resolution) * 2 - 1) * config.size;
        const height = terrain.heightAt(x, z);
        const biome = layout.biomeAt(
          x / (config.size / 110),
          z / (config.size / 110),
          config.biome,
        );
        cells.push(
          terrain.water.sample(x, z, height)
            ? 'water'
            : landscapeCell(terrain, biome, x, z, height),
        );
      }
    const coordinate = (meters: number) => (meters / (2 * config.size) + 0.5) * resolution;
    const water = mapWater(terrain).map((body) => ({
      id: body.id,
      points: (body.points.length === 1 ? [body.points[0], body.points[0]] : body.points)
        .map(({ x, z }) => `${coordinate(x)},${coordinate(z)}`)
        .join(' '),
      width: (body.radius / config.size) * resolution,
    }));
    return { cells, resolution, water };
  }
}
