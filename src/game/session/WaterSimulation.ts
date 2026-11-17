import type { Object3D } from 'three';
import { AnimalFactory } from '../animals/AnimalFactory';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import type { Pike } from '../animals/Pike';
import { GeneticTraits } from '../genetics/GeneticTraits';
import { Random } from '../Random';
import { WaterNavigation, RABBIT_SWIM_SPEED, RABBIT_SWIM_IMMERSION } from '../WaterNavigation';
import type { World } from '../World';
import type { Excavation } from '../Excavation';
import type { DigNode } from '../types';
import { HawkVictims, type HawkPopulation, type HawkVictim } from './HawkVictims';
import { defaultWorldConfig } from '../WorldConfig';
import {
  AquaticHabitats,
  inWaterPath,
  PIKE_MIN_DEPTH,
  type AquaticHabitat,
} from '../AquaticHabitats';
import { AquaticCohorts } from '../AquaticCohorts';
import { ModelAssets } from '../ModelAssets';
import { SeasonSystem } from '../systems/SeasonSystem';
import type { HabitatPoint } from '../AnimalHabitats';

export interface PikeState extends HabitatPoint {
  id: number;
  slot: number;
  health: number;
  waterBody: string;
  ambush: HabitatPoint;
  fishAt?: number;
}

interface WaterActor extends HawkVictim {
  swimSpeed: number;
  immersion: number;
  rabbit?: boolean;
  fish?: boolean;
}
interface Context extends HawkPopulation {
  protectPlayer?: (time: number) => boolean;
  world: World;
  earth: Excavation;
  toast: (line: string) => void;
  consequences: { predatorAttack: (kind: string) => void };
  habitats?: AquaticHabitats;
  onPikeDeath?: (pike: Pike) => void;
}

/** Согласует воду с семейной навигацией и коллизиями; щуки выбирают только реально плавающую добычу. */
export class WaterSimulation {
  readonly pikes: Pike[] = [];
  private readonly navigation: WaterNavigation;
  private readonly habitats: AquaticHabitats;
  private readonly cohorts: AquaticCohorts;
  private readonly seasons: SeasonSystem;
  private readonly pikeCount: number;
  private nextCohortCheck = 0;
  private readonly sources: HawkVictims;
  private actors: WaterActor[] = [];
  private nextRefresh = 0;
  private readonly previous = new WeakMap<Object3D, DigNode>();
  private readonly targets = new Map<Pike, WaterActor>();
  private readonly fishAt = new WeakMap<Pike, number>();
  private nextSearch = 0;

  constructor(private readonly context: Context) {
    this.navigation = new WaterNavigation(context.world);
    this.sources = new HawkVictims(context);
    const { world, save } = context;
    const config = save.worldConfig ?? defaultWorldConfig();
    this.pikeCount = config.creatures.pike;
    this.seasons = new SeasonSystem(save.seed, config.seasonLengths);
    this.habitats =
      context.habitats ??
      new AquaticHabitats(
        world,
        this.pikeCount ? (world.terrain?.water?.bodies ?? []) : [],
        save.seed,
      );
    this.cohorts = new AquaticCohorts({
      save,
      habitats: this.habitats,
      terrain: world,
      scene: world.scene,
      cover: (x, z) => world.hasCover?.(x, z) ?? false,
      kinds: ['pike'],
      enabled: () => this.pikeCount > 0,
      adults: (_kind, body) =>
        this.pikes.filter((actor) => actor.alive && actor.waterBody === body).length,
      settle: (_kind, site, point) => this.settlePike(site, point),
    });
    const saved = new Map((save.pikePopulation ?? []).map((record) => [record.slot, record]));
    for (let slot = 0; slot < this.pikeCount; slot++) {
      const record = saved.get(slot);
      if (save.pikePopulation && !record) continue;
      const id = record?.id ?? slot;
      if (save.deadPopulation?.includes(`pike:${id}`)) continue;
      const site = this.habitats.forSlot('pike', slot, record?.waterBody);
      if (!site) continue;
      const defaults = site.body.points.filter((point) => this.validPikePoint(site, point));
      const index = (slot % 2) + 2 * Math.floor(slot / (2 * this.habitats.forKind('pike').length));
      const start =
        defaults[(index + 1) % defaults.length] ?? site.pike[(index * 4) % site.pike.length];
      const point = record && this.validPikePoint(site, record) ? record : start;
      this.placePike(slot, id, site, point, record);
    }
  }

