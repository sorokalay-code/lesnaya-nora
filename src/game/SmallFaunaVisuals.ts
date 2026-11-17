import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SmallFaunaCohort } from './SmallFaunaCohorts';
import { smallFaunaStage } from './SmallFaunaCohorts';
import type { DigNode } from './types';

interface Batch {
  mesh: THREE.InstancedMesh;
}

/** Рисует коконы, укрытия и расселяющийся молодняк пакетами с общими ресурсами. */
export class SmallFaunaVisuals {
  private readonly sphere = new THREE.SphereGeometry(1, 8, 6);
  private readonly rock = new THREE.DodecahedronGeometry(1, 0);
  private readonly silk = new THREE.MeshStandardMaterial({ color: 0xded4b9, roughness: 0.96 });
  private readonly bark = new THREE.MeshStandardMaterial({ color: 0x564131, roughness: 1 });
  private readonly dark = new THREE.MeshStandardMaterial({ color: 0x372a22, roughness: 0.86 });
  private readonly scales = new THREE.MeshStandardMaterial({ color: 0x817057, roughness: 0.85 });
  private readonly spiderling: THREE.BufferGeometry;
  private readonly snakelet: THREE.BufferGeometry;
  private readonly retreats = new Map<string, THREE.Group>();
  private readonly cocoons = new Map<SmallFaunaCohort, THREE.Mesh>();
  private readonly broods = new Map<SmallFaunaCohort, Batch>();
  private readonly pose = new THREE.Object3D();
  private nextUpdate = -Infinity;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly groundAt: (x: number, z: number) => number,
    private readonly dry: (x: number, z: number) => boolean,
  ) {
    const pieces: THREE.BufferGeometry[] = [this.sphere.clone().scale(0.07, 0.055, 0.095)];
    for (const side of [-1, 1])
      for (let leg = 0; leg < 4; leg++)
        pieces.push(
          new THREE.BoxGeometry(0.1, 0.012, 0.012)
            .rotateY(side * (leg - 1.5) * 0.45)
            .translate(side * 0.08, 0.025, (leg - 1.5) * 0.042),
        );
    this.spiderling = mergeGeometries(pieces)!;
    for (const piece of pieces) piece.dispose();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.035, -0.25),
      new THREE.Vector3(-0.07, 0.035, -0.1),
      new THREE.Vector3(0.07, 0.045, 0.08),
      new THREE.Vector3(0, 0.065, 0.25),
    ]);
    this.snakelet = new THREE.TubeGeometry(curve, 12, 0.029, 5, false);
  }

  retreat(id: string, at: DigNode, elevated: boolean): void {
    if (this.retreats.has(id)) return;
    const group = new THREE.Group();
    group.name = `small-fauna-retreat-${id}`;
    group.position.set(at.x, at.y, at.z);
    const shelter = new THREE.Mesh(this.rock, this.bark);
    shelter.scale.set(0.53, 0.33, 0.43);
    shelter.position.set(0, 0.06, 0.1);
    const lining = new THREE.Mesh(this.sphere, this.silk);
    lining.scale.set(0.27, 0.17, 0.08);
    lining.position.set(0, 0.045, -0.24);
    const opening = new THREE.Mesh(this.sphere, this.dark);
    opening.scale.set(0.16, 0.11, 0.07);
    opening.position.set(0, 0.03, -0.29);
    group.add(shelter, lining, opening);
    if (elevated) group.rotation.x = Math.PI / 2;
    this.scene.add(group);
    this.retreats.set(id, group);
  }

  update(
    cohorts: readonly SmallFaunaCohort[],
    clock: number,
    time: number,
    player: DigNode,
    winter: boolean,
  ): void {
    if (time < this.nextUpdate) return;
    this.nextUpdate = time + 0.2;
    for (const cohort of cohorts) {
      const stage = smallFaunaStage(cohort, clock);
      const nearby = Math.hypot(cohort.home.x - player.x, cohort.home.z - player.z) < 42;
      if (stage === 'cocoon') {
        let cocoon = this.cocoons.get(cohort);
        if (!cocoon) {
          cocoon = new THREE.Mesh(this.sphere, this.silk);
          cocoon.name = `small-fauna-cocoon-${cohort.kind}-${cohort.slot}`;
          cocoon.position.set(cohort.home.x + 0.28, cohort.home.y + 0.1, cohort.home.z - 0.1);
          cocoon.scale.set(0.16, 0.21, 0.14);
          this.scene.add(cocoon);
          this.cocoons.set(cohort, cocoon);
        }
        cocoon.visible = nearby;
      } else {
        this.cocoons.get(cohort)?.removeFromParent();
        this.cocoons.delete(cohort);
      }

      let batch = this.broods.get(cohort);
      if (stage === 'dispersing' || stage === 'mature') {
        if (!batch) {
          const snake = cohort.kind === 'snake';
          const mesh = new THREE.InstancedMesh(
            snake ? this.snakelet : this.spiderling,
            snake ? this.scales : this.dark,
            Math.min(8, cohort.remaining),
          );
          mesh.name = `small-fauna-young-${cohort.kind}-${cohort.slot}`;
          mesh.frustumCulled = false;
          batch = { mesh };
          this.scene.add(mesh);
          this.broods.set(cohort, batch);
        }
        batch.mesh.visible = nearby && !winter;
        if (!batch.mesh.visible) continue;
        const age = Math.min(
          1,
          Math.max(0, (clock - cohort.dueAt) / (cohort.matureAt - cohort.dueAt)),
        );
        batch.mesh.count = Math.min(batch.mesh.instanceMatrix.count, cohort.remaining);
        for (let index = 0; index < batch.mesh.count; index++) {
          const angle = index * 2.399963 + time * 0.075;
          const radius = 0.24 + age * 3.7 + Math.sin(index + time * 0.5) * 0.12;
          let x = cohort.home.x + Math.cos(angle) * radius;
          let z = cohort.home.z + Math.sin(angle) * radius;
          if (!this.dry(x, z)) {
            x = cohort.home.x;
            z = cohort.home.z;
          }
          const floor = this.groundAt(x, z);
          const y =
            cohort.kind === 'spider' && age < 0.35
              ? THREE.MathUtils.lerp(cohort.home.y, floor, age / 0.35)
              : floor;
          this.pose.position.set(x, y + 0.025, z);
          this.pose.rotation.y = -angle;
          this.pose.scale.setScalar(cohort.kind === 'snake' ? 0.65 + age : 0.6 + age * 0.65);
          this.pose.updateMatrix();
          batch.mesh.setMatrixAt(index, this.pose.matrix);
        }
        batch.mesh.instanceMatrix.needsUpdate = true;
      } else if (batch) {
        batch.mesh.removeFromParent();
        batch.mesh.dispose();
        this.broods.delete(cohort);
      }
    }
    for (const [cohort, cocoon] of this.cocoons)
      if (!cohorts.includes(cohort)) {
        cocoon.removeFromParent();
        this.cocoons.delete(cohort);
      }
    for (const [cohort, batch] of this.broods)
      if (!cohorts.includes(cohort)) {
        batch.mesh.removeFromParent();
        batch.mesh.dispose();
        this.broods.delete(cohort);
      }
    for (const retreat of this.retreats.values())
      retreat.visible =
        Math.hypot(retreat.position.x - player.x, retreat.position.z - player.z) < 65;
  }

  dispose(): void {
    for (const model of [...this.retreats.values(), ...this.cocoons.values()])
      model.removeFromParent();
    for (const { mesh } of this.broods.values()) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    for (const resource of [
      this.sphere,
      this.rock,
      this.spiderling,
      this.snakelet,
      this.silk,
      this.bark,
      this.dark,
      this.scales,
    ])
      resource.dispose();
  }
}
