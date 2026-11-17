import type { Scene } from 'three';
import { AnimalFactory, type Predator } from '../animals';
import { ModelAssets } from '../ModelAssets';
import { AnimalAppearance } from '../AnimalAppearance';
import type { Wolf } from '../animals/Wolf';
import type { AnimalHabitats, Habitat, HabitatPoint, TerritoryIntent } from '../AnimalHabitats';
import { Random } from '../Random';
import type { SaveData } from '../types';
import type { World } from '../World';
import { DEN_BED, type WolfDen } from '../WolfDen';
import type { WolfDens } from '../WolfDens';
import { WolfDenDefense } from '../WolfDenDefense';
import { traceGround } from '../GroundContact';
import {
  allocateMammal,
  MammalNursery,
  mammalIdentity,
  type MammalOrigin,
  type YoungMammal,
} from '../MammalNursery';

export type WolfState =
  | {
      state: 'alive';
      x: number;
      z: number;
      health: number;
      denDepth?: number;
      individual?: number;
      origin?: MammalOrigin;
    }
  | { state: 'vacant'; replaceAt: number };

interface WolfSlot {
  id: string;
  pack: WolfPack;
  index: number;
  restAt?: HabitatPoint;
  actor?: Wolf;
  replaceAt?: number;
}

interface WolfPack {
  home: Habitat;
  members: WolfSlot[];
  young: Map<YoungMammal, Wolf>;
  nursery: MammalNursery;
  caretaker?: Wolf;
  meeting?: HabitatPoint;
  shelter?: { den: WolfDen; defense: WolfDenDefense };
}

interface Context {
  save: SaveData;
  world: Pick<World, 'heightAt'> & Partial<Pick<World, 'waterAt'>>;
  scene: Scene;
  predators: Predator[];
  habitats: AnimalHabitats;
  dens: WolfDens;
  size: number;
  count: number;
  onArrival?: (wolf: Predator) => void;
  onBirth?: (wolf: Predator) => void;
  onDeparture?: (wolf: Predator) => void;
  onDiscovery?: () => void;
  onDenWarning?: () => void;
}

const PACK_SIZE = 4;
const REPLACEMENT_MINUTES = 1440;
const RECOLONIZATION_MINUTES = 3 * REPLACEMENT_MINUTES;
const RESPAWN_PLAYER_DISTANCE = 22;
const DEN_DISCOVERY_RADIUS = 12;
const DEN_LABEL = 'Волчье логово';
const WATCH_INTERVAL_SECONDS = 0.3;
const RIVAL_INTRUSION_RADIUS = 7;
const LITTER_HUNT_SHARE = 0.65;
const PATROL_STOPS = [
  [3.1, -2.3],
  [2.15, -5],
  [-2.1, -5],
  [-3.1, -2.3],
] as const;

/** Владеет местами волков в стаях, обнаружением логовищ и замещением погибших по календарю. */
export class WolfPopulation {
  private readonly slots: WolfSlot[] = [];
  private readonly byActor = new WeakMap<Predator, WolfSlot>();
  private readonly packs = new Map<number, WolfPack>();
  private readonly discovered = new Set<number>();
  private nextCheck = 0;
  private nextWatch = 0;
  private watching = false;

  constructor(private readonly context: Context) {}

  register(id: string, index: number): void {
    const packId = Math.floor(index / PACK_SIZE);
    const pack = this.packAt(packId);
    if (!pack) return;

    const member = index % PACK_SIZE;
    const packSize = Math.min(PACK_SIZE, this.context.count - packId * PACK_SIZE);
    const insideCount = Math.min(2, Math.max(1, packSize - 1));
    const den = pack.shelter?.den;
    const restAt =
      member < insideCount ? den?.entrance : den?.point(member === 2 ? 2.35 : -2.35, -1.45);
    const slot: WolfSlot = { id, index, pack, restAt };
    this.slots.push(slot);
    pack.members.push(slot);

    const state = this.context.save.wolves?.[id];
    if (state?.state === 'alive') this.place(slot, state);
    else if (state?.state === 'vacant') slot.replaceAt = state.replaceAt;
    else if (this.context.save.deadPopulation?.includes(id))
      slot.replaceAt = this.context.save.clock + REPLACEMENT_MINUTES;
    else this.place(slot);
  }

  restoreYoung(): void {
    for (const pack of this.packs.values())
      for (const young of pack.nursery.state.young) this.placeYoung(pack, young, false);
  }