  capture(): void {
    this.context.save.pikePopulation = this.pikes
      .filter((actor) => actor.alive)
      .map((actor) => ({
        id: Number(String(actor.root.userData.remainsIdentity).slice('pike:'.length)),
        slot: actor.habitatSlot ?? 0,
        x: actor.x,
        z: actor.z,
        health: actor.health,
        waterBody: actor.waterBody,
        ambush: { ...actor.ambushPoint },
        fishAt: this.fishAt.get(actor),
      }));
  }

  dispose(): void {
    this.cohorts.dispose();
  }

  resetTargets(): void {
    for (const actor of this.actors) {
      this.previous.delete(actor.root);
      actor.root.userData.swimming = false;
    }
    this.targets.clear();
    this.nextRefresh = 0;
    this.nextSearch = 0;
  }

  update(dt: number, time: number, combat: boolean): void {
    this.removeDead();
    if (time >= this.nextCohortCheck) {
      this.nextCohortCheck = time + 1;
      const { clock, player } = this.context.save;
      this.cohorts.update(
        clock,
        this.seasons.name(1 + Math.floor(clock / 1440)) === 'Весна',
        player,
      );
    }
    if (time >= this.nextRefresh) {
      this.nextRefresh = time + 0.5;
      this.refreshActors();
    }
    for (const actor of this.actors) if (!actor.fish) this.settle(actor, dt);
    if (time >= this.nextSearch) {
      this.nextSearch = time + 0.4;
      for (const pike of this.pikes) {
        let nearest: WaterActor | undefined;
        let best = Infinity;
        if (combat)
          for (const actor of this.actors) {
            if (actor.fish && this.context.save.clock < (this.fishAt.get(pike) ?? 0)) continue;
            if (!this.available(actor) || !pike.accepts(actor.root.position, this.context.world))
              continue;
            const d = Math.hypot(actor.root.position.x - pike.x, actor.root.position.z - pike.z);
            const score = d - (actor.fish ? 6 : 0);
            if (score < best) {
              nearest = actor;
              best = score;
            }
          }
        if (nearest) this.targets.set(pike, nearest);
        else this.targets.delete(pike);
      }
    }
    for (const pike of this.pikes) {
      const candidate = this.targets.get(pike);
      const prey = combat && candidate && this.available(candidate) ? candidate : undefined;
      if (pike.update(dt, time, this.context.world, prey?.root.position) && prey) {
        if (prey.player) {
          if (this.context.protectPlayer?.(time)) this.targets.delete(pike);
          else this.context.consequences.predatorAttack('pike');
        } else {
          prey.hurt(11.2);
          if (prey.fish) this.fishAt.set(pike, this.context.save.clock + 180);
          if (prey.related)
            this.context.toast('Щука укусила ' + prey.name + '! Уведи семью на берег.');
        }
      }
      pike.root.visible =
        pike.alive &&
        Math.hypot(pike.x - this.context.save.player.x, pike.z - this.context.save.player.z) < 65;
    }
  }

  private available(actor: WaterActor): boolean {
    const p = actor.root.position;
    if (actor.fish)
      return actor.alive() && (this.context.world.waterAt(p.x, p.z)?.depth ?? 0) >= PIKE_MIN_DEPTH;
    return (
      actor.alive() &&
      !actor.root.userData.conversing &&
      !AnimalRestraint.active(actor.root) &&
      !this.context.earth.isSheltered(p.x, p.y, p.z) &&
      !!this.navigation.swimming(p.x, p.z) &&
      Math.abs(p.y - this.navigation.height(p.x, p.z, actor.immersion)) < 0.8
    );
  }

