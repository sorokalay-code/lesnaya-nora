import type { Scene } from 'three';
import type { ForestAnimal } from './animals';
import type { Habitat, HabitatPoint } from './AnimalHabitats';
import {
  AquaticHabitats,
  FISH_MIN_DEPTH,
  inWaterPath,
  type AquaticHabitat,
} from './AquaticHabitats';
import { AquaticCohorts } from './AquaticCohorts';
import { DuckBroods } from './DuckBroods';
import { hash2 } from './Random';
import type { SaveData } from './types';
import type { World } from './World';
import { defaultWorldConfig } from './WorldConfig';
import { WildlifeRoutine } from './WildlifeRoutine';
import type { WildlifeShelters } from './WildlifeShelters';
import { isNightAt } from './session/WorldCalendar';
import { Frog } from './animals/Frog';

export type ShoreKind = 'beaver' | 'duck' | 'fish' | 'frog';

interface Placement {
  site: AquaticHabitat;
  point: HabitatPoint;
  home?: Habitat;
}

interface Context {
  world: World;
  save: SaveData;
  scene: Scene;
  animals: readonly ForestAnimal[];
  shelters: WildlifeShelters;
  create: (kind: ShoreKind, at: HabitatPoint, socialId?: number) => ForestAnimal;
  depart: (actor: ForestAnimal) => void;
}

const DAY = 1440;
const SCHOOL_SIZE = 4;
const SHOAL_ROUTE_MINUTES = 45;

export function shoreKind(kind: string): kind is ShoreKind {
  return kind === 'beaver' || kind === 'duck' || kind === 'fish' || kind === 'frog';
}

/** Распределяет береговых животных по водоёмам и ведёт их суточные маршруты и размножение. */
export class ShoreEcology {
  readonly habitats: AquaticHabitats;
  private readonly broods: DuckBroods;
  private readonly cohorts: AquaticCohorts;
  private readonly config;
  private readonly positions = new Map<string, Placement>();
  private readonly schoolRoutes = new Map<string, { phase: number; target: HabitatPoint }>();

  constructor(private readonly context: Context) {
    const { world, save, scene, animals, shelters } = context;
    this.config = save.worldConfig ?? defaultWorldConfig();
    this.habitats = new AquaticHabitats(world, world.terrain.water.bodies, save.seed);
    this.broods = new DuckBroods({
      save,
      habitats: this.habitats,
      shelters,
      scene,
      ducks: animals,
      create: (site, point, saved) => {
        const actor = context.create('duck', saved ?? point, saved?.id);
        actor.useWaterBody(site.body.id);
        return actor;
      },
      settle: (actor, site) => this.settleDuck(actor, site),
      depart: context.depart,
      enabled: () => this.config.creatures.duck > 0,
    });
    this.cohorts = new AquaticCohorts({
      save,
      habitats: this.habitats,
      terrain: world,
      scene,
      kinds: ['fish', 'frog'],
      enabled: (kind) => this.config.creatures[kind] > 0,
      adults: (kind, body) =>
        animals.filter((actor) => actor.kind === kind && actor.alive && actor.waterBody === body)
          .length,
      settle: (kind, site, point) => {
        if (kind === 'pike') return false;
        const slot = this.freeSlot(kind, site);
        if (slot === undefined) return false;
        const actor = context.create(kind, point);
        this.apply(actor, kind, slot, site);
        return true;
      },
    });
  }

  restore(): void {
    this.broods.restore();
  }

  dispose(): void {
    this.broods.dispose();
    this.cohorts.dispose();
  }

  owns(actor: ForestAnimal): boolean {
    return this.broods.owns(actor);
  }

  onDeath(actor: ForestAnimal): void {
    this.broods.onDeath(actor);
  }

  capture(): void {
    this.broods.capture();
  }

  spawn(kind: ShoreKind, slot: number, player?: HabitatPoint): ForestAnimal | undefined {
    const placement = this.placement(kind, slot);
    if (
      !placement ||
      (player && Math.hypot(placement.point.x - player.x, placement.point.z - player.z) < 22)
    )
      return;
    const actor = this.context.create(kind, placement.point);
    this.apply(actor, kind, slot, placement.site);
    return actor;
  }

