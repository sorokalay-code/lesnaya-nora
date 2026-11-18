import type { SaveData } from '../types';
import { ForestAnimal, Predator, type FlyingRaptor } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { setRabbitAction, type RabbitRig } from '../Models';
import { RABBIT_BODY } from '../RabbitBody';

export type RabbitAttack = 'swipe' | 'bite';
export const RABBIT_ATTACKS = {
  swipe: { damage: 2, energy: 7, windup: 0.16, recovery: 0.65, reach: 0.35, arc: 0.2 },
  bite: { damage: 4, energy: 14, windup: 0.28, recovery: 1.1, reach: 0.18, arc: 0.65 },
} as const;

export function rabbitCombatPower(generation: number): number {
  // Рост ощутим, но не превращает позднее поколение в неограниченный источник урона.
  return 1 + Math.min(2, Math.max(0, generation - 1) * 0.12);
}

interface Context {
  save: SaveData;
  player: RabbitRig;
  predators: Predator[];
  wildlife: ForestAnimal[];
  hawks: FlyingRaptor[];
  elapsed: () => number;
  allowed: () => boolean;
  facing: () => { x: number; z: number };
  clearPath: (target: { x: number; z: number; root: RabbitRig['root'] }) => boolean;
  toast: (message: string) => void;
  hurt: (damage: number) => void;
}

/** Выполняет атаки игрока и ответный бой мирных животных, не владея перемещением и сохранением. */
export class PlayerCombat {
  private nextAttackAt = 0;
  private nextDefenseAt = 0;
  private pending?: { kind: RabbitAttack; at: number; heading: { x: number; z: number } };

  constructor(private readonly context: Context) {}

  attack(kind: RabbitAttack): boolean {
    const { save, player } = this.context;
    const time = this.context.elapsed();
    const profile = RABBIT_ATTACKS[kind];
    if (
      !this.context.allowed() ||
      AnimalRestraint.active(player.root) ||
      player.root.userData.jumping === true ||
      time < this.nextAttackAt ||
      save.player.health <= 0 ||
      save.player.energy < profile.energy ||
      (!['swipe', 'bite'].includes(String(player.root.userData.action)) &&
        Number(player.root.userData.actionUntil ?? 0) > time)
    )
      return false;

    save.player.energy -= profile.energy;
    this.nextAttackAt = time + profile.recovery;
    const heading = this.context.facing();
    player.root.rotation.y = Math.atan2(-heading.x, -heading.z);
    this.pending = { kind, at: time + profile.windup, heading };
    setRabbitAction(player, kind, time, profile.recovery);
    return true;
  }

  update(time: number): void {
    const allowed = this.context.allowed();
    if (
      !allowed ||
      this.context.player.root.userData.jumping === true ||
      (this.pending && this.context.player.root.userData.action !== this.pending.kind)
    )
      this.pending = undefined;
    if (this.pending && time >= this.pending.at) {
      const attack = this.pending;
      this.pending = undefined;
      this.strike(attack.kind, attack.heading, time);
    }
    if (!allowed || time < this.nextDefenseAt) return;
    this.nextDefenseAt = time + 0.1;

    for (const animal of this.context.wildlife) {
      if (!animal.alive || animal.inShelter || AnimalRestraint.active(animal.root)) continue;
      const damage = animal.fightPlayer(this.context.save.player, time);
      if (damage > 0 && this.context.clearPath(animal)) this.context.hurt(damage);
    }
  }

  private strike(kind: RabbitAttack, heading: { x: number; z: number }, time: number): void {
    const { save } = this.context;
    const p = save.player;
    const profile = RABBIT_ATTACKS[kind];
    let nearest: Predator | ForestAnimal | FlyingRaptor | undefined;
    let nearestDistance = Infinity;
    // Поиск только при ударе, без обхода всех акторов в кадровой анимации.
    for (const animal of [
      ...this.context.predators,
      ...this.context.wildlife,
      ...this.context.hawks,
    ]) {
      if (
        !animal.alive ||
        !animal.root.visible ||
        ((animal instanceof ForestAnimal || animal instanceof Predator) && animal.inShelter) ||
        AnimalRestraint.active(animal.root)
      )
        continue;
      const dx = animal.x - p.x;
      const dz = animal.z - p.z;
      const distance = Math.hypot(dx, dz);
      const radius =
        animal instanceof ForestAnimal || animal instanceof Predator ? animal.profile.radius : 0.4;
      // Отсчитываем выпад от переднего края капсулы, чтобы коллизия тел не блокировала укус.
      const reach =
        (RABBIT_BODY.radius + RABBIT_BODY.halfLength + profile.reach) * p.genes.size + radius;
      if (
        distance > reach ||
        distance >= nearestDistance ||
        Math.abs(animal.root.position.y - p.y) > 1.2 ||
        (distance > 0.01 && (dx * heading.x + dz * heading.z) / distance < profile.arc) ||
        !this.context.clearPath(animal)
      )
        continue;
      nearest = animal;
      nearestDistance = distance;
    }
    if (!nearest) {
      this.context.toast('Удар мимо — подойди ближе и повернись к противнику.');
      return;
    }
    const damage =
      profile.damage * rabbitCombatPower(p.lineage?.generation ?? save.stats.generations);
    if (nearest instanceof ForestAnimal) {
      nearest.receivePlayerAttack(damage, time, p);
      this.context.toast(
        nearest.hostile
          ? 'Животное стало враждебным!'
          : 'Нападение снизило репутацию. Повторный удар вызовет ответный бой.',
      );
    } else {
      if (nearest instanceof Predator) nearest.receiveAttack(damage, time, p);
      else nearest.health = Math.max(0, nearest.health - damage);
      this.context.toast(
        nearest.alive
          ? `${kind === 'swipe' ? 'Удар лапами' : 'Укус'}: ${damage.toFixed(1)} урона. Здоровье противника: ${Math.ceil(nearest.health)}.`
          : 'Противник повержен.',
      );
    }
  }
}
