import { AnimalPhysics, type PhysicalBody } from '../AnimalPhysics';
import { RABBIT_BODY } from '../RabbitBody';
import { bodyContact } from '../BodyContact';
import type { FamilyMember, ForestAnimal, Predator, RabbitActor } from '../animals';
import type { Excavation } from '../Excavation';
import type { SaveData } from '../types';
import type { World } from '../World';
import type { FamilyLifecycle } from './FamilyLifecycle';
interface CollisionContext {
  playerHeading?: () => number;
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
  private bodies: PhysicalBody[] = [];

  constructor(private readonly context: CollisionContext) {}

  canPlayerMove(x: number, z: number, y: number, heading: number): boolean {
    const player = this.context.save.player;
    const current: PhysicalBody = {
      id: 0,
      x: player.x,
      y: player.y,
      z: player.z,
      heading,
      radius: RABBIT_BODY.radius * player.genes.size,
      halfLength: RABBIT_BODY.halfLength * player.genes.size,
      sheltered: this.context.earth.isSheltered(player.x, player.y, player.z),
      mass: Infinity,
      moveTo: () => false,
    };
    const candidate = { ...current, x, z, y };
    for (const other of this.bodies) {
      if (
        other.id === 0 ||
        other.sheltered !== current.sheltered ||
        Math.abs(other.y - y) > 1.2 ||
        Math.hypot(other.x - x, other.z - z) > 4
      )
        continue;
      const distance = bodyContact(candidate, other).distance;
      // Из уже возникшего пересечения разрешаем выйти, но не углублять его в сторону стены.
      if (
        distance < current.radius + other.radius - 0.01 &&
        distance < bodyContact(current, other).distance - 0.001
      )
        return false;
    }
    return true;
  }

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
      radius: RABBIT_BODY.radius * p.genes.size,
      halfLength: RABBIT_BODY.halfLength * p.genes.size,
      heading: this.context.playerHeading?.() ?? 0,
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
        radius: RABBIT_BODY.radius * root.scale.x,
        halfLength: RABBIT_BODY.halfLength * root.scale.x,
        heading: root.rotation.y,
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
        radius: RABBIT_BODY.radius * root.scale.x,
        halfLength: RABBIT_BODY.halfLength * root.scale.x,
        heading: root.rotation.y,
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
          radius: Math.max(0.14, RABBIT_BODY.radius * rig.root.scale.x),
          halfLength: RABBIT_BODY.halfLength * rig.root.scale.x,
          heading: rig.root.rotation.y,
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
    this.bodies = bodies;
  }
}