  restoreAdult(
    actor: ForestAnimal,
    kind: ShoreKind,
    slot: number,
    body?: string,
    inside = false,
  ): boolean {
    const placement = this.placement(kind, slot, body);
    if (!placement) return false;
    const { world } = this.context;
    const water = world.waterAt(actor.x, actor.z);
    const belongs = water ? water.body.id === placement.site.body.id : kind !== 'fish';
    const suitable =
      kind === 'fish'
        ? (water?.depth ?? 0) >= FISH_MIN_DEPTH
        : Math.hypot(actor.x - placement.point.x, actor.z - placement.point.z) < 36;
    if (!belongs || !suitable) {
      const { x, z } = placement.point;
      const depth = world.waterAt(x, z);
      const floor = world.heightAt(x, z);
      const y = depth
        ? Math.max(floor + 0.1, depth.level - (kind === 'fish' ? 0.4 : actor.swimImmersion))
        : floor;
      actor.moveTo(x, z, y);
    }
    this.apply(actor, kind, slot, placement.site, inside);
    return true;
  }

  beaverHome(slot: number, body?: string): Habitat | undefined {
    return this.placement('beaver', slot, body)?.home;
  }

  beaverShelter(slot: number, home: Habitat) {
    return this.shelter('beaver', slot, this.habitats.forSlot('beaver', slot, home.waterBody));
  }

  canSettleBeaver(actor: ForestAnimal, slot: number): boolean {
    const previous = this.context.shelters.get('beaver', slot)?.site.waterBody;
    return this.habitats.forSlot('beaver', slot, previous)?.body.id === actor.waterBody;
  }

  settleBeaver(actor: ForestAnimal, slot: number): void {
    const placement = this.placement('beaver', slot, actor.waterBody);
    if (placement) this.apply(actor, 'beaver', slot, placement.site);
  }

  prepare(actor: ForestAnimal, clock: number, winter: boolean): boolean {
    const kind = actor.kind;
    const site = actor.waterBody && this.habitats.get(actor.waterBody);
    if (!shoreKind(kind) || !site) return false;
    if (this.owns(actor)) return true;
    const slot = actor.habitatSlot ?? 0;
    const minute = clock % DAY;
    actor.restAt = undefined;
    actor.foragingAllowed = false;
    if (kind === 'fish') {
      actor.destination = this.schoolTarget(actor, site, slot, clock);
    } else {
      const bank = this.habitats.bank(site, slot);
      const phase = Math.floor((clock + slot * 9) / 85);
      if (kind === 'frog') {
        if (actor instanceof Frog)
          actor.restForWinter(winter, {
            ...bank.shallows,
            y: this.context.world.heightAt(bank.shallows.x, bank.shallows.z),
          });
        const wet =
          winter || (isNightAt(clock) && this.context.save.weather !== 'rain') || phase % 3 === 0;
        actor.destination = wet ? bank.shallows : bank.dry;
      } else if (kind === 'beaver') {
        const outing = (minute >= 930 && minute < 1360) || (minute >= 285 && minute < 500);
        const nest = actor.shelter;
        const resting = !outing || (winter && minute < 850);
        actor.destination = phase % 3 === 0 ? bank.shallows : (nest?.entrance ?? bank.dry);
        if (resting) {
          actor.restAt = nest?.entrance ?? bank.dry;
          actor.destination = actor.restAt;
        } else actor.foragingAllowed = phase % 3 !== 0;
      } else {
        const resting = isNightAt(clock);
        actor.destination = phase % 3 === 0 ? bank.dry : bank.shallows;
        if (resting) actor.restAt = actor.shelter?.entrance ?? bank.dry;
        else actor.foragingAllowed = phase % 3 === 0;
      }
    }
    return true;
  }

  update(clock: number, spring: boolean, player: HabitatPoint): void {
    this.broods.update(clock, spring, player);
    this.cohorts.update(clock, spring, player);
  }

