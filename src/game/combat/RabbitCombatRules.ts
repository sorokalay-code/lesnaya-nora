import type { Genes } from '../types';
import { RABBIT_BODY } from '../RabbitBody';
import { RabbitConformation } from '../genetics/RabbitConformation';
import { RABBIT_ATTACKS, type RabbitAttack } from './AttackProfiles';

export function rabbitCombatPower(generation: number): number {
  // Рост ощутим, но не превращает позднее поколение в неограниченный источник урона.
  return 1 + Math.min(2, Math.max(0, generation - 1) * 0.12);
}

export function rabbitAttackDamage(kind: RabbitAttack, generation: number): number {
  return RABBIT_ATTACKS[kind].damage * rabbitCombatPower(generation);
}

export function rabbitAttackReach(genes: Genes, kind: RabbitAttack): number {
  const shape = RabbitConformation.shape(genes);
  // Те же размеры капсулы, что у коллизий, независимо от посещаемой сцены.
  return (
    (RABBIT_BODY.radius * shape.bodyWidth +
      RABBIT_BODY.halfLength * shape.bodyLength +
      RABBIT_ATTACKS[kind].reach) *
    genes.size
  );
}
