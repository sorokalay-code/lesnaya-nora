import type { Object3D } from 'three';
import {
  FamilyMember,
  type ForestAnimal,
  type FlyingRaptor,
  type Predator,
  type RabbitActor,
} from '../animals';
import { animalNames } from '../animals/names';
import type { FamilyLifecycle } from './FamilyLifecycle';
import type { SaveData } from '../types';
import type { RabbitRig } from '../Models';
import { GeneticTraits } from '../genetics/GeneticTraits';

export interface HawkVictim {
  root: Object3D;
  name: string;
  player: boolean;
  related: boolean;
  prey?: 'bird' | 'mouse';
  condition: () => number;
  bodyHeight: number;
  alive: () => boolean;
  move: (x: number, y: number, z: number) => void;
  hurt: (damage: number) => void;
}
export interface HawkPopulation {
  save: SaveData;
  player: RabbitRig;
  rabbits: RabbitActor[];
  families: FamilyMember[];
  wildlife: ForestAnimal[];
  predators: Predator[];
  hawks: FlyingRaptor[];
  family?: Pick<FamilyLifecycle, 'rigs'>;
}

/** Адаптеры захвата синхронно перемещают модель и игровые координаты разных видов жертв. */
export class HawkVictims {
  constructor(private readonly population: HawkPopulation) {}

  all(includeLargeWildlife = false): Iterable<HawkVictim> {
    return this.candidates(includeLargeWildlife, false);
  }

  rodents(): Iterable<HawkVictim> {
    return this.candidates(false, true);
  }

  private *candidates(includeLargeWildlife: boolean, rodentsOnly: boolean): Iterable<HawkVictim> {
    const p = this.population.save.player;
    yield {
      root: this.population.player.root,
      name: 'Крольчиха',
      player: true,
      related: true,
      condition: () => p.health / 100,
      bodyHeight: 0.82 * p.genes.size,
      alive: () => p.health > 0,
      move: (x, y, z) => {
        p.x = x;
        p.y = y;
        p.z = z;
        this.pose(this.population.player.root, x, y, z);
      },
      hurt: (damage) => {
        if (this.population.player.root.userData.dodging === true) return;

        p.health = Math.max(0, p.health - damage / GeneticTraits.resilience(p.genes));
      },
    };
    for (const actor of [...this.population.rabbits, ...this.population.families]) {
      if (!actor.alive || ('inShelter' in actor && actor.inShelter)) continue;
      yield {
        root: actor.root,
        name: actor.data.name,
        player: false,
        related: actor.data.id === this.population.save.mateId,
        condition: () => actor.health / actor.maxHealth,
        bodyHeight: 0.82 * actor.root.scale.x,
        alive: () => actor.alive && !('inShelter' in actor && actor.inShelter),
        move: (x, y, z) => {
          actor.moveTo(x, z, y);
          actor.data.x = x;
          actor.data.z = z;
          actor.data.y = y;
          this.pose(actor.root, x, y, z);
        },
        hurt: (damage) => {
          actor.health = Math.max(
            0,
            actor.health - damage / GeneticTraits.resilience(actor.data.genes),
          );
          actor.data.health = actor.health;
          if (actor instanceof FamilyMember)
            (this.population.save.familyHealth ??= {})[actor.data.id] = actor.health;
        },
      };
    }
    for (const kit of this.population.save.kits) {
      const rig = this.population.family?.rigs.get(kit.id);
      if (!kit.alive || !rig) continue;
      yield {
        root: rig.root,
        name: kit.name,
        player: false,
        related: true,
        condition: () => kit.health / 100,
        bodyHeight: 0.82 * rig.root.scale.x,
        alive: () => kit.alive && kit.health > 0,
        move: (x, y, z) => {
          kit.x = x;
          kit.y = y;
          kit.z = z;
          this.pose(rig.root, x, y, z);
        },
        hurt: (damage) => {
          kit.health = Math.max(0, kit.health - damage / GeneticTraits.resilience(kit.genes));
        },
      };
    }
    for (const animal of this.population.wildlife) {
      // mass — вес для наземных столкновений, а не килограммы; переносимость определяют габариты.
      if (
        animal.kind === 'fish' ||
        animal.inShelter ||
        (rodentsOnly && animal.kind !== 'mouse') ||
        !animal.alive ||
        (!rodentsOnly && !includeLargeWildlife && animal.profile.radius > 0.43)
      )
        continue;
      yield {
        root: animal.root,
        name: animalNames[animal.kind],
        player: false,
        related: false,
        prey:
          animal.kind === 'mouse'
            ? 'mouse'
            : animal.kind === 'duck' || animal.kind === 'pheasant'
              ? 'bird'
              : undefined,
        condition: () => animal.health / animal.maxHealth,
        bodyHeight: 0.55 * animal.appearance.size,
        alive: () => animal.alive && !animal.inShelter,
        move: (x, y, z) => animal.moveTo(x, z, y),
        hurt: (damage) => {
          animal.health = Math.max(0, animal.health - damage);
        },
      };
    }
  }

  private pose(root: Object3D, x: number, y: number, z: number): void {
    root.position.set(x, y, z);
    root.userData.baseY = y;
  }
}
