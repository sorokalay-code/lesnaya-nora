import type { AnimalHabitats, Habitat, HabitatPoint } from './AnimalHabitats';
import type { ForestAnimal } from './animals';
import { MammalNursery, type YoungMammal } from './MammalNursery';
import { ModelAssets } from './ModelAssets';
import type { SaveData } from './types';
import type { WildlifeShelter, WildlifeShelters } from './WildlifeShelters';
import { WildlifeRoutine } from './WildlifeRoutine';

type Colony = {
  nursery: MammalNursery;
  shelter: WildlifeShelter;
  home: Habitat;
};

const distance = (a: HabitatPoint, b: HabitatPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const IMMIGRATION_DELAY = 2 * 1440;
const IMMIGRATION_INTERVAL = 1440;
const COLONY_NEIGHBOR_RADIUS = 80;

/** Привязывает выводки сурков к материнским норам и расселяет подросших особей. */
export class MarmotFamilies {
  private readonly colonies = new Map<number, Colony>();
  private readonly residents = new Map<ForestAnimal, { young: YoungMammal; colony: Colony }>();

  constructor(
    private readonly save: SaveData,
    private readonly animals: ForestAnimal[],
    private readonly habitats: AnimalHabitats,
    private readonly shelters: WildlifeShelters,
    private readonly create: (young: YoungMammal, home: Habitat) => ForestAnimal,
    private readonly settle: (animal: ForestAnimal, slot: number, home?: Habitat) => void,
  ) {}

  restore(): void {
    if (!this.count) return;
    for (const key of Object.keys(this.save.mammalNurseries ?? {})) {
      if (!key.startsWith('marmot:')) continue;
      const slot = Number(key.slice('marmot:'.length));
      const colony = this.colonyAt(slot);
      if (colony)
        for (const young of colony.nursery.state.young)
          this.place(colony, young, this.save.clock, !!young.inside);
    }
  }

  owns(animal: ForestAnimal): boolean {
    return this.residents.has(animal);
  }

  onDeath(animal: ForestAnimal, clock: number): void {
    if (animal.kind !== 'marmot') return;
    if (this.owns(animal)) this.remove(animal);
    else
      this.save.marmotImmigrationAt = Math.max(
        this.save.marmotImmigrationAt ?? 0,
        clock + IMMIGRATION_DELAY,
      );
  }

  canImmigrate(clock: number): boolean {
    return clock >= (this.save.marmotImmigrationAt ?? 0);
  }

  onImmigration(clock: number): void {
    this.save.marmotImmigrationAt = clock + IMMIGRATION_INTERVAL;
  }

  private remove(animal: ForestAnimal): void {
    const entry = this.residents.get(animal);
    if (!entry) return;
    entry.colony.nursery.remove(entry.young);
    this.residents.delete(animal);
  }

  update(clock: number, player: HabitatPoint): void {
    if (!this.count) return;
    const adults = this.animals.filter(
      (animal) => animal.kind === 'marmot' && animal.alive && !this.owns(animal),
    );
    const slots = new Set(adults.map((animal) => animal.habitatSlot));
    const eligible = adults.filter((animal) => animal.health >= animal.maxHealth * 0.5);
    for (const adult of eligible)
      if (adult.habitatSlot !== undefined && this.sex(adult) === 0)
        this.colonyAt(adult.habitatSlot);

    for (const [slot, colony] of this.colonies) {
      const { nursery, shelter } = colony;
      const mother = eligible.find((adult) => adult.habitatSlot === slot && this.sex(adult) === 0);
      let father: ForestAnimal | undefined;
      if (mother) {
        let nearest = COLONY_NEIGHBOR_RADIUS;
        for (const adult of eligible) {
          if (this.sex(adult) !== 1 || !adult.shelter) continue;
          const separation = distance(adult.shelter.entrance, shelter.entrance);
          if (separation >= nearest) continue;
          nearest = separation;
          father = adult;
        }
      }
      const parentId = nursery.state.parents?.[0];
      const parent = adults.find((adult) => this.identity(adult) === parentId);
      nursery.advance(
        clock,
        mother && father ? [this.identity(mother), this.identity(father)] : undefined,
        !parentId || !!parent,
        shelter.entrance,
        ((parent ?? mother)?.maxHealth ?? 0) * 0.45,
      );
      if (parent && nursery.preparingNest(clock)) {
        parent.restAt = shelter.entrance;
        parent.foragingAllowed = false;
      }
      for (const young of nursery.state.young) {
        if (young.socialId === undefined) this.place(colony, young, clock, true);
      }
    }

    for (const [actor, { young, colony }] of this.residents) {
      if (!actor.alive) continue;
      const { nursery, shelter } = colony;
      const stage = nursery.stage(young, clock);
      const motherId = nursery.state.parents?.[0];
      const parent = adults.find((adult) => this.identity(adult) === motherId);
      const caregiver =
        parent ?? adults.find((adult) => distance(adult, shelter.entrance) < 5 && !adult.inShelter);
      const attended =
        !!caregiver &&
        (actor.inShelter
          ? distance(caregiver, shelter.entrance) < 4
          : !caregiver.inShelter && distance(actor, caregiver) < 4);
      nursery.grow(young, actor, clock, attended);

      if (stage !== 'adult') {
        const resting = stage === 'nest' || actor.restAt !== undefined;
        if (caregiver) {
          if (resting) caregiver.restAt = shelter.entrance;
          caregiver.destination = shelter.approach;
          caregiver.foragingAllowed = false;
        }
        actor.restAt = resting ? shelter.entrance : undefined;
        const side = young.id % 2 === 0 ? -0.65 : 0.65;
        const x = shelter.approach.x + Math.cos(shelter.site.angle) * side;
        const z = shelter.approach.z - Math.sin(shelter.site.angle) * side;
        actor.destination =
          this.shelters.routeHeight(x, z) === undefined ? shelter.approach : { x, z };
        actor.foragingAllowed = false;
        continue;
      }

      if (actor.inShelter) {
        actor.restAt = undefined;
        continue;
      }

      if (adults.length < this.count && slots.size < this.count) {
        let free = 0;
        while (slots.has(free)) free++;
        slots.add(free);
        this.settle(actor, free, this.habitats.wildlife('marmot', free));
        adults.push(actor);
        this.remove(actor);
      } else {
        actor.restAt = undefined;
        actor.foragingAllowed = false;
        const dx = shelter.approach.x - shelter.entrance.x;
        const dz = shelter.approach.z - shelter.entrance.z;
        actor.destination = { x: shelter.approach.x + dx * 14, z: shelter.approach.z + dz * 14 };
        if (
          distance(actor, player) > 22 &&
          (distance(actor, shelter.entrance) > 12 || clock - young.bornAt > 5760)
        ) {
          this.remove(actor);
          this.animals.splice(this.animals.indexOf(actor), 1);
          ModelAssets.shared.release(actor.root);
          actor.root.removeFromParent();
        }
      }
    }
  }

  capture(): void {
    for (const [actor, { young }] of this.residents) {
      young.x = actor.x;
      young.z = actor.z;
      young.health = actor.health;
      young.inside = actor.inShelter ? true : undefined;
      young.social = { ...actor.social };
    }
  }

  private get count(): number {
    return this.save.worldConfig?.creatures.marmot ?? 0;
  }

  private colonyAt(slot: number): Colony | undefined {
    const existing = this.colonies.get(slot);
    if (existing) return existing;
    if (slot >= this.count) return;

    const home = this.habitats.wildlife('marmot', slot);
    const shelter = home && this.shelters.place('marmot', slot, home);
    if (!home || !shelter) return;

    const colony = {
      nursery: new MammalNursery('marmot', this.save, `marmot:${slot}`),
      shelter,
      home,
    };
    this.colonies.set(slot, colony);
    return colony;
  }

  private place(colony: Colony, young: YoungMammal, clock: number, inside: boolean): void {
    const actor = this.create(young, colony.home);
    actor.mammalOrigin = colony.nursery.origin(young);
    young.socialId = actor.socialId;
    actor.habitat = colony.home;
    actor.useRoutine(new WildlifeRoutine(colony.shelter, this.shelters.routeHeight), inside);
    if (colony.nursery.stage(young, clock) === 'nest') actor.restAt = colony.shelter.entrance;
    colony.nursery.restoreGrowth(young, actor, clock);
    this.residents.set(actor, { young, colony });
  }

  private sex(animal: ForestAnimal): number {
    return (animal.mammalId ?? animal.habitatSlot ?? animal.socialId) % 2;
  }

  private identity(animal: ForestAnimal): string {
    return String(animal.root.userData.remainsIdentity);
  }
}
