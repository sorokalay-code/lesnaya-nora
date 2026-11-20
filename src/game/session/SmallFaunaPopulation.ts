import type { Scene } from 'three';
import { AnimalFactory, type Predator } from '../animals';
import { Spider } from '../animals/Spider';
import { JumpingSpider } from '../animals/JumpingSpider';
import type { HabitatPoint } from '../AnimalHabitats';
import type { AnimalHabitats } from '../AnimalHabitats';
import { ModelAssets } from '../ModelAssets';
import { Random } from '../Random';
import {
  SmallFaunaCohorts,
  SMALL_FAUNA_KINDS,
  type SmallFaunaCohort,
  type SmallFaunaKind,
} from '../SmallFaunaCohorts';
import { SmallFaunaVisuals } from '../SmallFaunaVisuals';
import { SeasonSystem } from '../systems';
import type { DigNode, SaveData, Season } from '../types';
import type { World } from '../World';
import type { WildlifeShelters } from '../WildlifeShelters';
import { WildlifeRoutine } from '../WildlifeRoutine';
import { defaultWorldConfig } from '../WorldConfig';
import type { LandPredators } from './LandPredators';
import type { WebAnchor } from '../SpiderWeb';
import { isNightAt } from './WorldCalendar';

export interface SpiderState extends DigNode {
  kind: 'spider' | 'jumping-spider';
  id: string;
  slot: number;
  health: number;
  origin: HabitatPoint;
  anchors?: { a: WebAnchor; b: WebAnchor };
  inside?: true;
}

interface Context {
  save: SaveData;
  scene: Scene;
  world: World;
  predators: Predator[];
  habitats: AnimalHabitats;
  shelters: WildlifeShelters;
  land: LandPredators;
  onArrival?: (actor: Predator) => void;
  onDeparture?: (actor: Predator) => void;
}

const DAY = 1440;
const FIRST_ID = 1000000;
const IMMIGRATION_DELAY = 3 * DAY;
const SEASONAL_MINIMUM = 7;
const SNAKE_REFUGE_TEMPERATURE = 8;
const SNAKE_HUNTING_TEMPERATURE = 14;
const INSECT_FLIGHT_TEMPERATURE = 9;

export function isSmallFaunaKind(kind: string): kind is SmallFaunaKind {
  return kind === 'spider' || kind === 'jumping-spider' || kind === 'snake';
}

/** Связывает укрытия пауков, температурную активность и ограниченное заселение малых животных. */
export class SmallFaunaPopulation {
  private readonly config;
  private readonly seasons: SeasonSystem;
  private readonly cohorts: SmallFaunaCohorts;
  private readonly visuals: SmallFaunaVisuals;
  private readonly spiderHomes = new WeakMap<Predator, DigNode>();
  private readonly breedingSites = new Map<string, DigNode>();
  private nextImmigration = 0;

  constructor(private readonly context: Context) {
    const { save, world, scene, predators } = context;
    this.config = save.worldConfig ?? defaultWorldConfig();
    this.seasons = new SeasonSystem(save.seed, this.config.seasonLengths);
    this.cohorts = new SmallFaunaCohorts(save);
    this.visuals = new SmallFaunaVisuals(
      scene,
      (x, z) => world.heightAt(x, z),
      (x, z) =>
        Math.max(Math.abs(x), Math.abs(z)) < this.config.size * 0.87 &&
        (world.waterAt?.(x, z)?.depth ?? 0) < 0.035,
    );
    if (save.spiders) {
      for (const actor of predators.slice())
        if (actor.kind === 'spider' || actor.kind === 'jumping-spider') this.depart(actor);
      for (const state of save.spiders) {
        if (
          state.slot >= this.config.creatures[state.kind] ||
          save.deadPopulation?.includes(state.id)
        )
          continue;
        const actor = this.makeSpider(
          state.kind,
          state.slot,
          state.origin,
          state.id,
          state.anchors,
        );
        actor.health = state.health;
        actor.moveTo(state.x, state.z, state.y);
        if (actor instanceof Spider)
          actor.restoreHeight(state.y - world.heightAt(state.x, state.z));
        else if (state.inside && actor.shelter)
          actor.useRoutine(new WildlifeRoutine(actor.shelter, context.shelters.routeHeight), true);
      }
    } else {
      for (const kind of ['spider', 'jumping-spider'] as const) {
        const actors = predators.filter((actor) => actor.kind === kind);
        for (const [index, actor] of actors.entries()) {
          const slot = actor.habitatSlot ?? index;
          actor.habitatSlot = slot;
          this.attachSpider(actor, slot);
        }
      }
    }
    this.prepare();
  }

