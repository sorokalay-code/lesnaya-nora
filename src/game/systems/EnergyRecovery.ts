import type { SaveData } from '../types';

/** Восстанавливает силы после передышки; трата энергии заново запускает задержку восстановления. */
export class EnergyRecovery {
  private previousEnergy = 100;
  private recoverAfter = 0;

  update(player: SaveData['player'], dt: number, elapsed: number, moving: boolean): void {
    if (moving || player.energy < this.previousEnergy - 0.001) this.recoverAfter = elapsed + 4;

    if (!moving && elapsed >= this.recoverAfter) {
      const rate = player.hunger < 10 || player.thirst < 10 ? 0.3 : 1;
      player.energy = Math.min(100, player.energy + rate * dt);
    }

    this.previousEnergy = player.energy;
  }
}
