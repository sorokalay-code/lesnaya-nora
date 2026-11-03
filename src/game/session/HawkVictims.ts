import type { Object3D } from 'three';
import {
  FamilyMember,
  type ForestAnimal,
  type Hawk,
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
  hawks: Hawk[];
  family?: Pick<FamilyLifecycle, 'rigs'>;
}

/** Адаптеры захвата синхронно перемещают модель и игровые координаты разных видов жертв. */
export class HawkVictims {
  constructor(private readonly population: HawkPopulation) {}

  *all(): Iterable<HawkVictim> {
    const p = this.population.save.player;
    yield {
      root: this.population.player.root,
      name: 'Крольчиха',
      player: true,
      bodyHeight: 0.82 * p.genes.size,
      alive: () => p.health > 0,
      move: (x, y, z) => {
        p.x = x;
        p.y = y;
        p.z = z;
        this.pose(this.population.player.root, x, y, z);
      },
      hurt: (damage) => {
        p.health = Math.max(0, p.health - damage / GeneticTraits.resilience(p.genes));
      },
    };
    for (const actor of [...this.population.rabbits, ...this.population.families]) {
      if (!actor.alive) continue;
      yield {
        root: actor.root,
        name: actor.data.name,
        player: false,
        bodyHeight: 0.82 * actor.root.scale.x,
        alive: () => actor.alive,
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
          if (!actor.alive) {
            if (this.population.save.mateId === actor.data.id)
              this.population.save.mateId = undefined;
          }
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
      if (!animal.alive || animal.profile.radius > 0.43) continue;
      yield {
        root: animal.root,
        name: animalNames[animal.kind],
        player: false,
        bodyHeight: 0.55 * animal.appearance.size,
        alive: () => animal.alive,
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
