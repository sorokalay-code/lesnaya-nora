import type { Scene } from 'three';
import { AnimalFactory, type Predator } from '../animals';
import type { Wolf } from '../animals/Wolf';
import type { AnimalHabitats, Habitat, HabitatPoint, TerritoryIntent } from '../AnimalHabitats';
import { Random } from '../Random';
import type { SaveData } from '../types';
import type { World } from '../World';
import type { WolfDen } from '../WolfDen';
import type { WolfDens } from '../WolfDens';
import { WolfDenDefense } from '../WolfDenDefense';
import { traceGround } from '../GroundContact';

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
  shelter?: { den: WolfDen; defense: WolfDenDefense };
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
  onDenWarning?: () => void;
}

const PACK_SIZE = 4;
const REPLACEMENT_MINUTES = 1440;
const RESPAWN_PLAYER_DISTANCE = 22;
const DEN_DISCOVERY_RADIUS = 12;
const DEN_LABEL = 'Волчье логово';
const WATCH_INTERVAL_SECONDS = 0.3;
const RIVAL_INTRUSION_RADIUS = 7;
const PATROL_STOPS = [
  [3.1, -2.3],
  [2.15, -5],
  [-2.1, -5],
  [-3.1, -2.3],
] as const;

/** Владеет местами волков в стаях, обнаружением логовищ и замещением погибших по календарю. */
export class WolfPopulation {
  private readonly slots: WolfSlot[] = [];
  private readonly byActor = new WeakMap<Predator, WolfSlot>();
  private readonly packs = new Map<number, WolfPack>();
  private readonly discovered = new Set<number>();
  private nextCheck = 0;
  private nextWatch = 0;
  private watching = false;

  constructor(private readonly context: Context) {}

  register(id: string, index: number): void {
    const packId = Math.floor(index / PACK_SIZE);
    const pack = this.packAt(packId);
    if (!pack) return;

    const member = index % PACK_SIZE;
    const packSize = Math.min(PACK_SIZE, this.context.count - packId * PACK_SIZE);
    const insideCount = Math.min(2, Math.max(1, packSize - 1));
    const den = pack.shelter?.den;
    const restAt =
      member < insideCount ? den?.entrance : den?.point(member === 2 ? 2.35 : -2.35, -1.45);
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
      [...this.packs.values()].flatMap(({ home, shelter }) => {
        const route = routes.get(home);
        if (!route) return [];
        return [{ ...route, home: shelter ? { ...home, ...shelter.den.entrance } : home }];
      }),
    );
  }

  prepareDefense(time: number, player: HabitatPoint | undefined, combat: boolean): void {
    if (!combat) {
      if (this.watching)
        for (const { shelter } of this.packs.values())
          shelter?.defense.update(time, undefined, undefined);
      this.watching = false;
      return;
    }
    if (this.watching && time < this.nextWatch) return;

    this.watching = true;
    this.nextWatch = time + WATCH_INTERVAL_SECONDS;
    const guards = new Map<WolfPack, Wolf>();
    for (const { actor, pack } of this.slots) {
      if (!actor?.alive || !pack.shelter?.defense.canRespond(actor)) continue;
      const current = guards.get(pack);
      if (!current || (current.inDen && !actor.inDen)) guards.set(pack, actor);
    }

    for (const pack of this.packs.values()) {
      const defense = pack.shelter?.defense;
      if (!defense) continue;

      const guard = guards.get(pack);
      const rival = guard ? this.rivalAt(pack, defense) : undefined;
      if (defense.update(time, guard ? player : undefined, rival) && guard) {
        guard.warnIntruder(time);
        this.context.onDenWarning?.();
      }
    }
  }

  private rivalAt(pack: WolfPack, defense: WolfDenDefense): Predator | undefined {
    const available = (actor: Predator) =>
      actor.alive &&
      !actor.inDen &&
      !actor.underground &&
      actor.homeTerritory !== pack.home &&
      (actor.kind === 'wolf' ||
        actor.kind === 'fox' ||
        actor.kind === 'dog' ||
        actor.kind === 'lynx') &&
      Math.abs(actor.root.position.y - this.context.world.heightAt(actor.x, actor.z)) < 1.5;

    const previous = defense.trackedRival;
    if (previous && available(previous)) return previous;
    return this.context.predators.find(
      (actor) => defense.near(actor, RIVAL_INTRUSION_RADIUS) && available(actor),
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

    for (const { shelter } of this.packs.values()) {
      if (!shelter) continue;
      const { den } = shelter;
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
      const site = slot.pack.shelter?.den.entrance ?? slot.pack.home;
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
    const pack: WolfPack = {
      home,
      shelter: den ? { den, defense: new WolfDenDefense(den) } : undefined,
    };
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
    const { home, shelter } = slot.pack;
    const den = shelter?.den;
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
    if (shelter) {
      this.assignShelter(wolf, slot, shelter);
      if (state?.denDepth) wolf.restoreDen(state.denDepth);
    }
    predators.push(wolf);
    this.context.scene.add(wolf.root);

    if (save.deadPopulation?.includes(slot.id))
      save.deadPopulation = save.deadPopulation.filter((id) => id !== slot.id);
    return wolf;
  }

  private assignShelter(
    wolf: Wolf,
    slot: WolfSlot,
    shelter: NonNullable<WolfPack['shelter']>,
  ): void {
    const { den, defense } = shelter;
    const { world, dens } = this.context;
    const heightAt = (x: number, z: number) => {
      const y = world.heightAt(x, z);
      if (!dens.canMove(wolf, x, z, y, 0.1)) return;
      if ((world.waterAt?.(x, z)?.depth ?? 0) > 0.15) return;
      return y;
    };
    const restInside = slot.restAt === den.entrance;
    const patrol = restInside
      ? []
      : PATROL_STOPS.map(([side, depth]) => den.point(side, depth)).filter((point) => {
          const reached = traceGround(den.approach, point.x, point.z, { heightAt });
          return Math.hypot(reached.x - point.x, reached.z - point.z) < 0.01;
        });
    wolf.useDen({ den, member: slot.index % PACK_SIZE, restInside, heightAt, defense, patrol });
  }
}
