import type * as THREE from 'three';
import type { FamilyMember, ForestAnimal, Hawk, Predator, RabbitActor } from '../animals';
import type { Excavation } from '../Excavation';
import { setRabbitAction, type RabbitRig } from '../Models';
import { Random } from '../Random';
import { AerialDroppings } from '../systems/AerialDroppings';
import type { WasteSystem } from '../systems/WasteSystem';
import type { SaveData } from '../types';
import type { FamilyLifecycle } from './FamilyLifecycle';

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
  private readonly due = new WeakMap<object, number>();
  private readonly rng: Random;
  private readonly aerial: AerialDroppings;
  private nextScan = 0;

  constructor(private readonly context: Context) {
    this.rng = new Random(context.save.seed + 8233);
    this.aerial = new AerialDroppings(
      context.scene,
      (x, z, y) => context.earth.floorAt(x, z, y),
      context.waste,
    );
  }

  update(dt: number, time: number): void {
    this.aerial.update(dt);
    if (time < this.nextScan) return;
    this.nextScan = time + 1;
    for (const kit of this.context.save.kits) {
      if (!kit.alive) continue;
      const position = { x: kit.x ?? kit.homeX, y: kit.y ?? kit.homeY, z: kit.z ?? kit.homeZ };
      this.emit(kit, position, time, kit.id, 0.55, this.context.family.rigs.get(kit.id));
      if (
        kit.age < 3 &&
        this.context.waste.nearby(position.x, position.y, position.z, 1.5).length >= 3
      )
        kit.health = Math.max(0, kit.health - 0.03);
    }
    for (const rabbit of this.context.rabbits)
      this.emit(
        rabbit.data,
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
    for (const member of this.context.families)
      this.emit(member, member.root.position, time, 0, 0.8, member.rig);
    for (const animal of [...this.context.wildlife, ...this.context.predators])
      if (animal.alive)
        this.emit(animal, animal.root.position, time, 0, animal.profile.radius > 0.8 ? 1.4 : 0.8);
    for (const bird of this.context.hawks) {
      if (this.ready(bird, 180, 360)) this.aerial.release(bird.x, bird.root.position.y, bird.z);
    }
  }

  private ready(subject: object, min = 120, max = 240): boolean {
    const clock = this.context.save.clock;
    const next = this.due.get(subject);
    if (next === undefined) {
      this.due.set(subject, clock + this.rng.range(min, max));
      return false;
    }
    if (clock < next) return false;
    this.due.set(subject, clock + this.rng.range(min, max));
    return true;
  }

  private emit(
    subject: object,
    position: { x: number; y: number; z: number },
    time: number,
    phase: number,
    size: number,
    rig?: RabbitRig,
  ): void {
    if (!this.ready(subject)) return;
    this.context.waste.spawn(
      this.rng.chance(0.2) ? 'urine' : 'pellets',
      position.x,
      position.y,
      position.z,
      size,
    );
    if (rig && !rig.root.userData.conversing) setRabbitAction(rig, 'defecate', time + phase, 1.2);
  }
}
