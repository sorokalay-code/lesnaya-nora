import type { SaveData } from '../types';

const RECOVERY_DELAY_SECONDS = 2;
const RECOVERY_PER_SECOND = {
  nourished: { moving: 1, standing: 2, resting: 7.5 },
  depleted: { moving: 0.3, standing: 0.6, resting: 2.5 },
} as const;

/** Возвращает силы в движении и на месте, усиливая восстановление после короткой передышки. */
export class EnergyRecovery {
  private previousEnergy = 100;
  private recoverAfter = 0;

  update(player: SaveData['player'], dt: number, elapsed: number, moving: boolean): void {
    if (moving || player.energy < this.previousEnergy - 0.001)
      this.recoverAfter = elapsed + RECOVERY_DELAY_SECONDS;

    const depleted = player.hunger < 10 || player.thirst < 10;
    const rates = depleted ? RECOVERY_PER_SECOND.depleted : RECOVERY_PER_SECOND.nourished;
    const seconds = Math.max(0, dt);
    const base = moving ? rates.moving : rates.standing;
    // Считаем только часть шага после конца задержки, чтобы бонус не зависел от частоты кадров.
    const bonusSeconds = moving ? 0 : Math.max(0, Math.min(seconds, elapsed - this.recoverAfter));
    player.energy = Math.min(
      100,
      player.energy + base * seconds + (rates.resting - rates.standing) * bonusSeconds,
    );

    this.previousEnergy = player.energy;
  }
}
