import * as THREE from 'three';
import { ModelAssets } from './ModelAssets';
import { hash2, Random } from './Random';
import type { CaveBounds } from './CaveMesher';
import type { SeasonBlend } from './SeasonalGround';
import type { Biome, Season } from './types';
import { WORLD_CHUNK_SIZE, type WorldChunks } from './WorldChunks';

const SUMMER: Season = 'Лето';
const SPRING: Season = 'Весна';
const COVER_DENSITY: Record<Season, number> = { Весна: 0.63, Лето: 1.18, Осень: 0.62, Зима: 0.28 };
const COVER_HEIGHT: Record<Season, number> = { Весна: 0.88, Лето: 1, Осень: 0.87, Зима: 0.77 };

const LITTER_VARIANTS = 20;
const LITTER_FIRST_TILE = 10;
const LITTER_LIFT = 0.018;

type CoverMode = 0 | 1 | 2 | 3;
type CoverKind = 'plant' | 'litter' | 'tall';
const TALL_GRASS_FIRST_TILE = 30;
const TALL_GRASS_VARIANTS = 5;
type Plant = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  variant: number;
  densityRank: number;
  mode: CoverMode;
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
  private readonly tallGrowth = { value: 0 };
  private readonly material = new THREE.MeshStandardMaterial({
    roughness: 1,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });

  constructor(chunks: WorldChunks, rng: Random, options: GroundCoverOptions) {
    const groups = new Map<string, Plant[]>();
    const add = (
      x: number,
      z: number,
      scale: number,
      variant: number,
      kind: CoverKind = 'plant',
    ) => {
      if (options.wet(x, z) || options.biomeAt(x, z) === 'garden') return;

      const key = `${Math.floor(x / WORLD_CHUNK_SIZE)},${Math.floor(z / WORLD_CHUNK_SIZE)}`;
      const plants = groups.get(key) ?? [];
      const litter = kind === 'litter';
      const tall = kind === 'tall';
      const flat = litter && ((variant >= 5 && variant < 14) || variant >= 18);
      const mode: CoverMode = tall ? 3 : litter ? (flat ? 2 : 1) : 0;
      const height = tall
        ? 1.18 * scale
        : litter
          ? (flat ? 0.32 : 0.23) * scale
          : (variant === 1 ? 0.9 : variant === 2 ? 0.65 : 0.52) * scale;
      const width =
        height * (tall ? 0.63 : litter ? (flat ? 1.15 : 1.45) : variant === 0 ? 1.4 : 1.15);
      const rank = hash2(Math.floor(x * 97), Math.floor(z * 97), options.seed + 278);
      const appearance = hash2(Math.floor(x * 131), Math.floor(z * 131), options.seed + 316);
      const tile = tall
        ? TALL_GRASS_FIRST_TILE + variant
        : litter
          ? LITTER_FIRST_TILE + variant
          : variant === 0
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
        mode,
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

    const litter = new Random(options.seed + 1843);
    const litterCount = Math.min(4600, Math.round(1500 * population));
    for (let i = 0; i < litterCount; i++) {
      const x = litter.range(-99, 99) * options.scale;
      const z = litter.range(-99, 99) * options.scale;
      add(x, z, litter.range(0.65, 1.45), i % LITTER_VARIANTS, 'litter');
    }

    const tall = new Random(options.seed + 2189);
    const tallClusters = Math.min(920, Math.round(240 * population));
    for (let i = 0; i < tallClusters; i++) {
      const x = tall.range(-97, 97) * options.scale;
      const z = tall.range(-97, 97) * options.scale;
      if (options.biomeAt(x, z) === 'forest' && !tall.chance(0.35)) continue;

      for (let j = 0; j < 4; j++) {
        add(
          x + tall.range(-0.85, 0.85) * options.scale,
          z + tall.range(-0.85, 0.85) * options.scale,
          tall.range(0.76, 1.24),
          (i + j) % TALL_GRASS_VARIANTS,
          'tall',
        );
      }
    }

    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uNextCover = this.nextMap;
      shader.uniforms.uCoverMix = this.mix;
      shader.uniforms.uCoverDensity = this.density;
      shader.uniforms.uCoverGrowth = this.growth;
      shader.uniforms.uTallGrowth = this.tallGrowth;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec3 plantAppearance; varying float vStaticTile; uniform float uCoverDensity, uCoverGrowth, uTallGrowth;',
        )
        .replace(
          '#include <uv_vertex>',
          `
          #include <uv_vertex>
          #ifdef USE_MAP
            float tile = plantAppearance.x;
            vec2 slot = vec2(mod(tile, 8.0), 4.0 - floor(tile / 8.0));
            vMapUv = (slot + mix(vec2(0.03125), vec2(0.96875), vMapUv)) / vec2(8.0, 5.0);
          #endif
        `,
        )
        .replace(
          '#include <defaultnormal_vertex>',
          `#include <defaultnormal_vertex>
          // Плоскость поворачивается к камере в project_vertex; нормаль травы направляем вверх,
          // чтобы её яркость не зависела от взгляда и совпадала с освещением поверхности.
          transformedNormal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));`,
        )
        .replace(
          '#include <project_vertex>',
          `
          float mode = plantAppearance.z;
          vStaticTile = step(0.5, mode);
          vec4 mvPosition;
          if (mode == 2.0) {
            vec4 flatPosition = vec4(transformed.x, 0.0, 0.5 - transformed.y, 1.0);
            mvPosition = modelViewMatrix * instanceMatrix * flatPosition;
          } else {
            mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
            float visibility = smoothstep(0.0, 0.18, uCoverDensity - plantAppearance.y);
            float growth = mix(visibility * uCoverGrowth, 1.0, vStaticTile);
            if (mode == 3.0) growth = uTallGrowth;
            vec2 offset = transformed.xy * size * growth;
            mvPosition.x += offset.x;
            mvPosition.xyz += mat3(viewMatrix) * vec3(0.0, offset.y, 0.0);
          }
          gl_Position = projectionMatrix * mvPosition;
        `,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D uNextCover; uniform float uCoverMix; varying float vStaticTile;',
        )
        .replace(
          '#include <map_fragment>',
          `
          #ifdef USE_MAP
          vec4 plant = texture2D(map, vMapUv);
          if (uCoverMix > 0.0 && vStaticTile < 0.5) {
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
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3();
    const yaw = new THREE.Quaternion();
    for (const plants of groups.values()) {
      const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      geometry.setAttribute(
        'plantAppearance',
        new THREE.InstancedBufferAttribute(
          new Float32Array(
            plants.flatMap((plant) => [plant.variant, plant.densityRank, plant.mode]),
          ),
          3,
        ),
      );
      const mesh = new THREE.InstancedMesh(geometry, this.material, plants.length);
      mesh.name = 'billboard-ground-cover';
      plants.forEach((plant, index) => {
        const { x, y, z, width, height, mode, densityRank } = plant;
        transform.position.set(x, y - 0.025, z);
        transform.scale.set(width, height, 1);
        transform.quaternion.identity();
        if (mode === 2) {
          // Касательная к рельефу удерживает плоские листья и хвою на склоне.
          const step = 0.12;
          normal
            .set(
              options.heightAt(x - step, z) - options.heightAt(x + step, z),
              step * 2,
              options.heightAt(x, z - step) - options.heightAt(x, z + step),
            )
            .normalize();
          yaw.setFromAxisAngle(up, densityRank * 2 * Math.PI);
          transform.quaternion.setFromUnitVectors(up, normal).multiply(yaw);
          transform.position.y = y + LITTER_LIFT;
          transform.scale.set(width, 1, height);
        }
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
    this.tallGrowth.value = THREE.MathUtils.lerp(
      Number(blend.current === SUMMER),
      Number(blend.next === SUMMER),
      blend.mix,
    );
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