  prepare(): void {
    const { save, predators, shelters } = this.context;
    const day = Math.floor(save.clock / DAY) + 1;
    const season = this.seasons.name(day);
    const night = isNightAt(save.clock);
    const air = this.seasons.temperature(day, save.clock, save.weather);
    const available = new Map<SmallFaunaKind, Predator[]>();
    for (const actor of predators) {
      if (!isSmallFaunaKind(actor.kind) || !actor.alive) continue;
      const adults = available.get(actor.kind) ?? [];
      adults.push(actor);
      available.set(actor.kind, adults);
      const offset = this.context.world.temperatureOffset?.(actor.x, actor.z) ?? 0;
      const temperature = air + offset;
      if (actor instanceof Spider) {
        actor.setEcology(
          season !== 'Зима' && temperature > SEASONAL_MINIMUM,
          this.insectFood(season, temperature),
        );
      } else if (actor.kind === 'jumping-spider') {
        const rest = season === 'Зима' || night || temperature <= SEASONAL_MINIMUM;
        actor.restAt = rest ? (actor.shelter?.entrance ?? this.spiderHomes.get(actor)) : undefined;
        actor.foragingAllowed = !rest;
        if (actor instanceof JumpingSpider)
          actor.forageForInsects(!rest && this.insectFood(season, temperature));
      } else {
        const cold = season === 'Зима' || night || temperature < SNAKE_REFUGE_TEMPERATURE;
        const warm = !cold && temperature >= SNAKE_HUNTING_TEMPERATURE;
        actor.foragingAllowed = warm;
        if (cold) actor.restAt = actor.shelter?.entrance ?? actor.homeTerritory;
        else if (!warm) {
          const at = actor.shelter?.approach ?? actor.homeTerritory;
          actor.restAt = at;
        }
      }
      const slot = actor.habitatSlot;
      if (slot === undefined || slot % 2) continue;
      const siteKey = `${actor.kind}:${slot}`;
      let nest = this.breedingSites.get(siteKey);
      if (!nest) {
        nest =
          this.spiderHomes.get(actor) ??
          (actor.kind === 'snake' ? shelters.get('snake', slot)?.approach : undefined);
        if (nest) this.breedingSites.set(siteKey, nest);
      }
    }

    for (const [kind, adults] of available) {
      if (kind !== 'snake' && !this.insectFood(season, air)) continue;
      for (const mother of adults) {
        const slot = mother.habitatSlot;
        if (slot === undefined || slot % 2 || mother.health < mother.maxHealth * 0.5) continue;
        if (
          !adults.some(
            (mate) =>
              mate !== mother &&
              (mate.habitatSlot ?? 0) % 2 === 1 &&
              Math.hypot(mate.x - mother.x, mate.z - mother.z) < 100,
          )
        )
          continue;
        const home = this.breedingSites.get(`${kind}:${slot}`);
        if (home)
          this.cohorts.breed(
            kind,
            slot,
            String(mother.root.userData.remainsIdentity),
            home,
            season,
          );
      }
    }
    const living = new Set(
      predators
        .filter((actor) => actor.alive)
        .map((actor) => String(actor.root.userData.remainsIdentity)),
    );
    this.cohorts.advance(
      season,
      (parent) => living.has(parent),
      (cohort) => this.recruit(cohort),
    );
    this.immigrate(season);
  }

  update(time: number): void {
    const { save } = this.context;
    this.visuals.update(
      this.cohorts.records,
      save.clock,
      time,
      save.player,
      this.seasons.name(Math.floor(save.clock / DAY) + 1) === 'Зима',
    );
  }

  onDeath(actor: Predator): void {
    if (!isSmallFaunaKind(actor.kind)) return;
    const save = this.context.save;
    if (actor.kind === 'snake')
      this.cohorts.motherDied(String(actor.root.userData.remainsIdentity));
    (save.smallFaunaImmigration ??= {})[actor.kind] = save.clock + IMMIGRATION_DELAY;
  }

  capture(): void {
    this.context.save.spiders = this.context.predators.flatMap((actor) => {
      if (!actor.alive || (actor.kind !== 'spider' && actor.kind !== 'jumping-spider')) return [];
      return [
        {
          kind: actor.kind,
          id: String(actor.root.userData.remainsIdentity),
          slot: actor.habitatSlot ?? 0,
          x: actor.x,
          y: actor.root.position.y,
          z: actor.z,
          health: actor.health,
          origin: { ...actor.origin },
          anchors: actor instanceof Spider ? actor.habitat : undefined,
          inside: actor.inDen ? (true as const) : undefined,
        },
      ];
    });
  }

  dispose(): void {
    this.visuals.dispose();
  }

  private insectFood(season: Season, temperature: number): boolean {
    return (
      season !== 'Зима' && temperature > INSECT_FLIGHT_TEMPERATURE && this.config.vegetation > 0
    );
  }

