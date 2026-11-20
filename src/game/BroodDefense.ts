import type { HabitatPoint } from './AnimalHabitats';
import type { Animal } from './animals/Animal';
import type { Object3D } from 'three';

export type BroodDefenseKind = 'bear' | 'fox' | 'hawk' | 'owl';
interface BroodHome extends HabitatPoint {
  y?: number;
  support?: Object3D;
}
export interface BroodGuard<A extends Animal> {
  actor: A;
  home: BroodHome;
  center: HabitatPoint;
}
export type BroodDefenseOrder =
  | { phase: 'warning' | 'return'; home: BroodHome }
  | { phase: 'pursuit'; home: BroodHome; target: HabitatPoint };

const PROFILES = {
  bear: { warning: 13, intrusion: 6, chase: 18, grace: 1.6 },
  fox: { warning: 8, intrusion: 4, chase: 11, grace: 1.2 },
  hawk: { warning: 12, intrusion: 7, chase: 16, grace: 1.3 },
  owl: { warning: 9, intrusion: 5, chase: 13, grace: 1.5 },
};
const MIN_RETURN_SECONDS = 3;
const MAX_RETURN_SECONDS = 24;
const HOME_REACH = 2;

const distance = (a: HabitatPoint, b: HabitatPoint) => Math.hypot(a.x - b.x, a.z - b.z);

interface Alert {
  since: number;
  pursuing: boolean;
  returnSince: number;
  boundary?: HabitatPoint;
}

/** Ограничивает защиту выводка его окрестностями и даёт игроку время отступить. */
export class BroodDefense {
  private readonly alerts = new WeakMap<Animal, Alert>();

  update(
    kind: BroodDefenseKind,
    guard: BroodGuard<Animal>,
    player: HabitatPoint | undefined,
    time: number,
    warn: () => void,
  ): BroodDefenseOrder | undefined {
    const profile = PROFILES[kind];
    const { actor, center, home } = guard;
    let alert = this.alerts.get(actor);
    const range = alert?.pursuing ? profile.chase : profile.warning;
    const boundary = alert?.boundary ?? center;
    const near =
      player &&
      distance(player, boundary) <= range &&
      distance(actor, boundary) <= profile.chase + 3;
    if (!near) {
      if (!alert) return;
      if (alert.pursuing || Number.isFinite(alert.since)) {
        alert.returnSince = time;
        alert.since = Infinity;
        alert.pursuing = false;
        alert.boundary = undefined;
      }
      const elapsed = time - alert.returnSince;
      if (
        elapsed < MIN_RETURN_SECONDS ||
        (elapsed < MAX_RETURN_SECONDS && distance(actor, home) > HOME_REACH)
      )
        return { phase: 'return', home };
      this.alerts.delete(actor);
      return;
    }

    if (!alert || !Number.isFinite(alert.since)) {
      alert = { since: time, pursuing: false, returnSince: 0 };
      this.alerts.set(actor, alert);
      warn();
    }
    if (
      !alert.pursuing &&
      distance(player, center) <= profile.intrusion &&
      time - alert.since >= profile.grace
    ) {
      alert.pursuing = true;
      alert.boundary = { x: center.x, z: center.z };
    }
    return alert.pursuing ? { phase: 'pursuit', home, target: player } : { phase: 'warning', home };
  }

  clear(actor: Animal): void {
    this.alerts.delete(actor);
  }
}
