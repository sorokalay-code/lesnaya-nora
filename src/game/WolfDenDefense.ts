import type { HabitatPoint } from './AnimalHabitats';
import type { Predator } from './animals/Predator';
import type { WolfDen } from './WolfDen';

const WARNING_RADIUS = 9;
const ATTACK_RADIUS = 5.5;
const CHASE_RADIUS = 13;
const WARNING_SECONDS = 0.8;
const TOLERANCE_SECONDS = 2.6;

/** Хранит общее состояние тревоги стаи вокруг одного входа. */
export class WolfDenDefense {
  private player?: HabitatPoint;
  private playerSince = -Infinity;
  private pursuingPlayer = false;
  private rival?: Predator;
  private nextWarningAt = 0;

  constructor(private readonly den: WolfDen) {}

  update(time: number, player: HabitatPoint | undefined, rival: Predator | undefined): boolean {
    const limit = this.pursuingPlayer ? CHASE_RADIUS : WARNING_RADIUS;
    const wasTracking = !!this.player;
    this.player = player && this.near(player, limit) ? player : undefined;
    this.rival = rival;
    if (!this.player) {
      this.pursuingPlayer = false;
      return false;
    }

    if (!wasTracking) this.playerSince = time;
    const waited = time - this.playerSince;
    if (
      waited >= TOLERANCE_SECONDS ||
      (waited >= WARNING_SECONDS && this.near(this.player, ATTACK_RADIUS))
    )
      this.pursuingPlayer = true;
    if (wasTracking || time < this.nextWarningAt) return false;

    this.nextWarningAt = time + 8;
    return true;
  }

  targetFor(wolf: HabitatPoint): HabitatPoint | undefined {
    return this.playerTargetFor(wolf) ?? this.rivalFor(wolf);
  }

  playerTargetFor(wolf: HabitatPoint): HabitatPoint | undefined {
    if (!this.canRespond(wolf)) return;
    if (this.pursuingPlayer && this.player && this.near(this.player, CHASE_RADIUS))
      return this.player;
  }

  get trackedRival(): Predator | undefined {
    return this.rival && this.near(this.rival, CHASE_RADIUS) ? this.rival : undefined;
  }

  rivalFor(wolf: HabitatPoint): Predator | undefined {
    const rival = this.rival;
    if (
      rival?.alive &&
      !rival.underground &&
      !rival.inDen &&
      this.canRespond(wolf) &&
      this.near(rival, CHASE_RADIUS)
    )
      return rival;
  }

  canRespond(wolf: HabitatPoint): boolean {
    return this.near(wolf, CHASE_RADIUS + 3);
  }

  near(point: HabitatPoint, limit: number): boolean {
    return Math.hypot(point.x - this.den.entrance.x, point.z - this.den.entrance.z) <= limit;
  }
}