  updateIntents(clock: number, prey?: (point: HabitatPoint) => number): void {
    for (const pack of this.packs.values()) this.updateNursery(pack, clock);
    const routes = new Map<Habitat, TerritoryIntent>();
    for (const slot of this.slots) {
      if (!slot.actor?.alive) continue;
      const { habitats } = this.context;
      const { home } = slot.pack;
      const intent = routes.get(home) ?? habitats.intent(home, clock, true, prey);
      routes.set(home, intent);
      this.follow(slot, intent, clock);
    }

    this.context.habitats.setWolfRoutes(
      [...this.packs.values()].flatMap(({ home, shelter }) => {
        const route = routes.get(home);
        if (!route) return [];
        return [{ ...route, home: shelter ? { ...home, ...shelter.den.entrance } : home }];
      }),
    );
  }

  prepareDefense(time: number, player: HabitatPoint | undefined, combat: boolean): void {
    if (!combat) {
      if (this.watching)
        for (const { shelter } of this.packs.values())
          shelter?.defense.update(time, undefined, undefined);
      this.watching = false;
      return;
    }
    if (this.watching && time < this.nextWatch) return;

    this.watching = true;
    this.nextWatch = time + WATCH_INTERVAL_SECONDS;
    const guards = new Map<WolfPack, Wolf>();
    for (const { actor, pack } of this.slots) {
      if (!actor?.alive || !pack.shelter?.defense.canRespond(actor)) continue;
      const current = guards.get(pack);
      if (!current || (current.inDen && !actor.inDen)) guards.set(pack, actor);
    }

    for (const pack of this.packs.values()) {
      const defense = pack.shelter?.defense;
      if (!defense) continue;

      const guard = guards.get(pack);
      const rival = guard ? this.rivalAt(pack, defense) : undefined;
      if (defense.update(time, guard ? player : undefined, rival) && guard) {
        guard.warnIntruder(time);
        this.context.onDenWarning?.();
      }
    }
  }

  private rivalAt(pack: WolfPack, defense: WolfDenDefense): Predator | undefined {
    const available = (actor: Predator) =>
      actor.alive &&
      !actor.inDen &&
      !actor.underground &&
      actor.homeTerritory !== pack.home &&
      (actor.kind === 'wolf' ||
        actor.kind === 'fox' ||
        actor.kind === 'dog' ||
        actor.kind === 'lynx') &&
      Math.abs(actor.root.position.y - this.context.world.heightAt(actor.x, actor.z)) < 1.5;

    const previous = defense.trackedRival;
    if (previous && available(previous)) return previous;
    return this.context.predators.find(
      (actor) => defense.near(actor, RIVAL_INTRUSION_RADIUS) && available(actor),
    );
  }

  onDeath(wolf: Predator, clock: number): void {
    const slot = this.byActor.get(wolf);
    if (!slot) {
      for (const pack of this.packs.values())
        for (const [young, actor] of pack.young)
          if (wolf === actor) {
            pack.young.delete(young);
            pack.nursery.remove(young);
            return;
          }
      return;
    }

    slot.actor = undefined;
    slot.replaceAt = clock + REPLACEMENT_MINUTES;
    this.byActor.delete(wolf);
    if (!slot.pack.members.some((member) => member.actor?.alive))
      for (const member of slot.pack.members) member.replaceAt = clock + RECOLONIZATION_MINUTES;
  }

