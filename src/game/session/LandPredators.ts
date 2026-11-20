import type { Scene } from 'three';
import { AnimalFactory, type ForestAnimal, type Predator } from '../animals';
import type { AnimalHabitats, Habitat, HabitatPoint } from '../AnimalHabitats';
import { AnimalAppearance } from '../AnimalAppearance';
import { LandMammalFamilies } from '../LandMammalFamilies';
import {
  allocateMammal,
  isPredatorFamilyKind,
  mammalIdentity,
  PREDATOR_FAMILIES,
  type MammalOrigin,
  type PredatorFamilyKind,
  type YoungMammal,
} from '../MammalNursery';
import { ModelAssets } from '../ModelAssets';
import { afterImmigration, awayFromPlayer, immigrationReady } from '../TerritoryImmigration';
import { Random } from '../Random';
import type { PredatorKind, SaveData } from '../types';
import type { World } from '../World';
import type { WildlifeShelter, WildlifeShelters } from '../WildlifeShelters';
import { WildlifeRoutine } from '../WildlifeRoutine';
import { defaultWorldConfig } from '../WorldConfig';

export interface LandPredatorState extends HabitatPoint {
  id: string;
  kind: PredatorFamilyKind | 'snake' | 'dog';
  slot: number;
  health: number;
  inside?: true;
  mouseBurrow?: number;
  mammalId?: number;
  origin?: MammalOrigin;
}

interface Context {
  save: SaveData;
  predators: Predator[];
  scene: Scene;
  world: Pick<World, 'heightAt'> & Partial<Pick<World, 'waterAt'>>;
  habitats: AnimalHabitats;
  shelters: WildlifeShelters;
  onArrival?: (predator: Predator) => void;
  onDeparture?: (predator: Predator) => void;
}

const IMMIGRATION_PLAYER_DISTANCE = 24;
const WEASEL_BURROW_RANGE = 12;

function isLandPredator(kind: string): kind is LandPredatorState['kind'] {
  return kind === 'snake' || kind === 'dog' || isPredatorFamilyKind(kind);
}

/** Ведёт участки, укрытия, выводки и сохранение наземных хищников вне волчьих стай. */
export class LandPredators {
  private readonly families: LandMammalFamilies<Predator, PredatorFamilyKind>;
  private readonly config;
  private readonly savedSlots = new Map<string, LandPredatorState>();
  private nextImmigration = 0;

  constructor(private readonly context: Context) {
    const { save, predators, habitats, shelters } = context;
    this.config = save.worldConfig ?? defaultWorldConfig();
    for (const state of save.landPredators ?? [])
      this.savedSlots.set(this.slotKey(state.kind, state.slot), state);
    this.families = new LandMammalFamilies({
      save,
      animals: predators,
      kinds: PREDATOR_FAMILIES,
      shelters,
      count: (kind) => this.config.creatures[kind],
      home: (kind, slot) => habitats.predator(kind, slot),
      resting: (home, clock) => habitats.intent(home, clock).resting,
      create: (kind, young, home) => this.placeYoung(kind, young, home),
      settle: (actor, kind, slot) => this.settle(actor, kind, slot),
      depart: (actor) => this.depart(actor),
    });
  }

  register(
    kind: PredatorKind,
    slot: number,
    id: string,
    fallback: HabitatPoint,
    rng: Random,
  ): boolean {
    if (!isLandPredator(kind)) return false;
    const state = this.savedSlots.get(this.slotKey(kind, slot));
    if (kind === 'dog' && this.context.save.landPredators && !state) return true;
    if (!state && this.context.save.deadPopulation?.includes(id)) return true;

    const home = this.context.habitats.predator(kind, slot);
    const shelter =
      home && kind !== 'dog' ? this.context.shelters.place(kind, slot, home) : undefined;
    const patrol =
      home && kind === 'dog'
        ? this.context.habitats.dogPatrol(home, slot, this.context.save.clock).destination
        : undefined;
    const point = state ?? shelter?.approach ?? patrol ?? home ?? fallback;
    const actor = this.create(kind, point, rng, state?.id ?? id, state?.mammalId, home);
    if (state) {
      actor.health = Math.min(state.health, actor.maxHealth);
      actor.mammalOrigin = state.origin;
    }
    const borrowed =
      state?.mouseBurrow === undefined
        ? undefined
        : this.context.shelters.get('mouse', state.mouseBurrow);
    this.settle(actor, kind, slot, !!state?.inside && !borrowed);
    if (borrowed)
      actor.useRoutine(
        new WildlifeRoutine(borrowed, this.context.shelters.routeHeight),
        !!state?.inside,
      );
    return true;
  }