  private refreshActors(): void {
    const traits = new Map<Object3D, { swimSpeed: number; immersion: number; rabbit?: boolean }>();
    const p = this.context.save.player;
    traits.set(this.context.player.root, {
      swimSpeed: GeneticTraits.mobility(p.genes) > 0 ? RABBIT_SWIM_SPEED : 0,
      immersion: RABBIT_SWIM_IMMERSION * p.genes.size,
      rabbit: true,
    });
    for (const actor of this.context.rabbits)
      traits.set(actor.root, {
        swimSpeed: actor.swimSpeed,
        immersion: RABBIT_SWIM_IMMERSION * actor.root.scale.x,
        rabbit: true,
      });
    for (const actor of this.context.families)
      traits.set(actor.root, {
        swimSpeed: actor.young ? 0 : actor.swimSpeed,
        immersion: RABBIT_SWIM_IMMERSION * actor.root.scale.x,
        rabbit: true,
      });
    for (const actor of this.context.wildlife) {
      if (actor.kind === 'fish') continue;
      traits.set(actor.root, { swimSpeed: actor.swimSpeed, immersion: actor.swimImmersion });
    }
    for (const kit of this.context.save.kits) {
      const root = this.context.family?.rigs.get(kit.id)?.root;
      if (root)
        traits.set(root, {
          swimSpeed: kit.age >= 3 && GeneticTraits.mobility(kit.genes) > 0 ? RABBIT_SWIM_SPEED : 0,
          immersion: RABBIT_SWIM_IMMERSION * root.scale.x,
          rabbit: true,
        });
    }
    this.actors = [];
    for (const source of this.sources.all(true)) {
      const trait = traits.get(source.root);
      if (trait) this.actors.push({ ...source, ...trait });
    }
    for (const actor of [
      ...this.context.rabbits,
      ...this.context.families,
      ...this.context.wildlife,
      ...this.context.predators,
    ]) {
      actor.useWater(this.navigation);
      actor.root.userData.swimImmersion =
        'swimImmersion' in actor
          ? actor.swimImmersion
          : 'profile' in actor
            ? actor.profile.radius * 0.9
            : RABBIT_SWIM_IMMERSION * actor.root.scale.x;
    }
    for (const actor of this.context.predators)
      this.actors.push({
        root: actor.root,
        name: actor.kind,
        player: false,
        related: false,
        bodyHeight: actor.profile.radius,
        swimSpeed: actor.swimSpeed,
        immersion: actor.kind === 'snake' ? 0.06 : actor.profile.radius * 0.9,
        alive: () => actor.alive && !actor.inDen,
        condition: () => actor.health / actor.maxHealth,
        move: (x, y, z) => actor.moveTo(x, z, y),
        hurt: (damage) => {
          actor.health = Math.max(0, actor.health - damage);
        },
      });
    for (const actor of this.context.wildlife) {
      if (actor.kind !== 'fish') continue;
      this.actors.push({
        root: actor.root,
        name: 'рыба',
        player: false,
        related: false,
        bodyHeight: 0.18,
        swimSpeed: actor.swimSpeed,
        immersion: 0.42,
        fish: true,
        alive: () => actor.alive,
        condition: () => actor.health / actor.maxHealth,
        move: (x, y, z) => actor.moveTo(x, z, y),
        hurt: (damage) => {
          actor.health = Math.max(0, actor.health - damage * 1.7);
        },
      });
    }
  }

  private validPikePoint(site: AquaticHabitat, point: HabitatPoint): boolean {
    if (Math.max(Math.abs(point.x), Math.abs(point.z)) >= this.context.world.size - 7) return false;
    const water = this.context.world.waterAt(point.x, point.z);
    return !!water && water.body.id === site.body.id && water.depth >= PIKE_MIN_DEPTH;
  }

