import type { Scene } from 'three';
import { BroodProvisioning, beginProvision, newBroodFood } from '../BroodFood';
import { AnimalFactory } from '../animals';
import type { FlyingRaptor, RaptorKind } from '../animals/FlyingRaptor';
import type { HabitatPoint } from '../AnimalHabitats';
import { BirdBroods, type BirdBroodState } from '../BirdBroods';
import { Random } from '../Random';
import { RaptorNests } from '../RaptorNests';
import { SeasonSystem } from '../systems';
import type { DigNode, SaveData } from '../types';
import type { World } from '../World';
import { defaultWorldConfig } from '../WorldConfig';
import { isNightAt } from './WorldCalendar';

export interface RaptorState extends DigNode {
  kind: RaptorKind;
  slot: number;
  id: number;
  health: number;
}

const KINDS = ['hawk', 'owl'] as const;
const FIRST_BRED_ID = 1000;

interface Context {
  save: SaveData;
  world: World;
  scene: Scene;
  arrival?: (actor: FlyingRaptor) => void;
  departure?: (actor: FlyingRaptor) => void;
}

/** Ведёт территориальные пары хищных птиц, смену присады и охоты и первые вылеты птенцов. */
export class RaptorPopulation {
  private readonly provisions = new BroodProvisioning();
  readonly actors: FlyingRaptor[] = [];
  private readonly nests: RaptorNests;
  private readonly broods: Record<RaptorKind, BirdBroods<FlyingRaptor>>;
  private readonly adults = new WeakMap<FlyingRaptor, { slot: number; id: number }>();
  private readonly born = new WeakMap<FlyingRaptor, number>();
  private readonly capacity: Record<RaptorKind, number>;
  private readonly size: number;
  private readonly seasons: SeasonSystem;
  private nextUpdate = 0;

  constructor(private readonly context: Context) {
    const { save, world, scene } = context;
    const config = save.worldConfig ?? defaultWorldConfig();
    this.size = config.size;
    this.capacity = config.creatures;
    this.seasons = new SeasonSystem(save.seed, config.seasonLengths);
    this.nests = new RaptorNests(world, scene, this.size);
    const records = (save.birdBroods ??= {});
    this.broods = {
      hawk: this.makeBroods('hawk', (records.hawk ??= [])),
      owl: this.makeBroods('owl', (records.owl ??= [])),
    };

    for (const kind of KINDS) {
      for (let pair = 0; pair * 2 < this.capacity[kind]; pair++) {
        this.nests.place(kind, pair, this.anchor(kind, pair), this.random(kind, pair + 1));
      }
      if (save.raptors) {
        for (const state of save.raptors) {
          if (state.kind === kind && state.slot < this.capacity[kind]) this.restoreAdult(state);
        }
      } else {
        for (let slot = 0; slot < this.capacity[kind]; slot++) {
          const at = this.anchor(kind, Math.floor(slot / 2));
          this.restoreAdult({
            kind,
            slot,
            id: slot + 1,
            ...at,
            y: world.heightAt(at.x, at.z) + 10,
            health: 60,
          });
        }
      }
      this.broods[kind].restore(save.clock);
    }
    this.update(0);
    // У загруженного взрослого сохраняется точка полёта. В новом мире птица начинает на своём участке.
    if (!save.raptors) {
      for (const bird of this.actors) {
        const adult = this.adults.get(bird);
        if (!adult) continue;
        const nest = this.nests.get(bird.kind, Math.floor(adult.slot / 2));
        if (!nest) continue;
        const at = this.active(bird.kind, save.clock)
          ? nest.grounds
          : this.ledge(bird.kind, adult.slot);
        if (!at) continue;
        const y =
          'y' in at && typeof at.y === 'number'
            ? at.y + bird.root.scale.y * 0.45
            : world.heightAt(at.x, at.z) + 11;
        bird.moveTo(at.x, at.z, y);
      }
    }
  }

