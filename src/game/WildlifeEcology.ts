import { WaterNavigation } from './WaterNavigation';
import * as THREE from 'three';
import {
  createForestAnimal,
  Predator,
  RabbitActor,
  ForestAnimal,
  type GroundHeight,
  type WildlifeKind,
} from './animals';
import { ModelAssets } from './ModelAssets';
import { Random } from './Random';
import { World, type Resource } from './World';
import type { PredatorKind, SaveData } from './types';
import { AnimalRestraint } from './animals/AnimalRestraint';
import { defaultWorldConfig } from './WorldConfig';
import { animalNames } from './animals/names';
import type { AnimalHabitats, Habitat, HabitatPoint, HuntingTrail } from './AnimalHabitats';
import type { WolfPopulation } from './session/WolfPopulation';
import { WildlifeForage } from './WildlifeForage';
import type { WildlifeShelters } from './WildlifeShelters';
import { isShelteredWildlife } from './WildlifeShelterProfiles';
import { WildlifeRoutine } from './WildlifeRoutine';
import { LandMammalFamilies } from './LandMammalFamilies';
import {
  isWildlifeFamilyKind,
  mammalIdentity,
  WILDLIFE_FAMILIES,
  type WildlifeFamilyKind,
} from './MammalNursery';
import { SeasonSystem } from './systems/SeasonSystem';
import type { LandPredators } from './session/LandPredators';
import { HuntingGrounds, preyRank } from './HuntingGrounds';
import { BroodProvisioning, beginProvision, newBroodFood } from './BroodFood';
import { WildRabbitTerritories } from './session/WildRabbitTerritories';
import type { Excavation } from './Excavation';
import { AnimalAppearance } from './AnimalAppearance';
import { ShoreEcology, shoreKind } from './ShoreEcology';
import type { AquaticHabitats } from './AquaticHabitats';
import { PheasantFlocks } from './PheasantFlocks';
import { Pheasant } from './animals/Pheasant';
import type { SmallFaunaPopulation } from './session/SmallFaunaPopulation';

type Target = ForestAnimal | Predator | RabbitActor;
type ForageTarget = { kind: 'plant'; plant: Resource } | { kind: 'ground'; point: HabitatPoint };
export type WildlifeEvent = {
  kind: 'hunt' | 'fight' | 'defend' | 'arrival';
  x: number;
  z: number;
  subject: string;
};
const FIELD_WILDLIFE = ['mole', 'marmot', 'pheasant'] as const;
const LITTER_FORAGERS = new Set<WildlifeKind>(['badger', 'hedgehog', 'mole', 'boar', 'pheasant']);
const ADDITIONAL_WILDLIFE = ['badger', 'chipmunk', ...FIELD_WILDLIFE, 'roe-deer', 'frog'] as const;
const WILDLIFE_KINDS = [
  'deer',
  'squirrel',
  'hedgehog',
  'beaver',
  'moose',
  'boar',
  'bear',
  'duck',
  'mouse',
  'fish',
  ...ADDITIONAL_WILDLIFE,
] as const satisfies readonly WildlifeKind[];

/** Моделирует питание, охоту, конфликты, защиту и восстановление популяции животных. */

