import * as THREE from 'three';
import { ModelAssets } from '../ModelAssets';
import { type SaveData, type WasteData } from '../types';
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
/** Создаёт отходы в игровом мире и учитывает загрязнение шерсти при контакте с ними. */
export class WasteSystem {
  private meshes = new Map<number, THREE.Group>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly save: SaveData,
    private readonly groundY: (w: WasteData) => number = (w) => w.y,
  ) {
    for (const waste of save.waste) this.addModel(waste);
  }

  spawn(kind: WasteData['kind'], x: number, y: number, z: number): WasteData {
    const id = Math.max(0, ...this.save.waste.map((w) => w.id)) + 1;
    const waste: WasteData = { id, kind, x, y, z, age: this.save.clock };
    waste.y = this.groundY(waste);
    this.save.waste.push(waste);
    this.addModel(waste);
    return waste;
  }

  private addModel(w: WasteData): void {
    w.y = this.groundY(w);
    const root = new THREE.Group();
    root.position.set(w.x, w.y, w.z);
    const material = new THREE.MeshStandardMaterial({
      color: w.kind === 'urine' ? 0xd6c680 : w.kind === 'diarrhea' ? 0x795f3d : 0x594330,
      roughness: 1,
      transparent: w.kind !== 'pellets',
      opacity: w.kind === 'pellets' ? 1 : 0.75,
    });
    if (w.kind === 'pellets')
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 5), material);
        m.position.set(Math.cos(i * 2.4) * 0.18, 0.08, Math.sin(i * 2.4) * 0.18);
        root.add(m);
      }
    else {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(w.kind === 'diarrhea' ? 0.42 : 0.36, 16),
        material,
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.016;
      root.add(m);
    }

    this.scene.add(root);
    this.meshes.set(w.id, root);
  }

  update(dt: number, px: number, py: number, pz: number): void {
    const p = this.save.player;
    for (const w of this.save.waste) {
      if (Math.hypot(px - w.x, pz - w.z) < 0.7 && Math.abs(py - w.y) < 1.2)
        p.dirtiness = clamp(p.dirtiness + dt * (w.kind === 'pellets' ? 0.16 : 0.6), 0, 100);
    }

    if (this.save.waste.length > 180) {
      const old = this.save.waste.splice(0, this.save.waste.length - 180);
      old.forEach((w) => {
        const mesh = this.meshes.get(w.id);
        if (mesh) {
          ModelAssets.shared.release(mesh);
          mesh.removeFromParent();
        }
        this.meshes.delete(w.id);
      });
    }
  }
}
