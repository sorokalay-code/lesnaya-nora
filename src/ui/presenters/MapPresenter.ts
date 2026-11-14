import type { World } from '../../game/World';
import type { SaveData } from '../../game/types';
import type { MapViewModel } from '../types';
import { landscapeCell, mapWater } from './LandscapeMap';

const MAP_COLORS = {
  forest: '#426e51',
  meadow: '#88a969',
  swamp: '#798756',
  garden: '#b69b66',
  highland: '#9b9587',
  lowland: '#1f3d3a',
};

/** Готовит карту без передачи объектов Three.js в состояние интерфейса. */
export class MapPresenter {
  build(world: World, save: SaveData, facing = { x: 0, z: -1 }): MapViewModel {
    const colors: string[] = [];
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 60; x++) {
        const px = ((x + 0.5) / 60 - 0.5) * world.size * 2;
        const pz = ((y + 0.5) / 60 - 0.5) * world.size * 2;
        colors.push(MAP_COLORS[landscapeCell(world.terrain, world.biomeAt(px, pz), px, pz)]);
      }

    return {
      size: world.size,
      colors,
      water: mapWater(world.terrain),
      landmarks: [...world.landmarks, ...(save.discoveries ?? [])].map(({ x, z, label }) => ({
        x,
        z,
        label,
      })),
      openings: save.excavation
        .filter((node) => node.y >= world.heightAt(node.x, node.z) - 0.5)
        .map(({ x, z }) => ({ x, z })),
      // На карте ось Z направлена вниз, поэтому север соответствует углу 0.
      player: { x: save.player.x, z: save.player.z, heading: Math.atan2(facing.x, -facing.z) },
    };
  }
}