  update(time: number, clock: number, player: HabitatPoint): void {
    if (time < this.nextCheck) return;
    this.nextCheck = time + 2;

    for (const { shelter } of this.packs.values()) {
      if (!shelter) continue;
      const { den } = shelter;
      const { x, z } = den.entrance;
      if (
        this.discovered.has(den.id) ||
        Math.hypot(player.x - x, player.z - z) > DEN_DISCOVERY_RADIUS
      )
        continue;
      this.discovered.add(den.id);
      const discoveries = (this.context.save.discoveries ??= []);
      if (
        !discoveries.some((place) => place.label === DEN_LABEL && place.x === x && place.z === z)
      ) {
        discoveries.push({ x, z, label: DEN_LABEL });
        this.context.onDiscovery?.();
      }
    }

    for (const slot of this.slots) {
      if (slot.replaceAt === undefined || clock < slot.replaceAt) continue;
      const { members, young } = slot.pack;
      const vacancies = members.filter((member) => !member.actor).length;
      if (vacancies <= young.size) continue;
      const site = slot.pack.shelter?.den.entrance ?? slot.pack.home;
      if (Math.hypot(player.x - site.x, player.z - site.z) < RESPAWN_PLAYER_DISTANCE) continue;
      const wolf = this.place(slot, undefined, allocateMammal(this.context.save));
      this.context.onArrival?.(wolf);
      // Даже если погибла вся стая, новая заселяет логово постепенно.
      break;
    }

    for (const pack of this.packs.values()) {
      for (const [young, actor] of pack.young) {
        if (!actor.alive || pack.nursery.stage(young, clock) !== 'adult') continue;
        if (Math.hypot(player.x - actor.x, player.z - actor.z) < RESPAWN_PLAYER_DISTANCE) continue;
        const site = pack.shelter?.den.entrance ?? pack.home;
        if (
          Math.hypot(actor.x - site.x, actor.z - site.z) < 15 &&
          clock - young.bornAt < 5 * REPLACEMENT_MINUTES
        )
          continue;
        pack.young.delete(young);
        pack.nursery.remove(young);
        this.context.predators.splice(this.context.predators.indexOf(actor), 1);
        this.context.onDeparture?.(actor);
        ModelAssets.shared.release(actor.root);
        actor.root.removeFromParent();
      }
    }
  }

  capture(): void {
    const states: Record<string, WolfState> = {};
    for (const { id, actor, replaceAt } of this.slots) {
      if (actor?.alive)
        states[id] = {
          state: 'alive',
          x: actor.x,
          z: actor.z,
          health: actor.health,
          denDepth: actor.inDen ? actor.denDepth : undefined,
          individual: this.individual(actor),
          origin: actor.mammalOrigin,
        };
      else
        states[id] = {
          state: 'vacant',
          replaceAt: replaceAt ?? this.context.save.clock + REPLACEMENT_MINUTES,
        };
    }
    this.context.save.wolves = states;
    for (const pack of this.packs.values()) {
      for (const [young, actor] of pack.young) {
        if (!actor.alive) continue;
        young.x = actor.x;
        young.z = actor.z;
        young.health = actor.health;
        young.denDepth = actor.inDen ? actor.denDepth : undefined;
      }
    }
  }

  private packAt(id: number): WolfPack | undefined {
    const existing = this.packs.get(id);
    if (existing) return existing;

    const home = this.context.habitats.predator('wolf', id);
    if (!home) return;

    const den = this.context.dens.place(id, home, home.key);
    const pack: WolfPack = {
      home,
      members: [],
      young: new Map(),
      nursery: new MammalNursery('wolf', this.context.save, `wolf:${id}`),
      meeting: den ? this.meetingPoint(den) : undefined,
      shelter: den ? { den, defense: new WolfDenDefense(den) } : undefined,
    };
    this.packs.set(id, pack);
    if (den) this.moveLegacyDiscovery(home, den);
    return pack;
  }

  private moveLegacyDiscovery(home: HabitatPoint, den: WolfDen): void {
    const marks = this.context.save.discoveries;
    if (!marks) return;

    const { x, z } = den.entrance;
    const old = marks.findIndex(
      (mark) => mark.label === DEN_LABEL && mark.x === home.x && mark.z === home.z,
    );
    if (old < 0 || (x === home.x && z === home.z)) return;

    if (marks.some((mark) => mark.label === DEN_LABEL && mark.x === x && mark.z === z))
      marks.splice(old, 1);
    else marks[old] = { x, z, label: DEN_LABEL };
  }

  private follow(slot: WolfSlot, intent: TerritoryIntent, clock: number): void {
    let destination =
      slot.restAt && intent.resting
        ? slot.restAt
        : this.context.habitats.nearHome(intent.destination, slot.index);
    const caretaker = slot.actor && slot.actor === slot.pack.caretaker;
    const den = slot.pack.shelter?.den;
    if (caretaker && den) {
      const [young] = slot.pack.nursery.state.young;
      const stage = young ? slot.pack.nursery.stage(young, clock) : 'nest';
      if (stage === 'nest') destination = den.entrance;
      else {
        const rally = stage === 'entrance' ? den.approach : (slot.pack.meeting ?? den.approach);
        const side = Math.floor(clock / 30) % 2 === 0 ? -1.8 : 1.8;
        destination = this.rallyPosition(den, rally, side);
      }
    }
    let huntRadius: number | undefined;
    if (!caretaker && slot.pack.caretaker && den && intent.hunting) {
      huntRadius = slot.pack.home.radius * LITTER_HUNT_SHARE;
      const dx = destination.x - den.entrance.x;
      const dz = destination.z - den.entrance.z;
      const fraction = Math.min(1, huntRadius / Math.max(1, Math.hypot(dx, dz)));
      destination = { x: den.entrance.x + dx * fraction, z: den.entrance.z + dz * fraction };
    }
    slot.actor?.stayWithLitter(caretaker ? destination : undefined, huntRadius);
    slot.actor?.followTerritory({ ...intent, destination, hunting: !caretaker && intent.hunting });
  }