  update(time: number): void {
    if (time < this.nextUpdate) return;
    this.nextUpdate = time + 0.8;
    const { clock, player } = this.context.save;
    this.provisions.prune(
      KINDS.flatMap((kind) =>
        (this.context.save.birdBroods?.[kind] ?? []).flatMap((brood) =>
          brood.food ? [brood.food] : [],
        ),
      ),
    );
    const spring = this.seasons.name(Math.floor(clock / 1440) + 1) === 'Весна';
    for (const kind of KINDS) {
      const slots = new Map<number, { actor: FlyingRaptor; id: number }>();
      for (const actor of this.actors) {
        const adult = this.adults.get(actor);
        if (adult && actor.alive && actor.kind === kind)
          slots.set(adult.slot, { actor, id: adult.id });
      }
      const active = this.active(kind, clock);
      if (spring && active) {
        for (const [slot, adult] of slots) {
          if (slot % 2 === 0 && slots.has(slot + 1))
            this.broods[kind].lay(slot / 2, adult.id, clock);
        }
      }
      this.broods[kind].update(
        clock,
        player,
        (brood) => this.hasParent(slots, brood),
        (brood, chick, age, id) => this.tendChick(brood.slot, chick, clock, age, id),
      );
      const families = new Map(
        (this.context.save.birdBroods?.[kind] ?? []).map((record) => [record.slot, record]),
      );
      for (const [slot, { actor }] of slots) {
        const pair = Math.floor(slot / 2);
        const nest = this.nests.get(kind, pair);
        if (!nest) continue;
        const brood = families.get(pair);
        if (brood?.food) {
          const carrier = [...slots.values()].find(
            ({ actor: bird }) =>
              `${kind}:${this.adults.get(bird)?.id}` === brood.food?.trip?.carrier,
          )?.actor;
          if (this.provisions.update(brood.food, carrier, nest.bowl, clock) && carrier === actor) {
            actor.followFlight({ mode: 'landing', target: nest.bowl, support: nest.support });
            continue;
          }
        }
        const shift = (Math.floor(clock / 85) + pair) % 3;
        const raising = brood && this.hasParent(slots, brood) && (brood.eggs || brood.young.length);
        const tending = raising && (slot % 2 === 0 ? shift !== 1 : shift === 1);
        if (tending || !active) {
          const nearBowl = tending || (!raising && slot % 2 === 1);
          actor.followFlight({
            mode: 'landing',
            target: nearBowl ? nest.care : nest.perch,
            support: nest.support,
          });
        } else {
          actor.followFlight({ mode: 'hunting', grounds: nest.grounds, angle: slot * Math.PI });
        }
      }
    }
  }

  capture(): void {
    for (const kind of KINDS) this.broods[kind].capture();
    this.context.save.raptors = this.actors.flatMap((actor) => {
      const adult = this.adults.get(actor);
      return actor.alive && adult
        ? [
            {
              ...adult,
              kind: actor.kind,
              x: actor.x,
              y: actor.root.position.y,
              z: actor.z,
              health: actor.health,
            },
          ]
        : [];
    });
  }

  removeDead(hasCarry: (actor: FlyingRaptor) => boolean): void {
    for (let index = this.actors.length - 1; index >= 0; index--) {
      const bird = this.actors[index];
      if (!bird.alive && !hasCarry(bird)) this.depart(bird);
    }
  }

  dispose(): void {
    this.provisions.dispose();
    for (const kind of KINDS) this.broods[kind].dispose();
    for (const actor of this.actors) actor.dispose();
    this.nests.dispose();
  }

  successfulHunt(actor: FlyingRaptor): void {
    const adult = this.adults.get(actor);
    if (!adult) return;
    const brood = this.context.save.birdBroods?.[actor.kind]?.find(
      (brood) => brood.slot === Math.floor(adult.slot / 2) && brood.young.length,
    );
    if (!brood) return;
    const clock = this.context.save.clock;
    beginProvision((brood.food ??= newBroodFood(clock)), `${actor.kind}:${adult.id}`, clock);
  }

  private makeBroods(kind: RaptorKind, records: BirdBroodState[]): BirdBroods<FlyingRaptor> {
    return new BirdBroods({
      provisioned: true,
      attended: (slot) => {
        const nest = this.nests.get(kind, slot);
        return (
          !!nest &&
          this.actors.some(
            (actor) =>
              actor.alive &&
              actor.kind === kind &&
              Math.floor((this.adults.get(actor)?.slot ?? -10) / 2) === slot &&
              Math.hypot(actor.x - nest.bowl.x, actor.z - nest.bowl.z) < 2 &&
              Math.abs(actor.root.position.y - nest.bowl.y) < 1.5,
          )
        );
      },
      scene: this.context.scene,
      records,
      eggs: kind === 'owl' ? 3 : 2,
      incubationDays: 2,
      growthDays: 4,
      shellColor: kind === 'owl' ? 0xe4ddc8 : 0xc79d80,
      nest: (pair) => this.nests.get(kind, pair)?.bowl,
      create: (_pair, point, saved) => {
        const save = this.context.save;
        const id = saved?.id ?? save.nextRaptorId ?? FIRST_BRED_ID;
        if (!saved) save.nextRaptorId = id + 1;
        const actor = this.create(kind, point, id);
        this.born.set(actor, id);
        actor.root.userData.remainsIdentity = `${kind}:${id}`;
        return { actor, id };
      },
      settle: (bird, pair) => this.settle(bird, pair),
      depart: (bird) => this.depart(bird),
    });
  }

