import { Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import type { Animal } from './animals/Animal';
import type { HabitatPoint } from './AnimalHabitats';

export interface BroodFoodState {
  portions: number;
  checkedAt: number;
  lastFedAt: number;
  trip?: { carrier: string; startedAt: number };
}

const FEED_INTERVAL = 60;
export const FOOD_GRACE = 1440;
const FOOD_CAPACITY = 16;
const DELIVERY_PORTIONS = 8;
const DELIVERY_TIMEOUT_MINUTES = 720;
const FEED_DISPLAY_MINUTES = 24;

export function newBroodFood(clock: number): BroodFoodState {
  return { portions: 0, checkedAt: clock, lastFedAt: clock };
}

/** Календарное кормление расходует общий запас один раз на весь выводок, в том числе после сна. */
export function feedBrood(
  food: BroodFoodState,
  clock: number,
  mouths: number,
  attended: boolean,
): boolean {
  const intervals = Math.floor((clock - food.checkedAt) / FEED_INTERVAL);
  if (intervals > 0) {
    const meal = Math.max(1, mouths) * 0.25;
    const fed = attended ? Math.min(intervals, Math.floor(food.portions / meal)) : 0;
    food.portions -= fed * meal;
    if (fed > 0) food.lastFedAt = food.checkedAt + fed * FEED_INTERVAL;
    food.checkedAt += intervals * FEED_INTERVAL;
  }
  return attended && clock - food.lastFedAt <= FEED_INTERVAL;
}

export function beginProvision(food: BroodFoodState, carrier: string, clock: number): boolean {
  if (food.trip || food.portions >= DELIVERY_PORTIONS) return false;
  food.trip = { carrier, startedAt: clock };
  return true;
}

export function validBroodFood(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const food = value as Partial<BroodFoodState>;
  const minute = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (
    !minute(food.portions) ||
    food.portions > FOOD_CAPACITY ||
    !minute(food.checkedAt) ||
    !minute(food.lastFedAt) ||
    food.lastFedAt > food.checkedAt
  )
    return false;
  const trip = food.trip;
  return (
    trip === undefined ||
    (typeof trip === 'object' &&
      trip !== null &&
      typeof trip.carrier === 'string' &&
      trip.carrier.length > 0 &&
      trip.carrier.length < 100 &&
      minute(trip.startedAt))
  );
}

/** Показывает порцию добычи и завершает доставку только у дома; ресурсы принадлежат сервису. */
export class BroodProvisioning {
  private readonly geometry = new SphereGeometry(0.2, 7, 5);
  private readonly material = new MeshStandardMaterial({ color: 0x995d50, roughness: 0.95 });
  private readonly parcels = new Map<BroodFoodState, Mesh>();
  private readonly feeding = new Map<BroodFoodState, number>();
  private readonly feeders = new Map<BroodFoodState, Animal>();
  private readonly mealPlaces = new Map<BroodFoodState, Vector3>();

  update(
    food: BroodFoodState,
    actor: Animal | undefined,
    home: HabitatPoint,
    clock: number,
  ): boolean {
    let returning = false;
    if (food.trip) {
      if (!actor?.alive || clock - food.trip.startedAt > DELIVERY_TIMEOUT_MINUTES) delete food.trip;
      else if (
        Math.hypot(actor.x - home.x, actor.z - home.z) < 1.3 &&
        (!('y' in home) ||
          typeof home.y !== 'number' ||
          Math.abs(actor.root.position.y - home.y) < 1.2)
      ) {
        food.portions = Math.min(FOOD_CAPACITY, food.portions + DELIVERY_PORTIONS);
        delete food.trip;
        this.feeding.set(food, clock + FEED_DISPLAY_MINUTES);
        this.feeders.set(food, actor);
        this.mealPlaces.set(
          food,
          new Vector3(
            home.x,
            'y' in home && typeof home.y === 'number' ? home.y : actor.root.position.y,
            home.z,
          ),
        );
      } else returning = true;
    }
    actor ??= this.feeders.get(food);
    const showing = actor?.alive && (returning || clock < (this.feeding.get(food) ?? 0));
    let parcel = this.parcels.get(food);
    if (showing && actor) {
      if (!parcel) {
        parcel = new Mesh(this.geometry, this.material);
        parcel.name = 'brood-prey-portion';
        this.parcels.set(food, parcel);
      }
      const bird = actor.kind === 'hawk' || actor.kind === 'owl';
      const meal = this.mealPlaces.get(food);
      if (!returning && meal && actor.root.parent) {
        // После передачи корм остаётся у входа/в гнезде, а не уезжает с кормильцем.
        if (parcel.parent !== actor.root.parent) actor.root.parent.add(parcel);
        parcel.position.copy(meal);
        parcel.position.y += 0.18;
      } else {
        if (parcel.parent !== actor.root) actor.root.add(parcel);
        parcel.position.set(0, bird ? -0.1 : 0.35, bird ? -0.12 : -0.6);
      }
      parcel.scale.setScalar(returning ? 1 : 0.75 + Math.sin(clock * 2) * 0.15);
    }
    if (parcel) parcel.visible = !!showing;
    return returning;
  }

  prune(foods: Iterable<BroodFoodState>): void {
    const active = new Set(foods);
    for (const [food, parcel] of this.parcels) {
      if (active.has(food)) continue;
      parcel.removeFromParent();
      this.parcels.delete(food);
      this.feeders.delete(food);
      this.feeding.delete(food);
      this.mealPlaces.delete(food);
    }
  }

  dispose(): void {
    for (const parcel of this.parcels.values()) parcel.removeFromParent();
    this.parcels.clear();
    this.feeding.clear();
    this.feeders.clear();
    this.mealPlaces.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
