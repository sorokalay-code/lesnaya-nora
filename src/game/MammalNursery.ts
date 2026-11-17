import type { Animal } from './animals/Animal';
import type { HabitatPoint } from './AnimalHabitats';
import type { SaveData, WildlifeSocial } from './types';

const DAY = 1440;
const CARE_INTERVAL = 15;
const CARE_GRACE = DAY;
const PREPARE_NEST_MINUTES = 180;

export const MAMMAL_NURSERY = {
  wolf: {
    gestation: DAY,
    emerge: 360,
    meeting: 720,
    mature: 4 * DAY,
    interval: 6 * DAY,
    litter: 2,
  },
  marmot: {
    gestation: DAY,
    emerge: 240,
    meeting: 480,
    mature: 3 * DAY,
    interval: 5 * DAY,
    litter: 2,
  },
} as const;

export type NurseryKind = keyof typeof MAMMAL_NURSERY;
export type YoungStage = 'nest' | 'entrance' | 'meeting' | 'adult';

export interface MammalOrigin {
  bornAt: number;
  parents: [string, string];
}

export interface YoungMammal extends HabitatPoint {
  id: number;
  bornAt: number;
  lastCare: number;
  checkedAt: number;
  health: number;
  denDepth?: number;
  inside?: true;
  socialId?: number;
  social?: WildlifeSocial;
}

export interface NurseryState {
  nextAt: number;
  parents?: [string, string];
  dueAt?: number;
  young: YoungMammal[];
}

export function mammalIdentity(id: number): string {
  return `mammal:${id}`;
}

export function allocateMammal(save: SaveData): number {
  const id = save.nextMammalId ?? 1;
  save.nextMammalId = id + 1;
  return id;
}

/** Хранит один выводок и рассчитывает рождение, кормление и рост по игровым минутам. */
export class MammalNursery {
  private readonly profile: (typeof MAMMAL_NURSERY)[NurseryKind];
  readonly state: NurseryState;

  constructor(
    kind: NurseryKind,
    private readonly save: SaveData,
    readonly key: string,
  ) {
    this.profile = MAMMAL_NURSERY[kind];
    this.state = save.mammalNurseries?.[key] ?? { nextAt: 0, young: [] };
  }

  stage(young: YoungMammal, clock: number): YoungStage {
    const age = clock - young.bornAt;
    if (age >= this.profile.mature) return 'adult';
    if (age >= this.profile.meeting) return 'meeting';
    return age >= this.profile.emerge ? 'entrance' : 'nest';
  }

  preparingNest(clock: number): boolean {
    const due = this.state.dueAt;
    return due !== undefined && clock >= due - PREPARE_NEST_MINUTES;
  }

  restoreGrowth(young: YoungMammal, actor: Animal, clock: number): void {
    actor.updateGrowth(this.growth(young, clock));
  }

  origin(young: YoungMammal): MammalOrigin | undefined {
    if (this.state.parents) return { bornAt: young.bornAt, parents: this.state.parents };
  }

  grow(young: YoungMammal, actor: Animal, clock: number, attended: boolean): void {
    const growth = this.growth(young, clock);
    actor.updateGrowth(growth);
    if (!actor.alive || growth === 1 || clock - young.checkedAt < CARE_INTERVAL) return;

    if (attended) {
      young.lastCare = clock;
      const healthyWeight = actor.maxHealth * (0.45 + 0.55 * growth);
      if (actor.health < healthyWeight)
        actor.health = Math.min(healthyWeight, actor.health + actor.maxHealth * 0.035);
    } else {
      const missingCare = clock - Math.max(young.checkedAt, young.lastCare + CARE_GRACE);
      if (missingCare > 0)
        actor.health = Math.max(0, actor.health - (missingCare / DAY) * actor.maxHealth * 0.65);
    }
    young.checkedAt = clock;
  }

  advance(
    clock: number,
    parents: [string, string] | undefined,
    motherPresent: boolean,
    birthAt: HabitatPoint,
    health: number,
  ): void {
    const state = this.state;
    if (state.young.length || clock < state.nextAt) return;

    if (state.dueAt !== undefined) {
      if (!motherPresent) {
        delete state.dueAt;
        delete state.parents;
        state.nextAt = clock + DAY;
        return;
      }
      if (clock < state.dueAt) return;

      const bornAt = state.dueAt;
      delete state.dueAt;
      state.nextAt = bornAt + this.profile.interval;
      for (let index = 0; index < this.profile.litter; index++) {
        state.young.push({
          x: birthAt.x,
          z: birthAt.z,
          id: allocateMammal(this.save),
          bornAt,
          checkedAt: bornAt,
          lastCare: bornAt,
          health,
        });
      }
      return;
    }

    if (!parents) return;
    (this.save.mammalNurseries ??= {})[this.key] = state;
    state.parents = parents;
    state.dueAt = clock + this.profile.gestation;
  }

  remove(young: YoungMammal): void {
    const index = this.state.young.indexOf(young);
    if (index >= 0) this.state.young.splice(index, 1);
  }

  private growth(young: YoungMammal, clock: number): number {
    return Math.min(1, Math.max(0, clock - young.bornAt) / this.profile.mature);
  }
}
