import { RabbitActor, type GroundHeight } from './animals';
import { Excavation } from './Excavation';
import { GroundItems, type GroundPickup } from './GroundItems';
import { setRabbitAction } from './Models';
import { Random } from './Random';
import { RABBIT_BODY } from './RabbitBody';
import { FOOD, type SaveData, type StashData } from './types';
import { World, type Resource } from './World';

type ForageTarget = { type: 'food'; resource: Resource } | { type: 'branch'; item: GroundPickup };
export type PartnerEvent = { kind: 'gathered' | 'delivered'; text: string };

/** Автомат состояний партнёра: поиск припасов, доставка в тайник и семейные команды. */

export class PartnerSupport {
  private target?: ForageTarget;
  private nextSearch = 0;
  private nextFur = 0;

  constructor(
    private readonly save: SaveData,
    private readonly world: World,
    private readonly earth: Excavation,
    private readonly items: GroundItems,
    private readonly rng: Random,
  ) {}

  familyStash(): StashData | undefined {
    // Домом служит только готовый склад в укрытом ходе; расстояние считаем от крольчихи.
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
    if (actor.rig.root.userData.conversing === true) {
      actor.navigateMate(dt, time, this.save.player, this.earth, groundAt);
      return;
    }
    const stash = this.familyStash();
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

    if (cargo.food || cargo.grass || cargo.twigs || cargo.fur) {
      actor.navigateMate(dt, time, stash, this.earth, groundAt);
      if (
        Math.hypot(
          actor.data.x - stash.x,
          ((actor.rig.root.userData.baseY as number) ?? 0) - stash.y,
          actor.data.z - stash.z,
        ) > 1.5
      )
        return;

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
      return { kind: 'delivered', text: `Партнёр принёс в тайник ${delivered.join(' и ')}.` };
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
          ['clover', 'carrot', 'cabbage', 'berries', 'acorn'].includes(r.kind) &&
          Math.hypot(r.x - home.x, r.z - home.z) < 60,
      );
      const branches = this.items.availableBranches(home.x, home.z, 55);
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
      actor.navigateMate(dt, time, home, this.earth, groundAt);
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

      this.world.harvest(resource, this.save.clock);
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

    if (time >= this.nextFur) {
      cargo.fur = 1;
      this.nextFur = time + this.rng.range(65, 105);
    }

    this.target = undefined;
    return { kind: 'gathered', text: 'Партнёр нашёл припасы и несёт их домой.' };
  }
}
