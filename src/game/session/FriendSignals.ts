import type { ForestAnimal, Predator } from '../animals';
import { animalNames } from '../animals/names';

/** Друзья поблизости замечают наземных хищников; предупреждения ограничены по частоте. */
export class FriendSignals {
  private nextWarning = 0;

  update(
    time: number,
    player: { x: number; y: number; z: number; hidden: boolean },
    animals: readonly ForestAnimal[],
    predators: readonly Predator[],
    toast: (line: string) => void,
  ): void {
    if (time < this.nextWarning || player.hidden) return;
    const friend = animals.find(
      (animal) =>
        animal.alive &&
        animal.trust >= 50 &&
        Math.hypot(animal.x - player.x, animal.z - player.z) < 18,
    );
    if (!friend) return;
    const threat = predators.find(
      (predator) =>
        predator.alive &&
        !predator.underground &&
        Math.hypot(predator.x - friend.x, predator.z - friend.z) < 20 &&
        Math.hypot(predator.x - player.x, predator.z - player.z) < 24,
    );
    if (!threat) return;
    this.nextWarning = time + 12;
    toast(
      `${animalNames[friend.kind]} подаёт тревожный сигнал: хищник в ${Math.round(Math.hypot(threat.x - player.x, threat.z - player.z))} м!`,
    );
  }
}
