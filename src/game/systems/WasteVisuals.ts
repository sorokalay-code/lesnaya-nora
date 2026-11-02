import * as THREE from 'three';
import type { WasteData } from '../types';

/** Показывает ближайшие нечистоты пакетами, не создавая отдельный draw call на каждую кучку. */
export class WasteVisuals {
  readonly root = new THREE.Group();
  private readonly batches: Record<WasteData['kind'], THREE.InstancedMesh>;
  private readonly transform = new THREE.Object3D();
  private readonly capacity = 256;

  constructor(scene: THREE.Scene) {
    const sphere = new THREE.SphereGeometry(0.08, 7, 5);
    const circle = new THREE.CircleGeometry(0.38, 12);
    const batch = (
      geometry: THREE.BufferGeometry,
      color: number,
      count: number,
      transparent = false,
    ) => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          transparent,
          opacity: transparent ? 0.65 : 1,
          depthWrite: !transparent,
        }),
        count,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      return mesh;
    };
    this.batches = {
      pellets: batch(sphere, 0x594330, this.capacity * 5),
      urine: batch(circle, 0xd6c680, this.capacity, true),
      diarrhea: batch(circle, 0x795f3d, this.capacity, true),
      bird: batch(circle, 0xe6e0ca, this.capacity),
    };
    this.root.name = 'waste-batches';
    scene.add(this.root);
  }

  update(waste: readonly WasteData[], player: { x: number; y: number; z: number }): void {
    const counts = { pellets: 0, urine: 0, diarrhea: 0, bird: 0 };
    for (const item of waste) {
      if (Math.hypot(item.x - player.x, item.z - player.z) > 34 || Math.abs(item.y - player.y) > 7)
        continue;
      const copies = item.kind === 'pellets' ? 5 : 1;
      if (counts[item.kind] + copies > this.batches[item.kind].instanceMatrix.count) continue;
      for (let i = 0; i < copies; i++) {
        this.transform.position.set(
          item.x + (copies > 1 ? Math.cos(i * 2.4) * 0.18 : 0),
          item.y + (copies > 1 ? 0.08 : 0.018),
          item.z + (copies > 1 ? Math.sin(i * 2.4) * 0.18 : 0),
        );
        this.transform.rotation.set(copies > 1 ? 0 : -Math.PI / 2, 0, 0);
        this.transform.scale.setScalar((item.size ?? 1) * (item.kind === 'bird' ? 0.6 : 1));
        this.transform.updateMatrix();
        this.batches[item.kind].setMatrixAt(counts[item.kind]++, this.transform.matrix);
      }
    }
    for (const kind of Object.keys(this.batches) as WasteData['kind'][]) {
      this.batches[kind].count = counts[kind];
      this.batches[kind].instanceMatrix.needsUpdate = true;
    }
  }
}
