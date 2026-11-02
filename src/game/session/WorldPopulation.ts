import * as THREE from 'three';
import { Random } from '../Random';
import { WildlifeEcology } from '../WildlifeEcology';
import { World } from '../World';
import { ModelAssets } from '../ModelAssets';
import type { ForestAnimal } from '../animals';
import {
  createPredatorActor,
  FamilyMember,
  Hawk,
  Predator,
  RabbitActor,
  RabbitFactory,
} from '../animals';
import type { PredatorKind } from '../types';
import { type SaveData } from '../types';

/** Создаёт стартовую популяцию с сохранением порядка генерации случайных значений. */
export class WorldPopulation {
  readonly rabbits: RabbitActor[];
  readonly families: FamilyMember[];
  readonly predators: Predator[];
  readonly wildlife: ForestAnimal[];
  readonly hawks: Hawk[];
  readonly ecology: WildlifeEcology;

  constructor(context: {
    scene: THREE.Scene;
    world: World;
    save: SaveData;
    rng: Random;
    markPartner: (actor: RabbitActor, active: boolean) => void;
  }) {
    this.rabbits = context.save.partners.map((p) => {
      const actor = new RabbitActor(p, context.rng);
      actor.rig.root.position.y = p.y ?? context.world.heightAt(p.x, p.z);
      actor.rig.root.userData.baseY = actor.rig.root.position.y;
      context.scene.add(actor.rig.root);
      if (p.id === context.save.mateId) context.markPartner(actor, true);
      return actor;
    });
    this.families = [];
    for (const partner of context.save.partners.slice()) {
      const familyFactory = new RabbitFactory(
        new Random(context.save.seed + 900 + partner.id * 71),
      );
      for (let i = 0; i < partner.familySize; i++) {
        const genes = familyFactory.genes();
        const young = i < Math.floor(partner.familySize / 2);
        if (
          !young &&
          context.save.partners.some((saved) => saved.id === 100000 + partner.id * 100 + i)
        )
          continue;
        const member = new FamilyMember(partner, genes, i, young);
        if (!young) {
          const actor = new RabbitActor(member.data, context.rng);
          actor.moveTo(member.x, member.z, context.world.heightAt(member.x, member.z));
          ModelAssets.shared.release(member.root);
          context.save.partners.push(member.data);
          this.rabbits.push(actor);
          context.scene.add(actor.root);
          continue;
        }
        member.rig.root.position.set(
          member.x,
          context.world.heightAt(member.x, member.z),
          member.z,
        );
        this.families.push(member);
        context.scene.add(member.rig.root);
      }
    }

    this.predators = [];
    for (let i = 0; i < 22; i++) {
      const a = context.rng.range(0, Math.PI * 2),
        d = context.rng.range(27, 82);
      const x = i === 0 ? 34 : i === 1 ? -35 : Math.cos(a) * d;
      const z = i === 0 ? 31 : i === 1 ? 29 : Math.sin(a) * d;
      const kind = this.predatorKind(i);
      const predator = createPredatorActor(kind, x, z, context.rng);
      predator.root.position.y = context.world.heightAt(x, z);
      this.predators.push(predator);
      context.scene.add(predator.root);
    }

    this.ecology = new WildlifeEcology(context.scene, context.world, context.rng, context.save);
    this.ecology.populate();
    this.wildlife = this.ecology.animals;
    this.hawks = [[32, -30]].map(([x, z]) => new Hawk(x, z, context.rng));
    for (const hawk of this.hawks) context.scene.add(hawk.root, hawk.shadow);
  }

  private predatorKind(index: number): PredatorKind {
    if (index < 2) return 'dog';
    if (index === 2 || index === 6) return 'bear';
    if (index >= 3 && index <= 5) return 'snake';
    if (index % 7 === 0) return 'lynx';
    if (index % 5 === 0) return 'weasel';
    if (index % 4 === 0) return 'wolf';
    return 'fox';
  }
}
