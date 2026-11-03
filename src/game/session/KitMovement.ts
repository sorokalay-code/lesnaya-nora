import { GroundNavigator } from '../GroundNavigator';
import type { Excavation } from '../Excavation';
import type { KitWander } from '../KitWander';
import { animateRabbit, setRabbitAction, type RabbitRig } from '../Models';
import type { DigNode, KitData, SaveData } from '../types';
import type { World } from '../World';
import { KitFeeding } from './KitFeeding';
import { GeneticTraits } from '../genetics/GeneticTraits';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { WaterNavigation, RABBIT_SWIM_IMMERSION } from '../WaterNavigation';

interface Context {
  save: SaveData;
  earth: Excavation;
  world: World;
}

/** Движение детей и взрослых потомков: единые маршруты, цели кормления и спокойный отдых. */
export class KitMovement {
  private readonly navigators = new Map<number, GroundNavigator>();
  private readonly feeding: KitFeeding;
  private readonly water?: WaterNavigation;
  private readonly followTargets = new Map<number, { anchor: DigNode; point: DigNode }>();

  constructor(
    private readonly context: Context,
    private readonly wander: KitWander,
  ) {
    this.feeding = new KitFeeding(context.save, context.earth);
    if (typeof context.world.waterAt === 'function')
      this.water = new WaterNavigation(context.world);
  }

  update(kit: KitData, rig: RabbitRig, time: number, dt: number): void {
    if (AnimalRestraint.active(rig.root)) {
      animateRabbit(rig, time, false, false, dt);
      return;
    }
    if (rig.root.userData.hunting && !rig.root.userData.conversing) {
      animateRabbit(rig, time + kit.id, !!rig.root.userData.huntMoving, true, dt);
      return;
    }
    if (
      rig.root.userData.conversing ||
      Number(rig.root.userData.careUntil ?? 0) > time ||
      (rig.root.userData.action === 'defecate' &&
        Number(rig.root.userData.actionUntil) > time + kit.id)
    ) {
      animateRabbit(rig, time + kit.id, false, false, dt);
      return;
    }
    const nest = this.context.save.nests.find((item) => item.id === kit.nestId);
    const home = nest ?? { x: kit.homeX, y: kit.homeY, z: kit.homeZ };
    const center =
      kit.command === 'follow'
        ? this.context.save.player
        : (kit.command === 'stay' || (kit.command === 'rest' && !nest)) && kit.stayX !== undefined
          ? { x: kit.stayX, y: kit.stayY ?? home.y, z: kit.stayZ ?? home.z }
          : home;
    const food = this.feeding.update(kit);
    const inside = this.context.earth.isSheltered(center.x, center.y, center.z);
    let destination =
      food ??
      (kit.independent || !kit.command
        ? this.wander.target(kit, center, time, this.context.earth, (x, z) =>
            this.context.world.heightAt(x, z),
          )
        : kit.command === 'follow'
          ? inside
            ? this.followSlot(kit, center)
            : {
                x: center.x + Math.cos(kit.id * 2.4) * (1.5 + (kit.id % 3) * 0.35),
                y: center.y,
                z: center.z + Math.sin(kit.id * 2.4) * (1.5 + (kit.id % 3) * 0.35),
              }
          : kit.command === 'rest'
            ? this.restSlot(kit, center)
            : center);
    if (
      !kit.independent &&
      inside &&
      !this.context.earth.isSheltered(destination.x, destination.y, destination.z)
    )
      destination = center;
    const from = { x: kit.x ?? home.x, y: kit.y ?? home.y, z: kit.z ?? home.z };
    const navigator = this.navigators.get(kit.id) ?? new GroundNavigator();
    this.navigators.set(kit.id, navigator);
    const distance = Math.hypot(destination.x - from.x, destination.z - from.z);
    const speed = kit.independent
      ? 2.4
      : kit.command === 'follow'
        ? Math.min(9, 3 + distance)
        : kit.age < 0.7
          ? 0.55
          : 1.2;
    const stop = food ? 1.2 : 0.3;
    const { point, moving } = navigator.step(
      from,
      destination,
      this.context.earth,
      dt,
      time,
      speed * GeneticTraits.mobility(kit.genes) * (0.7 + kit.genes.speed * 0.1),
      stop,
      this.water,
      kit.age >= 3,
      RABBIT_SWIM_IMMERSION * rig.root.scale.x,
    );
    if (moving) {
      const desired = Math.atan2(-(point.x - from.x), -(point.z - from.z));
      const turn = Math.atan2(
        Math.sin(desired - rig.root.rotation.y),
        Math.cos(desired - rig.root.rotation.y),
      );
      rig.root.rotation.y += Math.max(-dt * 5, Math.min(dt * 5, turn));
      rig.root.userData.actionUntil = 0;
    } else if (kit.command === 'rest') setRabbitAction(rig, 'lie', time + kit.id, 0.35);
    else if (kit.command === 'stay') setRabbitAction(rig, 'sit', time + kit.id, 0.35);
    kit.x = point.x;
    kit.y = point.y;
    kit.z = point.z;
    rig.root.position.set(point.x, point.y, point.z);
    rig.root.userData.baseY = point.y;
    rig.root.scale.setScalar((kit.age < 3 ? 0.28 + kit.age * 0.095 : 1) * kit.genes.size);
    const mark = rig.root.getObjectByName('family-mark');
    if (mark) {
      mark.rotation.y = time * 0.9;
      mark.position.y = Math.sin(time * 2 + kit.id) * 0.07;
    }
    animateRabbit(rig, time + kit.id, moving, false, dt);
  }

  forget(id: number): void {
    this.navigators.delete(id);
    this.followTargets.delete(id);
  }

  private followSlot(kit: KitData, center: DigNode): DigNode {
    const cached = this.followTargets.get(kit.id);
    if (
      cached &&
      Math.hypot(
        cached.anchor.x - center.x,
        cached.anchor.y - center.y,
        cached.anchor.z - center.z,
      ) < 0.8
    )
      return cached.point;
    const dx = center.x - (kit.x ?? kit.homeX),
      dz = center.z - (kit.z ?? kit.homeZ);
    const length = Math.hypot(dx, dz) || 1,
      trail = 1.4 + Math.floor((kit.id % 6) / 3) * 0.8,
      lateral = ((kit.id % 3) - 1) * 0.65;
    const x = center.x - (dx / length) * trail - (dz / length) * lateral,
      z = center.z - (dz / length) * trail + (dx / length) * lateral;
    const point = { x, y: this.context.earth.floorAt(x, z, center.y), z };
    const target = this.context.earth.isSheltered(point.x, point.y, point.z) ? point : center;
    this.followTargets.set(kit.id, { anchor: { ...center }, point: target });
    return target;
  }

  private restSlot(kit: KitData, center: DigNode): DigNode {
    const radius = 0.7 + (kit.id % 2) * 0.3;
    const x = center.x + Math.cos(kit.id * 2.4) * radius,
      z = center.z + Math.sin(kit.id * 2.4) * radius;
    const point = { x, y: this.context.earth.floorAt(x, z, center.y), z };
    return this.context.earth.isSheltered(center.x, center.y, center.z) &&
      !this.context.earth.isSheltered(point.x, point.y, point.z)
      ? center
      : point;
  }
}
