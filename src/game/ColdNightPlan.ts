import type { Excavation } from './Excavation';
import { NEST_FUR_COST } from './NestBedding';
import type { ColdNightGoal, ColdNightOuting, FoodKind, SaveData, StashData } from './types';

const WINTER_FOOD = ['clover', 'carrot', 'cabbage', 'berries'] as const satisfies FoodKind[];
const FOOD_TARGET = 8;
const PANTRY_CHECK_SECONDS = 0.5;

export function isColdNightFood(kind: FoodKind): boolean {
  return WINTER_FOOD.some((food) => food === kind);
}

export function isColdNightGoal(value: unknown): value is ColdNightGoal {
  return value === 'food' || value === 'fur';
}

export function companionGoal(goal: ColdNightGoal): ColdNightGoal {
  return goal === 'food' ? 'fur' : 'food';
}

interface PantryProgress {
  food: number;
  foodTarget: number;
  storedFur: number;
  carriedFur: number;
  furTarget: number;
  hasNest: boolean;
  warm: boolean;
  hasExit: boolean;
}

type PantrySupplies = Omit<PantryProgress, 'hasNest' | 'hasExit' | 'warm'>;

export function coldNightGoalMet(
  progress: PantrySupplies & { warm: boolean },
  goal: ColdNightGoal,
): boolean {
  if (goal === 'food') return progress.food >= progress.foodTarget;
  return progress.warm || progress.carriedFur + progress.storedFur >= progress.furTarget;
}

/** Хранит цель вылазки и проверяет запасы и гнёзда в сети выбранной кладовой. */
export class ColdNightPlan {
  private pantryCheck?: {
    outing: Readonly<ColdNightOuting>;
    warm: boolean;
    stash: StashData;
    until: number;
  };

  constructor(
    private readonly save: SaveData,
    private readonly earth: Pick<Excavation, 'burrowAt' | 'isSheltered'>,
    private readonly mapSize: number,
  ) {}

  get active(): Readonly<ColdNightOuting> | undefined {
    return this.save.coldNightOuting;
  }

  get helperAvailable(): boolean {
    return this.save.partners.some(
      (rabbit) => rabbit.id === this.save.mateId && (rabbit.health ?? 100) > 0,
    );
  }

  pantry(id: number): StashData | undefined {
    return this.save.stashes.find((stash) => stash.id === id);
  }

  progress(stash: StashData): PantryProgress | undefined {
    const network = this.networkAt(stash);
    if (!network) return;

    let hasNest = false;
    let warm = false;
    for (const nest of this.save.nests) {
      if (this.networkAt(nest) !== network) continue;
      hasNest = true;
      if (nest.insulated) {
        warm = true;
        break;
      }
    }
    return {
      ...this.supplies(stash),
      hasNest,
      warm,
      hasExit: network.exits.length > 0,
    };
  }

  ready(progress: PantryProgress): boolean {
    return coldNightGoalMet(progress, 'food') && progress.warm;
  }

  start(stashId: number, goal: ColdNightGoal): boolean {
    if (this.active) return false;
    const progress = this.localProgress(stashId);
    if (!progress?.hasExit || !progress.hasNest || this.ready(progress)) return false;
    if (coldNightGoalMet(progress, goal) && (goal === 'food' || progress.warm)) return false;

    this.save.coldNightOuting = { stashId, goal };
    return true;
  }

  assignHelper(): boolean {
    const outing = this.save.coldNightOuting;
    if (!outing || !this.helperAvailable || this.save.mateId === undefined) return false;
    if (outing.helperId === this.save.mateId) return false;
    const progress = this.localProgress(outing.stashId);
    if (
      !progress?.hasExit ||
      !progress.hasNest ||
      coldNightGoalMet(progress, companionGoal(outing.goal))
    )
      return false;

    outing.helperId = this.save.mateId;
    this.pantryCheck = undefined;
    this.save.mateCommand = 'forage';
    this.save.mateStay = undefined;
    return true;
  }

  mark(x: number, z: number): boolean {
    const outing = this.save.coldNightOuting;
    if (!outing || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (Math.abs(x) > this.mapSize || Math.abs(z) > this.mapSize) return false;

    outing.waypoint = { x, z };
    return true;
  }

  clearMarker(): boolean {
    if (!this.save.coldNightOuting?.waypoint) return false;
    delete this.save.coldNightOuting.waypoint;
    return true;
  }

  finish(): boolean {
    const outing = this.active;
    const progress = outing && this.localProgress(outing.stashId);
    return !!progress && this.ready(progress) && this.cancel();
  }

  cancel(): boolean {
    if (!this.active) return false;
    this.dismissHelper();
    delete this.save.coldNightOuting;
    return true;
  }

  dismissHelper(): void {
    const outing = this.save.coldNightOuting;
    if (outing?.helperId === undefined) return;
    if (outing.helperId === this.save.mateId && this.save.mateCommand === 'forage')
      this.save.mateCommand = 'home';
    delete outing.helperId;
    this.pantryCheck = undefined;
  }

  orderFor(
    rabbitId: number,
    time: number,
  ): { stash: StashData; goal: ColdNightGoal; ready: boolean } | undefined {
    const outing = this.active;
    if (outing?.helperId !== rabbitId || this.save.mateId !== rabbitId) return;
    if (this.save.mateCommand !== 'forage') return;

    // Узлы раскопа проверяем с интервалом, запасы читаем сразу после каждой доставки.
    if (this.pantryCheck?.outing !== outing || time >= this.pantryCheck.until) {
      const stash = this.pantry(outing.stashId);
      const progress = stash && this.progress(stash);
      if (!stash || !progress?.hasExit || !progress.hasNest) {
        this.dismissHelper();
        return;
      }
      this.pantryCheck = { outing, warm: progress.warm, stash, until: time + PANTRY_CHECK_SECONDS };
    }

    const goal = companionGoal(outing.goal);
    const { stash, warm } = this.pantryCheck;
    return { stash, goal, ready: coldNightGoalMet({ ...this.supplies(stash), warm }, goal) };
  }

  private supplies(stash: StashData): PantrySupplies {
    return {
      food: WINTER_FOOD.reduce((total, kind) => total + (stash.food[kind] ?? 0), 0),
      foodTarget: FOOD_TARGET,
      storedFur: stash.materials?.fur ?? 0,
      carriedFur: this.save.materials.fur,
      furTarget: NEST_FUR_COST,
    };
  }

  private localProgress(id: number): PantryProgress | undefined {
    const stash = this.pantry(id);
    if (!stash) return;
    const network = this.earth.burrowAt(this.save.player)?.network;
    if (!network || this.networkAt(stash) !== network) return;
    return this.progress(stash);
  }

  private networkAt(point: { x: number; y: number; z: number }) {
    if (this.earth.isSheltered(point.x, point.y, point.z))
      return this.earth.burrowAt(point)?.network;
  }
}
