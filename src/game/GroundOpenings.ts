import * as THREE from 'three';
import type { CaveBounds } from './CaveMesher';

type Vertex = { x: number; z: number; distance: number };
type Patch = { x: number; z: number; vertices: Vertex[] };
const SUBDIVISIONS = 8;
// Узкий нахлёст скрывает расхождение между сеткой рельефа и тетраэдрами стенки.
const RIM_OVERLAP = 0.025;

/** Вырезает устья в локальных ячейках рельефа, сохраняя остальную поверхность и её материал. */
export class GroundOpenings {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly patches = new Map<number, Patch>();

  constructor(
    private readonly ground: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
    private readonly size: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), ground.material);
    this.mesh.name = 'burrow-entrances';
    this.mesh.visible = false;
    this.mesh.receiveShadow = true;
    ground.add(this.mesh);
  }

  update(bounds: CaveBounds, distanceAt: (x: number, y: number, z: number) => number): void {
    const { size } = this;
    const side = size * 2;
    let changed = false;
    let replacedTile = false;
    for (let z = Math.max(-size, Math.floor(bounds.minZ)); z < Math.min(size, bounds.maxZ); z++) {
      for (let x = Math.max(-size, Math.floor(bounds.minX)); x < Math.min(size, bounds.maxX); x++) {
        const tile = (z + size) * side + x + size;
        if (
          Math.min(
            this.heightAt(x, z),
            this.heightAt(x + 1, z),
            this.heightAt(x + 1, z + 1),
            this.heightAt(x, z + 1),
          ) > bounds.maxY
        )
          continue;

        const vertices = this.clipTile(x, z, distanceAt);
        if (!vertices) continue;

        replacedTile ||= !this.patches.has(tile);
        this.patches.set(tile, { x, z, vertices });
        changed = true;
      }
    }
    if (!changed) return;

    if (replacedTile) {
      const indices: number[] = [];
      for (let tile = 0; tile < side * side; tile++) {
        if (this.patches.has(tile)) continue;
        const j = tile * 4;
        indices.push(j, j + 2, j + 1, j, j + 3, j + 2);
      }
      this.ground.geometry.setIndex(indices);
    }

    const positions: number[] = [],
      uvs: number[] = [];
    for (const { vertices } of this.patches.values()) {
      for (const v of vertices) {
        positions.push(v.x, this.heightAt(v.x, v.z), v.z);
        uvs.push(v.x / 7, v.z / 7);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.mesh.visible = positions.length > 0;
    this.updateColors();
  }

  updateColors(): void {
    const source = this.ground.geometry.getAttribute('color');
    const colors: number[] = [];
    const component = (vertex: number, channel: number) => source.getComponent(vertex, channel);
    for (const [tile, { x, z, vertices }] of this.patches) {
      const i = tile * 4;
      for (const v of vertices) {
        const u = v.x - x,
          w = v.z - z;
        const side = u >= w ? 1 : 3;
        const mid = Math.min(u, w),
          high = Math.max(u, w);
        for (let c = 0; c < 3; c++)
          colors.push(
            component(i, c) * (1 - high) +
              component(i + side, c) * (high - mid) +
              component(i + 2, c) * mid,
          );
      }
    }
    this.mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }

  private clipTile(
    x: number,
    z: number,
    distanceAt: (x: number, y: number, z: number) => number,
  ): Vertex[] | undefined {
    const samples: Vertex[] = [];
    for (let row = 0; row <= SUBDIVISIONS; row++) {
      for (let col = 0; col <= SUBDIVISIONS; col++) {
        const wx = x + col / SUBDIVISIONS,
          wz = z + row / SUBDIVISIONS;
        samples.push({
          x: wx,
          z: wz,
          distance: distanceAt(wx, this.heightAt(wx, wz), wz) + RIM_OVERLAP,
        });
      }
    }
    if (samples.every((point) => point.distance >= 0)) return undefined;
    const result: Vertex[] = [];
    const stride = SUBDIVISIONS + 1;
    for (let row = 0; row < SUBDIVISIONS; row++) {
      for (let col = 0; col < SUBDIVISIONS; col++) {
        const i = row * stride + col;
        const a = samples[i],
          b = samples[i + 1],
          c = samples[i + stride + 1],
          d = samples[i + stride];
        clipTriangle([a, c, b], result);
        clipTriangle([a, d, c], result);
      }
    }
    return result;
  }
}

function clipTriangle(triangle: Vertex[], result: Vertex[]): void {
  const polygon: Vertex[] = [];
  for (let i = 0; i < 3; i++) {
    const a = triangle[i],
      b = triangle[(i + 1) % 3];
    if (a.distance >= 0) polygon.push(a);
    if (a.distance < 0 === b.distance < 0) continue;
    const t = a.distance / (a.distance - b.distance);
    polygon.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, distance: 0 });
  }
  for (let i = 1; i + 1 < polygon.length; i++) result.push(polygon[0], polygon[i], polygon[i + 1]);
}
