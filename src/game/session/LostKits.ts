import { AnimalFactory, type FamilyMember, type Predator, type RabbitActor } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import type { Excavation } from '../Excavation';
import { ModelAssets } from '../ModelAssets';
import { Random } from '../Random';
import { rabbitSex } from '../RabbitSex';
import type { DigNode, KitData, SaveData } from '../types';
import type { World } from '../World';
import { RabbitFamily } from './RabbitFamily';

const SEPARATION_DISTANCE = 15;
const RESCUE_DISTANCE = 2.8;
const HUNGER_PER_MINUTE = 0.16;
const STARVATION_PER_MINUTE = 0.25;

interface Context {
  save: SaveData;
  rabbits: RabbitActor[];
  families: FamilyMember[];
  predators: readonly Predator[];
  world: Pick<World, 'size' | 'scene' | 'heightAt' | 'waterAt'>;
  earth: Excavation;
  addKit: (kit: KitData) => void;
}

interface Run {
  target: DigNode;
  changeAt: number;
}

/** Следит за потерявшимися крольчатами и переводит спасённого малыша в семью игрока. */
export class LostKits {
  readonly prey: RabbitActor[] = [];
  private readonly rng: Random;
  private readonly routes = new WeakMap<RabbitActor, Run>();
  private nextScan = 0;

  constructor(private readonly context: Context) {
    this.rng = new Random(context.save.seed + 67313);
    this.prey.push(...context.rabbits.filter((actor) => actor.alive && actor.data.lost));
  }

  update(time: number): void {
    if (time < this.nextScan) return;
    this.nextScan = time + 0.8;
    const { rabbits, families, save, earth } = this.context;
    const parents = new Map(rabbits.map((actor) => [actor.data.id, actor]));
    for (let index = families.length - 1; index >= 0; index--) {
      const member = families[index];
      if (!this.separated(member, parents)) continue;

      const { x, y, z } = member.root.position;
      member.data.health = member.health;
      const actor = AnimalFactory.rabbit(member.data, this.rng);
      actor.useWorldBounds(this.context.world.size);
      actor.moveTo(x, z, y);
      this.context.world.scene.add(actor.root);
      rabbits.push(actor);
      save.partners.push(actor.data);
      // Начальные семьи пересоздаются из сида при загрузке. Убираем старое место малыша.
      (save.familyHealth ??= {})[member.data.id] = 0;
      families.splice(index, 1);
      this.removeModel(member);
      this.mark(actor);
    }

    for (const actor of rabbits) {
      if (actor.alive && !actor.data.lost && this.separated(actor, parents)) this.mark(actor);
    }

    for (let index = this.prey.length - 1; index >= 0; index--) {
      const actor = this.prey[index];
      const state = actor.data.lost;
      if (!actor.alive || !state) {
        this.prey.splice(index, 1);
        continue;
      }
      const elapsed = Math.max(0, save.clock - state.lastClock);
      const starving = Math.max(0, elapsed - state.hunger / HUNGER_PER_MINUTE);
      state.lastClock = save.clock;
      state.hunger = Math.max(0, state.hunger - elapsed * HUNGER_PER_MINUTE);
      actor.health = Math.max(0, actor.health - starving * STARVATION_PER_MINUTE);
      actor.data.health = actor.health;
      actor.root.userData.lostKitExposed = !earth.isSheltered(
        actor.x,
        actor.root.position.y,
        actor.z,
      );
    }
  }

  move(actor: RabbitActor, dt: number, time: number): void {
    const { earth, world } = this.context;
    let route = this.routes.get(actor);
    if (!route || time >= route.changeAt) {
      route = { target: this.runTarget(actor), changeAt: time + this.rng.range(1, 2.5) };
      this.routes.set(actor, route);
    }
    actor.navigateMate(dt, time, route.target, earth, (x, z) => world.heightAt(x, z), 2.9, 0.25);
  }

