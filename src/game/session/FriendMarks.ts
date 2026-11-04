import * as THREE from 'three';
import type { ForestAnimal } from '../animals';
import { FRIENDSHIP_TRUST } from '../Friendship';
import type { DigNode } from '../types';

const MARK_RANGE = 24;

interface FriendMark {
  mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  height: number;
}

/** Рисует бирюзовые пломбобы друзей рядом с игроком и владеет общими ресурсами меток. */
export class FriendMarks {
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.OctahedronGeometry(0.21);
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x65e8c6 });
  private readonly bounds = new THREE.Box3();
  private readonly marks = new Map<ForestAnimal, FriendMark>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'friend-marks';
    scene.add(this.group);
  }

  update(animals: readonly ForestAnimal[], player: DigNode, time: number): void {
    for (const [animal, mark] of this.marks) {
      if (!animal.alive || animal.trust < FRIENDSHIP_TRUST) {
        mark.mesh.removeFromParent();
        this.marks.delete(animal);
      } else mark.mesh.visible = false;
    }
    for (const animal of animals) {
      if (
        !animal.alive ||
        animal.trust < FRIENDSHIP_TRUST ||
        !animal.root.visible ||
        Math.hypot(animal.x - player.x, animal.root.position.y - player.y, animal.z - player.z) >
          MARK_RANGE
      )
        continue;

      let mark = this.marks.get(animal);
      if (!mark) {
        const height = this.bounds.setFromObject(animal.root).max.y - animal.root.position.y;
        const mesh = new THREE.Mesh(this.geometry, this.material);
        mesh.scale.y = 1.6;
        mark = { mesh, height: (Number.isFinite(height) ? height : 0.5) + 0.42 };
        this.marks.set(animal, mark);
        this.group.add(mesh);
      }
      mark.mesh.visible = true;
      mark.mesh.position.copy(animal.root.position);
      mark.mesh.position.y += mark.height + Math.sin(time * 2 + animal.socialId) * 0.08;
      mark.mesh.rotation.y = time * 0.9;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.marks.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
