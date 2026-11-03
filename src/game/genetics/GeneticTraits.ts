import type { Genes } from '../types';
import { NEUTRAL_RABBIT_SHAPE } from './RabbitConformation';

export const DEFAULT_GENES: Genes = {
  shape: { ...NEUTRAL_RABBIT_SHAPE },
  coat: 'cream',
  secondaryCoat: 'white',
  pattern: 'solid',
  eyeColor: 'brown',
  ear: 1.1,
  speed: 3,
  vitality: 4,
  size: 1,
  endurance: 3,
  immunity: 3,
  metabolism: 3,
  coldResistance: 3,
  stability: 4,
  anatomy: { legs: 4, ears: 2, eyes: 2, fangs: false },
};

/** Единые эффекты генов для движения, потребностей, урона и интерфейса. Здоровье хранится в процентах. */
export class GeneticTraits {
  static mobility(genes: Genes): number {
    if (genes.anatomy.legs === 0) return 0;
    const legs = genes.anatomy.legs;
    return (
      (legs < 4 ? 0.35 + legs * 0.16 : legs > 4 ? 0.9 : 1) * (genes.anatomy.eyes === 0 ? 0.55 : 1)
    );
  }

  static resilience(genes: Genes): number {
    return 0.6 + genes.vitality * 0.1;
  }

  static energyCost(genes: Genes): number {
    return 1.45 - genes.endurance * 0.15;
  }

  static metabolism(genes: Genes): number {
    return 1.3 - genes.metabolism * 0.1;
  }

  static immunity(genes: Genes): number {
    return 0.55 + genes.immunity * 0.15;
  }

  static coldProtection(genes: Genes): number {
    return (genes.coldResistance - 3) * 2;
  }

  static canJump(genes: Genes): boolean {
    return genes.anatomy.legs >= 2 && genes.anatomy.eyes > 0;
  }

  static hearing(genes: Genes): number {
    return genes.anatomy.ears === 0 ? 0.35 : genes.anatomy.ears === 1 ? 0.7 : 1;
  }
}
