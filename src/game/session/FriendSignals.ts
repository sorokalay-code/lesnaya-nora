import type { ForestAnimal, Predator } from '../animals';
import { animalNames } from '../animals/names';
import { FRIENDSHIP_TRUST } from '../Friendship';

/** Друзья поблизости замечают наземных хищников; предупреждения ограничены по частоте. */
export class FriendSignals {
  private nextWarning = 0;

  update(
    time: number,
    player: { x: number; y: number; z: number; hidden: boolean },
    animals: readonly ForestAnimal[],
    predators: readonly Predator[],
    toast: (line: string) => void,
    clock = time * 6,
  ): void {
    if (player.hidden) return;
    for (const animal of animals) {
      if (
        animal.alive &&
        animal.trust >= FRIENDSHIP_TRUST &&
        Math.hypot(animal.x - player.x, animal.z - player.z) < 5 &&
        clock - (animal.social.lastGreetingAt ?? -Infinity) > 360
      ) {
        animal.social.lastGreetingAt = clock;
        animal.greet(player, time);
        toast(`${animalNames[animal.kind]} узнаёт тебя и радостно приветствует!`);
        break;
      }
    }
    if (time < this.nextWarning) return;
    const friend = animals.find(
      (animal) =>
        animal.alive &&
        animal.trust >= FRIENDSHIP_TRUST &&
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
