import * as THREE from 'three';
import { ModelAssets } from './ModelAssets';
import { Random } from './Random';
import type { CaveBounds } from './CaveMesher';
import type { Biome, Season } from './types';
import { WORLD_CHUNK_SIZE, type WorldChunks } from './WorldChunks';

type Plant = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  variant: number;
  removed?: boolean;
};
type Batch = { plants: Plant[]; mesh: THREE.InstancedMesh; minX: number; minZ: number };

interface GroundCoverOptions {
  seed: number;
  scale: number;
  density: number;
  heightAt(x: number, z: number): number;
  biomeAt(x: number, z: number): Biome;
  wet(x: number, z: number): boolean;
}

/** Собирает траву, папоротники и цветы в один пакет на чанк. Поворот выполняется на GPU. */
export class GroundCover {
  private readonly batches: Batch[] = [];
  private readonly winter = { value: 0 };
  private readonly material = new THREE.MeshBasicMaterial({
    map: ModelAssets.shared.groundCover ?? null,
    alphaTest: 0.4,
  });

  constructor(chunks: WorldChunks, rng: Random, options: GroundCoverOptions) {
    const groups = new Map<string, Plant[]>();
    const add = (x: number, z: number, scale: number, variant: number) => {
      if (options.wet(x, z) || options.biomeAt(x, z) === 'garden') return;

      const key = `${Math.floor(x / WORLD_CHUNK_SIZE)},${Math.floor(z / WORLD_CHUNK_SIZE)}`;
      const plants = groups.get(key) ?? [];
      const height = (variant === 1 ? 0.9 : variant === 2 ? 0.65 : 0.52) * scale;
      const width = height * (variant === 0 ? 1.4 : 1.15);
      plants.push({ x, y: options.heightAt(x, z), z, width, height, variant });
      groups.set(key, plants);
    };

    const population = options.scale ** 2 * options.density;
    // Сохраняем поток случайных чисел для старых миров и размещения ресурсов.
    for (let i = 0; i < Math.round(2200 * population); i++) {
      const x = rng.range(-102, 102) * options.scale;
      const z = rng.range(-102, 102) * options.scale;
      rng.range(0, Math.PI * 2);
      add(x, z, rng.range(0.65, 1.4), 0);
    }

    const decor = new Random(options.seed + 817);
    const clusters = Math.min(3600, Math.round(1050 * population));
    for (let i = 0; i < clusters; i++) {
      const x = decor.range(-99, 99) * options.scale;
      const z = decor.range(-99, 99) * options.scale;
      const biome = options.biomeAt(x, z);
      const variant = biome === 'forest' || biome === 'swamp' ? 1 : 2;
      add(x, z, decor.range(0.75, 1.3), variant);
      for (let j = 0; j < 3; j++)
        add(x + decor.range(-1.7, 1.7), z + decor.range(-1.7, 1.7), decor.range(0.65, 1.45), 0);
    }

    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uWinterCover = this.winter;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float plantVariant; uniform float uWinterCover;',
        )
        .replace(
          '#include <uv_vertex>',
          `
          #include <uv_vertex>
          #ifdef USE_MAP
            vMapUv.x = (plantVariant + mix(0.015625, 0.984375, vMapUv.x)) * 0.25;
          #endif
        `,
        )
        .replace(
          '#include <project_vertex>',
          `
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          float winterScale = plantVariant < 0.5 ? 0.62 : 0.0;
          vec2 offset = transformed.xy * size * mix(1.0, winterScale, uWinterCover);
          mvPosition.x += offset.x;
          mvPosition.xyz += mat3(viewMatrix) * vec3(0.0, offset.y, 0.0);
          gl_Position = projectionMatrix * mvPosition;
        `,
        );
    };

    const transform = new THREE.Object3D();
    for (const plants of groups.values()) {
      const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      geometry.setAttribute(
        'plantVariant',
        new THREE.InstancedBufferAttribute(
          new Float32Array(plants.map((plant) => plant.variant)),
          1,
        ),
      );
      const mesh = new THREE.InstancedMesh(geometry, this.material, plants.length);
      mesh.name = 'billboard-ground-cover';
      plants.forEach((plant, index) => {
        transform.position.set(plant.x, plant.y - 0.025, plant.z);
        transform.scale.set(plant.width, plant.height, 1);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      // Сфера одного растения должна учитывать поворот карты в любую сторону.
      geometry.computeBoundingSphere();
      const sphere = geometry.boundingSphere!;
      sphere.center.set(0, 0, 0);
      sphere.radius = 1.12;
      mesh.computeBoundingSphere();
      chunks.add(mesh, plants[0].x, plants[0].z);
      this.batches.push({
        plants,
        mesh,
        minX: Math.floor(plants[0].x / WORLD_CHUNK_SIZE) * WORLD_CHUNK_SIZE,
        minZ: Math.floor(plants[0].z / WORLD_CHUNK_SIZE) * WORLD_CHUNK_SIZE,
      });
    }
  }

  setSeason(season: Season): void {
    this.winter.value = Number(season === 'Зима');
    this.material.color.setHex(
      season === 'Зима' ? 0xc6bda4 : season === 'Осень' ? 0xc5a775 : 0xffffff,
    );
  }

  clearOpening(bounds: CaveBounds, distanceAt: (x: number, y: number, z: number) => number): void {
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { mesh, plants, minX, minZ } of this.batches) {
      if (
        minX > bounds.maxX ||
        minZ > bounds.maxZ ||
        minX + WORLD_CHUNK_SIZE < bounds.minX ||
        minZ + WORLD_CHUNK_SIZE < bounds.minZ
      )
        continue;

      let changed = false;
      plants.forEach((plant, index) => {
        const { x, y, z } = plant;
        if (
          plant.removed ||
          x < bounds.minX ||
          x > bounds.maxX ||
          z < bounds.minZ ||
          z > bounds.maxZ ||
          y > bounds.maxY
        )
          return;
        if (distanceAt(x, y, z) >= -0.025) return;
        plant.removed = true;
        mesh.setMatrixAt(index, hidden);
        changed = true;
      });
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
