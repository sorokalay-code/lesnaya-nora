import type * as THREE from 'three';
import type { FamilyMember, ForestAnimal, Hawk, Predator, RabbitActor } from '../animals';
import type { Excavation } from '../Excavation';
import { setRabbitAction, type RabbitRig } from '../Models';
import { Random } from '../Random';
import { AerialDroppings } from '../systems/AerialDroppings';
import type { WasteSystem } from '../systems/WasteSystem';
import type { SaveData } from '../types';
import type { FamilyLifecycle } from './FamilyLifecycle';
import { DailyWasteBudget } from '../systems/DailyWasteBudget';
import { CoatDirt } from '../CoatDirt';

interface Context {
  scene: THREE.Scene;
  save: SaveData;
  earth: Excavation;
  waste: WasteSystem;
  family: FamilyLifecycle;
  rabbits: RabbitActor[];
  families: FamilyMember[];
  wildlife: ForestAnimal[];
  predators: Predator[];
  hawks: Hawk[];
}

/** Потребности животных и санитария гнезда обновляются редко и независимо от кадровой частоты. */
export class AnimalWasteSystem {
  private readonly budget: DailyWasteBudget;
  private readonly rng: Random;
  private readonly aerial: AerialDroppings;
  private nextScan = 0;
  private contactTime = 0;

  constructor(private readonly context: Context) {
    this.rng = new Random(context.save.seed + 8233);
    this.budget = new DailyWasteBudget(context.save, this.rng);
    this.aerial = new AerialDroppings(
      context.scene,
      (x, z, y) => context.earth.floorAt(x, z, y),
      context.waste,
    );
  }

  update(dt: number, time: number): void {
    this.aerial.update(dt);
    this.contactTime += dt;
    if (this.contactTime >= 0.1) {
      this.updateCoats(this.contactTime);
      this.contactTime = 0;
    }
    if (time < this.nextScan) return;
    this.nextScan = time + 1;
    for (const kit of this.context.save.kits) {
      if (!kit.alive) continue;
      const position = { x: kit.x ?? kit.homeX, y: kit.y ?? kit.homeY, z: kit.z ?? kit.homeZ };
      this.emit(
        `kit:${kit.id}`,
        position,
        time,
        kit.id,
        0.55,
        this.context.family.rigs.get(kit.id),
      );
      if (
        kit.age < 3 &&
        this.context.waste.nearby(position.x, position.y, position.z, 1.5).length >= 3
      )
        kit.health = Math.max(0, kit.health - 0.03);
    }
    for (const rabbit of this.context.rabbits) {
      this.emit(
        `rabbit:${rabbit.data.id}`,
        {
          x: rabbit.data.x,
          y: (rabbit.root.userData.baseY as number) ?? rabbit.root.position.y,
          z: rabbit.data.z,
        },
        time,
        rabbit.data.id,
        1,
        rabbit.rig,
      );
    }
    for (const member of this.context.families)
      this.emit(`family:${member.data.id}`, member.root.position, time, 0, 0.8, member.rig);
    for (const animal of this.context.wildlife)
      if (animal.alive)
        this.emit(
          `wild:${animal.socialId}`,
          animal.root.position,
          time,
          0,
          animal.profile.radius > 0.8 ? 1.4 : 0.8,
        );
    for (const animal of this.context.predators)
      if (animal.alive)
        this.emit(
          `predator:${animal.kind}:${animal.origin.x}:${animal.origin.z}`,
          animal.root.position,
          time,
          0,
          0.8,
        );
    for (const [index, bird] of this.context.hawks.entries()) {
      if (this.budget.ready(`bird:${index}`))
        this.aerial.release(bird.x, bird.root.position.y, bird.z);
    }
  }

  private emit(
    key: string,
    position: { x: number; y: number; z: number },
    time: number,
    phase: number,
    size: number,
    rig?: RabbitRig,
  ): void {
    if (!this.budget.ready(key)) return;
    this.context.waste.spawn(
      this.rng.chance(0.2) ? 'urine' : 'pellets',
      position.x,
      position.y,
      position.z,
      size,
    );
    if (rig && !rig.root.userData.conversing) setRabbitAction(rig, 'defecate', time + phase, 1.2);
  }

  private updateCoats(dt: number): void {
    for (const kit of this.context.save.kits) {
      if (!kit.alive) continue;
      this.soil(
        dt,
        kit,
        { x: kit.x ?? kit.homeX, y: kit.y ?? kit.homeY, z: kit.z ?? kit.homeZ },
        this.context.family.rigs.get(kit.id),
      );
    }
    for (const rabbit of this.context.rabbits) {
      if (rabbit.data.id !== this.context.save.mateId) {
        CoatDirt.update(rabbit.rig, 0);
        delete rabbit.data.dirtiness;
        continue;
      }
      this.soil(
        dt,
        rabbit.data,
        {
          x: rabbit.x,
          y: (rabbit.root.userData.baseY as number) ?? rabbit.root.position.y,
          z: rabbit.z,
        },
        rabbit.rig,
      );
    }
  }

  private soil(
    dt: number,
    data: { dirtiness?: number },
    position: { x: number; y: number; z: number },
    rig?: RabbitRig,
  ): void {
    data.dirtiness = Math.min(
      100,
      (data.dirtiness ?? 0) +
        this.context.waste.contactDirt(dt, position.x, position.y, position.z),
    );
    if (rig) CoatDirt.update(rig, data.dirtiness);
  }
}
