import type { World } from '../../game/World';
import type { SaveData } from '../../game/types';
import type { MapViewModel } from '../types';

/** Готовит карту без передачи объектов Three.js в состояние интерфейса. */
export class MapPresenter {
  build(world: World, save: SaveData, facing = { x: 0, z: -1 }): MapViewModel {
    const colors: string[] = [];
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 60; x++)
        colors.push(
          { forest: '#426e51', meadow: '#88a969', swamp: '#5d8c80', garden: '#b69b66' }[
            world.biomeAt((x / 60 - 0.5) * world.size * 2, (y / 60 - 0.5) * world.size * 2)
          ],
        );

    return {
      size: world.size,
      colors,
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