  restoreFamilies(): void {
    this.families.restore();
  }

  recruitSnake(slot: number, identity: string, at: HabitatPoint, rng: Random): void {
    const home = this.context.habitats.predator('snake', slot);
    const actor = this.create('snake', at, rng, identity, undefined, home);
    this.settle(actor, 'snake', slot);
    this.context.onArrival?.(actor);
  }

  prepare(
    clock: number,
    winter: boolean,
    player: HabitatPoint,
    preyScore: (kind: PredatorKind, point: HabitatPoint) => number,
    wildlife: readonly ForestAnimal[],
  ): void {
    const { habitats } = this.context;
    for (const actor of this.context.predators) {
      const home = actor.homeTerritory;
      if (!isLandPredator(actor.kind) || !home || this.families.owns(actor)) continue;

      const intent =
        actor.kind === 'dog' && actor.habitatSlot !== undefined
          ? habitats.dogPatrol(home, actor.habitatSlot, clock)
          : habitats.predatorIntent(actor.kind, home, clock, (point) =>
              preyScore(actor.kind, point),
            );
      const winterRest = actor.kind === 'snake' && winter;
      const resting = winterRest || intent.resting;
      const denRest = actor.kind === 'fox' || actor.kind === 'weasel' || actor.kind === 'snake';
      actor.restAt =
        resting && denRest ? (actor.shelter?.entrance ?? intent.destination) : undefined;
      actor.foragingAllowed = !resting;
      actor.followTerritory({ ...intent, resting, hunting: !resting });
    }
    this.families.update(clock, player, winter);
    this.borrowMouseBurrows(wildlife);
  }

  onDeath(actor: Predator, clock: number): void {
    this.families.onDeath(actor, clock);
  }

  update(clock: number, player: HabitatPoint): void {
    if (clock < this.nextImmigration) return;
    this.nextImmigration = clock + 30;
    this.immigrateDog(player);
    for (const kind of PREDATOR_FAMILIES) {
      if (!this.families.canImmigrate(kind, clock)) continue;

      const living = this.context.predators.filter(
        (actor) => actor.kind === kind && actor.alive && actor.habitatSlot !== undefined,
      );
      const used = new Set(living.map((actor) => actor.habitatSlot));
      for (let slot = 0; slot < this.config.creatures[kind]; slot++) {
        if (used.has(slot)) continue;
        const home = this.context.habitats.predator(kind, slot);
        if (!home) continue;
        const point = this.context.shelters.place(kind, slot, home)?.approach ?? home;
        if (Math.hypot(point.x - player.x, point.z - player.z) < IMMIGRATION_PLAYER_DISTANCE)
          continue;

        const id = allocateMammal(this.context.save);
        const actor = this.create(
          kind,
          point,
          new Random(home.key ^ id),
          mammalIdentity(id),
          id,
          home,
        );
        this.settle(actor, kind, slot);
        this.context.onArrival?.(actor);
        this.families.onImmigration(kind, clock);
        break;
      }
    }
  }

  capture(): void {
    const states: LandPredatorState[] = [];
    for (const actor of this.context.predators) {
      const { kind, habitatSlot: slot } = actor;
      if (!actor.alive || slot === undefined || !isLandPredator(kind) || this.families.owns(actor))
        continue;
      states.push({
        id: String(actor.root.userData.remainsIdentity),
        kind,
        slot,
        x: actor.x,
        z: actor.z,
        health: actor.health,
        inside: actor.inDen ? true : undefined,
        mammalId: actor.mammalId,
        mouseBurrow: actor.shelter?.site.kind === 'mouse' ? actor.shelter.site.slot : undefined,
        origin: actor.mammalOrigin,
      });
    }
    this.context.save.landPredators = states;
    this.families.capture();
  }

  private immigrateDog(player: HabitatPoint): void {
    const { save, predators, habitats, world } = this.context;
    const capacity = this.config.creatures.dog;
    const occupied = new Set<number>();
    for (const actor of predators)
      if (actor.kind === 'dog' && actor.alive && actor.habitatSlot !== undefined)
        occupied.add(actor.habitatSlot);
    if (!immigrationReady(save, 'dog', occupied.size < capacity)) return;

    for (let slot = 0; slot < capacity; slot++) {
      if (occupied.has(slot)) continue;
      const home = habitats.predator('dog', slot);
      if (!home || !awayFromPlayer(home, player)) continue;
      const point = habitats.dogPatrol(home, slot, save.clock).destination;
      if (!awayFromPlayer(point, player) || (world.waterAt?.(point.x, point.z)?.depth ?? 0) > 0.05)
        continue;

      const id = allocateMammal(save);
      const actor = this.create(
        'dog',
        point,
        new Random(home.key ^ id),
        mammalIdentity(id),
        id,
        home,
      );
      this.settle(actor, 'dog', slot);
      actor.followTerritory(habitats.dogPatrol(home, slot, save.clock));
      this.context.onArrival?.(actor);
      afterImmigration(save, 'dog');
      return;
    }
  }

