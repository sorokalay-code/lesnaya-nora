import * as THREE from 'three';
import { Excavation } from '../Excavation';
import { ModelAssets } from '../ModelAssets';
import { makeNest, makeStash } from '../Models';
import { World } from '../World';
import { RabbitActor } from '../animals';
import { type NestData, type StashData } from '../types';

interface Context {
  scene: THREE.Scene;
  world: World;
  earth: Excavation;
}

/** Создаёт гнёзда, тайники и отметку партнёра в общей сцене. */
export class SceneDecorations {
  private readonly nestMeshes = new Map<number, THREE.Group>();
  private readonly stashMeshes = new Map<number, THREE.Group>();

  constructor(private readonly context: Context) {}

  addNest(n: NestData): void {
    const mesh = makeNest();
    mesh.position.set(
      n.x,
      (this.context.earth.isSheltered(n.x, n.y, n.z)
        ? n.y
        : this.context.world.heightAt(n.x, n.z)) + 0.04,
      n.z,
    );
    this.nestMeshes.set(n.id, mesh);
    this.context.scene.add(mesh);
  }

  addStash(s: StashData): void {
    const mesh = makeStash();
    mesh.position.set(
      s.x,
      (this.context.earth.isSheltered(s.x, s.y, s.z)
        ? s.y
        : this.context.world.heightAt(s.x, s.z)) + 0.02,
      s.z,
    );
    this.stashMeshes.set(s.id, mesh);
    this.context.scene.add(mesh);
  }

  markPartner(actor: RabbitActor, active: boolean): void {
    const previous = actor.rig.root.getObjectByName('mate-mark');
    if (previous) {
      ModelAssets.shared.release(previous);
      previous.removeFromParent();
    }

    if (!active) return;

    const mark = new THREE.Group();
    mark.name = 'mate-mark';
    const teal = new THREE.MeshStandardMaterial({
      color: 0x89cfc0,
      emissive: 0x285d50,
      emissiveIntensity: 0.3,
    });
    const rose = new THREE.MeshStandardMaterial({
      color: 0xf1a7b4,
      emissive: 0x7c344d,
      emissiveIntensity: 0.4,
    });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.04, 5, 16), teal);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.72, -0.22);
    mark.add(collar);
    for (const side of [-1, 1]) {
      const half = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), rose);
      half.position.set(side * 0.09, 1.88, 0);
      mark.add(half);
    }

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.24, 8), rose);
    tip.position.y = 1.76;
    tip.rotation.z = Math.PI;
    mark.add(tip);
    actor.rig.root.add(mark);
  }
}
