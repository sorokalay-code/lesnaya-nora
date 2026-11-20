import type { SaveData } from '../types';
import { FamilyMember, ForestAnimal, Predator, RabbitActor, type FlyingRaptor } from '../animals';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { setRabbitAction, type RabbitRig } from '../Models';
import { RABBIT_BODY } from '../RabbitBody';
import { rabbitAttackDamage, rabbitAttackReach } from '../combat/RabbitCombatRules';
export { rabbitCombatPower } from '../combat/RabbitCombatRules';
import { meleeContact } from './MeleeHitbox';

import { RABBIT_ATTACKS, type RabbitAttack } from '../combat/AttackProfiles';
export { RABBIT_ATTACKS, type RabbitAttack } from '../combat/AttackProfiles';
const HIT_WINDOW_SECONDS = 0.18;
const HITBOX_MARGIN_METRES = 0.22;
const MAX_HEIGHT_DIFFERENCE_METRES = 1.5;
const TARGET_APPROACH_MARGIN_METRES = 2;
type RabbitCombatTarget = RabbitActor | FamilyMember;
type CombatTarget = Predator | ForestAnimal | FlyingRaptor | RabbitCombatTarget;

interface Context {
  save: SaveData;
  player: RabbitRig;
  rabbits: RabbitActor[];
  families: FamilyMember[];
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
  private pending?: {
    kind: RabbitAttack;
    at: number;
    until: number;
    heading: { x: number; z: number };
    candidates: CombatTarget[];
  };

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
    this.pending = {
      kind,
      at: time + profile.windup,
      until: time + profile.windup + HIT_WINDOW_SECONDS,
      heading,
      candidates: this.nearbyTargets(kind),
    };
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
      if (time > attack.until) {
        this.pending = undefined;
        this.context.toast('Удар мимо — подойди ближе и повернись к противнику.');
      } else if (this.strike(attack.kind, attack.heading, attack.candidates, time))
        this.pending = undefined;
    }

    if (!allowed || time < this.nextDefenseAt) return;
    this.nextDefenseAt = time + 0.1;

    for (const animal of this.context.wildlife) {
      if (!animal.alive || animal.inShelter || AnimalRestraint.active(animal.root)) continue;
      const damage = animal.fightPlayer(this.context.save.player, time);
      if (damage > 0 && this.context.clearPath(animal)) this.context.hurt(damage);
    }
  }

  private targetRadius(animal: CombatTarget): number {
    if (animal instanceof RabbitActor || animal instanceof FamilyMember) {
      const bodyWidth = Number(animal.root.userData.bodyWidth ?? 1);
      const bodyLength = Number(animal.root.userData.bodyLength ?? 1);
      return (
        RABBIT_BODY.radius * bodyWidth * animal.root.scale.x +
        RABBIT_BODY.halfLength * bodyLength * animal.root.scale.x +
        HITBOX_MARGIN_METRES
      );
    }

    const radius =
      animal instanceof ForestAnimal || animal instanceof Predator ? animal.profile.radius : 0.4;
    return radius * animal.growthScale + HITBOX_MARGIN_METRES;
  }

  private nearbyTargets(kind: RabbitAttack): CombatTarget[] {
    const p = this.context.save.player;
    const reach = rabbitAttackReach(p.genes, kind) + TARGET_APPROACH_MARGIN_METRES;
    const candidates: CombatTarget[] = [];
    // Полный поиск только по нажатию; короткое окно удара проверяет уже отобранных соседей.
    for (const group of [
      this.context.rabbits,
      this.context.families,
      this.context.predators,
      this.context.wildlife,
      this.context.hawks,
    ]) {
      for (const animal of group) {
        if (
          animal.alive &&
          Math.hypot(animal.x - p.x, animal.z - p.z) <= reach + this.targetRadius(animal)
        )
          candidates.push(animal);
      }
    }
    return candidates;
  }

  private strike(
    kind: RabbitAttack,
    heading: { x: number; z: number },
    candidates: readonly CombatTarget[],
    time: number,
  ): boolean {
    const { save } = this.context;
    const p = save.player;
    const profile = RABBIT_ATTACKS[kind];
    let nearest: CombatTarget | undefined;
    let nearestDistance = Infinity;
    const sector = {
      x: p.x,
      z: p.z,
      direction: heading,
      reach: rabbitAttackReach(p.genes, kind),
      arcCosine: profile.arc,
    };
    for (const animal of candidates) {
      if (
        !animal.alive ||
        !animal.root.visible ||
        ('inShelter' in animal && animal.inShelter) ||
        AnimalRestraint.active(animal.root)
      )
        continue;
      const distance = meleeContact(sector, {
        x: animal.x,
        z: animal.z,
        radius: this.targetRadius(animal),
      });
      if (
        distance === undefined ||
        distance >= nearestDistance ||
        Math.abs(animal.root.position.y - p.y) > MAX_HEIGHT_DIFFERENCE_METRES ||
        !this.context.clearPath(animal)
      )
        continue;
      nearest = animal;
      nearestDistance = distance;
    }
    if (!nearest) return false;

    const damage = rabbitAttackDamage(kind, p.lineage?.generation ?? save.stats.generations);
    if (nearest instanceof ForestAnimal) {
      nearest.receivePlayerAttack(damage, time, p);
      this.context.toast(
        nearest.hostile
          ? 'Животное стало враждебным!'
          : 'Нападение снизило репутацию. Повторный удар вызовет ответный бой.',
      );
    } else {
      if (nearest instanceof Predator) nearest.receiveAttack(damage, time, p);
      else {
        nearest.health = Math.max(0, nearest.health - damage);
        if (nearest instanceof RabbitActor) nearest.data.health = nearest.health;
        if (nearest instanceof FamilyMember)
          (save.familyHealth ??= {})[nearest.data.id] = nearest.health;
      }
      this.context.toast(
        nearest.alive
          ? `${kind === 'swipe' ? 'Удар лапами' : 'Укус'}: ${damage.toFixed(1)} урона. Здоровье противника: ${Math.ceil(nearest.health)}.`
          : 'Противник повержен.',
      );
    }
    return true;
  }
}
