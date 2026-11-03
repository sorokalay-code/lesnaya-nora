import type { HawkVictim } from './HawkVictims';
import { HAWK_HUNT } from '../animals/HawkProfile';

/** Приоритет охоты: игрок заметнее, но близкая ослабленная или маленькая добыча может оказаться выгоднее. */
export class HawkTargeting {
  score(victim: HawkVictim, bird: { x: number; z: number }): number {
    const p = victim.root.position;
    const distance = Math.hypot(p.x - bird.x, p.z - bird.z);
    if (distance > (victim.player ? HAWK_HUNT.playerRadius : HAWK_HUNT.preyRadius)) return Infinity;
    let priority = victim.player
      ? HAWK_HUNT.playerPriority
      : 1 + Math.max(0, 1 - victim.condition()) * 1.2;
    if (!victim.player && victim.bodyHeight < 0.5) priority *= 1.25;
    return Math.max(0.75, distance) / priority;
  }

  choose(
    candidates: Iterable<HawkVictim>,
    bird: { x: number; z: number },
    available: (victim: HawkVictim) => boolean,
  ): HawkVictim | undefined {
    let best = Infinity,
      selected: HawkVictim | undefined;
    for (const victim of candidates) {
      const score = this.score(victim, bird);
      if (score < best && available(victim)) {
        best = score;
        selected = victim;
      }
    }
    return selected;
  }
}
