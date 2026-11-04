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

const NEST_VISUAL_SCALE = 1.18;

/** Создаёт гнёзда, тайники и отметку партнёра в общей сцене. */
export class SceneDecorations {
  private readonly nestMeshes = new Map<number, THREE.Group>();
  private readonly stashMeshes = new Map<number, THREE.Group>();
  private readonly placements = new Map<THREE.Group, NestData | StashData>();
  private revision = -1;

  constructor(private readonly context: Context) {}

  addNest(n: NestData): void {
    const mesh = makeNest();
    mesh.scale.set(NEST_VISUAL_SCALE, 1, NEST_VISUAL_SCALE);
    this.placements.set(mesh, n);
    this.place(mesh, n);
    this.nestMeshes.set(n.id, mesh);
    this.context.scene.add(mesh);
  }

  addStash(s: StashData): void {
    const mesh = makeStash();
    this.placements.set(mesh, s);
    this.place(mesh, s);
    this.stashMeshes.set(s.id, mesh);
    this.context.scene.add(mesh);
  }

  removeNest(id: number): void {
    const mesh = this.nestMeshes.get(id);
    if (mesh) {
      ModelAssets.shared.release(mesh);
      mesh.removeFromParent();
      this.nestMeshes.delete(id);
      this.placements.delete(mesh);
    }
  }

  removeStash(id: number): void {
    const mesh = this.stashMeshes.get(id);
    if (mesh) {
      ModelAssets.shared.release(mesh);
      mesh.removeFromParent();
      this.stashMeshes.delete(id);
      this.placements.delete(mesh);
    }
  }

  update(): void {
    if (this.revision === this.context.earth.revision) return;
    this.revision = this.context.earth.revision;
    for (const [mesh, data] of this.placements) this.place(mesh, data);
  }

  private place(mesh: THREE.Group, data: NestData | StashData): void {
    data.y = this.context.earth.floorAt(data.x, data.z, data.y);
    const sample = 0.35;
    const floor = (x: number, z: number) => this.context.earth.floorAt(x, z, data.y);
    const normal = new THREE.Vector3(
      floor(data.x - sample, data.z) - floor(data.x + sample, data.z),
      sample * 2,
      floor(data.x, data.z - sample) - floor(data.x, data.z + sample),
    ).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    mesh.position.set(data.x, data.y + 0.025, data.z);
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
