import type { HabitatPoint } from './AnimalHabitats';
import { SurfaceRoute } from './SurfaceRoute';
import type { DigNode } from './types';
import type { WildlifeShelter } from './WildlifeShelters';

type RoutineAction =
  | { kind: 'enter'; at: DigNode }
  | { kind: 'emerge'; at: DigNode; heading: number }
  | { kind: 'hidden' | 'rest' }
  | { kind: 'move'; target: HabitatPoint; fleeing: boolean };

const ENTRANCE_REACH = 0.22;
const APPROACH_REACH = 0.65;
const ESCAPE_RANGE = 9;
const WAIT_AFTER_DANGER = 4;
const APPROACH_TIMEOUT = 3;
const APPROACH_RETRY = 6;

/** Выбирает отдых, подход к укрытию и безопасный выход, не управляя моделью животного. */
export class WildlifeRoutine {
  private readonly route = new SurfaceRoute();
  private approachReached = false;
  private emerging = false;
  private hidden = false;
  private safeAt = 0;
  private previous?: { x: number; z: number; time: number };
  private retryAt = 0;

  constructor(
    readonly shelter: WildlifeShelter | undefined,
    private readonly heightAt: (x: number, z: number) => number | undefined,
  ) {}

  get inside(): boolean {
    return this.hidden;
  }

  restore(): DigNode | undefined {
    if (!this.shelter) return;
    this.hidden = true;
    return this.shelter.entrance;
  }

  update(
    from: DigNode,
    time: number,
    restAt: HabitatPoint | undefined,
    danger: HabitatPoint | undefined,
    canRetreat: boolean,
  ): RoutineAction | undefined {
    const shelter = this.shelter;
    if (shelter && this.hidden) {
      if (danger) this.safeAt = time + WAIT_AFTER_DANGER;
      if (restAt || time < this.safeAt) return { kind: 'hidden' };

      this.hidden = false;
      this.approachReached = false;
      this.emerging = true;
      return { kind: 'emerge', at: shelter.entrance, heading: shelter.site.angle };
    }

    if (shelter && this.emerging) {
      // Первые шаги идут наружу вдоль устья. Иначе корм за норой развернёт зверя прямо в муляж.
      if (
        !danger &&
        !restAt &&
        this.distance(from, shelter.approach) > APPROACH_REACH &&
        this.progressing(from, time)
      )
        return { kind: 'move', target: shelter.approach, fleeing: false };

      this.emerging = false;
      this.previous = undefined;
    }

    if (shelter && (danger || restAt) && time >= this.retryAt) {
      const { approach, entrance } = shelter;
      const retreat =
        danger &&
        canRetreat &&
        this.distance(from, entrance) <= ESCAPE_RANGE &&
        this.distance(danger, entrance) > 1.6 &&
        this.distance(from, entrance) < this.distance(danger, entrance) + 0.8;
      if ((!danger && restAt) || retreat) {
        if (this.distance(from, approach) <= APPROACH_REACH) this.approachReached = true;
        if (
          this.distance(from, entrance) <= ENTRANCE_REACH &&
          Math.abs(from.y - entrance.y) < 0.6
        ) {
          this.hidden = true;
          this.safeAt = danger ? time + WAIT_AFTER_DANGER : time;
          this.previous = undefined;
          return { kind: 'enter', at: entrance };
        }
        if (this.progressing(from, time)) {
          const target = this.approachReached
            ? entrance
            : this.route.step(from, approach, time, this.heightAt);
          return { kind: 'move', target, fleeing: !!retreat };
        }
      }
    }

    this.approachReached = false;
    if (danger || !restAt) {
      this.previous = undefined;
      return;
    }
    // При недоступной норе можно переждать тихое время на текущем сухом месте.
    if (
      shelter ||
      this.distance(from, restAt) < 0.45 ||
      time < this.retryAt ||
      !this.progressing(from, time)
    )
      return { kind: 'rest' };
    return {
      kind: 'move',
      target: this.route.step(from, restAt, time, this.heightAt),
      fleeing: false,
    };
  }

  private progressing(from: DigNode, time: number): boolean {
    if (!this.previous || this.distance(from, this.previous) >= 0.35) {
      this.previous = { x: from.x, z: from.z, time };
      return true;
    }
    if (time - this.previous.time < APPROACH_TIMEOUT) return true;

    this.retryAt = time + APPROACH_RETRY;
    return false;
  }

  private distance(a: HabitatPoint, b: HabitatPoint): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
}
