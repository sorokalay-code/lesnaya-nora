import type { Scene } from 'three';
import { AnimalFactory, type Predator } from '../animals';
import type { Wolf } from '../animals/Wolf';
import type { AnimalHabitats, Habitat, HabitatPoint, TerritoryIntent } from '../AnimalHabitats';
import { Random } from '../Random';
import type { SaveData } from '../types';
import type { World } from '../World';
import type { WolfDen } from '../WolfDen';
import type { WolfDens } from '../WolfDens';

export type WolfState =
  | { state: 'alive'; x: number; z: number; health: number; denDepth?: number }
  | { state: 'vacant'; replaceAt: number };

interface WolfSlot {
  id: string;
  pack: WolfPack;
  index: number;
  restAt?: HabitatPoint;
  actor?: Wolf;
  replaceAt?: number;
}

interface WolfPack {
  home: Habitat;
  den?: WolfDen;
}

interface Context {
  save: SaveData;
  world: Pick<World, 'heightAt'> & Partial<Pick<World, 'waterAt'>>;
  scene: Scene;
  predators: Predator[];
  habitats: AnimalHabitats;
  dens: WolfDens;
  size: number;
  count: number;
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
  private readonly packs = new Map<number, WolfPack>();
  private readonly discovered = new Set<number>();
  private nextCheck = 0;

  constructor(private readonly context: Context) {}

  register(id: string, index: number): void {
    const packId = Math.floor(index / PACK_SIZE);
    const pack = this.packAt(packId);
    if (!pack) return;

    const member = index % PACK_SIZE;
    const packSize = Math.min(PACK_SIZE, this.context.count - packId * PACK_SIZE);
    const insideCount = Math.min(2, Math.max(1, packSize - 1));
    const restAt =
      member < insideCount
        ? pack.den?.entrance
        : pack.den?.point(member === 2 ? 2.35 : -2.35, -1.45);
    const slot: WolfSlot = { id, index, pack, restAt };
    this.slots.push(slot);

    const state = this.context.save.wolves?.[id];
    if (state?.state === 'alive') this.place(slot, state);
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
      const { home } = slot.pack;
      const intent = routes.get(home) ?? habitats.intent(home, clock, true);
      routes.set(home, intent);
      this.follow(slot, intent);
    }

    this.context.habitats.setWolfRoutes(
      [...this.packs.values()].flatMap(({ home, den }) => {
        const route = routes.get(home);
        if (!route) return [];
        return [{ ...route, home: den ? { ...home, ...den.entrance } : home }];
      }),
    );
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

    for (const { den } of this.packs.values()) {
      if (!den) continue;
      const { x, z } = den.entrance;
      if (
        this.discovered.has(den.id) ||
        Math.hypot(player.x - x, player.z - z) > DEN_DISCOVERY_RADIUS
      )
        continue;
      this.discovered.add(den.id);
      const discoveries = (this.context.save.discoveries ??= []);
      if (
        !discoveries.some((place) => place.label === DEN_LABEL && place.x === x && place.z === z)
      ) {
        discoveries.push({ x, z, label: DEN_LABEL });
        this.context.onDiscovery?.();
      }
    }

    for (const slot of this.slots) {
      if (slot.replaceAt === undefined || clock < slot.replaceAt) continue;
      const site = slot.pack.den?.entrance ?? slot.pack.home;
      if (Math.hypot(player.x - site.x, player.z - site.z) < RESPAWN_PLAYER_DISTANCE) continue;
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
        states[id] = {
          state: 'alive',
          x: actor.x,
          z: actor.z,
          health: actor.health,
          denDepth: actor.inDen ? actor.denDepth : undefined,
        };
      else
        states[id] = {
          state: 'vacant',
          replaceAt: replaceAt ?? this.context.save.clock + REPLACEMENT_MINUTES,
        };
    }
    this.context.save.wolves = states;
  }

  private packAt(id: number): WolfPack | undefined {
    const existing = this.packs.get(id);
    if (existing) return existing;

    const home = this.context.habitats.predator('wolf', id);
    if (!home) return;

    const den = this.context.dens.place(id, home, home.key);
    const pack: WolfPack = { home, den };
    this.packs.set(id, pack);
    if (den) this.moveLegacyDiscovery(home, den);
    return pack;
  }

  private moveLegacyDiscovery(home: HabitatPoint, den: WolfDen): void {
    const marks = this.context.save.discoveries;
    if (!marks) return;

    const { x, z } = den.entrance;
    const old = marks.findIndex(
      (mark) => mark.label === DEN_LABEL && mark.x === home.x && mark.z === home.z,
    );
    if (old < 0 || (x === home.x && z === home.z)) return;

    if (marks.some((mark) => mark.label === DEN_LABEL && mark.x === x && mark.z === z))
      marks.splice(old, 1);
    else marks[old] = { x, z, label: DEN_LABEL };
  }

  private follow(slot: WolfSlot, intent: TerritoryIntent): void {
    const destination =
      slot.restAt && intent.resting
        ? slot.restAt
        : this.context.habitats.nearHome(intent.destination, slot.index);
    slot.actor?.followTerritory({ ...intent, destination });
  }

  private place(slot: WolfSlot, state?: Extract<WolfState, { state: 'alive' }>): Wolf {
    const { save, world, predators, habitats } = this.context;
    const { home, den } = slot.pack;
    const spawn =
      den?.point(((slot.index % PACK_SIZE) - 1.5) * 1.05, -2.75) ??
      habitats.nearHome(home, slot.index);
    const point =
      state && (!den || state.denDepth || den.penetration(state.x, state.z) <= 0) ? state : spawn;
    const wolf = AnimalFactory.wolf(point.x, point.z, new Random(home.key ^ slot.index));
    wolf.useWorldBounds(this.context.size);
    wolf.moveTo(point.x, point.z, world.heightAt(point.x, point.z));
    wolf.root.userData.remainsIdentity = slot.id;
    if (state) wolf.health = Math.min(state.health, wolf.maxHealth);
    slot.actor = wolf;
    slot.replaceAt = undefined;
    this.byActor.set(wolf, slot);
    this.follow(slot, habitats.intent(home, save.clock, true));
    if (den) {
      wolf.useDen({
        den,
        member: slot.index % PACK_SIZE,
        restInside: slot.restAt === den.entrance,
        heightAt: (x, z) => {
          const y = world.heightAt(x, z);
          if (!this.context.dens.canMove({ x: wolf.x, z: wolf.z }, x, z, y, 0.1)) return;
          if ((world.waterAt?.(x, z)?.depth ?? 0) > 0.15) return;
          return y;
        },
      });
      if (state?.denDepth) wolf.restoreDen(state.denDepth);
    }
    predators.push(wolf);
    this.context.scene.add(wolf.root);

    if (save.deadPopulation?.includes(slot.id))
      save.deadPopulation = save.deadPopulation.filter((id) => id !== slot.id);
    return wolf;
  }
}
