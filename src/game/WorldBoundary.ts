import { ModelAssets } from './ModelAssets';
import { groundColor, seasonalGroundColor } from './TerrainColors';
import type { Biome } from './types';
import * as THREE from 'three';
import { smoothNoise, Random } from './Random';
import type { Terrain } from './Terrain';
import type { Season } from './types';

/** Декоративное продолжение леса за игровой границей: холмы и дешёвые силуэты деревьев. */
export class WorldBoundary {
  readonly root = new THREE.Group();
  private readonly ground = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: ModelAssets.shared.ground ?? null,
    roughness: 1,
    flatShading: true,
  });
  private readonly leaves = new THREE.MeshStandardMaterial({ color: 0x345e47, roughness: 1 });

  private readonly geometry = new THREE.BufferGeometry();
  private readonly baseColors: number[] = [];
  private season?: Season;

  constructor(
    terrain: Terrain,
    seed: number,
    edge = 110,
    biomeAt: (x: number, z: number) => Biome = () => 'forest',
  ) {
    this.root.name = 'distant-forest';
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color();
    const point = (x: number, z: number) => {
      const distance = Math.max(Math.abs(x), Math.abs(z));
      const fade = THREE.MathUtils.smoothstep(distance, edge, edge + 100);
      return [
        x,
        terrain.heightAt(x, z) + fade * (12 + smoothNoise(x / 65, z / 65, seed + 411) * 30),
        z,
      ];
    };
    // Внутреннее кольцо повторяет каждый метровый узел края мира; дальние кольца редкие.
    const rings = [edge, edge + 12, edge + 35, edge + 70, edge + 130, 330];
    const segments = edge * 8;
    for (const radius of rings)
      for (let i = 0; i < segments; i++) {
        const side = Math.floor(i / (edge * 2)),
          t = (i % (edge * 2)) / edge - 1;
        const x =
          side === 0 ? radius : side === 1 ? -t * radius : side === 2 ? -radius : t * radius;
        const z =
          side === 0 ? t * radius : side === 1 ? radius : side === 2 ? -t * radius : -radius;
        positions.push(...point(x, z));
        uvs.push(x / 7, z / 7);
        groundColor(color, x, z, seed, biomeAt(x, z));
        this.baseColors.push(color.r, color.g, color.b);
      }
    for (let ring = 0; ring < rings.length - 1; ring++)
      for (let i = 0; i < segments; i++) {
        const a = ring * segments + i,
          b = ring * segments + ((i + 1) % segments),
          c = a + segments,
          d = b + segments;
        indices.push(a, b, c, b, d, c);
      }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.baseColors, 3));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    const groundMesh = new THREE.Mesh(this.geometry, this.ground);
    groundMesh.updateMatrixWorld();
    this.root.add(groundMesh);
    const groundRay = new THREE.Raycaster();
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), this.leaves, 160);
    const random = new Random(seed + 514);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 160; i++) {
      const side = i % 4,
        along = random.range(-175, 175),
        depth = random.range(edge + 3, edge + 65);
      const x = side < 2 ? (side === 0 ? depth : -depth) : along;
      const z = side >= 2 ? (side === 2 ? depth : -depth) : along;
      const height = random.range(7, 16);
      groundRay.set(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
      const groundY = groundRay.intersectObject(groundMesh)[0]?.point.y ?? point(x, z)[1];
      transform.position.set(x, groundY + height / 2, z);
      transform.scale.set(random.range(2.5, 4), height, random.range(2.5, 4));
      transform.updateMatrix();
      trees.setMatrixAt(i, transform.matrix);
    }
    this.root.add(trees);
  }

  setSeason(season: Season): void {
    if (this.season === season) return;
    this.season = season;
    const colors = this.geometry.attributes.color;
    const color = new THREE.Color();
    for (let i = 0; i < colors.count; i++) {
      color.setRGB(this.baseColors[i * 3], this.baseColors[i * 3 + 1], this.baseColors[i * 3 + 2]);
      seasonalGroundColor(color, season);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
    this.leaves.color.setHex(season === 'Зима' ? 0x658777 : 0x345e47);
  }
}
