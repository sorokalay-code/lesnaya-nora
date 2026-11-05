import { Terrain } from '../../game/Terrain';
import { WorldLayout } from '../../game/WorldLayout';
import { validWorldConfig, type WorldConfig } from '../../game/WorldConfig';
import type { Biome } from '../../game/types';

/** Готовит лёгкую схему из того же генератора без сцены, ресурсов и игровых объектов. */
export class WorldPreviewPresenter {
  static build(
    config: WorldConfig,
  ): { cells: (Biome | 'water')[]; resolution: number } | undefined {
    if (!validWorldConfig(config)) return;
    const seed = config.map?.seed ?? 31415;
    const layout = new WorldLayout(seed, config.map);
    const terrain = new Terrain(seed, config.size / 110, config.water, layout);
    const resolution = 36;
    const cells: (Biome | 'water')[] = [];
    for (let row = 0; row < resolution; row++)
      for (let column = 0; column < resolution; column++) {
        const x = (((column + 0.5) / resolution) * 2 - 1) * config.size;
        const z = (((row + 0.5) / resolution) * 2 - 1) * config.size;
        const wet = terrain.water.sample(x, z, terrain.heightAt(x, z));
        cells.push(
          wet
            ? 'water'
            : layout.biomeAt(x / (config.size / 110), z / (config.size / 110), config.biome),
        );
      }
    return { cells, resolution };
  }
}