export class WildlifeEcology {
  private readonly provisions = new BroodProvisioning();
  readonly animals: ForestAnimal[] = [];
  private readonly water: WaterNavigation;
  private readonly newWildlifeRng: Random;
  private readonly forage: WildlifeForage;
  private readonly families?: LandMammalFamilies<ForestAnimal, WildlifeFamilyKind>;
  private readonly seasons: SeasonSystem;
  private readonly huntingGrounds = new HuntingGrounds();
  private readonly neighborTerritories?: WildRabbitTerritories;
  private readonly shore?: ShoreEcology;
  private readonly pheasants?: PheasantFlocks;
  private readonly foodTargets = new Map<ForestAnimal, ForageTarget>();
  private preyTargets = new Map<Predator, { target: Target; until: number }>();
  private readonly nextPreySearch = new WeakMap<Predator, number>();
  private nextHabitatUpdate = 0;
  private nextFoodSearch = 0;
  private nextSpawn = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: World,
    private readonly rng: Random,
    private readonly save?: SaveData,
    private readonly onDeath?: (animal: ForestAnimal | Predator) => void,
    private readonly territories?: {
      habitats: AnimalHabitats;
      wolves: WolfPopulation;
      shelters: WildlifeShelters;
      land?: LandPredators;
      rabbits?: readonly RabbitActor[];
      smallFauna?: () => SmallFaunaPopulation | undefined;
    },
  ) {
    this.water = new WaterNavigation(world);
    this.forage = new WildlifeForage(world.resources ?? []);
    this.newWildlifeRng = new Random((save?.seed ?? world.seed ?? 0) + 82473);
    this.seasons = new SeasonSystem(
      save?.seed ?? world.seed ?? 0,
      save?.worldConfig?.seasonLengths,
    );
    if (save && territories)
      this.pheasants = new PheasantFlocks({
        save,
        scene,
        animals: this.animals,
        shelters: territories.shelters,
        habitats: territories.habitats,
        create: (at, id) =>
          this.addAnimal(
            'pheasant',
            at.x,
            at.z,
            save.worldConfig?.size ?? 110,
            this.newWildlifeRng,
            undefined,
            undefined,
            id,
          ),
        settle: (animal, slot) =>
          this.assignHabitat(animal, slot, territories.habitats.wildlife('pheasant', slot)),
        depart: (animal) => this.depart(animal),
      });
    if (save && territories && world.terrain?.water && typeof world.waterAt === 'function')
      this.shore = new ShoreEcology({
        world,
        save,
        scene,
        animals: this.animals,
        shelters: territories.shelters,
        create: (kind, at, socialId) =>
          this.addAnimal(
            kind,
            at.x,
            at.z,
            save.worldConfig?.size ?? 110,
            this.newWildlifeRng,
            undefined,
            undefined,
            socialId,
          ),
        depart: (actor) => this.depart(actor),
      });
    if (save && territories?.rabbits)
      this.neighborTerritories = new WildRabbitTerritories(
        save,
        territories.habitats,
        territories.shelters,
        world,
      );
    if (save && territories)
      this.families = new LandMammalFamilies({
        save,
        animals: this.animals,
        kinds: WILDLIFE_FAMILIES,
        shelters: territories.shelters,
        home: (kind, slot) =>
          kind === 'beaver'
            ? this.shore?.beaverHome(slot)
            : territories.habitats.wildlife(kind, slot),
        shelter: (kind, slot, home) =>
          kind === 'beaver' && this.shore
            ? this.shore.beaverShelter(slot, home)
            : isShelteredWildlife(kind)
              ? territories.shelters.place(kind, slot, home)
              : undefined,
        canSettle: (animal, kind, slot) =>
          kind !== 'beaver' || !this.shore || this.shore.canSettleBeaver(animal, slot),
        raiseAt: (animal, shelter, caregiver) =>
          animal.kind === 'beaver' &&
          caregiver &&
          !caregiver.inShelter &&
          !!this.world.waterAt(caregiver.x, caregiver.z)
            ? caregiver
            : shelter.approach,
        bed: (home, slot) => territories.habitats.nurseryBed(home, slot),
        count: (kind) => (save.worldConfig ?? defaultWorldConfig()).creatures[kind],
        resting: (home, clock) =>
          home.waterBody
            ? !(
                (clock % 1440 >= 930 && clock % 1440 < 1360) ||
                (clock % 1440 >= 285 && clock % 1440 < 500)
              )
            : territories.habitats.intent(home, clock).resting,
        create: (kind, young, home) => {
          const animal = createForestAnimal(
            kind,
            young.x,
            young.z,
            new Random(home.key ^ young.id),
            AnimalAppearance.seeded(kind, young.id, home.key),
          );
          animal.socialId = young.socialId ?? this.allocateSocialId();
          if (young.social) animal.social = { ...young.social };
          animal.health = young.health;
          this.identifyMammal(animal, young.id);
          young.socialId = animal.socialId;
          animal.habitat = home;
          animal.useWorldBounds(save.worldConfig?.size ?? 110);
          this.place(animal, young.x, young.z);
          if (home.waterBody) animal.useWaterBody(home.waterBody);
          this.animals.push(animal);
          scene.add(animal.root);
          return animal;
        },
        settle: (animal, kind, slot) => {
          if (kind === 'beaver' && this.shore) this.shore.settleBeaver(animal, slot);
          else this.assignHabitat(animal, slot, territories.habitats.wildlife(kind, slot));
        },
        depart: (animal) => this.depart(animal),
        saveSocial: (animal, young) => {
          young.social = { ...animal.social };
        },
      });
  }

  get aquaticHabitats(): AquaticHabitats | undefined {
    return this.shore?.habitats;
  }

  dispose(): void {
    this.provisions.dispose();
    this.shore?.dispose();
    this.pheasants?.dispose();
    this.territories?.smallFauna?.()?.dispose();
  }

  populate(): void {
    if (this.save?.wildlife) {
      const occupied = new Map<WildlifeKind, Set<number>>();
      for (const data of this.save.wildlife) {
        const slots = occupied.get(data.kind) ?? new Set<number>();
        if (data.habitatSlot !== undefined) slots.add(data.habitatSlot);
        occupied.set(data.kind, slots);
      }
      for (const data of this.save.wildlife) {
        if (this.save.worldConfig?.creatures[data.kind] === 0) continue;
        const animal = createForestAnimal(data.kind, data.x, data.z, this.rng, data.appearance);
        animal.socialId = data.id;
        if (isWildlifeFamilyKind(data.kind)) this.identifyMammal(animal, data.mammalId);
        animal.mammalOrigin = data.mammalOrigin;
        animal.useWorldBounds(this.save.worldConfig?.size ?? 110);
        animal.social = { ...data.social };
        animal.health = Math.max(0, Math.min(animal.maxHealth, data.health));
        const slots = occupied.get(data.kind)!;
        let slot = data.habitatSlot;
        if (slot === undefined) {
          slot = 0;
          while (slots.has(slot)) slot++;
          slots.add(slot);
        }
        this.place(animal, data.x, data.z);
        if (this.shore && shoreKind(data.kind)) {
          if (!this.shore.restoreAdult(animal, data.kind, slot, data.waterBody, data.inShelter)) {
            ModelAssets.shared.release(animal.root);
            continue;
          }
        } else
          this.assignHabitat(
            animal,
            slot,
            this.territories?.habitats.wildlife(data.kind, slot),
            data.inShelter,
          );
        this.animals.push(animal);
        this.scene.add(animal.root);
      }
      this.families?.restore();
      this.shore?.restore();
      this.pheasants?.restore();
      return;
    }
    const counts = (this.save?.worldConfig ?? defaultWorldConfig()).creatures;
    for (const kind of WILDLIFE_KINDS)
      for (let i = 0; i < counts[kind]; i++) this.spawn(kind, 0, 0, true, i);
    this.families?.restore();
    this.shore?.restore();
    this.pheasants?.restore();
  }

  private spawn(
    kind: WildlifeKind,
    px: number,
    pz: number,
    initial = false,
    slot?: number,
  ): ForestAnimal | undefined {
    if (this.shore && shoreKind(kind) && slot !== undefined)
      return this.shore.spawn(kind, slot, initial ? undefined : { x: px, z: pz });
    if ((kind === 'fish' || kind === 'duck' || kind === 'frog') && !this.world.waterSources.length)
      return;
    const size = this.save?.worldConfig?.size ?? 110;
    const home = slot !== undefined ? this.territories?.habitats.wildlife(kind, slot) : undefined;
    if (home && slot !== undefined && this.territories) {
      const shelter =
        isShelteredWildlife(kind) && (kind !== 'pheasant' || slot % 2 === 0)
          ? this.territories.shelters.place(kind, slot, home)
          : undefined;
      const point = shelter?.approach ?? this.territories.habitats.nearHome(home, slot);
      if (!initial && Math.hypot(point.x - px, point.z - pz) < 22) return;
      return this.addAnimal(kind, point.x, point.z, size, this.newWildlifeRng, slot, home);
    }
    const scale = size / 110;
    const additional = ADDITIONAL_WILDLIFE.some((species) => species === kind);
    const fieldAnimal = FIELD_WILDLIFE.some((species) => species === kind);
    const swampSources =
      kind === 'frog'
        ? this.world.waterSources.filter(
            (source) => this.world.biomeAt(source.x, source.z) === 'swamp',
          )
        : [];
    // Новые соседние виды не сдвигают случайный поток прежней стартовой популяции.
    const rng = additional ? this.newWildlifeRng : this.rng;
    let x = 0,
      z = 0,
      found = false;
    for (let attempt = 0; attempt < 35; attempt++) {
      if (kind === 'frog') {
        const source = rng.pick(swampSources.length ? swampSources : this.world.waterSources);
        const angle = rng.range(0, Math.PI * 2);
        const distance = rng.range(1.5, 4.5);
        x = source.x + Math.sin(angle) * distance;
        z = source.z + Math.cos(angle) * distance;
        if (!this.world.nearWater?.(x, z, 1.5)) continue;
        if (!initial && Math.hypot(x - px, z - pz) < 26) continue;
      } else if (kind === 'fish') {
        const water = rng.pick(this.world.waterSources);
        x = water.x + rng.range(-1.4, 1.4);
        z = water.z + rng.range(-1.4, 1.4);
        if ((this.world.waterAt?.(x, z)?.depth ?? 0) < 0.6) continue;
        if (!initial && Math.hypot(x - px, z - pz) < 26) continue;
        found = true;
        break;
      }
      if ((kind === 'beaver' || kind === 'duck') && this.world.waterSources.length) {
        const pond = rng.pick(this.world.waterSources),
          a = rng.range(0, Math.PI * 2),
          d = kind === 'duck' ? rng.range(1.5, 6) : rng.range(4, 8);
        x = pond.x + Math.sin(a) * d;
        z = pond.z + Math.cos(a) * d;
      } else if (kind !== 'frog') {
        x = rng.range(-90, 90) * scale;
        z = rng.range(-90, 90) * scale;
      }

      const biome = this.world.biomeAt(x, z);
      if (fieldAnimal && biome !== 'meadow') continue;
      if (additional && kind !== 'frog' && this.world.nearWater?.(x, z, 0.5)) continue;
      if (
        Math.abs(x) > 97 * scale ||
        Math.abs(z) > 97 * scale ||
        Math.hypot(x - px, z - pz) < (initial ? 9 : 26) ||
        biome === 'garden'
      )
        continue;

      if (
        kind !== 'deer' &&
        kind !== 'roe-deer' &&
        kind !== 'moose' &&
        kind !== 'beaver' &&
        kind !== 'bear' &&
        kind !== 'duck' &&
        kind !== 'mouse' &&
        kind !== 'frog' &&
        !fieldAnimal &&
        biome !== 'forest'
      )
        continue;

      found = true;
      break;
    }

    // При преобладании лугов или огородов лес может отсутствовать. Стартовые животные
    // используют свободную сушу, а не исчезают вопреки выбранной численности.
    if (!found && initial && kind !== 'fish' && kind !== 'duck' && kind !== 'frog') {
      for (let attempt = 0; attempt < 100; attempt++) {
        x = rng.range(-90, 90) * scale;
        z = rng.range(-90, 90) * scale;
        if (Math.hypot(x, z) < 9 || this.world.nearWater?.(x, z, 1)) continue;
        found = true;
        break;
      }
    }
    if (!found) return;

    return this.addAnimal(kind, x, z, size, rng, slot);
  }

  private addAnimal(
    kind: WildlifeKind,
    x: number,
    z: number,
    size: number,
    rng: Random,
    slot?: number,
    home?: Habitat,
    socialId?: number,
  ): ForestAnimal {
    const animal = createForestAnimal(kind, x, z, rng);
    animal.useWorldBounds(size);
    animal.socialId = socialId ?? this.allocateSocialId();
    if (isWildlifeFamilyKind(kind)) this.identifyMammal(animal);
    this.place(animal, x, z);
    this.assignHabitat(animal, slot, home);
    this.animals.push(animal);
    this.scene.add(animal.root);
    return animal;
  }

  private depart(animal: ForestAnimal): void {
    const index = this.animals.indexOf(animal);
    if (index >= 0) this.animals.splice(index, 1);
    this.foodTargets.delete(animal);
    ModelAssets.shared.release(animal.root);
    animal.root.removeFromParent();
  }

  private allocateSocialId(): number {
    if (!this.save) return this.animals.length + 1;
    const id = this.save.nextWildlifeId ?? 1;
    this.save.nextWildlifeId = id + 1;
    return id;
  }

  private identifyMammal(animal: ForestAnimal, id?: number): void {
    animal.mammalId = id;
    animal.root.userData.remainsIdentity =
      id === undefined ? `wildlife:${animal.socialId}` : mammalIdentity(id);
  }

  private assignHabitat(
    animal: ForestAnimal,
    slot: number | undefined,
    home?: Habitat,
    inside = false,
  ): void {
    animal.habitatSlot = slot;
    animal.habitat = home;
    animal.destination = home;
    const shelters = this.territories?.shelters;
    if (shelters && animal instanceof Pheasant) {
      animal.useRoutine(new WildlifeRoutine(undefined, shelters.routeHeight));
      animal.findCover = (x, z, threat) => this.world.tallGrassNear?.(x, z, threat);
      if (home && slot !== undefined) {
        if (slot % 2 === 0) shelters.place('pheasant', slot, home);
        animal.useHenPlumage(slot % 2 === 0);
      }
      return;
    }
    if (!shelters || !home || slot === undefined) return;

    if (isShelteredWildlife(animal.kind)) {
      const shelter = shelters.place(animal.kind, slot, home);
      animal.useRoutine(new WildlifeRoutine(shelter, shelters.routeHeight), inside);
    } else if (home.profile.mode === 'roaming') {
      animal.useRoutine(new WildlifeRoutine(undefined, shelters.routeHeight));
    }
  }

  private provisionKill(actor: Predator, clock: number): void {
    if (!this.save || actor.juvenile) return;
    const home = actor.kind === 'wolf' ? this.territories?.wolves.provisionHome(actor) : undefined;
    const identity: unknown = actor.root.userData.remainsIdentity;
    if (typeof identity !== 'string') return;
    const entry = Object.entries(this.save.mammalNurseries ?? {}).find(
      ([key, nursery]) =>
        nursery.young.length &&
        (home
          ? key === home.key
          : key.startsWith(`${actor.kind}:`) && nursery.parents?.includes(identity)),
    );
    if (!entry) return;
    beginProvision((entry[1].food ??= newBroodFood(clock)), identity, clock);
  }

  private updateProvisions(predators: readonly Predator[], clock: number): void {
    this.provisions.prune(
      Object.values(this.save?.mammalNurseries ?? {}).flatMap((state) =>
        state.food ? [state.food] : [],
      ),
    );
    for (const actor of predators) actor.provisionHome = undefined;
    for (const [key, nursery] of Object.entries(this.save?.mammalNurseries ?? {})) {
      const food = nursery.food;
      if (!food) continue;
      if (!nursery.young.length) delete food.trip;
      const actor = food.trip
        ? predators.find((actor) => actor.root.userData.remainsIdentity === food.trip?.carrier)
        : undefined;
      const [kind, slot] = key.split(':');
      const home =
        actor?.kind === 'wolf'
          ? this.territories?.wolves.provisionHome(actor)?.point
          : isShelteredWildlife(kind)
            ? this.territories?.shelters.get(kind, Number(slot))?.approach
            : undefined;
      const point = home ?? nursery.young[0] ?? { x: 0, z: 0 };
      if (this.provisions.update(food, actor, point, clock) && actor) {
        actor.provisionHome = point;
        actor.restAt = undefined;
        actor.foragingAllowed = true;
      }
    }
  }

  prepareHabitats(
    time: number,
    clock: number,
    predators: readonly Predator[],
    player = this.save?.player ?? { x: 0, z: 0 },
  ): void {
    if (!this.territories || time < this.nextHabitatUpdate) return;
    this.nextHabitatUpdate = time + 1;
    const { habitats, wolves, land, rabbits } = this.territories;
    const day = Math.floor(clock / 1440) + 1;
    const season = this.seasons.name(day);
    const winter = season === 'Зима';
    this.huntingGrounds.refresh(this.animals, rabbits ?? [], (actor) => this.canHunt(actor));
    wolves.updateIntents(clock, (point) => this.huntingGrounds.score('wolf', point));
    if (land) land.prepare(clock, winter, player, this.preyScore, this.animals);
    this.updateProvisions(predators, clock);
    const trails = new Map<Predator, HuntingTrail>();
    for (const actor of predators) {
      if (
        !actor.alive ||
        actor.inDen ||
        actor.underground ||
        !actor.huntingOpen ||
        !actor.homeTerritory
      )
        continue;
      const target = actor.destination ?? actor.homeTerritory;
      const dx = target.x - actor.x;
      const dz = target.z - actor.z;
      const step = Math.min(1, 13 / Math.max(1, Math.hypot(dx, dz)));
      trails.set(actor, {
        start: { x: actor.x, z: actor.z },
        end: { x: actor.x + dx * step, z: actor.z + dz * step },
        radius: actor.kind === 'wolf' ? 11 : 7,
        strength: actor.kind === 'wolf' ? 3.8 : 2.4,
      });
    }
    habitats.updateHuntingTrails(clock, trails);
    for (const animal of this.animals) {
      if (
        this.families?.owns(animal) ||
        this.shore?.prepare(animal, clock, winter) ||
        !animal.habitat
      )
        continue;
      const intent = habitats.intent(animal.habitat, clock);
      const { destination } = intent;
      const resting =
        intent.resting ||
        (winter && animal.habitat.profile.dormantInWinter) ||
        (animal.kind === 'boar' &&
          clock % 1440 > 320 &&
          clock % 1440 < 960 &&
          habitats.riskAt(animal.x, animal.z) > 1.6);
      animal.foragingAllowed = !resting;
      animal.destination =
        animal.habitat.profile.mode === 'roaming' && !resting
          ? habitats.nearHome(destination, animal.habitatSlot ?? 0)
          : destination;
      animal.restAt = resting ? (animal.shelter?.entrance ?? animal.destination) : undefined;
    }
    this.families?.update(clock, player, winter, winter && this.seasons.name(day + 4) !== 'Зима');
    this.shore?.update(clock, season === 'Весна', player);
    this.pheasants?.update(clock, season === 'Весна', player);
    this.territories?.smallFauna?.()?.prepare();
    if (!land)
      for (const predator of predators)
        if (predator.kind !== 'wolf' && predator.homeTerritory)
          predator.followTerritory(habitats.intent(predator.homeTerritory, clock));
  }

  prepareDenDefense(
    time: number,
    player: { x: number; z: number } | undefined,
    combat: boolean,
  ): void {
    this.territories?.wolves.prepareDefense(time, player, combat);
  }

  private place(animal: ForestAnimal, x: number, z: number): void {
    if (typeof this.world.waterAt === 'function') animal.useWater(this.water);
    const water = this.world.waterAt?.(x, z);
    const level =
      animal.kind === 'fish' && water
        ? Math.max(this.world.heightAt(x, z) + 0.15, water.level - 0.42)
        : water && animal.profile.swimImmersion !== undefined
          ? Math.max(this.world.heightAt(x, z), water.level - animal.swimImmersion)
          : this.world.heightAt(x, z);
    animal.moveTo(x, z, level);
  }

  private readonly preyScore = (kind: PredatorKind, point: HabitatPoint) =>
    this.huntingGrounds.score(kind, point);

  updateRabbitTerritory(actor: RabbitActor, dt: number, time: number, earth: Excavation): boolean {
    const hunting = actor.solitary && actor.root.userData.hunting === true;
    return this.neighborTerritories?.update(actor, dt, time, earth, hunting) ?? false;
  }

  targetFor(
    predator: Predator,
    predators: readonly Predator[],
    time: number,
    lostKits: readonly RabbitActor[] = [],
  ): { x: number; z: number } | undefined {
    if (predator.underground || predator.inDen || !predator.alive || !predator.huntsWildlife)
      return;
    const rivalAtDen = predator.defenseRival;
    if (rivalAtDen) {
      this.preyTargets.delete(predator);
      return rivalAtDen;
    }
    if (!predator.huntingOpen) {
      this.preyTargets.delete(predator);
      return;
    }

    let current = this.preyTargets.get(predator);
    if (
      current &&
      (time > current.until ||
        !this.canHunt(current.target) ||
        AnimalRestraint.active(current.target.root) ||
        !predator.canPursue(current.target.x, current.target.z) ||
        Math.hypot(current.target.x - predator.x, current.target.z - predator.z) > 22)
    ) {
      this.preyTargets.delete(predator);
      current = undefined;
    }

    if (!current && time >= (this.nextPreySearch.get(predator) ?? -Infinity)) {
      this.nextPreySearch.set(predator, time + 0.68);
      let prey: ForestAnimal | RabbitActor | undefined;
      let best = Infinity;
      const consider = (actor: ForestAnimal | RabbitActor, distance: number) => {
        if (
          !this.canHunt(actor) ||
          AnimalRestraint.active(actor.root) ||
          !predator.canPursue(actor.x, actor.z)
        )
          return;
        const preference = preyRank(predator.kind, actor);
        if (preference < 0 || distance >= 14) return;
        const score = distance - preference * 1.7 - (actor.juvenile ? 1.5 : 0);
        if (score < best) {
          best = score;
          prey = actor;
        }
      };
      if (this.territories) this.huntingGrounds.around(predator, consider);
      else
        for (const actor of this.animals)
          consider(actor, Math.hypot(actor.x - predator.x, actor.z - predator.z));
      for (const kit of lostKits) consider(kit, Math.hypot(kit.x - predator.x, kit.z - predator.z));
      const rival =
        !prey && this.rng.chance(0.4)
          ? predators
              .filter(
                (p) =>
                  p !== predator &&
                  p.alive &&
                  !p.underground &&
                  !p.inDen &&
                  p.kind !== predator.kind &&
                  predator.canPursue(p.x, p.z) &&
                  Math.abs(p.root.position.y - predator.root.position.y) < 1.5 &&
                  Math.hypot(p.x - predator.x, p.z - predator.z) < 9,
              )
              .sort(
                (a, b) =>
                  Math.hypot(a.x - predator.x, a.z - predator.z) -
                  Math.hypot(b.x - predator.x, b.z - predator.z),
              )[0]
          : undefined;
      if (prey || rival) {
        current = { target: (prey ?? rival)!, until: time + this.rng.range(4, 8) };
        this.preyTargets.set(predator, current);
      }
    }

    return current?.target;
  }

  update(
    dt: number,
    time: number,
    clock: number,
    px: number,
    pz: number,
    groundAt: GroundHeight,
    predators: Predator[],
    combatAllowed = true,
  ): WildlifeEvent[] {
    const events: WildlifeEvent[] = [];
    this.prepareHabitats(time, clock, predators, { x: px, z: pz });
    this.territories?.smallFauna?.()?.update(time);
    if (time >= this.nextFoodSearch) {
      this.nextFoodSearch = time + 3;
      const season = this.seasons.name(Math.floor(clock / 1440) + 1);
      for (const animal of this.animals) {
        let best: ForageTarget | undefined;
        if (animal.foragingAllowed && !animal.inShelter) {
          const plant = this.pheasants?.owns(animal)
            ? undefined
            : this.forage.find(animal, this.risk, season);
          const patch = animal.destination;
          if (plant) best = { kind: 'plant', plant };
          else if (patch && LITTER_FORAGERS.has(animal.kind) && this.risk(patch.x, patch.z) < 1.5)
            best = { kind: 'ground', point: patch };
        }
        if (best) this.foodTargets.set(animal, best);
        else this.foodTargets.delete(animal);
      }
    }

    const threats = predators.filter(
      (p) => p.alive && !p.juvenile && !p.underground && !p.inDen && p.huntingOpen,
    );
    for (const animal of this.animals) {
      if (combatAllowed && animal.kind === 'bear' && !animal.inShelter) {
        const den = this.families?.careAt(animal);
        const rival = den && threats.find((p) => Math.hypot(p.x - den.x, p.z - den.z) < 6);
        if (rival && Math.hypot(rival.x - animal.x, rival.z - animal.z) < 9)
          animal.guardAgainst(rival, time);
      }
      const food =
        animal.foragingAllowed && !animal.inShelter ? this.foodTargets.get(animal) : undefined;
      const plant = food?.kind === 'plant' ? food.plant : undefined;
      const groundFood =
        food?.kind === 'ground'
          ? food.point
          : animal.foragingAllowed && this.pheasants?.owns(animal)
            ? animal.destination
            : undefined;
      const target = plant?.available ? plant : groundFood;
      if (animal.update(dt, time, groundAt, threats, target) && plant?.available) {
        this.world.harvest(plant, clock, animal.root);
        this.foodTargets.delete(animal);
      }
    }

    for (const predator of predators) {
      if (!combatAllowed) continue;
      if (
        !predator.alive ||
        predator.underground ||
        predator.inDen ||
        predator.huntingPlayer ||
        predator.attackCooldown > 0 ||
        !predator.canMelee
      )
        continue;

      const victim = predator.defenseRival ?? this.preyTargets.get(predator)?.target;
      if (
        !victim ||
        !this.canHunt(victim) ||
        AnimalRestraint.active(victim.root) ||
        !predator.canEngagePrey(victim)
      )
        continue;
      if (Math.abs(victim.root.position.y - predator.root.position.y) > 1.5) continue;

      const reach = predator.profile.preyReach;
      if (Math.hypot(victim.x - predator.x, victim.z - predator.z) > reach) continue;

      predator.attackCooldown = predator.profile.preyCooldown;
      predator.playAttack(time);
      const damage = predator.profile.damage;
      if (victim instanceof Predator) {
        victim.receiveAttack(damage, time, predator);
        if (victim.alive && victim.canMelee)
          predator.receiveAttack(victim.profile.counterDamage, time, victim);

        events.push({
          kind: 'fight',
          x: predator.x,
          z: predator.z,
          subject: `${predator.kind} и ${victim.kind}`,
        });
      } else if (victim instanceof RabbitActor) {
        victim.health = Math.max(0, victim.health - damage);
        victim.data.health = victim.health;
        if (!victim.alive)
          events.push({ kind: 'hunt', x: victim.x, z: victim.z, subject: victim.data.name });
      } else {
        const counter = victim.receiveAttack(damage, time, predator);
        if (counter) {
          predator.receiveAttack(counter, time, victim);
          events.push({
            kind: 'defend',
            x: victim.x,
            z: victim.z,
            subject: animalNames[victim.kind],
          });
        }

        if (!victim.alive)
          events.push({
            kind: 'hunt',
            x: victim.x,
            z: victim.z,
            subject: animalNames[victim.kind],
          });
      }

      if (!victim.alive && !(victim instanceof Predator)) this.provisionKill(predator, clock);
      this.preyTargets.delete(predator);
    }

    for (let i = this.animals.length - 1; i >= 0; i--)
      if (!this.animals[i].alive) {
        const animal = this.animals.splice(i, 1)[0];
        this.onDeath?.(animal);
        this.families?.onDeath(animal, clock);
        this.shore?.onDeath(animal);
        ModelAssets.shared.release(animal.root);
        animal.root.removeFromParent();
        this.foodTargets.delete(animal);
      }

    for (let i = predators.length - 1; i >= 0; i--)
      if (!predators[i].alive) {
        const predator = predators.splice(i, 1)[0];
        this.onDeath?.(predator);
        this.territories?.wolves.onDeath(predator, clock);
        this.territories?.land?.onDeath(predator, clock);
        this.territories?.smallFauna?.()?.onDeath(predator);
        ModelAssets.shared.release(predator.root);
        predator.root.removeFromParent();
        this.preyTargets.delete(predator);
      }

    if (time >= this.nextSpawn) {
      this.nextSpawn = time + this.rng.range(24, 42);
      const counts = (this.save?.worldConfig ?? defaultWorldConfig()).creatures;
      const candidates = (['deer', 'squirrel', ...WILDLIFE_KINDS] as const).filter(
        (kind) =>
          (!this.shore || (kind !== 'fish' && kind !== 'frog' && kind !== 'duck')) &&
          (kind !== 'pheasant' || (this.pheasants?.canImmigrate() ?? true)) &&
          (this.world.waterSources.length > 0 ||
            (kind !== 'duck' && kind !== 'fish' && kind !== 'frog')) &&
          (this.families?.canImmigrate(kind, clock) ?? true) &&
          this.animals.filter((animal) => animal.kind === kind).length < counts[kind],
      );
      if (candidates.length) {
        const kind = this.rng.pick(candidates);
        const slots = new Set(
          this.animals.filter((animal) => animal.kind === kind).map((animal) => animal.habitatSlot),
        );
        let slot = 0;
        while (slots.has(slot)) slot++;
        const animal = this.spawn(kind, px, pz, false, slot);
        if (animal) {
          this.families?.onImmigration(kind, clock);
          events.push({ kind: 'arrival', x: animal.x, z: animal.z, subject: animalNames[kind] });
        }
      }
    }

    this.territories?.wolves.update(time, clock, { x: px, z: pz });
    this.territories?.land?.update(clock, { x: px, z: pz });
    return events;
  }

  private readonly risk = (x: number, z: number) => this.territories?.habitats.riskAt(x, z) ?? 0;

  private canHunt(target: Target): boolean {
    return (
      target.alive &&
      (!(target instanceof ForestAnimal) || !target.inShelter) &&
      (!(target instanceof RabbitActor) ||
        (target.data.lost
          ? target.root.userData.lostKitExposed === true
          : target.data.id !== this.save?.mateId && !target.inShelter))
    );
  }

  capture(): void {
    if (!this.save) return;
    this.neighborTerritories?.capture();
    this.pheasants?.capture();
    this.save.wildlife = this.animals
      .filter(
        (animal) =>
          animal.alive &&
          !this.families?.owns(animal) &&
          !this.shore?.owns(animal) &&
          !this.pheasants?.owns(animal),
      )
      .map((animal) => ({
        id: animal.socialId,
        habitatSlot: animal.habitatSlot,
        waterBody: animal.waterBody,
        mammalId: animal.mammalId,
        mammalOrigin: animal.mammalOrigin,
        inShelter: animal.inShelter && animal.shelter ? true : undefined,
        kind: animal.kind,
        x: animal.x,
        z: animal.z,
        health: animal.health,
        social: { ...animal.social },
        appearance: { ...animal.appearance },
      }));
    this.families?.capture();
    this.shore?.capture();
    this.territories?.wolves.capture();
    this.territories?.land?.capture();
    this.territories?.smallFauna?.()?.capture();
  }
}
