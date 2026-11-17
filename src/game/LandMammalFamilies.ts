import type { Habitat, HabitatPoint } from './AnimalHabitats';
import type { ForestAnimal, Predator } from './animals';
import { MammalNursery, MAMMAL_NURSERY, type NurseryKind, type YoungMammal } from './MammalNursery';
import type { SaveData } from './types';
import type { WildlifeShelter, WildlifeShelters } from './WildlifeShelters';
import { isShelteredWildlife } from './WildlifeShelterProfiles';
import { WildlifeRoutine } from './WildlifeRoutine';

export type LandFamilyKind = Exclude<NurseryKind, 'wolf'>;
type Resident = ForestAnimal | Predator;

interface Family<K> {
  kind: K;
  slot: number;
  nursery: MammalNursery;
  shelter?: WildlifeShelter;
  home: Habitat;
  nest: HabitatPoint;
}

interface Context<A, K> {
  save: SaveData;
  animals: A[];
  kinds: readonly K[];
  shelters: WildlifeShelters;
  count: (kind: K) => number;
  home: (kind: K, slot: number) => Habitat | undefined;
  shelter?: (kind: K, slot: number, home: Habitat) => WildlifeShelter | undefined;
  canSettle?: (actor: A, kind: K, slot: number) => boolean;
  raiseAt?: (actor: A, shelter: WildlifeShelter, caregiver: A | undefined) => HabitatPoint;
  bed?: (home: Habitat, slot: number) => HabitatPoint;
  resting: (home: Habitat, clock: number) => boolean;
  create: (kind: K, young: YoungMammal, home: Habitat) => A;
  settle: (actor: A, kind: K, slot: number) => void;
  depart: (actor: A) => void;
  saveSocial?: (actor: A, young: YoungMammal) => void;
}

