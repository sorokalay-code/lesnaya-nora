import { InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry, type Scene } from 'three';
import type { Animal } from './animals/Animal';
import type { HabitatPoint } from './AnimalHabitats';
import type { DigNode } from './types';
import type { RaptorKind } from './animals/FlyingRaptor';

export type BirdKind = 'pheasant' | RaptorKind;

export interface BirdChick extends DigNode {
  id: number;
  health: number;
}

export interface BirdBroodState {
  slot: number;
  parent: number;
  laidAt: number;
  eggs: number;
  young: BirdChick[];
}

interface Context<A extends Animal> {
  scene: Scene;
  records: BirdBroodState[];
  eggs: number;
  incubationDays: number;
  growthDays: number;
  shellColor: number;
  nest: (slot: number) => DigNode | undefined;
  create: (slot: number, at: DigNode, saved?: BirdChick) => { actor: A; id: number };
  depart: (actor: A) => void;
  settle: (actor: A, slot: number) => boolean;
}

const DAY = 1440;

/** Хранит кладки и возраст птенцов в игровом времени, связывает их с моделями в сцене. */
export class BirdBroods<A extends Animal> {
  private readonly live = new Map<BirdChick, A>();
  private readonly chickData = new WeakMap<A, BirdChick>();
  private readonly clutches = new Map<BirdBroodState, InstancedMesh>();
  private readonly eggShape = new SphereGeometry(1, 8, 5);
  private readonly shell: MeshStandardMaterial;

  constructor(private readonly context: Context<A>) {
    this.shell = new MeshStandardMaterial({ color: context.shellColor, roughness: 0.78 });
  }

  owns(actor: A): boolean {
    return this.chickData.has(actor);
  }

  restore(clock: number): void {
    for (const brood of this.context.records) {
      const nest = this.context.nest(brood.slot);
      if (!nest) continue;
      if (brood.eggs) this.showEggs(brood, nest);
      for (const chick of brood.young) this.place(brood, chick, clock, chick);
    }
  }

  lay(slot: number, parent: number, clock: number): void {
    const records = this.context.records;
    const previous = records.findIndex((brood) => brood.slot === slot);
    const brood = records[previous];
    const interval = Math.max(7, this.context.incubationDays + this.context.growthDays + 1) * DAY;
    if (brood && (brood.eggs || brood.young.length || clock - brood.laidAt < interval)) return;
    const nest = this.context.nest(slot);
    if (!nest) return;

    const clutch = { slot, parent, laidAt: clock, eggs: this.context.eggs, young: [] };
    if (brood) records[previous] = clutch;
    else records.push(clutch);
    this.showEggs(clutch, nest);
  }

  update(
    clock: number,
    player: HabitatPoint,
    parentAlive: (brood: BirdBroodState) => boolean,
    tend: (brood: BirdBroodState, young: A, age: number, id: number) => void,
  ): void {
    for (const brood of this.context.records) {
      const nest = this.context.nest(brood.slot);
      if (!nest) continue;
      const hatchAt = brood.laidAt + this.context.incubationDays * DAY;
      if (brood.eggs && !parentAlive(brood)) brood.eggs = 0;
      if (brood.eggs && clock >= hatchAt) {
        for (let index = 0; index < brood.eggs; index++) {
          const angle = index * 2.399963;
          this.place(
            brood,
            { x: nest.x + Math.cos(angle) * 0.17, y: nest.y, z: nest.z + Math.sin(angle) * 0.17 },
            clock,
          );
        }
        brood.eggs = 0;
      }
      if (!brood.eggs) this.hideEggs(brood);

      const age = this.age(brood, clock);
      for (let index = brood.young.length - 1; index >= 0; index--) {
        const data = brood.young[index];
        const actor = this.live.get(data);
        if (!actor?.alive) {
          this.forget(brood, index, actor);
          continue;
        }

        actor.updateGrowth(age);
        if (age >= 1) {
          if (this.context.settle(actor, brood.slot)) {
            this.forget(brood, index, actor);
            continue;
          }
          if (Math.hypot(actor.x - player.x, actor.z - player.z) > 26) {
            this.forget(brood, index, actor);
            this.context.depart(actor);
            continue;
          }
        }
        tend(brood, actor, age, data.id);
      }
    }
  }

  capture(): void {
    for (const brood of this.context.records) {
      for (let index = brood.young.length - 1; index >= 0; index--) {
        const data = brood.young[index];
        const actor = this.live.get(data);
        if (!actor) continue;
        if (!actor.alive) {
          this.forget(brood, index, actor);
          continue;
        }
        Object.assign(data, {
          x: actor.x,
          y: actor.root.position.y,
          z: actor.z,
          health: actor.health,
        });
      }
    }
  }

  dispose(): void {
    for (const brood of this.clutches.keys()) this.hideEggs(brood);
    this.eggShape.dispose();
    this.shell.dispose();
  }

  private place(brood: BirdBroodState, at: DigNode, clock: number, saved?: BirdChick): void {
    const { actor, id } = this.context.create(brood.slot, at, saved);
    const data = saved ?? { ...at, id, health: actor.maxHealth * 0.64 };
    if (!saved) brood.young.push(data);
    actor.health = Math.min(data.health, actor.maxHealth);
    actor.updateGrowth(this.age(brood, clock));
    this.live.set(data, actor);
    this.chickData.set(actor, data);
  }

  private age(brood: BirdBroodState, clock: number): number {
    return Math.min(
      1,
      Math.max(
        0,
        (clock - brood.laidAt - this.context.incubationDays * DAY) /
          (this.context.growthDays * DAY),
      ),
    );
  }

  private forget(brood: BirdBroodState, index: number, actor?: A): void {
    this.live.delete(brood.young[index]);
    brood.young.splice(index, 1);
    if (actor) this.chickData.delete(actor);
  }

  private showEggs(brood: BirdBroodState, nest: DigNode): void {
    if (this.clutches.has(brood)) return;
    const eggs = new InstancedMesh(this.eggShape, this.shell, brood.eggs);
    eggs.name = `bird-clutch-${this.context.shellColor}-${brood.slot}`;
    eggs.position.set(nest.x, nest.y + 0.065, nest.z);
    const pose = new Object3D();
    for (let index = 0; index < brood.eggs; index++) {
      const angle = index * 2.399963;
      pose.position.set(Math.sin(angle) * 0.135, 0, Math.cos(angle) * 0.135);
      pose.rotation.z = angle * 0.14;
      pose.scale.set(0.073, 0.1, 0.073);
      pose.updateMatrix();
      eggs.setMatrixAt(index, pose.matrix);
    }
    this.context.scene.add(eggs);
    this.clutches.set(brood, eggs);
  }

  private hideEggs(brood: BirdBroodState): void {
    const eggs = this.clutches.get(brood);
    if (!eggs) return;
    eggs.removeFromParent();
    eggs.dispose();
    this.clutches.delete(brood);
  }
}
