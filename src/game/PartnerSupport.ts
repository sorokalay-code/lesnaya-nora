import { RabbitActor, type GroundHeight } from './animals';
import { AnimalRestraint } from './animals/AnimalRestraint';
import { isColdNightFood, type ColdNightPlan } from './ColdNightPlan';
import { Excavation } from './Excavation';
import { GroundItems, type GroundPickup } from './GroundItems';
import { animateRabbit, setRabbitAction } from './Models';
import { FUR_COOLDOWN_SECONDS } from './NestBedding';
import type { PartnerCare } from './PartnerCare';
import { Random } from './Random';
import { RABBIT_BODY } from './RabbitBody';
import { FOOD, type ColdNightGoal, type DigNode, type SaveData, type StashData } from './types';
import { World, type Resource } from './World';

type ForageTarget = { type: 'food'; resource: Resource } | { type: 'branch'; item: GroundPickup };
export type PartnerEvent = { kind: 'gathered' | 'delivered'; text: string };
const PANTRY_APPROACH_SECONDS = 0.5;

/** Автомат состояний партнёра: поиск припасов, доставка в тайник и семейные команды. */

export class PartnerSupport {
  private target?: ForageTarget;
  private nextSearch = 0;
  private nextFur = 0;
  private domesticUntil = 0;
  private outingTask?: { goal: ColdNightGoal; stash: StashData };
  private pantryApproach?: { pantry: StashData; destination: DigNode; until: number };

  constructor(
    private readonly save: SaveData,
    private readonly world: World,
    private readonly earth: Excavation,
    private readonly items: GroundItems,
    private readonly rng: Random,
    private readonly homeLife?: PartnerCare,
    private readonly coldNight?: ColdNightPlan,
  ) {}

  familyStash(): StashData | undefined {
    // Домом служит только готовый склад в укрытом ходе; расстояние считаем от игрока.
    const player = this.save.player;
    let nearest: StashData | undefined;
    let distance = Infinity;
    for (const stash of this.save.stashes) {
      if (!this.earth.isSheltered(stash.x, stash.y, stash.z)) continue;
      const current = Math.hypot(stash.x - player.x, stash.y - player.y, stash.z - player.z);
      if (current < distance) {
        nearest = stash;
        distance = current;
      }
    }
    return nearest;
  }

