import type { Scene } from 'three';
import type { ForestAnimal } from './animals';
import type { AnimalHabitats, HabitatPoint } from './AnimalHabitats';
import { BirdBroods } from './BirdBroods';
import { isNightAt } from './session/WorldCalendar';
import type { DigNode, SaveData } from './types';
import type { WildlifeShelters } from './WildlifeShelters';
import { defaultWorldConfig } from './WorldConfig';

interface Context {
  save: SaveData;
  scene: Scene;
  animals: readonly ForestAnimal[];
  shelters: WildlifeShelters;
  habitats: AnimalHabitats;
  create: (at: DigNode, id?: number) => ForestAnimal;
  settle: (animal: ForestAnimal, slot: number) => void;
  depart: (animal: ForestAnimal) => void;
}

/** Размещает наземные гнёзда фазанов и ведёт выводок за матерью между кормёжкой и ночёвкой. */
export class PheasantFlocks {
  private readonly broods: BirdBroods<ForestAnimal>;
  private readonly beds = new WeakMap<ForestAnimal, HabitatPoint>();
  private readonly adults = new Map<number, ForestAnimal>();
  private readonly capacity: number;

  constructor(private readonly context: Context) {
    const { save, scene, create, depart } = context;
    this.capacity = (save.worldConfig ?? defaultWorldConfig()).creatures.pheasant;
    this.broods = new BirdBroods({
      scene,
      records: ((save.birdBroods ??= {}).pheasant ??= []),
      eggs: 4,
      incubationDays: 1,
      growthDays: 3,
      shellColor: 0xc4b48c,
      nest: (slot) => this.nest(slot),
      create: (_slot, at, saved) => {
        const actor = create(at, saved?.id);
        return { actor, id: actor.socialId };
      },
      settle: (actor, slot) => this.settle(actor, slot),
      depart,
    });
  }

  restore(): void {
    this.broods.restore(this.context.save.clock);
  }

  owns(actor: ForestAnimal): boolean {
    return this.broods.owns(actor);
  }

  update(clock: number, spring: boolean, player: HabitatPoint): void {
    const { animals, habitats, save } = this.context;
    const night = isNightAt(clock);
    this.adults.clear();
    for (const actor of animals) {
      if (actor.kind !== 'pheasant' || !actor.alive || this.owns(actor)) continue;
      this.adults.set(actor.socialId, actor);
      const slot = actor.habitatSlot;
      if (!actor.habitat || slot === undefined) continue;
      let bed = this.beds.get(actor);
      if (!bed) {
        bed = habitats.nurseryBed(actor.habitat, slot + 3);
        this.beds.set(actor, bed);
      }
      if (night) {
        actor.restAt = bed;
        actor.foragingAllowed = false;
      }
      if (spring && !night && slot % 2 === 0 && this.hasRooster(actor)) {
        this.broods.lay(slot, actor.socialId, clock);
      }
    }

    this.broods.update(
      clock,
      player,
      (brood) => this.adults.has(brood.parent),
      (brood, chick, _age, id) => {
        const hen = this.adults.get(brood.parent);
        const resting = hen ? this.beds.get(hen) : undefined;
        const trail = (night ? resting : hen) ?? this.nest(brood.slot);
        if (!trail) return;
        const angle = id * 2.399963;
        const position = {
          x: trail.x + Math.cos(angle) * 0.48,
          z: trail.z + Math.sin(angle) * 0.48,
        };
        if (!night && hen && Math.hypot(chick.x - hen.x, chick.z - hen.z) > 3) {
          hen.restAt = { x: hen.x, z: hen.z };
          hen.foragingAllowed = false;
        }
        chick.foragingAllowed = !night && Math.hypot(chick.x - trail.x, chick.z - trail.z) < 1.5;
        chick.destination = position;
        chick.restAt = night ? position : undefined;
      },
    );

    for (const brood of save.birdBroods?.pheasant ?? []) {
      const hen = this.adults.get(brood.parent);
      if (!hen || !brood.eggs) continue;
      // Два коротких кормовых выхода в светлое время оставляют кладку видимой.
      const minute = clock % 1440;
      if (!night && ((minute >= 460 && minute < 520) || (minute >= 900 && minute < 960))) continue;
      hen.restAt = this.nest(brood.slot);
      hen.foragingAllowed = false;
    }
  }

  canImmigrate(): boolean {
    return !(this.context.save.birdBroods?.pheasant ?? []).some(
      (brood) => brood.eggs || brood.young.length,
    );
  }

  capture(): void {
    this.broods.capture();
  }

  dispose(): void {
    this.broods.dispose();
  }

  private hasRooster(hen: ForestAnimal): boolean {
    for (const rooster of this.context.animals) {
      if (
        rooster.kind === 'pheasant' &&
        rooster.alive &&
        (rooster.habitatSlot ?? 0) % 2 === 1 &&
        Math.hypot(rooster.x - hen.x, rooster.z - hen.z) <= (hen.habitat?.radius ?? 19) * 3
      )
        return true;
    }
    return false;
  }

  private nest(slot: number): DigNode | undefined {
    if (slot >= this.capacity) return;
    const { shelters, habitats } = this.context;
    const home = habitats.wildlife('pheasant', slot);
    if (!home) return;
    const shelter = shelters.place('pheasant', slot, home);
    if (!shelter) return;
    const { x, z } = shelter.site;
    return { x, y: (shelters.routeHeight(x, z) ?? shelter.entrance.y) + 0.1, z };
  }

  private settle(actor: ForestAnimal, origin: number): boolean {
    const anchors = new Set(
      this.context.animals
        .filter((a) => a.kind === 'pheasant' && a.alive)
        .map((a) => a.habitatSlot),
    );
    for (let index = 0; index < this.capacity; index++) {
      const slot = (origin + index) % this.capacity;
      if (anchors.has(slot) || !this.context.habitats.wildlife('pheasant', slot)) continue;
      this.context.settle(actor, slot);
      return true;
    }
    return false;
  }
}