  private place(
    slot: WolfSlot,
    state?: Extract<WolfState, { state: 'alive' }>,
    individual = state?.individual,
  ): Wolf {
    const { save, habitats } = this.context;
    const { home, shelter } = slot.pack;
    const den = shelter?.den;
    const spawn =
      den?.point(((slot.index % PACK_SIZE) - 1.5) * 1.05, -2.75) ??
      habitats.nearHome(home, slot.index);
    const point =
      state && (!den || state.denDepth || den.penetration(state.x, state.z) <= 0) ? state : spawn;
    const wolf = this.createWolf(
      point,
      home.key ^ (individual ?? slot.index),
      individual === undefined ? slot.id : mammalIdentity(individual),
    );
    if (state) {
      wolf.health = Math.min(state.health, wolf.maxHealth);
      wolf.mammalOrigin = state.origin;
    }
    slot.actor = wolf;
    slot.replaceAt = undefined;
    this.byActor.set(wolf, slot);
    this.follow(slot, habitats.intent(home, save.clock, true), save.clock);
    if (shelter) {
      this.assignShelter(
        wolf,
        slot.index % PACK_SIZE,
        slot.restAt === shelter.den.entrance,
        shelter,
      );
      if (state?.denDepth) wolf.restoreDen(state.denDepth);
    }
    return wolf;
  }

  private createWolf(point: HabitatPoint, seed: number, identity: string): Wolf {
    const { world, predators, scene, size } = this.context;
    const appearance = identity.startsWith('mammal:')
      ? AnimalAppearance.seeded('wolf', seed, Number(identity.slice('mammal:'.length)))
      : undefined;
    const wolf = AnimalFactory.wolf(point.x, point.z, new Random(seed), appearance);
    wolf.useWorldBounds(size);
    wolf.moveTo(point.x, point.z, world.heightAt(point.x, point.z));
    wolf.root.userData.remainsIdentity = identity;
    predators.push(wolf);
    scene.add(wolf.root);
    return wolf;
  }

  private individual(wolf: Wolf): number | undefined {
    const id = this.identity(wolf);
    if (id.startsWith('mammal:')) return Number(id.slice('mammal:'.length));
  }

  private identity(wolf: Wolf): string {
    return String(wolf.root.userData.remainsIdentity);
  }

  private meetingPoint(den: WolfDen): HabitatPoint {
    const { world, dens, size } = this.context;
    for (const [side, depth] of [
      [0, -10],
      [4, -8],
      [-4, -8],
      [0, -6],
    ]) {
      const point = den.point(side, depth);
      const reached = traceGround(den.approach, point.x, point.z, {
        heightAt: (x, z) => {
          const y = world.heightAt(x, z);
          if (
            Math.max(Math.abs(x), Math.abs(z)) > (size * 97) / 110 ||
            (world.waterAt?.(x, z)?.depth ?? 0) > 0.15 ||
            !dens.canMove(den.approach, x, z, y, 0.1)
          )
            return;
          return y;
        },
      });
      if (Math.hypot(reached.x - point.x, reached.z - point.z) < 0.01) return point;
    }
    return den.approach;
  }

  private rallyPosition(den: WolfDen, rally: HabitatPoint, side: number): HabitatPoint {
    const offset = den.point(side, 0);
    const x = rally.x + offset.x - den.entrance.x;
    const z = rally.z + offset.z - den.entrance.z;
    const { world } = this.context;
    if ((world.waterAt?.(x, z)?.depth ?? 0) > 0.15) return rally;
    if (Math.abs(world.heightAt(x, z) - world.heightAt(rally.x, rally.z)) > 0.45) return rally;
    return { x, z };
  }

