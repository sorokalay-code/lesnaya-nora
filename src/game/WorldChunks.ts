import * as THREE from 'three';

export const WORLD_CHUNK_SIZE = 24;

/** Группирует объекты в чанки и отключает работу с неподвижными трансформациями. */

export class WorldChunks {
  private chunks = new Map<string, { group: THREE.Group; cx: number; cz: number }>();
  private activeKey = '';

  constructor(
    private readonly scene: THREE.Scene,
    private readonly size = WORLD_CHUNK_SIZE,
    private radius = 2,
  ) {}

  add(object: THREE.Object3D, x: number, z: number, dynamic = false): void {
    const cx = Math.floor(x / this.size),
      cz = Math.floor(z / this.size),
      key = `${cx},${cz}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const group = new THREE.Group();
      group.name = `chunk-${key}`;
      this.scene.add(group);
      chunk = { group, cx, cz };
      this.chunks.set(key, chunk);
      if (this.activeKey) {
        const [ax, az] = this.activeKey.split(',').map(Number);
        group.visible = Math.abs(cx - ax) <= this.radius && Math.abs(cz - az) <= this.radius;
      }
    }

    chunk.group.add(object);
    if (!dynamic) {
      object.updateWorldMatrix(true, true);
      object.traverse((part) => {
        part.matrixAutoUpdate = false;
        part.matrixWorldAutoUpdate = false;
      });
    }
  }

  update(x: number, z: number): void {
    const cx = Math.floor(x / this.size),
      cz = Math.floor(z / this.size);
    const key = `${cx},${cz}`;
    if (key === this.activeKey) return;
    this.activeKey = key;
    for (const chunk of this.chunks.values())
      chunk.group.visible =
        Math.abs(chunk.cx - cx) <= this.radius && Math.abs(chunk.cz - cz) <= this.radius;
  }

  setRadius(radius: number, x: number, z: number): void {
    if (this.radius !== radius) {
      this.radius = radius;
      this.activeKey = '';
    }
    this.update(x, z);
  }

  get count(): number {
    return this.chunks.size;
  }
}