  private attachSpider(actor: Predator, slot: number): void {
    const { world, shelters, habitats } = this.context;
    if (actor instanceof Spider && actor.habitat) {
      const { a } = actor.habitat;
      const refuge = { x: a.x + 0.65, y: world.heightAt(a.x + 0.65, a.z) + 4.2, z: a.z };
      this.spiderHomes.set(actor, refuge);
      this.visuals.retreat(`spider:${slot}`, refuge, true);
      return;
    }
    const home = habitats.predator(actor.kind, slot);
    const shelter =
      home && (actor.kind === 'spider' || actor.kind === 'jumping-spider')
        ? shelters.place(actor.kind, slot, home)
        : undefined;
    if (shelter) {
      actor.useRoutine(new WildlifeRoutine(shelter, shelters.routeHeight));
      this.spiderHomes.set(actor, shelter.entrance);
      if (actor instanceof Spider) {
        actor.useGroundRetreat(shelter.entrance);
        actor.configureGroundWeb(shelter.approach, world.heightAt.bind(world));
        const { x, y, z } = shelter.entrance;
        actor.moveTo(x, z, y);
      }
      if ((world.waterAt?.(actor.x, actor.z)?.depth ?? 0) > 0.035) {
        const { x, y, z } = shelter.approach;
        actor.moveTo(x, z, y);
      }
    } else {
      const at = {
        x: actor.origin.x,
        y: world.heightAt(actor.origin.x, actor.origin.z),
        z: actor.origin.z,
      };
      this.spiderHomes.set(actor, at);
      this.visuals.retreat(`${actor.kind}:${slot}`, at, false);
      if (actor instanceof Spider) actor.useGroundRetreat(at);
    }
  }

  private recruit(cohort: SmallFaunaCohort): boolean {
    const slot = this.vacancy(cohort.kind);
    if (slot === undefined) return false;
    return this.arrive(cohort.kind, slot);
  }

  private immigrate(season: Season): void {
    const { save } = this.context;
    if (save.clock < this.nextImmigration || season === 'Зима') return;
    this.nextImmigration = save.clock + 60;
    for (const kind of SMALL_FAUNA_KINDS) {
      if (this.cohorts.reserves(kind)) continue;
      const vacancy = this.vacancy(kind);
      if (vacancy === undefined) continue;
      const calendar = (save.smallFaunaImmigration ??= {});
      calendar[kind] ??= save.clock + IMMIGRATION_DELAY;
      if (save.clock < calendar[kind]!) continue;
      const home = this.context.habitats.predator(kind, vacancy);
      if (!home || !this.arrive(kind, vacancy)) continue;
      calendar[kind] = save.clock + DAY;
    }
  }

  private vacancy(kind: SmallFaunaKind): number | undefined {
    const occupied = new Set(
      this.context.predators
        .filter((actor) => actor.alive && actor.kind === kind)
        .map((actor) => actor.habitatSlot),
    );
    for (let slot = 0; slot < this.config.creatures[kind]; slot++) {
      if (!occupied.has(slot)) return slot;
    }
  }

  private arrive(kind: SmallFaunaKind, slot: number): boolean {
    const { save, world, shelters, habitats, land } = this.context;
    const home = habitats.predator(kind, slot);
    if (!home) return false;
    const shelter = shelters.place(kind, slot, home);
    const at = shelter?.approach ?? home;
    if (
      Math.hypot(at.x - save.player.x, at.z - save.player.z) < 26 ||
      (shelter &&
        Math.hypot(shelter.entrance.x - save.player.x, shelter.entrance.z - save.player.z) < 26) ||
      (world.waterAt?.(at.x, at.z)?.depth ?? 0) > 0.035
    )
      return false;
    const id = save.nextSmallFaunaId ?? FIRST_ID;
    const identity = `predator:${id}`;
    save.nextSmallFaunaId = id + 1;
    if (kind === 'snake') land.recruitSnake(slot, identity, at, new Random(save.seed ^ id));
    else this.makeSpider(kind, slot, at, identity);
    return true;
  }

  private makeSpider(
    kind: SpiderState['kind'],
    slot: number,
    origin: HabitatPoint,
    id: string,
    anchors?: SpiderState['anchors'],
  ): Predator {
    const { world, scene, predators } = this.context;
    const seed = Number(id.split(':')[1]);
    const actor = AnimalFactory.predator(
      kind,
      origin.x,
      origin.z,
      new Random(this.context.save.seed ^ seed),
    );
    actor.habitatSlot = slot;
    actor.root.userData.remainsIdentity = id;
    actor.useWorldBounds(this.config.size);
    actor.moveTo(origin.x, origin.z, world.heightAt(origin.x, origin.z));
    if (actor instanceof Spider) {
      let habitat = anchors;
      if (!habitat) {
        const trees = world.treeLocations ?? [];
        const a = trees.find(
          (tree) =>
            Math.hypot(tree.x - origin.x, tree.z - origin.z) < 12 &&
            Math.hypot(tree.x - this.context.save.player.x, tree.z - this.context.save.player.z) >
              28,
        );
        const b =
          a &&
          trees.find((tree) => {
            const distance = Math.hypot(tree.x - a.x, tree.z - a.z);
            return distance > 3 && distance < 10;
          });
        if (a && b) habitat = { a, b };
      }
      if (habitat) actor.configureHabitat(habitat.a, habitat.b, (x, z) => world.heightAt(x, z));
    }
    this.attachSpider(actor, slot);
    predators.push(actor);
    scene.add(actor.root);
    this.context.onArrival?.(actor);
    return actor;
  }

  private depart(actor: Predator): void {
    this.context.onDeparture?.(actor);
    this.context.predators.splice(this.context.predators.indexOf(actor), 1);
    actor.root.removeFromParent();
    ModelAssets.shared.release(actor.root);
  }
}