  nearby(): RabbitActor | undefined {
    const { save, earth } = this.context;
    const p = save.player;
    const sheltered = earth.isSheltered(p.x, p.y, p.z);
    let nearest: RabbitActor | undefined;
    let best = RESCUE_DISTANCE;
    for (const actor of this.prey) {
      const y = actor.root.position.y;
      const distance = Math.hypot(actor.x - p.x, y - p.y, actor.z - p.z);
      if (
        !actor.alive ||
        !actor.data.lost ||
        distance > best ||
        Math.abs(y - p.y) > 1.2 ||
        AnimalRestraint.active(actor.root) ||
        earth.isSheltered(actor.x, y, actor.z) !== sheltered
      )
        continue;
      if (sheltered) {
        const from = earth.burrowAt(p);
        const to = earth.burrowAt({ x: actor.x, y, z: actor.z });
        if (
          !from ||
          !to ||
          from.network !== to.network ||
          from.network.distanceBetween(from, to) > RESCUE_DISTANCE
        )
          continue;
      }
      nearest = actor;
      best = distance;
    }
    return nearest;
  }

  adopt(): KitData | undefined {
    const actor = this.nearby();
    if (!actor) return;

    const { save, rabbits } = this.context;
    const { x, z } = actor;
    const y = actor.data.y ?? actor.root.position.y;
    const { data } = actor;
    const state = data.lost;
    if (!state) return;
    const father = data.lineage?.ancestors.filter((ancestor) => ancestor.distance === 1)[1]?.name;
    const kit: KitData = {
      id: RabbitFamily.nextId(save),
      name: data.name,
      sex: rabbitSex(data),
      genes: data.genes,
      lineage: data.lineage,
      father: father ?? 'Неизвестен',
      age: data.age ?? 1,
      hunger: state.hunger,
      health: actor.health,
      alive: true,
      adopted: true,
      command: 'follow',
      homeX: x,
      homeY: y,
      homeZ: z,
      x,
      y,
      z,
    };
    this.context.addKit(kit);
    save.kits.push(kit);
    delete data.lost;
    rabbits.splice(rabbits.indexOf(actor), 1);
    this.prey.splice(this.prey.indexOf(actor), 1);
    const savedIndex = save.partners.indexOf(data);
    if (savedIndex >= 0) save.partners.splice(savedIndex, 1);
    this.removeModel(actor);
    return kit;
  }

  private separated(
    actor: FamilyMember | RabbitActor,
    parents: ReadonlyMap<number, RabbitActor>,
  ): boolean {
    const { age, wildParentId } = actor.data;
    if (
      !actor.alive ||
      age === undefined ||
      age < 0.8 ||
      age >= 3 ||
      wildParentId === undefined ||
      actor.data.id === this.context.save.mateId ||
      AnimalRestraint.active(actor.root) ||
      actor.root.userData.conversing ||
      this.context.earth.isSheltered(actor.x, actor.root.position.y, actor.z)
    )
      return false;
    const parent = parents.get(wildParentId);
    return (
      !parent?.alive || Math.hypot(parent.x - actor.x, parent.z - actor.z) > SEPARATION_DISTANCE
    );
  }

  private mark(actor: RabbitActor): void {
    const clock = this.context.save.clock;
    actor.data.lost = { since: clock, lastClock: clock, hunger: 48 };
    this.prey.push(actor);
  }

  private removeModel(actor: FamilyMember | RabbitActor): void {
    ModelAssets.shared.release(actor.root);
    actor.root.removeFromParent();
  }

  private runTarget(actor: RabbitActor): DigNode {
    const { predators, world } = this.context;
    const threat = predators.find(
      (predator) =>
        predator.alive &&
        !predator.underground &&
        Math.hypot(predator.x - actor.x, predator.z - actor.z) < 10,
    );
    const heading = threat
      ? Math.atan2(actor.z - threat.z, actor.x - threat.x)
      : this.rng.range(0, Math.PI * 2);
    const limit = (world.size * 90) / 110;
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = heading + (attempt === 0 ? 0 : this.rng.range(-Math.PI, Math.PI));
      const distance = this.rng.range(2.5, 5);
      const x = Math.max(-limit, Math.min(limit, actor.x + Math.cos(angle) * distance));
      const z = Math.max(-limit, Math.min(limit, actor.z + Math.sin(angle) * distance));
      if (!world.waterAt?.(x, z)) return { x, y: world.heightAt(x, z), z };
    }
    return { x: actor.x, y: actor.root.position.y, z: actor.z };
  }
}
