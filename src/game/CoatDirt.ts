import * as THREE from 'three';
import type { RabbitRig } from './Models';

type CoatState = {
  step: number;
  materials: { material: THREE.MeshStandardMaterial; color: THREE.Color; roughness: number }[];
  spots: THREE.InstancedMesh[];
};

/** Меняет только личные материалы кролика и добавляет один пакет грязевых пятен на уровень LOD. */
export class CoatDirt {
  private static readonly states = new WeakMap<RabbitRig, CoatState>();

  static update(rig: RabbitRig, value: number): void {
    const step = Math.max(0, Math.min(100, Math.round(value)));
    let state = this.states.get(rig);
    if (!state && step === 0) return;
    if (!state) {
      state = this.prepare(rig);
      this.states.set(rig, state);
    }
    if (state.step === step) return;
    state.step = step;
    const mud = new THREE.Color(0x695235),
      amount = step / 100;
    for (const { material, color, roughness } of state.materials) {
      material.color.copy(color).lerp(mud, amount * 0.7);
      material.roughness = roughness + (1 - roughness) * amount;
    }
    for (const spots of state.spots) {
      spots.visible = step > 0;
      spots.count = step ? Math.min(8, 1 + Math.floor(step / 13)) : 0;
    }
  }

  private static prepare(rig: RabbitRig): CoatState {
    const materials = new Set<THREE.MeshStandardMaterial>();
    rig.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          if (material instanceof THREE.MeshStandardMaterial && material.name.startsWith('fur_'))
            materials.add(material);
      }
    });
    const spots: THREE.InstancedMesh[] = [];
    const geometry = new THREE.SphereGeometry(1, 5, 3),
      material = new THREE.MeshStandardMaterial({ color: 0x6b5034, roughness: 1 });
    const positions = [
      [0.39, 0.48, 0.08],
      [-0.39, 0.43, 0.12],
      [0.3, 0.18, 0.4],
      [-0.3, 0.18, 0.4],
      [0.19, 0.25, -0.35],
      [-0.19, 0.24, -0.35],
      [0.24, 0.72, 0.36],
      [-0.18, 0.7, 0.4],
    ];
    const transform = new THREE.Object3D();
    for (const variant of rig.variants ?? [rig]) {
      const visual = variant.root.getObjectByName('Visual') ?? variant.root;
      const mesh = new THREE.InstancedMesh(geometry, material, 8);
      mesh.name = 'coat-mud';
      positions.forEach(([x, y, z], index) => {
        transform.position.set(x, y, z);
        transform.scale.set(0.09, 0.055, 0.16);
        transform.rotation.set(index * 0.3, 0, index * 0.4);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1.6);
      mesh.count = 0;
      visual.add(mesh);
      spots.push(mesh);
    }
    return {
      step: -1,
      materials: [...materials].map((material) => ({
        material,
        color: material.color.clone(),
        roughness: material.roughness,
      })),
      spots,
    };
  }
}
