import type { HabitatPoint } from './AnimalHabitats';
import type { SaveData } from './types';

export type ImmigrationKind = 'hawk' | 'owl' | 'dog' | 'pheasant';
const DAY = 1440;
const DELAYS = { hawk: 4 * DAY, owl: 4 * DAY, dog: 2 * DAY, pheasant: 3 * DAY };
const PLAYER_DISTANCE = 26;

export function immigrationReady(save: SaveData, kind: ImmigrationKind, vacant: boolean): boolean {
  if (!vacant) {
    if (save.territoryImmigration) delete save.territoryImmigration[kind];
    return false;
  }

  const dates = (save.territoryImmigration ??= {});
  const due = (dates[kind] ??= save.clock + DELAYS[kind]);
  return save.clock >= due;
}

export function afterImmigration(save: SaveData, kind: ImmigrationKind): void {
  (save.territoryImmigration ??= {})[kind] = save.clock + DAY;
}

export function awayFromPlayer(at: HabitatPoint, player: HabitatPoint): boolean {
  return Math.hypot(at.x - player.x, at.z - player.z) >= PLAYER_DISTANCE;
}