  private placePike(
    slot: number,
    id: number,
    site: AquaticHabitat,
    point: HabitatPoint,
    record?: PikeState,
  ): Pike {
    const { world, save } = this.context;
    const pike = AnimalFactory.pike(
      point.x,
      point.z,
      site.body,
      new Random(save.seed ^ id ^ 55781),
    );
    pike.habitatSlot = slot;
    pike.root.userData.remainsIdentity = `pike:${id}`;
    if (record) pike.health = Math.min(pike.maxHealth, record.health);
    if (record?.fishAt !== undefined) this.fishAt.set(pike, record.fishAt);

    const clear = (position: HabitatPoint) =>
      inWaterPath((x, z) => world.waterAt(x, z), point, position, site.body.id, PIKE_MIN_DEPTH);
    if (record && this.validPikePoint(site, record.ambush) && clear(record.ambush))
      pike.setAmbush(record.ambush);
    else {
      let best: HabitatPoint = point;
      let score = Infinity;
      for (const candidate of site.pike) {
        const d = Math.hypot(candidate.x - point.x, candidate.z - point.z);
        if (d > 5.5 || !clear(candidate)) continue;
        const shore = this.habitats.closest(site.shallows, candidate);
        const edge = shore ? Math.hypot(candidate.x - shore.x, candidate.z - shore.z) : 10;
        const cost = edge + d * 0.65 - (world.hasCover?.(candidate.x, candidate.z) ? 4 : 0);
        if (cost >= score) continue;
        best = candidate;
        score = cost;
      }
      pike.setAmbush(best);
    }
    pike.update(0, 0, world);
    this.pikes.push(pike);
    world.scene.add(pike.root);
    return pike;
  }

  private settlePike(site: AquaticHabitat, point: HabitatPoint): boolean {
    const used = new Set(this.pikes.map((actor) => actor.habitatSlot));
    for (let slot = 0; slot < this.pikeCount; slot++) {
      if (used.has(slot) || this.habitats.forSlot('pike', slot)?.body.id !== site.body.id) continue;
      const id = this.context.save.nextPikeId ?? 1000;
      this.context.save.nextPikeId = id + 1;
      this.placePike(slot, id, site, point);
      return true;
    }
    return false;
  }

  private removeDead(): void {
    for (let index = this.pikes.length - 1; index >= 0; index--) {
      const actor = this.pikes[index];
      if (actor.alive) continue;
      this.context.onPikeDeath?.(actor);
      this.targets.delete(actor);
      this.pikes.splice(index, 1);
      ModelAssets.shared.release(actor.root);
      actor.root.removeFromParent();
    }
  }

  private settle(actor: WaterActor, dt: number): void {
    const root = actor.root,
      p = root.position;
    if (actor.player && !AnimalRestraint.active(root)) {
      const player = this.context.save.player;
      p.set(player.x, player.y, player.z);
      root.userData.baseY = player.y;
    }
    if (
      !actor.alive() ||
      AnimalRestraint.active(root) ||
      this.context.earth.isSheltered(p.x, p.y, p.z)
    ) {
      root.userData.swimming = false;
      this.previous.delete(root);
      return;
    }
    const from = this.previous.get(root);
    let x = p.x,
      z = p.z;
    const water = this.navigation.swimming(x, z);
    if (!actor.swimSpeed && water && !from) {
      const shore = this.navigation.nearestShore(x, z);
      x = shore.x;
      z = shore.z;
    } else if (!actor.swimSpeed && from) {
      const step = this.navigation.dryStep(from, x, z);
      x = step.x;
      z = step.z;
    } else if (actor.swimSpeed && from && (water || root.userData.swimming)) {
      const distance = Math.hypot(x - from.x, z - from.z),
        maximum = actor.swimSpeed * dt;
      if (distance > maximum && distance < 8) {
        x = from.x + ((x - from.x) * maximum) / distance;
        z = from.z + ((z - from.z) * maximum) / distance;
      }
    }
    const swimming = !!actor.swimSpeed && !!this.navigation.swimming(x, z);
    root.userData.swimming = swimming;
    const wasWet = from && this.navigation.swimming(from.x, from.z);
    // Не приземляем прыгающих/поднятых животных. Высота меняется только у берега или в воде.
    const y =
      (swimming || wasWet || x !== p.x || z !== p.z) && !root.userData.jumping
        ? this.navigation.height(
            x,
            z,
            actor.immersion,
            this.context.earth.floorAt(x, z, Number(root.userData.baseY ?? p.y)),
          )
        : actor.rabbit
          ? Number(root.userData.baseY ?? p.y)
          : p.y;
    actor.move(x, y, z);
    root.userData.baseY = y;
    const history = from ?? { x, y, z };
    history.x = x;
    history.y = y;
    history.z = z;
    this.previous.set(root, history);
  }
}