  update(
    actor: RabbitActor,
    dt: number,
    time: number,
    groundAt: GroundHeight,
  ): PartnerEvent | undefined {
    if (AnimalRestraint.active(actor.root)) return;
    if (Number(actor.root.userData.careUntil ?? 0) > time) {
      animateRabbit(actor.rig, time + actor.data.id, false, false, dt);
      return;
    }
    if (actor.rig.root.userData.conversing === true) {
      actor.navigateMate(dt, time, this.save.player, this.earth, groundAt);
      return;
    }
    const order = this.coldNight?.orderFor(actor.data.id, time);
    if (this.outingTask?.goal !== order?.goal || this.outingTask?.stash !== order?.stash) {
      this.outingTask = order;
      this.target = undefined;
      this.nextSearch = 0;
      this.pantryApproach = undefined;
    }

    const stash = order?.stash ?? this.familyStash();
    const home = stash ?? this.save.player;
    let command = this.save.mateCommand ?? 'forage';
    if (!stash) {
      this.target = undefined;
      if (command !== 'stay') {
        command = 'follow';
        this.save.mateCommand = 'follow';
      }
    }
    const cargo = (this.save.partnerCargo ??= { grass: 0, twigs: 0, fur: 0 });
    const unloaded = !cargo.food && !cargo.grass && !cargo.twigs && !cargo.fur;
    if (
      !order &&
      this.homeLife?.update(
        actor,
        home,
        dt,
        time,
        groundAt,
        command === 'home' ||
          (command === 'forage' &&
            unloaded &&
            (time < this.domesticUntil || this.homeLife.hasHouseWork(actor.data.id))),
      )
    )
      return;
    if (command === 'follow') {
      actor.navigateMate(
        dt,
        time,
        this.save.player,
        this.earth,
        groundAt,
        5.8,
        RABBIT_BODY.followDistance * Math.max(this.save.player.genes.size, actor.data.genes.size),
      );
      return;
    }

    if (command === 'stay') {
      actor.navigateMate(dt, time, this.save.mateStay ?? home, this.earth, groundAt, 2.2);
      return;
    }

    if (command === 'home') {
      actor.navigateMate(dt, time, home, this.earth, groundAt);
      return;
    }

    if (!stash) return;

    if (!unloaded) {
      const destination = order
        ? this.outingPantryDestination(actor, stash, groundAt, time)
        : stash;
      actor.navigateMate(dt, time, destination, this.earth, groundAt);
      if (!this.atPantry(actor, stash, groundAt, !!order)) return;

      const delivered: string[] = [];
      if (cargo.food) {
        stash.food[cargo.food] = (stash.food[cargo.food] ?? 0) + 1;
        delivered.push(FOOD[cargo.food].label.toLowerCase());
      }

      stash.materials ??= { grass: 0, twigs: 0, fur: 0 };
      for (const kind of ['grass', 'twigs', 'fur'] as const)
        if (cargo[kind]) {
          stash.materials[kind] += cargo[kind];
          delivered.push(
            `${cargo[kind]} ${kind === 'twigs' ? 'веток' : kind === 'fur' ? 'пуха' : 'травы'}`,
          );
        }

      this.save.partnerCargo = { grass: 0, twigs: 0, fur: 0 };
      this.domesticUntil = time + this.rng.range(12, 20);
      return {
        kind: 'delivered',
        text: `${actor.data.name}: в тайнике теперь есть ${delivered.join(' и ')}.`,
      };
    }

    if (order?.ready) {
      this.coldNight?.dismissHelper();
      return;
    }

    if (order?.goal === 'fur') {
      const destination = this.outingPantryDestination(actor, stash, groundAt, time);
      actor.navigateMate(dt, time, destination, this.earth, groundAt);
      if (time >= this.nextFur && this.atPantry(actor, stash, groundAt, true)) {
        this.nextFur = time + FUR_COOLDOWN_SECONDS;
        cargo.fur = 1;
        setRabbitAction(actor.rig, 'pluck', time + actor.data.id, 1.5);
      }

      return;
    }

    if (this.target?.type === 'food' && !this.target.resource.available) this.target = undefined;

    if (
      this.target?.type === 'branch' &&
      !this.items.availableBranches(this.target.item.x, this.target.item.z, 0.2).length
    )
      this.target = undefined;

    if (!this.target && time >= this.nextSearch) {
      this.nextSearch = time + this.rng.range(4, 8);
      const food = this.world.resources.filter(
        (r) =>
          r.available &&
          (order
            ? isColdNightFood(r.kind)
            : ['clover', 'carrot', 'cabbage', 'berries', 'acorn'].includes(r.kind)) &&
          Math.hypot(r.x - home.x, r.z - home.z) < 60,
      );
      const branches = order ? [] : this.items.availableBranches(home.x, home.z, 55);
      if (branches.length && (this.rng.chance(0.45) || !food.length)) {
        const item = branches.sort(
          (a, b) =>
            Math.hypot(a.x - actor.data.x, a.z - actor.data.z) -
            Math.hypot(b.x - actor.data.x, b.z - actor.data.z),
        )[0];
        this.target = { type: 'branch', item };
      } else if (food.length) {
        const resource = food.sort(
          (a, b) =>
            Math.hypot(a.x - actor.data.x, a.z - actor.data.z) -
            Math.hypot(b.x - actor.data.x, b.z - actor.data.z),
        )[0];
        this.target = { type: 'food', resource };
      }
    }

    if (!this.target) {
      if (order) {
        actor.navigateMate(
          dt,
          time,
          this.outingPantryDestination(actor, stash, groundAt, time),
          this.earth,
          groundAt,
        );
        return;
      }
      const handled = this.homeLife?.update(actor, home, dt, time, groundAt, true);
      if (this.homeLife?.busy) return;
      if (!handled) actor.navigateMate(dt, time, home, this.earth, groundAt);
      if (time >= this.nextFur && Math.hypot(actor.data.x - home.x, actor.data.z - home.z) < 3) {
        this.nextFur = time + 65;
        cargo.fur = 1;
        setRabbitAction(actor.rig, 'pluck', time + actor.data.id, 1.5);
      }

      return;
    }

    const position = this.target.type === 'food' ? this.target.resource : this.target.item;
    const destination = { x: position.x, y: groundAt(position.x, position.z), z: position.z };
    actor.navigateMate(dt, time, destination, this.earth, groundAt);
    if (
      Math.hypot(actor.data.x - position.x, actor.data.z - position.z) > 1.15 ||
      this.earth.isSheltered(actor.data.x, actor.rig.root.userData.baseY as number, actor.data.z)
    )
      return;

    if (this.target.type === 'food') {
      const resource = this.target.resource;
      if (!resource.available) {
        this.target = undefined;
        return;
      }

      this.world.harvest(resource, this.save.clock, actor.root);
      cargo.food = resource.kind;
      if (resource.kind === 'clover') cargo.grass = 1;

      setRabbitAction(actor.rig, 'eat', time + actor.data.id, 1.2);
    } else {
      if (!this.items.takeBranch(this.target.item.id, this.save.clock)) {
        this.target = undefined;
        return;
      }

      cargo.twigs = 1;
    }

    if (!order && time >= this.nextFur) {
      cargo.fur = 1;
      this.nextFur = time + this.rng.range(65, 105);
    }

    this.target = undefined;
    return { kind: 'gathered', text: `${actor.data.name} несёт припасы домой.` };
  }

  private outingPantryDestination(
    actor: RabbitActor,
    stash: StashData,
    groundAt: GroundHeight,
    time: number,
  ): DigNode {
    if (this.pantryApproach?.pantry === stash && time < this.pantryApproach.until)
      return this.pantryApproach.destination;

    const { x, z } = actor.data;
    const y = (actor.rig.root.userData.baseY as number | undefined) ?? groundAt(x, z);
    let destination: DigNode = stash;
    if (
      this.earth.isSheltered(x, y, z) &&
      this.earth.burrowAt({ x, y, z })?.network !== this.earth.burrowAt(stash)?.network
    ) {
      // Между отдельными норами путь проходит через поверхность.
      destination = { x: stash.x, y: groundAt(stash.x, stash.z), z: stash.z };
    }

    this.pantryApproach = { pantry: stash, destination, until: time + PANTRY_APPROACH_SECONDS };
    return destination;
  }

  private atPantry(
    actor: RabbitActor,
    stash: StashData,
    groundAt: GroundHeight,
    connected: boolean,
  ): boolean {
    const { x, z } = actor.data;
    const y = (actor.rig.root.userData.baseY as number | undefined) ?? groundAt(x, z);
    if (Math.hypot(x - stash.x, y - stash.y, z - stash.z) > 1.5) return false;
    if (!connected) return true;

    return (
      this.earth.isSheltered(x, y, z) &&
      this.earth.burrowAt({ x, y, z })?.network === this.earth.burrowAt(stash)?.network
    );
  }
}
