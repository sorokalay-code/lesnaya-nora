import * as THREE from 'three';
import { ModelAssets } from './ModelAssets';
import { hash2, Random } from './Random';
import type { CaveBounds } from './CaveMesher';
import type { SeasonBlend } from './SeasonalGround';
import type { Biome, Season } from './types';
import { WORLD_CHUNK_SIZE, type WorldChunks } from './WorldChunks';

const SPRING: Season = 'Весна';
const COVER_DENSITY: Record<Season, number> = { Весна: 0.63, Лето: 1.18, Осень: 0.62, Зима: 0.28 };
const COVER_HEIGHT: Record<Season, number> = { Весна: 0.88, Лето: 1, Осень: 0.87, Зима: 0.77 };

type Plant = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  variant: number;
  densityRank: number;
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
  private season?: Season;
  private readonly nextMap = { value: null as THREE.Texture | null };
  private readonly mix = { value: 0 };
  private readonly density = { value: 1 };
  private readonly growth = { value: 1 };
  private readonly material = new THREE.MeshBasicMaterial({
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
      const rank = hash2(Math.floor(x * 97), Math.floor(z * 97), options.seed + 278);
      const appearance = hash2(Math.floor(x * 131), Math.floor(z * 131), options.seed + 316);
      const tile =
        variant === 0
          ? Math.floor(appearance * 4)
          : (variant === 1 ? 4 : 7) + Math.floor(appearance * 3);
      plants.push({
        x,
        y: options.heightAt(x, z),
        z,
        width,
        height,
        variant: tile,
        densityRank: rank,
      });
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
      shader.uniforms.uNextCover = this.nextMap;
      shader.uniforms.uCoverMix = this.mix;
      shader.uniforms.uCoverDensity = this.density;
      shader.uniforms.uCoverGrowth = this.growth;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec2 plantAppearance; uniform float uCoverDensity, uCoverGrowth;',
        )
        .replace(
          '#include <uv_vertex>',
          `
          #include <uv_vertex>
          #ifdef USE_MAP
            float tile = plantAppearance.x;
            vec2 slot = vec2(mod(tile, 4.0), 3.0 - floor(tile / 4.0));
            vMapUv = (slot + mix(vec2(0.03125), vec2(0.96875), vMapUv)) * 0.25;
          #endif
        `,
        )
        .replace(
          '#include <project_vertex>',
          `
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          float visibility = smoothstep(0.0, 0.18, uCoverDensity - plantAppearance.y);
          vec2 offset = transformed.xy * size * visibility * uCoverGrowth;
          mvPosition.x += offset.x;
          mvPosition.xyz += mat3(viewMatrix) * vec3(0.0, offset.y, 0.0);
          gl_Position = projectionMatrix * mvPosition;
        `,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D uNextCover; uniform float uCoverMix;',
        )
        .replace(
          '#include <map_fragment>',
          `
          #ifdef USE_MAP
          vec4 plant = texture2D(map, vMapUv);
          if (uCoverMix > 0.0) {
            vec4 next = texture2D(uNextCover, vMapUv);
            float alpha = mix(plant.a, next.a, uCoverMix);
            plant.rgb = mix(plant.rgb * plant.a, next.rgb * next.a, uCoverMix) / max(alpha, 0.001);
            plant.a = alpha;
          }
          diffuseColor *= plant;
          #endif
        `,
        );
    };

    const transform = new THREE.Object3D();
    for (const plants of groups.values()) {
      const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      geometry.setAttribute(
        'plantAppearance',
        new THREE.InstancedBufferAttribute(
          new Float32Array(plants.flatMap((plant) => [plant.variant, plant.densityRank])),
          2,
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

  setSeason(blend: SeasonBlend): void {
    if (this.season !== blend.current) {
      this.season = blend.current;
      const map = ModelAssets.shared.coverTexture(blend.current) ?? null;
      if (!!this.material.map !== !!map) this.material.needsUpdate = true;
      this.material.map = map;
      this.nextMap.value = ModelAssets.shared.coverTexture(blend.next) ?? map;
    }
    this.mix.value = blend.mix;
    const density = COVER_DENSITY[blend.current];
    const springGrowth = blend.current === SPRING ? blend.progress * 0.22 : 0;
    this.density.value = THREE.MathUtils.lerp(
      density + springGrowth,
      COVER_DENSITY[blend.next],
      blend.mix,
    );
    this.growth.value = THREE.MathUtils.lerp(
      COVER_HEIGHT[blend.current],
      COVER_HEIGHT[blend.next],
      blend.mix,
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
