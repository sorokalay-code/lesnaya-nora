import type { SaveData } from '../types';

/** Медленно возвращает силы постоянно, а после передышки включает ускоренное восстановление. */
export class EnergyRecovery {
  private previousEnergy = 100;
  private recoverAfter = 0;

  update(player: SaveData['player'], dt: number, elapsed: number, moving: boolean): void {
    if (moving || player.energy < this.previousEnergy - 0.001) this.recoverAfter = elapsed + 4;

    const depleted = player.hunger < 10 || player.thirst < 10;
    const base = depleted ? 0.12 : 0.18;
    const bonus = !moving && elapsed >= this.recoverAfter ? (depleted ? 0.18 : 0.82) : 0;
    player.energy = Math.min(100, player.energy + (base + bonus) * dt * (moving ? 1 : 3));

    this.previousEnergy = player.energy;
  }
}
