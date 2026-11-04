import type { ForestAnimal, Predator } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { animalNames } from '../animals/names';
import { FRIENDSHIP_TRUST } from '../Friendship';
import type { DigNode } from '../types';

const GUARD = {
  playerRange: 9,
  pursuitRange: 6,
  defenseCooldown: 12,
  escortRange: 18,
} as const;

interface PlayerPosition extends DigNode {
  hidden: boolean;
}

/** Подводит ближайшего доступного друга к угрозе и даёт ему отразить или сорвать атаку. */
export class FriendDefense {
  private readonly readyAt = new WeakMap<ForestAnimal, number>();

  constructor(
    private readonly animals: readonly ForestAnimal[],
    private readonly toast: (line: string) => void,
  ) {}

  updateEscorts(player: PlayerPosition, clock: number, sheltered: boolean): void {
    for (const friend of this.animals) {
      const escort =
        !sheltered &&
        this.available(friend, player, GUARD.escortRange) &&
        (friend.social.escortUntil ?? 0) > clock;
      friend.followFriend(escort ? player : undefined);
    }
  }

  repel(predator: Predator, player: PlayerPosition, time: number): boolean {
    if (
      player.hidden ||
      !predator.huntingPlayer ||
      predator.underground ||
      Math.hypot(predator.x - player.x, predator.z - player.z) > GUARD.pursuitRange
    )
      return false;

    const friend = this.nearest(player, predator, time, false);
    if (!friend) return false;

    friend.guardAgainst(predator, time);
    const reach = Math.max(1.4, friend.profile.radius + predator.profile.radius + 0.65);
    if (Math.hypot(friend.x - predator.x, friend.z - predator.z) > reach) return false;

    // Маленькие друзья отвлекают без урона; крупные могут отбиться физически.
    const counter = friend.defense
      ? friend.receiveAttack(predator.profile.damage * 0.2, time, predator)
      : 0;
    predator.receiveAttack(counter, time, friend);
    predator.attackCooldown = Math.max(predator.attackCooldown, 1);
    this.used(friend, time, counter ? 'отогнал хищника' : 'отвлёк хищника');
    return true;
  }

  interruptStrike(player: PlayerPosition, time: number, water: boolean): boolean {
    const friend = this.nearest(player, player, time, water, water ? 2.4 : 3.2);
    if (!friend) return false;
    this.used(friend, time, water ? 'спугнул щуку' : 'сорвал бросок сокола');
    return true;
  }

  private nearest(
    player: PlayerPosition,
    target: { x: number; z: number },
    time: number,
    water: boolean,
    limit: number = GUARD.playerRange,
  ): ForestAnimal | undefined {
    let nearest: ForestAnimal | undefined;
    let best = limit;
    for (const friend of this.animals) {
      if (
        !this.available(friend, player, limit) ||
        time < (this.readyAt.get(friend) ?? 0) ||
        Boolean(friend.root.userData.swimming) !== water
      )
        continue;
      const distance = Math.hypot(friend.x - target.x, friend.z - target.z);
      if (distance >= best) continue;
      best = distance;
      nearest = friend;
    }
    return nearest;
  }

  private available(friend: ForestAnimal, player: PlayerPosition, range: number): boolean {
    return (
      friend.alive &&
      friend.kind !== 'fish' &&
      friend.trust >= FRIENDSHIP_TRUST &&
      !friend.root.userData.conversing &&
      !AnimalRestraint.active(friend.root) &&
      Math.abs(friend.root.position.y - player.y) < 1.8 &&
      Math.hypot(friend.x - player.x, friend.z - player.z) < range
    );
  }

  private used(friend: ForestAnimal, time: number, action: string): void {
    this.readyAt.set(friend, time + GUARD.defenseCooldown);
    this.toast(`Твой друг (${animalNames[friend.kind]}) ${action}!`);
  }
}
