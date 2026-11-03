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

interface WaterActor extends HawkVictim {
  swimSpeed: number;
  immersion: number;
  rabbit?: boolean;
}
interface Context extends HawkPopulation {
  world: World;
  earth: Excavation;
  toast: (line: string) => void;
  consequences: { predatorAttack: (kind: string) => void };
}

/** Согласует воду с семейной навигацией и коллизиями; щуки выбирают только реально плавающую добычу. */
export class WaterSimulation {
  readonly pikes: Pike[] = [];
  private readonly navigation: WaterNavigation;
  private readonly sources: HawkVictims;
  private actors: WaterActor[] = [];
  private nextRefresh = 0;
  private readonly previous = new WeakMap<Object3D, DigNode>();
  private readonly targets = new Map<Pike, WaterActor>();
  private nextSearch = 0;

  constructor(private readonly context: Context) {
    this.navigation = new WaterNavigation(context.world);
    this.sources = new HawkVictims(context);
    const river = context.world.terrain.water.bodies.find((body) => body.kind === 'river');
    if (river) {
      const rng = new Random(context.save.seed + 55781);
      const count = (context.save.worldConfig ?? defaultWorldConfig()).creatures.pike;
      for (let index = 0; index < count; index++) {
        const identity = `pike:${index}`;
        if (context.save.deadPopulation?.includes(identity)) continue;
        const point = river.points[1 + (index % (river.points.length - 1))];
        const pike = AnimalFactory.pike(point.x, point.z, river, rng);
        pike.root.userData.remainsIdentity = identity;
        pike.update(0, 0, context.world);
        this.pikes.push(pike);
        context.world.scene.add(pike.root);
      }
    }
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
    if (time >= this.nextRefresh) {
      this.nextRefresh = time + 0.5;
      this.refreshActors();
    }
    for (const actor of this.actors) this.settle(actor, dt);
    if (time >= this.nextSearch) {
      this.nextSearch = time + 0.4;
      for (const pike of this.pikes) {
        let nearest: WaterActor | undefined,
          distance = 8;
        if (combat)
          for (const actor of this.actors) {
            if (!this.available(actor)) continue;
            const d = Math.hypot(actor.root.position.x - pike.x, actor.root.position.z - pike.z);
            if (d < distance) {
              nearest = actor;
              distance = d;
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
        if (prey.player) this.context.consequences.predatorAttack('pike');
        else {
          prey.hurt(11.2);
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
    for (const actor of this.context.wildlife)
      traits.set(actor.root, { swimSpeed: actor.swimSpeed, immersion: actor.profile.radius * 0.9 });
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
        'profile' in actor
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
        alive: () => actor.alive,
        condition: () => actor.health / actor.maxHealth,
        move: (x, y, z) => actor.moveTo(x, z, y),
        hurt: (damage) => {
          actor.health = Math.max(0, actor.health - damage);
        },
      });
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