const DAY = 1440;
const IMMIGRATION_DELAY = 2 * DAY;
const NEIGHBOR_RADIUS = 80;
const WIDE_RANGE_NEIGHBOR_RADIUS = 125;
const CARE_DISTANCE = 4;
const DISPERSE_PLAYER_DISTANCE = 25;
const distance = (a: HabitatPoint, b: HabitatPoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** Привязывает выводки к участкам родителей, направляет уход и заселяет свободные участки. */
export class LandMammalFamilies<A extends Resident, K extends LandFamilyKind> {
  private readonly families = new Map<string, Family<K>>();
  private readonly dependents = new Map<A, { young: YoungMammal; family: Family<K> }>();
  private readonly caregivers = new Map<A, HabitatPoint>();

  constructor(private readonly context: Context<A, K>) {}

  restore(): void {
    for (const key of Object.keys(this.context.save.mammalNurseries ?? {})) {
      const [savedKind, savedSlot] = key.split(':');
      const kind = this.kind(savedKind);
      if (!kind) continue;

      const family = this.familyAt(kind, Number(savedSlot));
      if (family)
        for (const young of family.nursery.state.young)
          this.place(family, young, this.context.save.clock, !!young.inside);
    }
  }

  owns(actor: A): boolean {
    return this.dependents.has(actor);
  }

  careAt(actor: A): HabitatPoint | undefined {
    return this.caregivers.get(actor);
  }

  onDeath(actor: A, clock: number): void {
    const kind = this.kind(actor.kind);
    if (!kind) return;

    if (this.owns(actor)) this.remove(actor);
    else this.setImmigration(kind, clock + IMMIGRATION_DELAY);
  }

  canImmigrate(value: string, clock: number): boolean {
    const kind = this.kind(value);
    if (!kind) return true;
    const { save } = this.context;
    const due =
      save.landMammalImmigration?.[kind] ??
      (kind === 'marmot' ? save.marmotImmigrationAt : undefined);
    const reserved = this.context.animals.filter(
      (actor) => actor.kind === kind && actor.alive,
    ).length;
    return clock >= (due ?? 0) && reserved < this.context.count(kind);
  }

  onImmigration(value: string, clock: number): void {
    const kind = this.kind(value);
    if (kind) this.setImmigration(kind, clock + DAY);
  }

  update(clock: number, player: HabitatPoint, winter: boolean, nearSpring = false): void {
    const adultsByKind = new Map<K, A[]>();
    this.caregivers.clear();
    for (const actor of this.context.animals) {
      const kind = this.kind(actor.kind);
      if (!kind || !actor.alive || this.owns(actor)) continue;
      const adults = adultsByKind.get(kind) ?? [];
      adults.push(actor);
      adultsByKind.set(kind, adults);
      if (actor.habitatSlot !== undefined && this.sex(actor) === 0)
        this.familyAt(kind, actor.habitatSlot);
    }
    for (const family of this.families.values())
      this.advanceFamily(family, adultsByKind.get(family.kind) ?? [], clock, winter, nearSpring);

    for (const [actor, { young, family }] of this.dependents) {
      if (!actor.alive) continue;
      const adults = adultsByKind.get(family.kind) ?? [];
      const stage = family.nursery.stage(young, clock);
      const parent = this.findParent(family, adults);
      const caregiver = parent ?? adults.find((adult) => distance(adult, family.nest) < 5);
      const attended =
        !!caregiver &&
        (actor.inShelter
          ? distance(caregiver, family.nest) < CARE_DISTANCE
          : !caregiver.inShelter && distance(actor, caregiver) < CARE_DISTANCE);
      family.nursery.grow(young, actor, clock, attended);
      if (!actor.alive) continue;

      if (stage === 'adult' && (family.kind !== 'bear' || !winter))
        this.adult(actor, young, family, adults, player, clock);
      else if (stage === 'adult')
        this.raise(actor, family, 'nest', caregiver, young.id, clock, winter);
      else this.raise(actor, family, stage, caregiver, young.id, clock, winter);
    }
  }

  capture(): void {
    for (const [actor, { young }] of this.dependents) {
      young.x = actor.x;
      young.z = actor.z;
      young.health = actor.health;
      young.inside = actor.inShelter ? true : undefined;
      this.context.saveSocial?.(actor, young);
    }
  }

  private advanceFamily(
    family: Family<K>,
    adults: readonly A[],
    clock: number,
    winter: boolean,
    nearSpring: boolean,
  ): void {
    const { nursery, kind, slot, nest } = family;
    const eligible = adults.filter((actor) => actor.health >= actor.maxHealth * 0.5);
    const mother = eligible.find((actor) => actor.habitatSlot === slot && this.sex(actor) === 0);
    const father = mother && this.findFather(mother, nest, eligible);
    const parent = this.findParent(family, adults);
    const breedingSeason = kind === 'bear' ? winter && nearSpring : !winter;
    nursery.advance(
      clock,
      breedingSeason && mother && father
        ? [this.identity(mother), this.identity(father)]
        : undefined,
      !nursery.state.parents || !!parent,
      nest,
      ((parent ?? mother)?.maxHealth ?? 0) * 0.45,
    );
    if (parent && nursery.preparingNest(clock)) {
      parent.restAt = nest;
      parent.foragingAllowed = false;
      this.caregivers.set(parent, nest);
    }
    for (const young of nursery.state.young)
      if (!this.activeYoung.has(young)) this.place(family, young, clock, !!family.shelter);
  }

  private readonly activeYoung = new WeakSet<YoungMammal>();

  private raise(
    actor: A,
    family: Family<K>,
    stage: 'nest' | 'entrance' | 'meeting',
    caregiver: A | undefined,
    id: number,
    clock: number,
    winter: boolean,
  ): void {
    const { shelter, kind, nest } = family;
    const resting =
      stage === 'nest' ||
      (!!shelter && this.context.resting(family.home, clock)) ||
      (kind === 'bear' && winter);
    const approach = shelter?.approach ?? nest;
    if (caregiver) {
      this.caregivers.set(caregiver, nest);
      if (resting && shelter) caregiver.restAt = nest;
      else if (!shelter) {
        // Копытные возвращаются к лёжке, затем выводят детёныша к своему участку.
        if (stage === 'nest' && distance(caregiver, nest) > CARE_DISTANCE) {
          caregiver.destination = nest;
          caregiver.foragingAllowed = false;
        }
      } else if (stage !== 'meeting' || Math.floor(clock / 75) % 3 !== 0) {
        caregiver.destination = approach;
        caregiver.foragingAllowed = false;
      }
    }

    const guide = shelter
      ? (this.context.raiseAt?.(actor, shelter, caregiver) ?? approach)
      : approach;
    const angle = shelter?.site.angle ?? id * 2.399963;
    const side = id % 2 === 0 ? -0.65 : 0.65;
    const neighbour = {
      x: guide.x + Math.cos(angle) * side,
      z: guide.z - Math.sin(angle) * side,
    };
    actor.restAt = resting ? nest : undefined;
    actor.destination =
      !shelter && stage === 'meeting' && caregiver
        ? caregiver
        : this.context.shelters.navigationHeight(shelter)(neighbour.x, neighbour.z) === undefined
          ? guide
          : neighbour;
    actor.foragingAllowed = false;
  }

  private adult(
    actor: A,
    young: YoungMammal,
    family: Family<K>,
    adults: A[],
    player: HabitatPoint,
    clock: number,
  ): void {
    actor.restAt = undefined;
    if (actor.inShelter) return;
    const count = this.context.count(family.kind);
    if (adults.length < count) {
      const used = new Set(adults.map((adult) => adult.habitatSlot));
      let slot = 0;
      while (
        slot < count &&
        (used.has(slot) || this.context.canSettle?.(actor, family.kind, slot) === false)
      )
        slot++;
      if (slot < count) {
        this.context.settle(actor, family.kind, slot);
        adults.push(actor);
        this.remove(actor);
        return;
      }
    }

    const angle = family.shelter?.site.angle ?? young.id * 2.399963;
    actor.foragingAllowed = false;
    actor.destination = {
      x: family.nest.x - Math.sin(angle) * 20,
      z: family.nest.z - Math.cos(angle) * 20,
    };
    if (
      distance(actor, player) > DISPERSE_PLAYER_DISTANCE &&
      (distance(actor, family.nest) > 12 ||
        clock - young.bornAt >= MAMMAL_NURSERY[family.kind].mature + DAY)
    ) {
      this.remove(actor);
      this.context.depart(actor);
    }
  }

  private familyAt(kind: K, slot: number): Family<K> | undefined {
    const key = `${kind}:${slot}`;
    const existing = this.families.get(key);
    if (existing) return existing;
    if (slot >= this.context.count(kind)) return;

    const home = this.context.home(kind, slot);
    if (!home) return;
    const shelter = isShelteredWildlife(kind)
      ? this.context.shelter
        ? this.context.shelter(kind, slot, home)
        : this.context.shelters.place(kind, slot, home)
      : undefined;
    if (isShelteredWildlife(kind) && !shelter) return;
    const family = {
      kind,
      slot,
      home,
      shelter,
      nest: shelter?.entrance ?? this.context.bed?.(home, slot) ?? home,
      nursery: new MammalNursery(kind, this.context.save, key),
    };
    this.families.set(key, family);
    return family;
  }

  private place(family: Family<K>, young: YoungMammal, clock: number, inside: boolean): void {
    const { kind, home, nursery, shelter, nest } = family;
    const actor = this.context.create(kind, young, home);
    actor.mammalOrigin = nursery.origin(young);
    actor.useRoutine(
      new WildlifeRoutine(shelter, this.context.shelters.navigationHeight(shelter)),
      inside,
    );
    if (nursery.stage(young, clock) === 'nest') actor.restAt = nest;
    nursery.restoreGrowth(young, actor, clock);
    this.activeYoung.add(young);
    this.dependents.set(actor, { young, family });
  }

  private remove(actor: A): void {
    const entry = this.dependents.get(actor);
    if (!entry) return;
    entry.family.nursery.remove(entry.young);
    this.dependents.delete(actor);
  }

  private setImmigration(kind: K, clock: number): void {
    const dates = (this.context.save.landMammalImmigration ??= {});
    dates[kind] = Math.max(dates[kind] ?? 0, clock);
  }

  private kind(value: string): K | undefined {
    return this.context.kinds.find((kind) => kind === value);
  }

  private sex(actor: A): number {
    return (actor.mammalId ?? actor.habitatSlot ?? 0) % 2;
  }

  private identity(actor: A): string {
    return String(actor.root.userData.remainsIdentity);
  }

  private findParent(family: Family<K>, adults: readonly A[]): A | undefined {
    const mother = family.nursery.state.parents?.[0];
    return adults.find((actor) => this.identity(actor) === mother);
  }

  private findFather(mother: A, nest: HabitatPoint, adults: readonly A[]): A | undefined {
    const motherId = this.identity(mother);
    const maternalLine = mother.mammalOrigin?.parents;
    let nearest =
      mother.kind === 'bear' || mother.kind === 'moose' || mother.kind === 'lynx'
        ? WIDE_RANGE_NEIGHBOR_RADIUS
        : NEIGHBOR_RADIUS;
    let father: A | undefined;
    for (const adult of adults) {
      if (this.sex(adult) !== 1) continue;
      if (
        mother.kind === 'beaver' &&
        'waterBody' in mother &&
        'waterBody' in adult &&
        adult.waterBody !== mother.waterBody
      )
        continue;
      const id = this.identity(adult);
      const lineage = adult.mammalOrigin?.parents;
      if (
        maternalLine?.includes(id) ||
        lineage?.includes(motherId) ||
        lineage?.some((ancestor) => maternalLine?.includes(ancestor))
      )
        continue;

      const separation = distance(adult.shelter?.entrance ?? adult.homeTerritory ?? adult, nest);
      if (separation >= nearest) continue;
      nearest = separation;
      father = adult;
    }
    return father;
  }
}