  private borrowMouseBurrows(wildlife: readonly ForestAnimal[]): void {
    const weasels = this.context.predators.filter(
      (actor) => actor.kind === 'weasel' && actor.alive && !this.families.owns(actor),
    );
    if (!weasels.length) return;
    const mouseNests = new Set<WildlifeShelter>();
    for (const actor of wildlife)
      if (actor.alive && actor.shelter?.site.kind === 'mouse') mouseNests.add(actor.shelter);
    const occupied = new Set(mouseNests);
    for (const actor of weasels)
      if (actor.shelter?.site.kind === 'mouse') occupied.add(actor.shelter);
    const { shelters } = this.context;
    const vacancies = shelters.ofKind('mouse').filter((shelter) => !occupied.has(shelter));
    for (const actor of weasels) {
      const slot = actor.habitatSlot;
      if (slot === undefined || !actor.homeTerritory || actor.underground) continue;
      const family = this.families.careAt(actor);
      if (actor.shelter?.site.kind === 'mouse') {
        if (family || mouseNests.has(actor.shelter)) {
          if (actor.inDen) {
            actor.restAt = undefined;
            continue;
          }
          const home = shelters.place('weasel', slot, actor.homeTerritory);
          actor.useRoutine(new WildlifeRoutine(home, shelters.routeHeight));
        }
        continue;
      }
      if (family || !actor.restAt || actor.inDen) continue;

      let nearest = WEASEL_BURROW_RANGE;
      let selected: WildlifeShelter | undefined;
      for (const vacancy of vacancies) {
        if (occupied.has(vacancy)) continue;
        const distance = Math.hypot(actor.x - vacancy.entrance.x, actor.z - vacancy.entrance.z);
        if (distance >= nearest) continue;
        nearest = distance;
        selected = vacancy;
      }
      if (!selected) continue;
      occupied.add(selected);
      actor.useRoutine(new WildlifeRoutine(selected, shelters.routeHeight));
      actor.restAt = selected.entrance;
    }
  }

  private placeYoung(kind: PredatorFamilyKind, young: YoungMammal, home: Habitat): Predator {
    const actor = this.create(
      kind,
      young,
      new Random(home.key ^ young.id),
      mammalIdentity(young.id),
      young.id,
      home,
    );
    actor.health = young.health;
    this.context.onArrival?.(actor);
    return actor;
  }

  private settle(
    actor: Predator,
    kind: LandPredatorState['kind'],
    slot: number,
    inside = false,
  ): void {
    const { habitats, shelters, save } = this.context;
    actor.habitatSlot = slot;
    const home = habitats.predator(kind, slot);
    if (!home) return;

    actor.followTerritory(habitats.intent(home, save.clock));
    if (kind !== 'dog')
      actor.useRoutine(
        new WildlifeRoutine(shelters.place(kind, slot, home), shelters.routeHeight),
        inside,
      );
  }

  private create(
    kind: LandPredatorState['kind'],
    point: HabitatPoint,
    rng: Random,
    identity: string,
    id: number | undefined,
    home: Habitat | undefined,
  ): Predator {
    const { save, world, scene, predators } = this.context;
    const appearance = AnimalAppearance.seeded(kind, Number(identity.split(':')[1]), save.seed);
    const actor = AnimalFactory.predator(kind, point.x, point.z, rng, appearance);
    actor.root.userData.remainsIdentity = identity;
    actor.mammalId = id;
    actor.useWorldBounds(this.config.size);
    actor.moveTo(point.x, point.z, world.heightAt(point.x, point.z));
    if (home) actor.followTerritory(habitatIdle(home));
    predators.push(actor);
    scene.add(actor.root);
    return actor;
  }

  private depart(actor: Predator): void {
    const { predators, onDeparture } = this.context;
    predators.splice(predators.indexOf(actor), 1);
    onDeparture?.(actor);
    ModelAssets.shared.release(actor.root);
    actor.root.removeFromParent();
  }

  private slotKey(kind: LandPredatorState['kind'], slot: number): string {
    return `${kind}:${slot}`;
  }
}

function habitatIdle(home: Habitat) {
  return { home, destination: home, resting: false, hunting: false };
}
