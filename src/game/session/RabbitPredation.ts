import type * as THREE from 'three';
import type { ForestAnimal, RabbitActor } from '../animals';
import type { Excavation } from '../Excavation';
import { GeneticTraits } from '../genetics/GeneticTraits';
import { setRabbitAction, type RabbitRig } from '../Models';
import type { Genes, SaveData } from '../types';
import type { World } from '../World';
import type { FamilyLifecycle } from './FamilyLifecycle';
import type { AttackListener } from '../audio/AttackCue';
import { AnimalRestraint } from '../animals/AnimalRestraint';

interface Context {
  attackSound?: AttackListener;
  save: SaveData;
  world: World;
  earth: Excavation;
  rabbits: RabbitActor[];
  wildlife: ForestAnimal[];
  family?: FamilyLifecycle;
  combatAllowed?: () => boolean;
  consequences: { predatorAttack: (kind: string) => void };
  toast: (text: string) => void;
}
type Hunter = {
  phase: number;
  rig: RabbitRig;
  genes: Genes;
  x: number;
  y: number;
  z: number;
  move: (x: number, y: number, z: number) => void;
};

/** Самостоятельная охота клыкастых взрослых кроликов и выросших детей с соблюдением перемирия диалогов. */
export class RabbitPredation {
  private readonly cooldowns = new WeakMap<THREE.Object3D, number>();

  constructor(private readonly context: Context) {}

  update(dt: number, time: number): void {
    for (const actor of this.context.rabbits) {
      if (!actor.solitary || !actor.alive || AnimalRestraint.active(actor.root)) continue;
      this.hunt(
        {
          rig: actor.rig,
          phase: actor.data.id,
          genes: actor.data.genes,
          x: actor.x,
          z: actor.z,
          y: (actor.rig.root.userData.baseY as number) ?? actor.root.position.y,
          move: (x, y, z) => actor.moveTo(x, z, y),
        },
        dt,
        time,
      );
    }
    for (const kit of this.context.save.kits) {
      if (!kit.alive || kit.age < 3 || !kit.genes.anatomy.fangs) continue;
      const rig = this.context.family?.rigs.get(kit.id);
      if (!rig) continue;
      this.hunt(
        {
          rig,
          phase: kit.id,
          genes: kit.genes,
          x: kit.x ?? kit.homeX,
          y: kit.y ?? kit.homeY,
          z: kit.z ?? kit.homeZ,
          move: (x, y, z) => {
            kit.x = x;
            kit.y = y;
            kit.z = z;
            rig.root.position.set(x, y, z);
            rig.root.userData.baseY = y;
          },
        },
        dt,
        time,
      );
    }
  }

  private hunt(hunter: Hunter, dt: number, time: number): void {
    if (AnimalRestraint.active(hunter.rig.root)) return;
    const { rig, genes } = hunter;
    rig.root.userData.hunting = false;
    if (
      !(this.context.combatAllowed?.() ?? true) ||
      rig.root.userData.conversing ||
      this.context.earth.isSheltered(hunter.x, hunter.y, hunter.z)
    )
      return;
    const player = this.context.save.player;
    const prey = this.context.wildlife.find(
      (animal) =>
        animal.alive &&
        !AnimalRestraint.active(animal.root) &&
        animal.profile.radius < 0.7 &&
        Math.hypot(animal.x - hunter.x, animal.z - hunter.z) < 9 &&
        Math.abs(animal.root.position.y - hunter.y) < 1.2,
    );
    const target =
      prey ??
      (!player.hidden && Math.hypot(player.x - hunter.x, player.z - hunter.z) < 7
        ? player
        : undefined);
    if (!target) return;
    rig.root.userData.hunting = true;
    rig.root.userData.huntMoving = false;
    const dx = target.x - hunter.x,
      dz = target.z - hunter.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(
      Math.max(0, distance - 1.6),
      dt * (3.8 + genes.speed * 0.3) * GeneticTraits.mobility(genes),
    );
    const x = hunter.x + (dx / (distance || 1)) * step,
      z = hunter.z + (dz / (distance || 1)) * step;
    if (this.context.earth.canMoveTo(x, z, hunter.y, false)) {
      hunter.move(x, this.context.world.heightAt(x, z), z);
      rig.root.userData.huntMoving = step > 0.001;
    }
    rig.root.rotation.y = Math.atan2(-dx, -dz);
    if (distance < 1.9 && time >= (this.cooldowns.get(rig.root) ?? 0)) {
      this.cooldowns.set(rig.root, time + 3);
      setRabbitAction(rig, 'eat', time + hunter.phase, 0.5);
      const { x, y, z } = rig.root.position;
      this.context.attackSound?.({ kind: 'fanged-rabbit', phase: 'strike', x, y, z, time });
      if (prey) {
        prey.health = Math.max(0, prey.health - 14);
        if (!prey.alive) this.context.toast('Клыкастый кролик поймал лесную добычу.');
      } else this.context.consequences.predatorAttack('fanged-rabbit');
    }
  }
}
