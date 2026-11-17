import * as THREE from 'three';
import { Random } from '../Random';
import { WildlifeEcology } from '../WildlifeEcology';
import { World } from '../World';
import { ModelAssets } from '../ModelAssets';
import type { ForestAnimal } from '../animals';
import {
  createPredatorActor,
  FamilyMember,
  FlyingRaptor,
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
import { isNightAt } from './WorldCalendar';
import { AnimalHabitats } from '../AnimalHabitats';
import { WolfPopulation } from './WolfPopulation';
import { WolfDens } from '../WolfDens';
import { WildlifeShelters } from '../WildlifeShelters';
import { LandPredators } from './LandPredators';
import { DEN_DEPTH, DEN_HALF_WIDTH } from '../WolfDen';

type LegacyPredatorSlot = PredatorKind | 'bear';

/** Создаёт стартовую популяцию с сохранением порядка генерации случайных значений. */
export class WorldPopulation {
  readonly rabbits: RabbitActor[];
  readonly families: FamilyMember[];
  readonly predators: Predator[];
  readonly wildlife: ForestAnimal[];
  readonly hawks: FlyingRaptor[];
  readonly ecology: WildlifeEcology;
  readonly wolfDens: WolfDens;

  constructor(context: {
    scene: THREE.Scene;
    world: World;
    save: SaveData;
    rng: Random;
    markPartner: (actor: RabbitActor, active: boolean) => void;
    onDeath?: (animal: ForestAnimal | Predator) => void;
    onWolfArrival?: (wolf: Predator) => void;
    onWolfBirth?: (wolf: Predator) => void;
    onWolfDeparture?: (wolf: Predator) => void;
    onPredatorArrival?: (predator: Predator) => void;
    onPredatorDeparture?: (predator: Predator) => void;
    onDenDiscovery?: () => void;
    onDenWarning?: () => void;
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
    const habitats = new AnimalHabitats(context.world, context.save.seed, config.size);
    this.wolfDens = new WolfDens(context.world, context.save, (model, den) => {
      const { x, y, z } = den.entrance;
      if (context.world.chunks) context.world.chunks.add(model, x, z);
      else context.scene.add(model);
      const radius = Math.hypot(DEN_DEPTH, DEN_HALF_WIDTH) + 0.5;
      context.world.clearGroundCover?.(
        { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius, maxY: y + 1 },
        (px, _py, pz) => -den.penetration(px, pz, 0.5),
      );
    });
    const wolves = new WolfPopulation({
      ...context,
      predators: this.predators,
      habitats,
      dens: this.wolfDens,
      size: config.size,
      count: config.creatures.wolf,
      onArrival: context.onWolfArrival,
      onBirth: context.onWolfBirth,
      onDeparture: context.onWolfDeparture,
      onDiscovery: context.onDenDiscovery,
      onDenWarning: context.onDenWarning,
    });
    const groundKinds: LegacyPredatorSlot[] = [
      'dog',
      'bear',
      'snake',
      'lynx',
      'weasel',
      'wolf',
      'fox',
    ];
    const remaining = { ...config.creatures };
    const kinds: LegacyPredatorSlot[] = [];
    // Старые места медведей резервируем для прежних координат и ID остальных хищников.
    for (let i = 0; i < 22; i++) {
      const kind = this.predatorKind(i);
      if (remaining[kind] > 0) {
        kinds.push(kind);
        remaining[kind]--;
      }
    }
    for (const kind of groundKinds) for (let i = 0; i < remaining[kind]; i++) kinds.push(kind);

    let wolfIndex = 0;
    const slots = new Map<PredatorKind, number>();
    // Сначала размещаем стаи: лисьи и звериные участки учитывают их логова.
    for (const [i, kind] of kinds.entries())
      if (kind === 'wolf') wolves.register(`predator:${i}`, wolfIndex++);
    wolves.restoreYoung();
    const shelters = new WildlifeShelters(
      context.world,
      context.scene,
      context.save,
      this.wolfDens,
    );
    const land = new LandPredators({
      ...context,
      predators: this.predators,
      habitats,
      shelters,
      onArrival: context.onPredatorArrival,
      onDeparture: context.onPredatorDeparture,
    });

    for (const [i, kind] of kinds.entries()) {
      const a = context.rng.range(0, Math.PI * 2),
        d = context.rng.range(27, 82);
      const x =
        (i === 0 && kind === 'dog' ? 34 : i === 1 && kind === 'dog' ? -35 : Math.cos(a) * d) *
        scale;
      const z =
        (i === 0 && kind === 'dog' ? 31 : i === 1 && kind === 'dog' ? 29 : Math.sin(a) * d) * scale;
      if (kind === 'bear' || kind === 'wolf') continue;
      const slot = slots.get(kind) ?? 0;
      slots.set(kind, slot + 1);
      if (land.register(kind, slot, `predator:${i}`, { x, z }, context.rng)) continue;
      const home = habitats.predator(kind, slot);
      const predator = createPredatorActor(kind, home?.x ?? x, home?.z ?? z, context.rng);
      predator.root.userData.remainsIdentity = `predator:${i}`;
      predator.useWorldBounds(config.size);
      predator.root.position.y = context.world.heightAt(predator.x, predator.z);
      if (home) predator.followTerritory(habitats.intent(home, context.save.clock));
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
    this.ecology = new WildlifeEcology(
      context.scene,
      context.world,
      context.rng,
      context.save,
      context.onDeath,
      {
        habitats,
        wolves,
        shelters,
        land,
        rabbits: this.rabbits,
      },
    );
    this.ecology.populate();
    land.restoreFamilies();
    this.wildlife = this.ecology.animals;
    this.hawks = Array.from({ length: config.creatures.hawk }, (_, index) => {
      const angle = index * 2.4;
      const x = (index === 0 ? 32 : Math.cos(angle) * 60) * scale;
      const z = (index === 0 ? -30 : Math.sin(angle) * 60) * scale;
      const hawk = AnimalFactory.raptor('hawk', x, z, context.rng);
      hawk.useWorldBounds(config.size);
      return hawk;
    });
    for (const hawk of this.hawks) context.scene.add(hawk.root, hawk.shadow);

    for (let index = 0; index < config.creatures.owl; index++) {
      const identity = `owl:${index}`;
      if (context.save.deadPopulation?.includes(identity)) continue;
      const angle = index * 2.4 + 1.5;
      const radius = (index < 2 ? 26 : 64) * scale;
      const rng = new Random(context.save.seed + 58121 + index * 613);
      const owl = AnimalFactory.raptor(
        'owl',
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        rng,
      );
      owl.useWorldBounds(config.size);
      owl.root.userData.remainsIdentity = identity;
      owl.updatePresence(isNightAt(context.save.clock), context.scene, (x, z) =>
        context.world.heightAt(x, z),
      );
      this.hawks.push(owl);
    }
    // Постоянные номера стартовых хищников не дают воскресить их при загрузке мира.
    for (const [prefix, actors] of [
      ['predator', this.predators],
      ['hawk', this.hawks],
    ] as const) {
      for (let index = actors.length - 1; index >= 0; index--) {
        const identity =
          actors[index].root.userData.remainsIdentity ??
          `${prefix}:${index + (prefix === 'predator' ? config.creatures.bear : 0)}`;
        actors[index].root.userData.remainsIdentity = identity;
        if (!context.save.deadPopulation?.includes(identity)) continue;
        const animal = actors[index];
        if (animal instanceof FlyingRaptor) animal.dispose();
        else {
          ModelAssets.shared.release(animal.root);
          animal.root.removeFromParent();
        }
        actors.splice(index, 1);
      }
    }
  }

  private predatorKind(index: number): LegacyPredatorSlot {
    if (index < 2) return 'dog';
    if (index === 2 || index === 6) return 'bear';
    if (index >= 3 && index <= 5) return 'snake';
    if (index % 7 === 0) return 'lynx';
    if (index % 5 === 0) return 'weasel';
    if (index % 4 === 0) return 'wolf';
    return 'fox';
  }
}
