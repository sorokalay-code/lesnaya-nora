import { AnimalPhysics, type PhysicalBody } from '../AnimalPhysics';
import type { FamilyMember, ForestAnimal, Predator, RabbitActor } from '../animals';
import type { Excavation } from '../Excavation';
import type { SaveData } from '../types';
import type { World } from '../World';
import type { FamilyLifecycle } from './FamilyLifecycle';
interface CollisionContext {
  save: SaveData;
  world: World;
  earth: Excavation;
  rabbits: RabbitActor[];
  families: FamilyMember[];
  predators: Predator[];
  wildlife: ForestAnimal[];
  family: FamilyLifecycle;
}
/** Собирает физические тела сущностей и синхронизирует результат со сценой и сохранением. */
export class AnimalCollisionSystem {
  private readonly physics = new AnimalPhysics();

  constructor(private readonly context: CollisionContext) {}

  resolve(matingId?: number): void {
    const p = this.context.save.player,
      bodies: PhysicalBody[] = [];
    const valid = (x: number, z: number, y: number, sheltered: boolean) =>
      Math.abs(x) < 103 && Math.abs(z) < 103 && this.context.earth.canMoveTo(x, z, y, sheltered);
    bodies.push({
      id: 0,
      x: p.x,
      y: p.y,
      z: p.z,
      radius: 0.38,
      mass: Infinity,
      sheltered: this.context.earth.isSheltered(p.x, p.y, p.z),
      moveTo: () => false,
    });
    this.context.rabbits.forEach((actor, i) => {
      if (matingId === actor.data.id) return;

      const root = actor.rig.root,
        y = (root.userData.baseY as number) ?? root.position.y,
        sheltered = this.context.earth.isSheltered(actor.data.x, y, actor.data.z);
      bodies.push({
        id: 1000 + i,
        x: actor.data.x,
        y,
        z: actor.data.z,
        radius: 0.38 * root.scale.x,
        mass: 1,
        sheltered,
        moveTo: (x, z) => {
          if (!valid(x, z, y, sheltered)) return false;
          actor.moveTo(
            x,
            z,
            sheltered ? this.context.earth.floorAt(x, z, y) : this.context.world.heightAt(x, z),
          );
          return true;
        },
      });
    });
    this.context.families.forEach((member, i) => {
      const root = member.rig.root,
        y = (root.userData.baseY as number) ?? root.position.y;
      bodies.push({
        id: 2000 + i,
        x: root.position.x,
        y,
        z: root.position.z,
        radius: 0.34 * root.scale.x,
        mass: 1,
        sheltered: false,
        moveTo: (x, z) => {
          if (!valid(x, z, y, false)) return false;
          member.moveTo(x, z, this.context.world.heightAt(x, z));
          return true;
        },
      });
    });
    this.context.save.kits
      .filter((k) => k.alive)
      .forEach((kit) => {
        const rig = this.context.family.rigs.get(kit.id);
        if (!rig) return;

        const y = kit.y ?? kit.homeY,
          sheltered = this.context.earth.isSheltered(kit.x ?? kit.homeX, y, kit.z ?? kit.homeZ);
        bodies.push({
          id: 3000 + kit.id,
          x: kit.x ?? kit.homeX,
          y,
          z: kit.z ?? kit.homeZ,
          radius: Math.max(0.17, 0.36 * rig.root.scale.x),
          mass: 0.55,
          sheltered,
          moveTo: (x, z) => {
            if (!valid(x, z, y, sheltered)) return false;
            kit.x = x;
            kit.z = z;
            kit.y = sheltered
              ? this.context.earth.floorAt(x, z, y)
              : this.context.world.heightAt(x, z);
            rig.root.position.set(x, kit.y, z);
            rig.root.userData.baseY = kit.y;
            return true;
          },
        });
      });
    this.context.predators.forEach((predator, i) => {
      const y = predator.root.position.y,
        sheltered = predator.underground;
      const radius = predator.profile.radius;
      bodies.push({
        id: 4000 + i,
        x: predator.x,
        y,
        z: predator.z,
        radius,
        mass: predator.profile.mass,
        sheltered,
        moveTo: (x, z) => {
          if (!valid(x, z, y, sheltered)) return false;
          predator.moveTo(
            x,
            z,
            sheltered ? this.context.earth.floorAt(x, z, y) : this.context.world.heightAt(x, z),
          );
          return true;
        },
      });
    });
    this.context.wildlife.forEach((animal, i) => {
      const radius = animal.profile.radius;
      bodies.push({
        id: 5000 + i,
        x: animal.x,
        y: animal.root.position.y,
        z: animal.z,
        radius,
        mass: animal.profile.mass,
        sheltered: false,
        moveTo: (x, z) => {
          if (!valid(x, z, animal.root.position.y, false)) return false;
          animal.x = x;
          animal.z = z;
          animal.root.position.set(x, this.context.world.heightAt(x, z), z);
          return true;
        },
      });
    });
    this.physics.resolve(bodies);
  }
}
