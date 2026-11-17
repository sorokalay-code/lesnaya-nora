import {
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  type Scene,
} from 'three';
import type { ForestAnimal } from './animals';
import type { AquaticHabitat, AquaticHabitats } from './AquaticHabitats';
import type { HabitatPoint } from './AnimalHabitats';
import type { DigNode, SaveData } from './types';
import type { WildlifeShelters } from './WildlifeShelters';

export interface DucklingState extends HabitatPoint {
  id: number;
  health: number;
}

export interface DuckBroodState {
  slot: number;
  mother: number;
  waterBody: string;
  laidAt: number;
  hatchAt: number;
  nextAt: number;
  eggs: number;
  young: DucklingState[];
}

const DAY = 1440;
const EGGS = 3;
const INCUBATION = DAY;
const GROWTH = 3 * DAY;

interface Context {
  save: SaveData;
  habitats: AquaticHabitats;
  shelters: WildlifeShelters;
  scene: Scene;
  ducks: readonly ForestAnimal[];
  create: (site: AquaticHabitat, point: DigNode, saved?: DucklingState) => ForestAnimal;
  settle: (actor: ForestAnimal, site: AquaticHabitat) => boolean;
  depart: (actor: ForestAnimal) => void;
  enabled: () => boolean;
}

/** Ведёт наземную кладку, вылупление и движение выводка за матерью к воде. */
export class DuckBroods {
  private readonly actors = new Map<DucklingState, ForestAnimal>();
  private readonly stateByActor = new WeakMap<ForestAnimal, DucklingState>();
  private readonly clutches = new Map<DuckBroodState, Group>();
  private eggs?: SphereGeometry;
  private shell?: MeshStandardMaterial;

  constructor(private readonly context: Context) {}

  dispose(): void {
    for (const brood of this.clutches.keys()) this.clearEggs(brood);
    this.eggs?.dispose();
    this.shell?.dispose();
  }

  restore(): void {
    if (!this.context.enabled()) return;
    for (const brood of this.context.save.duckBroods ?? []) {
      const site = this.context.habitats.get(brood.waterBody);
      const nest = this.context.shelters.get('duck', brood.slot);
      if (!site || !nest || nest.site.waterBody !== brood.waterBody) continue;
      for (const young of brood.young)
        this.place(brood, site, nest.entrance, this.context.save.clock, young);
    }
  }

  owns(actor: ForestAnimal): boolean {
    return this.stateByActor.has(actor);
  }

  onDeath(actor: ForestAnimal): void {
    const data = this.stateByActor.get(actor);
    if (!data) return;
    for (const brood of this.context.save.duckBroods ?? [])
      if (brood.young.includes(data)) {
        this.remove(brood, data, actor);
        break;
      }
  }