  private placeYoung(pack: WolfPack, young: YoungMammal, born: boolean): void {
    if (!pack.shelter) return;

    const wolf = this.createWolf(young, pack.home.key ^ young.id, mammalIdentity(young.id));
    wolf.health = young.health;
    wolf.mammalOrigin = pack.nursery.origin(young);
    this.assignShelter(wolf, young.id % 2, true, pack.shelter);
    const depth = born ? DEN_BED : young.denDepth;
    if (depth) wolf.restoreDen(depth);
    pack.young.set(young, wolf);
    pack.nursery.restoreGrowth(young, wolf, this.context.save.clock);
    this.followYoung(pack, young, wolf, this.context.save.clock);
    if (born) this.context.onBirth?.(wolf);
  }

  private updateNursery(pack: WolfPack, clock: number): void {
    const { shelter, nursery } = pack;
    if (!shelter) return;

    const adults = pack.members.flatMap(({ actor }) => (actor?.alive ? [actor] : []));
    const eligible = adults.filter((adult) => adult.health >= adult.maxHealth * 0.5);
    const sex = (adult: Wolf) => (this.individual(adult) ?? this.byActor.get(adult)!.index) % 2;
    const mother = eligible.find((adult) => sex(adult) === 0);
    const father = eligible.find((adult) => sex(adult) === 1);
    const motherId = nursery.state.parents?.[0];
    const parent = adults.find((adult) => this.identity(adult) === motherId);
    nursery.advance(
      clock,
      mother && father ? [this.identity(mother), this.identity(father)] : undefined,
      !motherId || !!parent,
      shelter.den.entrance,
      ((parent ?? mother)?.maxHealth ?? 0) * 0.45,
    );
    for (const young of nursery.state.young)
      if (!pack.young.has(young)) this.placeYoung(pack, young, true);

    pack.caretaker = nursery.preparingNest(clock) ? parent : undefined;
    for (const [young, actor] of pack.young) {
      if (!actor.alive) continue;
      const stage = nursery.stage(young, clock);
      const caretaker = parent ?? adults[0];
      if (stage !== 'adult') pack.caretaker = caretaker;
      const attended =
        !!caretaker &&
        (actor.inDen
          ? caretaker.inDen
          : Math.hypot(actor.x - caretaker.x, actor.z - caretaker.z) < 4);
      nursery.grow(young, actor, clock, attended);

      const vacancy = stage === 'adult' ? pack.members.find((slot) => !slot.actor) : undefined;
      if (vacancy) {
        nursery.remove(young);
        pack.young.delete(young);
        vacancy.actor = actor;
        vacancy.replaceAt = undefined;
        this.byActor.set(actor, vacancy);
        this.assignShelter(
          actor,
          vacancy.index % PACK_SIZE,
          vacancy.restAt === shelter.den.entrance,
          shelter,
        );
      } else this.followYoung(pack, young, actor, clock);
    }
  }

  private followYoung(pack: WolfPack, young: YoungMammal, actor: Wolf, clock: number): void {
    const den = pack.shelter?.den;
    if (!den) return;

    const stage = pack.nursery.stage(young, clock);
    const offset = young.id % 2 === 0 ? -1 : 1;
    let destination: HabitatPoint = den.entrance;
    if (stage === 'entrance') destination = den.point(offset, -3.6);
    if (stage === 'meeting')
      destination = this.rallyPosition(den, pack.meeting ?? den.approach, offset * 0.9);
    if (stage === 'adult') destination = den.point(offset * 9, -21);
    actor.stayWithLitter(destination);
    actor.followTerritory({
      home: pack.home,
      destination,
      resting: stage === 'nest',
      hunting: false,
    });
  }

  private assignShelter(
    wolf: Wolf,
    member: number,
    restInside: boolean,
    shelter: NonNullable<WolfPack['shelter']>,
  ): void {
    const { den, defense } = shelter;
    const { world, dens } = this.context;
    const heightAt = (x: number, z: number) => {
      const y = world.heightAt(x, z);
      if (!dens.canMove(wolf, x, z, y, 0.1)) return;
      if ((world.waterAt?.(x, z)?.depth ?? 0) > 0.15) return;
      return y;
    };
    const patrol = restInside
      ? []
      : PATROL_STOPS.map(([side, depth]) => den.point(side, depth)).filter((point) => {
          const reached = traceGround(den.approach, point.x, point.z, { heightAt });
          return Math.hypot(reached.x - point.x, reached.z - point.z) < 0.01;
        });
    wolf.useDen({ den, member, restInside, heightAt, defense, patrol });
  }
}
