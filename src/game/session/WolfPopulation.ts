import type { Scene } from 'three';
import { createPredatorActor, type Predator } from '../animals';
import type { AnimalHabitats, Habitat, HabitatPoint, TerritoryIntent } from '../AnimalHabitats';
import { Random } from '../Random';
import type { SaveData } from '../types';
import type { World } from '../World';

export type WolfState =
  { state: 'alive'; x: number; z: number; health: number } | { state: 'vacant'; replaceAt: number };

interface WolfSlot {
  id: string;
  den: Habitat;
  index: number;
  actor?: Predator;
  replaceAt?: number;
}

interface Context {
  save: SaveData;
  world: Pick<World, 'heightAt'>;
  scene: Scene;
  predators: Predator[];
  habitats: AnimalHabitats;
  size: number;
  onArrival?: (wolf: Predator) => void;
  onDiscovery?: () => void;
}

const PACK_SIZE = 4;
const REPLACEMENT_MINUTES = 1440;
const RESPAWN_PLAYER_DISTANCE = 22;
const DEN_DISCOVERY_RADIUS = 12;
const DEN_LABEL = 'Волчье логово';

/** Владеет местами волков в стаях, обнаружением логовищ и замещением погибших по календарю. */
export class WolfPopulation {
  private readonly slots: WolfSlot[] = [];
  private readonly byActor = new WeakMap<Predator, WolfSlot>();
  private readonly dens = new Set<Habitat>();
  private readonly discovered = new Set<Habitat>();
  private nextCheck = 0;

  constructor(private readonly context: Context) {}

  register(id: string, index: number): void {
    const den = this.context.habitats.predator('wolf', Math.floor(index / PACK_SIZE));
    if (!den) return;
    this.dens.add(den);
    const slot: WolfSlot = { id, index, den };
    this.slots.push(slot);

    const state = this.context.save.wolves?.[id];
    if (state?.state === 'alive') this.place(slot, state, state.health);
    else if (state?.state === 'vacant') slot.replaceAt = state.replaceAt;
    else if (this.context.save.deadPopulation?.includes(id))
      slot.replaceAt = this.context.save.clock + REPLACEMENT_MINUTES;
    else this.place(slot);
  }

  updateIntents(clock: number): void {
    const routes = new Map<Habitat, TerritoryIntent>();
    for (const slot of this.slots) {
      if (!slot.actor?.alive) continue;
      const { habitats } = this.context;
      const intent = routes.get(slot.den) ?? habitats.intent(slot.den, clock, true);
      routes.set(slot.den, intent);
      slot.actor.followTerritory({
        ...intent,
        destination: habitats.nearHome(intent.destination, slot.index),
      });
    }
    this.context.habitats.setWolfRoutes([...routes.values()]);
  }

  onDeath(wolf: Predator, clock: number): void {
    const slot = this.byActor.get(wolf);
    if (!slot) return;
    slot.actor = undefined;
    slot.replaceAt = clock + REPLACEMENT_MINUTES;
    this.byActor.delete(wolf);
  }

  update(time: number, clock: number, player: HabitatPoint): void {
    if (time < this.nextCheck) return;
    this.nextCheck = time + 2;

    for (const den of this.dens) {
      if (
        this.discovered.has(den) ||
        Math.hypot(player.x - den.x, player.z - den.z) > DEN_DISCOVERY_RADIUS
      )
        continue;
      this.discovered.add(den);
      const discoveries = (this.context.save.discoveries ??= []);
      if (
        !discoveries.some(
          (place) => place.label === DEN_LABEL && place.x === den.x && place.z === den.z,
        )
      ) {
        discoveries.push({ x: den.x, z: den.z, label: DEN_LABEL });
        this.context.onDiscovery?.();
      }
    }

    for (const slot of this.slots) {
      if (slot.replaceAt === undefined || clock < slot.replaceAt) continue;
      if (Math.hypot(player.x - slot.den.x, player.z - slot.den.z) < RESPAWN_PLAYER_DISTANCE)
        continue;
      const wolf = this.place(slot);
      this.context.onArrival?.(wolf);
      // Даже если погибла вся стая, новая заселяет логово постепенно.
      break;
    }
  }

  capture(): void {
    const states: Record<string, WolfState> = {};
    for (const { id, actor, replaceAt } of this.slots) {
      if (actor?.alive)
        states[id] = { state: 'alive', x: actor.x, z: actor.z, health: actor.health };
      else
        states[id] = {
          state: 'vacant',
          replaceAt: replaceAt ?? this.context.save.clock + REPLACEMENT_MINUTES,
        };
    }
    this.context.save.wolves = states;
  }

  private place(
    slot: WolfSlot,
    point = this.context.habitats.nearHome(slot.den, slot.index),
    health?: number,
  ): Predator {
    const { save, world, predators, habitats } = this.context;
    const wolf = createPredatorActor(
      'wolf',
      point.x,
      point.z,
      new Random(slot.den.key ^ slot.index),
    );
    wolf.useWorldBounds(this.context.size);
    wolf.moveTo(point.x, point.z, world.heightAt(point.x, point.z));
    wolf.root.userData.remainsIdentity = slot.id;
    wolf.followTerritory(habitats.intent(slot.den, save.clock, true));
    if (health !== undefined) wolf.health = Math.min(health, wolf.maxHealth);
    slot.actor = wolf;
    slot.replaceAt = undefined;
    this.byActor.set(wolf, slot);
    predators.push(wolf);
    this.context.scene.add(wolf.root);

    if (save.deadPopulation?.includes(slot.id))
      save.deadPopulation = save.deadPopulation.filter((id) => id !== slot.id);
    return wolf;
  }
}