  update(clock: number, spring: boolean, player: HabitatPoint): void {
    if (!this.context.enabled()) return;
    const { save, habitats, shelters, ducks } = this.context;
    const adults = ducks.filter(
      (actor) => actor.kind === 'duck' && actor.alive && !this.owns(actor),
    );
    const records = (save.duckBroods ??= []);
    const seen = new Map(records.map((brood) => [brood.slot, brood]));
    for (const mother of adults) {
      const slot = mother.habitatSlot;
      const waterBody = mother.waterBody;
      if (!spring || slot === undefined || slot % 2 !== 0 || !waterBody || !mother.shelter)
        continue;
      const previous = seen.get(slot);
      if (previous && (previous.eggs || previous.young.length || clock < previous.nextAt)) continue;
      if (!adults.some((other) => other !== mother && other.waterBody === waterBody)) continue;

      const brood = {
        slot,
        waterBody,
        mother: mother.socialId,
        laidAt: clock,
        hatchAt: clock + INCUBATION,
        nextAt: clock + 7 * DAY,
        eggs: EGGS,
        young: [],
      };
      if (previous) records.splice(records.indexOf(previous), 1, brood);
      else records.push(brood);
    }

    for (const brood of records) {
      const site = habitats.get(brood.waterBody);
      const nest = shelters.get('duck', brood.slot);
      if (!site || !nest || nest.site.waterBody !== brood.waterBody) continue;
      const mother = adults.find((actor) => actor.socialId === brood.mother);
      if (brood.eggs && !mother) brood.eggs = 0;
      if (brood.eggs && clock >= brood.hatchAt) {
        for (let index = 0; index < brood.eggs; index++)
          this.place(brood, site, nest.entrance, clock);
        brood.eggs = 0;
      }
      if (brood.eggs) {
        this.drawEggs(brood, nest.site, nest.entrance.y);
        if (mother) {
          mother.restAt = nest.entrance;
          mother.foragingAllowed = false;
        }
      } else this.clearEggs(brood);

      const bank = habitats.closest(
        site.banks.map((item) => item.shallows),
        nest.entrance,
      );
      if (!bank) continue;
      if (
        mother &&
        brood.young.length &&
        clock - brood.hatchAt < GROWTH &&
        clock % DAY > 320 &&
        clock % DAY < 1180
      ) {
        mother.restAt = undefined;
        mother.destination = bank;
        mother.foragingAllowed = false;
      }
      for (const young of brood.young.slice()) {
        const actor = this.actors.get(young);
        if (!actor?.alive) continue;
        this.grow(actor, brood, clock);
        actor.foragingAllowed = false;
        actor.restAt = undefined;
        if (clock - brood.hatchAt >= GROWTH) {
          if (this.context.settle(actor, site)) this.remove(brood, young, actor);
          else if (Math.hypot(actor.x - player.x, actor.z - player.z) > 25) {
            this.remove(brood, young, actor);
            this.context.depart(actor);
          } else actor.destination = bank;
          continue;
        }
        const trail = mother?.inShelter ? nest.approach : (mother ?? bank);
        const angle = young.id * 2.399963;
        actor.destination = {
          x: trail.x + Math.cos(angle) * 0.5,
          z: trail.z + Math.sin(angle) * 0.5,
        };
      }
    }
  }

  capture(): void {
    for (const [data, actor] of this.actors) {
      data.x = actor.x;
      data.z = actor.z;
      data.health = actor.health;
    }
  }

  private place(
    brood: DuckBroodState,
    site: AquaticHabitat,
    point: DigNode,
    clock: number,
    saved?: DucklingState,
  ): void {
    const actor = this.context.create(site, point, saved);
    this.grow(actor, brood, clock);
    const data = saved ?? {
      id: actor.socialId,
      x: actor.x,
      z: actor.z,
      health: actor.maxHealth * 0.52,
    };
    if (!saved) brood.young.push(data);
    actor.health = data.health;
    this.actors.set(data, actor);
    this.stateByActor.set(actor, data);
  }

  private grow(actor: ForestAnimal, brood: DuckBroodState, clock: number): void {
    const age = Math.max(0, clock - brood.hatchAt);
    actor.updateGrowth(Math.min(1, age / GROWTH));
  }

  private remove(brood: DuckBroodState, data: DucklingState, actor: ForestAnimal): void {
    brood.young.splice(brood.young.indexOf(data), 1);
    this.actors.delete(data);
    this.stateByActor.delete(actor);
  }

  private drawEggs(brood: DuckBroodState, nest: HabitatPoint, y: number): void {
    if (this.clutches.has(brood)) return;
    this.eggs ??= new SphereGeometry(1, 8, 5);
    this.shell ??= new MeshStandardMaterial({ color: 0xded7af, roughness: 0.72 });
    const group = new Group();
    group.name = `duck-clutch-${brood.slot}`;
    group.position.set(nest.x, y + 0.25, nest.z);
    const eggs = new InstancedMesh(this.eggs, this.shell, brood.eggs);
    const pose = new Object3D();
    for (let index = 0; index < brood.eggs; index++) {
      const angle = index * 2.399963;
      pose.position.set(Math.sin(angle) * 0.11, 0, Math.cos(angle) * 0.11);
      pose.rotation.z = angle * 0.14;
      pose.scale.set(0.072, 0.1, 0.072);
      pose.updateMatrix();
      eggs.setMatrixAt(index, pose.matrix);
    }
    group.add(eggs);
    this.context.scene.add(group);
    this.clutches.set(brood, group);
  }

  private clearEggs(brood: DuckBroodState): void {
    const group = this.clutches.get(brood);
    if (!group) return;
    for (const child of group.children) if (child instanceof InstancedMesh) child.dispose();
    group.removeFromParent();
    this.clutches.delete(brood);
  }
}