  private placement(kind: ShoreKind, slot: number, savedBody?: string): Placement | undefined {
    const existing =
      kind === 'beaver' || kind === 'duck' ? this.context.shelters.get(kind, slot) : undefined;
    const site = this.habitats.forSlot(kind, slot, existing?.site.waterBody ?? savedBody);
    if (!site) return;
    const key = `${kind}:${slot}:${site.body.id}`;
    const cached = this.positions.get(key);
    if (cached) return cached;

    let point: HabitatPoint | undefined;
    let home: Habitat | undefined;
    if (kind === 'fish') {
      const anchor = this.habitats.pick(site.fish, Math.floor(slot / SCHOOL_SIZE));
      if (anchor) {
        const angle = slot * 2.399963;
        const offset = {
          x: anchor.x + Math.sin(angle) * 0.43,
          z: anchor.z + Math.cos(angle) * 0.43,
        };
        const sample = this.context.world.waterAt(offset.x, offset.z);
        point =
          sample?.body.id === site.body.id && sample.depth >= FISH_MIN_DEPTH ? offset : anchor;
      }
    } else if (kind === 'frog') {
      point = this.habitats.bank(site, slot).shallows;
    } else {
      home = this.habitats.shoreHome(kind, slot, site.body.id);
      const shore = this.shelter(kind, slot, site);
      point = shore?.approach ?? this.habitats.bank(site, slot).dry;
    }
    if (!point) return;
    const result = { site, point, home };
    this.positions.set(key, result);
    return result;
  }

  private apply(
    actor: ForestAnimal,
    kind: ShoreKind,
    slot: number,
    site: AquaticHabitat,
    inside = false,
  ): void {
    actor.habitatSlot = slot;
    actor.useWaterBody(site.body.id);
    if (kind !== 'beaver' && kind !== 'duck') return;
    actor.habitat = this.habitats.shoreHome(kind, slot, site.body.id);
    const shelter = this.shelter(kind, slot, site);
    actor.useRoutine(
      new WildlifeRoutine(shelter, this.context.shelters.navigationHeight(shelter)),
      inside,
    );
  }

  private shelter(kind: 'beaver' | 'duck', slot: number, site?: AquaticHabitat) {
    if (!site) return;
    return this.context.shelters.placeShore(kind, slot, site, this.habitats.bank(site, slot));
  }

  private settleDuck(actor: ForestAnimal, site: AquaticHabitat): boolean {
    const slot = this.freeSlot('duck', site);
    if (slot === undefined) return false;
    this.apply(actor, 'duck', slot, site);
    return true;
  }

  private freeSlot(kind: ShoreKind, site: AquaticHabitat): number | undefined {
    const used = new Set(
      this.context.animals
        .filter((actor) => actor.kind === kind && actor.alive)
        .map((actor) => actor.habitatSlot),
    );
    for (let slot = 0; slot < this.config.creatures[kind]; slot++)
      if (!used.has(slot) && this.habitats.forSlot(kind, slot)?.body.id === site.body.id)
        return slot;
  }

  private schoolTarget(
    actor: ForestAnimal,
    site: AquaticHabitat,
    slot: number,
    clock: number,
  ): HabitatPoint {
    const { world, save } = this.context;
    const school = Math.floor(slot / SCHOOL_SIZE);
    const phase = Math.floor(clock / SHOAL_ROUTE_MINUTES);
    const key = `${site.body.id}:${school}`;
    let plan = this.schoolRoutes.get(key);
    if (!plan || plan.phase !== phase) {
      const anchor = this.habitats.pick(site.fish, school);
      if (!anchor) return actor;
      const preferred = {
        x: anchor.x + (hash2(school, phase, save.seed) - 0.5) * 13,
        z: anchor.z + (hash2(school, phase, save.seed ^ 116) - 0.5) * 13,
      };
      plan = { phase, target: this.habitats.closest(site.fish, preferred) ?? anchor };
      this.schoolRoutes.set(key, plan);
    }
    const route = plan.target;
    const offset = {
      x: route.x + Math.cos(slot * 2.399963) * 0.72,
      z: route.z + Math.sin(slot * 2.399963) * 0.72,
    };
    const waterAt = (x: number, z: number) => world.waterAt(x, z);
    if (inWaterPath(waterAt, actor, offset, site.body.id, FISH_MIN_DEPTH)) return offset;
    if (inWaterPath(waterAt, actor, route, site.body.id, FISH_MIN_DEPTH)) return route;

    let best: HabitatPoint = actor;
    let score = Infinity;
    for (const point of site.fish) {
      const d = Math.hypot(point.x - actor.x, point.z - actor.z);
      const candidate = Math.hypot(point.x - route.x, point.z - route.z);
      if (
        d > 12 ||
        d < 0.8 ||
        candidate >= score ||
        !inWaterPath(waterAt, actor, point, site.body.id, FISH_MIN_DEPTH)
      )
        continue;
      best = point;
      score = candidate;
    }
    return best;
  }
}
