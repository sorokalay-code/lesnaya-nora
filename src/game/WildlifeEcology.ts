import * as THREE from 'three';
import {
  createForestAnimal,
  Predator,
  type ForestAnimal,
  type GroundHeight,
  type WildlifeKind,
} from './animals';
import { ModelAssets } from './ModelAssets';
import { Random } from './Random';
import { World, type Resource } from './World';
import type { SaveData } from './types';
import { AnimalRestraint } from './animals/AnimalRestraint';

type Target = ForestAnimal | Predator;
export type WildlifeEvent = {
  kind: 'hunt' | 'fight' | 'defend' | 'arrival';
  x: number;
  z: number;
  subject: string;
};
const names: Record<WildlifeKind, string> = {
  boar: 'кабан',
  deer: 'олень',
  squirrel: 'белка',
  hedgehog: 'ёж',
  beaver: 'бобр',
  moose: 'лось',
};

/** Моделирует питание, охоту, конфликты, защиту и восстановление популяции животных. */

export class WildlifeEcology {
  readonly animals: ForestAnimal[] = [];
  private foodTargets = new Map<ForestAnimal, Resource>();
  private preyTargets = new Map<Predator, { target: Target; until: number }>();
  private nextFoodSearch = 0;
  private nextSpawn = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: World,
    private readonly rng: Random,
    private readonly save?: SaveData,
  ) {}

  populate(): void {
    if (this.save?.wildlife) {
      for (const data of this.save.wildlife) {
        const animal = createForestAnimal(data.kind, data.x, data.z, this.rng, data.appearance);
        animal.socialId = data.id;
        animal.social = { ...data.social };
        animal.health = Math.max(0, Math.min(animal.maxHealth, data.health));
        animal.root.position.y = this.world.heightAt(data.x, data.z);
        this.animals.push(animal);
        this.scene.add(animal.root);
      }
      return;
    }
    for (const [kind, count] of [
      ['deer', 6],
      ['squirrel', 9],
      ['hedgehog', 8],
      ['beaver', 5],
      ['moose', 3],
      ['boar', 4],
    ] as [WildlifeKind, number][])
      for (let i = 0; i < count; i++) this.spawn(kind, 0, 0, true);
  }

  private spawn(
    kind: WildlifeKind,
    px: number,
    pz: number,
    initial = false,
  ): ForestAnimal | undefined {
    let x = 0,
      z = 0,
      found = false;
    for (let attempt = 0; attempt < 35; attempt++) {
      if (kind === 'beaver' && this.world.waterSources.length) {
        const pond = this.rng.pick(this.world.waterSources),
          a = this.rng.range(0, Math.PI * 2),
          d = this.rng.range(4, 8);
        x = pond.x + Math.sin(a) * d;
        z = pond.z + Math.cos(a) * d;
      } else {
        x = this.rng.range(-90, 90);
        z = this.rng.range(-90, 90);
      }

      const biome = this.world.biomeAt(x, z);
      if (
        Math.abs(x) > 97 ||
        Math.abs(z) > 97 ||
        Math.hypot(x - px, z - pz) < (initial ? 9 : 26) ||
        biome === 'garden'
      )
        continue;

      if (kind !== 'deer' && kind !== 'moose' && kind !== 'beaver' && biome !== 'forest') continue;

      found = true;
      break;
    }

    if (!found) return;

    const animal = createForestAnimal(kind, x, z, this.rng);
    animal.socialId = this.save ? (this.save.nextWildlifeId ??= 1) : this.animals.length + 1;
    if (this.save) this.save.nextWildlifeId = animal.socialId + 1;
    animal.root.position.set(x, this.world.heightAt(x, z), z);
    this.animals.push(animal);
    this.scene.add(animal.root);
    return animal;
  }

  targetFor(
    predator: Predator,
    predators: readonly Predator[],
    time: number,
  ): { x: number; z: number } | undefined {
    if (predator.underground || !predator.alive || !predator.huntsWildlife) return;

    let current = this.preyTargets.get(predator);
    if (
      current &&
      (time > current.until ||
        !current.target.alive ||
        AnimalRestraint.active(current.target.root) ||
        Math.hypot(current.target.x - predator.x, current.target.z - predator.z) > 22)
    ) {
      this.preyTargets.delete(predator);
      current = undefined;
    }

    if (!current) {
      const prey = this.animals
        .filter(
          (a) =>
            a.alive &&
            !AnimalRestraint.active(a.root) &&
            Math.hypot(a.x - predator.x, a.z - predator.z) < 14,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - predator.x, a.z - predator.z) -
            Math.hypot(b.x - predator.x, b.z - predator.z),
        )[0];
      const rival =
        !prey && this.rng.chance(0.4)
          ? predators
              .filter(
                (p) =>
                  p !== predator &&
                  p.alive &&
                  !p.underground &&
                  p.kind !== predator.kind &&
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
    if (time >= this.nextFoodSearch) {
      this.nextFoodSearch = time + 3;
      for (const animal of this.animals) {
        const current = this.foodTargets.get(animal);
        if (current?.available) continue;

        let best: Resource | undefined,
          dist = 9;
        for (const food of this.world.resources) {
          if (!food.available || !['clover', 'cabbage', 'carrot', 'berries'].includes(food.kind))
            continue;

          const d = Math.hypot(food.x - animal.x, food.z - animal.z);
          if (d < dist) {
            best = food;
            dist = d;
          }
        }

        if (best) this.foodTargets.set(animal, best);
        else this.foodTargets.delete(animal);
      }
    }

    const threats = predators.filter((p) => p.alive && !p.underground);
    for (const animal of this.animals) {
      const food = this.foodTargets.get(animal);
      if (
        animal.update(dt, time, groundAt, threats, food?.available ? food : undefined) &&
        food?.available
      ) {
        this.world.harvest(food, clock);
        this.foodTargets.delete(animal);
      }
    }

    for (const predator of predators) {
      if (!combatAllowed) continue;
      if (
        !predator.alive ||
        predator.underground ||
        predator.huntingPlayer ||
        predator.attackCooldown > 0 ||
        !predator.canMelee
      )
        continue;

      const victim = this.preyTargets.get(predator)?.target;
      if (!victim || !victim.alive || AnimalRestraint.active(victim.root)) continue;
      if (Math.abs(victim.root.position.y - predator.root.position.y) > 1.5) continue;

      const reach = predator.profile.preyReach;
      if (Math.hypot(victim.x - predator.x, victim.z - predator.z) > reach) continue;

      predator.attackCooldown = predator.profile.preyCooldown;
      predator.playAttack(time);
      const damage = predator.profile.damage;
      if (victim instanceof Predator) {
        victim.receiveAttack(damage, time, predator);
        if (victim.alive) predator.receiveAttack(victim.profile.counterDamage, time, victim);

        events.push({
          kind: 'fight',
          x: predator.x,
          z: predator.z,
          subject: `${predator.kind} и ${victim.kind}`,
        });
      } else {
        const counter = victim.receiveAttack(damage, time, predator);
        if (counter) {
          predator.receiveAttack(counter, time, victim);
          events.push({ kind: 'defend', x: victim.x, z: victim.z, subject: names[victim.kind] });
        }

        if (!victim.alive)
          events.push({ kind: 'hunt', x: victim.x, z: victim.z, subject: names[victim.kind] });
      }

      this.preyTargets.delete(predator);
    }

    for (let i = this.animals.length - 1; i >= 0; i--)
      if (!this.animals[i].alive) {
        const animal = this.animals.splice(i, 1)[0];
        ModelAssets.shared.release(animal.root);
        animal.root.removeFromParent();
        this.foodTargets.delete(animal);
      }

    for (let i = predators.length - 1; i >= 0; i--)
      if (!predators[i].alive) {
        const predator = predators.splice(i, 1)[0];
        ModelAssets.shared.release(predator.root);
        predator.root.removeFromParent();
        this.preyTargets.delete(predator);
      }

    if (time >= this.nextSpawn) {
      this.nextSpawn = time + this.rng.range(24, 42);
      if (this.animals.length < 35) {
        const kind = this.rng.pick([
          'deer',
          'deer',
          'squirrel',
          'squirrel',
          'hedgehog',
          'beaver',
          'moose',
          'boar',
        ] as WildlifeKind[]);
        const animal = this.spawn(kind, px, pz);
        if (animal)
          events.push({ kind: 'arrival', x: animal.x, z: animal.z, subject: names[kind] });
      }
    }

    return events;
  }

  capture(): void {
    if (!this.save) return;
    this.save.wildlife = this.animals
      .filter((animal) => animal.alive)
      .map((animal) => ({
        id: animal.socialId,
        kind: animal.kind,
        x: animal.x,
        z: animal.z,
        health: animal.health,
        social: { ...animal.social },
        appearance: { ...animal.appearance },
      }));
  }
}