  private restoreAdult(state: RaptorState): void {
    const { kind, id, slot } = state;
    const identity = `${kind}:${id < FIRST_BRED_ID ? slot : id}`;
    if (this.context.save.deadPopulation?.includes(identity)) return;
    const actor = this.create(kind, state, id);
    this.adults.set(actor, { slot, id });
    actor.health = Math.min(actor.maxHealth, state.health);
    actor.root.userData.remainsIdentity = identity;
  }

  private create(kind: RaptorKind, at: DigNode, id: number): FlyingRaptor {
    // Облик остаётся привязан к птице, даже если её координаты изменились после вылета.
    const rng = this.random(kind, id);
    const actor = AnimalFactory.raptor(kind, rng.range(-90, 90), rng.range(-90, 90), rng);
    actor.useWorldBounds(this.size);
    actor.moveTo(at.x, at.z, at.y);
    actor.root.visible = actor.shadow.visible = true;
    this.context.scene.add(actor.root, actor.shadow);
    this.actors.push(actor);
    this.context.arrival?.(actor);
    return actor;
  }

  private settle(bird: FlyingRaptor, pair: number): boolean {
    const occupied = new Set(
      this.actors
        .filter((actor) => actor.alive && actor.kind === bird.kind)
        .map((actor) => this.adults.get(actor)?.slot),
    );
    const capacity = this.capacity[bird.kind];
    for (let index = 0; index < capacity; index++) {
      const slot = (pair * 2 + index) % capacity;
      if (occupied.has(slot) || !this.nests.get(bird.kind, Math.floor(slot / 2))) continue;
      const id = this.born.get(bird);
      if (id === undefined) return false;
      this.adults.set(bird, { slot, id });
      return true;
    }
    return false;
  }

  private depart(bird: FlyingRaptor): void {
    this.context.departure?.(bird);
    bird.dispose();
    this.actors.splice(this.actors.indexOf(bird), 1);
  }

  private tendChick(
    pair: number,
    chick: FlyingRaptor,
    clock: number,
    age: number,
    id: number,
  ): void {
    const nest = this.nests.get(chick.kind, pair);
    if (!nest) return;
    const active = this.active(chick.kind, clock);
    const angle = id * 2.399963;
    const phase = clock % 26;
    if (age >= 0.63 && active && phase >= 6) {
      const radius = (2.8 + age * 4.2) * Math.sin((Math.PI * (phase - 6)) / 20);
      const heading = angle + phase * 0.15;
      chick.followFlight({
        mode: 'practice',
        target: {
          x: nest.bowl.x + Math.cos(heading) * radius,
          y: nest.bowl.y + 0.9 + radius * 0.34,
          z: nest.bowl.z + Math.sin(heading) * radius,
        },
      });
      return;
    }
    chick.followFlight({
      mode: 'landing',
      support: nest.support,
      target: {
        x: nest.bowl.x + Math.cos(angle) * 0.3,
        y: nest.bowl.y,
        z: nest.bowl.z + Math.sin(angle) * 0.3,
      },
    });
  }

  private ledge(kind: RaptorKind, slot: number): DigNode | undefined {
    const nest = this.nests.get(kind, Math.floor(slot / 2));
    if (!nest) return;
    return slot % 2 ? nest.care : nest.perch;
  }

  private hasParent(slots: ReadonlyMap<number, { id: number }>, brood: BirdBroodState): boolean {
    return slots.get(brood.slot * 2)?.id === brood.parent || slots.has(brood.slot * 2 + 1);
  }

  private active(kind: RaptorKind, clock: number): boolean {
    return isNightAt(clock) === (kind === 'owl');
  }

  private anchor(kind: RaptorKind, pair: number): HabitatPoint {
    const scale = this.size / 110;
    if (kind === 'hawk' && pair === 0) return { x: 32 * scale, z: -30 * scale };
    const angle = pair * 2.399963 + (kind === 'owl' ? 1.5 : 0);
    const radius = (kind === 'owl' && pair === 0 ? 26 : 62) * scale;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  }

  private random(kind: RaptorKind, id: number): Random {
    return new Random(this.context.save.seed + (kind === 'hawk' ? 76409 : 58121) + id * 613);
  }
}
