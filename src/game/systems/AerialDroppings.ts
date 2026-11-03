import * as THREE from 'three';
import type { WasteSystem } from './WasteSystem';

/** Помёт птицы физически падает с высоты и становится загрязнением только после приземления. */
export class AerialDroppings {
  private readonly drops: { x: number; y: number; z: number; speed: number }[] = [];
  private readonly mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.08, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0xe1dcc7 }),
    16,
  );
  private readonly transform = new THREE.Object3D();

  constructor(
    scene: THREE.Scene,
    private readonly floorAt: (x: number, z: number, y: number) => number,
    private readonly waste: WasteSystem,
  ) {
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'falling-droppings';
    scene.add(this.mesh);
  }

  release(x: number, y: number, z: number): void {
    if (this.drops.length < 16) this.drops.push({ x, y, z, speed: 0 });
  }

  update(dt: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.speed += dt * 9.8;
      drop.y -= drop.speed * dt;
      const ground = this.floorAt(drop.x, drop.z, drop.y);
      if (drop.y <= ground) {
        this.waste.spawn('bird', drop.x, ground, drop.z, 1, 'wild');
        this.drops.splice(i, 1);
      }
    }
    this.mesh.count = this.drops.length;
    this.drops.forEach((drop, index) => {
      this.transform.position.set(drop.x, drop.y, drop.z);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(index, this.transform.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
