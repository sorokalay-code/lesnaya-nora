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
  Spider,
  AnimalFactory,
} from '../animals';
import type { PredatorKind } from '../types';
import { type SaveData } from '../types';
import { AnimalAppearance } from '../AnimalAppearance';
import { defaultWorldConfig } from '../WorldConfig';

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
    const config = context.save.worldConfig ?? defaultWorldConfig();
    const scale = config.size / 110;
    this.rabbits = context.save.partners
      .filter((p) => (p.health ?? 100) > 0)
      .map((p) => {
        const actor = AnimalFactory.rabbit(p, context.rng);
        actor.useWorldBounds(config.size);
        actor.rig.root.position.y = p.y ?? context.world.heightAt(p.x, p.z);
        actor.rig.root.userData.baseY = actor.rig.root.position.y;
        context.scene.add(actor.rig.root);
        if (p.id === context.save.mateId) context.markPartner(actor, true);
        return actor;
      });
    this.families = [];
    for (const partner of context.save.partners.slice()) {
      if (partner.genes.anatomy.fangs) continue;
      const familyFactory = new RabbitFactory(
        new Random(context.save.seed + 900 + partner.id * 71),
      );
      for (let i = 0; i < partner.familySize; i++) {
        const genes = familyFactory.inherit(partner.genes, familyFactory.genes());
        const health = context.save.familyHealth?.[100000 + partner.id * 100 + i] ?? 100;
        if (health <= 0) continue;
        const young = i < Math.floor(partner.familySize / 2);
        if (
          !young &&
          context.save.partners.some((saved) => saved.id === 100000 + partner.id * 100 + i)
        )
          continue;
        const member = new FamilyMember(partner, genes, i, young, undefined, config.size);
        member.health = health;
        member.data.health = health;
        if (!young) {
          const actor = AnimalFactory.rabbit(member.data, context.rng);
          actor.useWorldBounds(config.size);
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
    const groundKinds: PredatorKind[] = ['dog', 'bear', 'snake', 'lynx', 'weasel', 'wolf', 'fox'];
    const remaining = { ...config.creatures };
    const kinds: PredatorKind[] = [];
    // Сначала сохраняем прежний порядок: дефолты и старые v4 получают прежний поток RNG.
    for (let i = 0; i < 22; i++) {
      const kind = this.predatorKind(i);
      if (remaining[kind] > 0) {
        kinds.push(kind);
        remaining[kind]--;
      }
    }
    for (const kind of groundKinds) for (let i = 0; i < remaining[kind]; i++) kinds.push(kind);

    for (const [i, kind] of kinds.entries()) {
      const a = context.rng.range(0, Math.PI * 2),
        d = context.rng.range(27, 82);
      const x =
        (i === 0 && kind === 'dog' ? 34 : i === 1 && kind === 'dog' ? -35 : Math.cos(a) * d) *
        scale;
      const z =
        (i === 0 && kind === 'dog' ? 31 : i === 1 && kind === 'dog' ? 29 : Math.sin(a) * d) * scale;
      const predator = createPredatorActor(kind, x, z, context.rng);
      predator.useWorldBounds(config.size);
      predator.root.position.y = context.world.heightAt(x, z);
      this.predators.push(predator);
      context.scene.add(predator.root);
    }

    const spiderRandom = new Random(context.save.seed + 9024);
    const treeCandidates = (context.world.treeLocations ?? []).filter(
      (tree) =>
        Math.hypot(tree.x, tree.z) > 20 &&
        Math.hypot(tree.x, tree.z) < 85 * scale &&
        context.world.biomeAt(tree.x, tree.z) === 'forest',
    );
    const spiderHomes: { x: number; z: number }[] = [];
    for (
      let attempt = 0;
      attempt < 200 && spiderHomes.length < config.creatures.spider && treeCandidates.length;
      attempt++
    ) {
      const tree = spiderRandom.pick(treeCandidates);
      const second = treeCandidates
        .filter((candidate) => {
          const distance = Math.hypot(candidate.x - tree.x, candidate.z - tree.z);
          return distance > 3 && distance < 10;
        })
        .sort(
          (a, b) => Math.hypot(a.x - tree.x, a.z - tree.z) - Math.hypot(b.x - tree.x, b.z - tree.z),
        )[0];
      if (!second) continue;
      const x = tree.x,
        z = tree.z;
      if (spiderHomes.some((home) => Math.hypot(home.x - x, home.z - z) < 16)) continue;
      spiderHomes.push({ x, z });
      const spider = new Spider(x, z, spiderRandom, AnimalAppearance.seeded('spider', x, z));
      spider.configureHabitat(tree, second, (x, z) => context.world.heightAt(x, z));
      this.predators.push(spider);
      context.scene.add(spider.root);
    }
    const jumperRandom = new Random(context.save.seed + 11773),
      jumperHomes: { x: number; z: number }[] = [];
    for (
      let attempt = 0;
      attempt < 200 &&
      jumperHomes.length < config.creatures['jumping-spider'] &&
      treeCandidates.length;
      attempt++
    ) {
      const tree = jumperRandom.pick(treeCandidates);
      if (
        [...spiderHomes, ...jumperHomes].some(
          (home) => Math.hypot(home.x - tree.x, home.z - tree.z) < 12,
        )
      )
        continue;
      const x = tree.x + 1.4,
        z = tree.z + 0.8;
      jumperHomes.push({ x, z });
      const jumper = createPredatorActor('jumping-spider', x, z, jumperRandom);
      jumper.useWorldBounds(config.size);
      jumper.root.position.y = context.world.heightAt(x, z);
      this.predators.push(jumper);
      context.scene.add(jumper.root);
    }
    // Без деревьев пауки остаются наземными: настройка растительности не отменяет выбранный вид.
    for (const kind of ['spider', 'jumping-spider'] as const) {
      const rng = kind === 'spider' ? spiderRandom : jumperRandom;
      const present = this.predators.filter((animal) => animal.kind === kind).length;
      for (let i = present; i < config.creatures[kind]; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const distance = rng.range(22, 80) * scale;
        const actor = AnimalFactory.predator(
          kind,
          Math.cos(angle) * distance,
          Math.sin(angle) * distance,
          rng,
        );
        actor.useWorldBounds(config.size);
        actor.root.position.y = context.world.heightAt(actor.x, actor.z);
        this.predators.push(actor);
        context.scene.add(actor.root);
      }
    }
    this.ecology = new WildlifeEcology(context.scene, context.world, context.rng, context.save);
    this.ecology.populate();
    this.wildlife = this.ecology.animals;
    this.hawks = Array.from({ length: config.creatures.hawk }, (_, index) => {
      const angle = index * 2.4;
      const x = (index === 0 ? 32 : Math.cos(angle) * 60) * scale;
      const z = (index === 0 ? -30 : Math.sin(angle) * 60) * scale;
      const hawk = new Hawk(x, z, context.rng, AnimalAppearance.seeded('hawk', x, z));
      hawk.useWorldBounds(config.size);
      return hawk;
    });
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
