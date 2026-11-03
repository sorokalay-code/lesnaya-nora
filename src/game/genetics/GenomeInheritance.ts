import { Random } from '../Random';
import type { Genes } from '../types';
import type { Anatomy } from './types';
import { RabbitConformation } from './RabbitConformation';
import { EAR_TYPES, EYE_SHAPES } from './RabbitFeatures';

/** Наследует независимые признаки; устойчивость и близкое родство определяют риск игровых мутаций. */
export class GenomeInheritance {
  constructor(private readonly rng: Random) {}

  static risk(mother: Genes, father: Genes, related = false): number {
    return Math.min(
      0.9,
      0.025 +
        (10 - mother.stability - father.stability) * 0.045 +
        (mother.vitality + father.vitality < 5 ? 0.12 : 0) +
        (related ? 0.3 : 0),
    );
  }

  inherit(mother: Genes, father: Genes, related = false): Genes {
    const choose = <T>(a: T, b: T): T => (this.rng.chance(0.5) ? a : b);
    const rating = (a: number, b: number) =>
      Math.max(1, Math.min(5, Math.round(choose(a, b) + this.rng.range(-0.7, 0.7))));
    const anatomy: Anatomy = {
      legs: choose(mother.anatomy.legs, father.anatomy.legs),
      ears: choose(mother.anatomy.ears, father.anatomy.ears),
      eyes: choose(mother.anatomy.eyes, father.anatomy.eyes),
      fangs: choose(mother.anatomy.fangs, father.anatomy.fangs),
    };
    const a = RabbitConformation.shape(mother),
      b = RabbitConformation.shape(father);
    const blend = (left: number, right: number, min: number, max: number) =>
      Math.max(min, Math.min(max, (left + right) / 2 + this.rng.range(-0.035, 0.035)));
    const genes: Genes = {
      eyeShape: choose(mother.eyeShape ?? 'round', father.eyeShape ?? 'round'),
      earType: choose(mother.earType ?? 'upright', father.earType ?? 'upright'),
      shape: {
        earWidth: blend(a.earWidth, b.earWidth, 0.82, 1.18),
        earBend: blend(a.earBend, b.earBend, -0.12, 0.38),
        legLength: blend(a.legLength, b.legLength, 0.86, 1.14),
        bodyWidth: blend(a.bodyWidth, b.bodyWidth, 0.88, 1.12),
        bodyLength: blend(a.bodyLength, b.bodyLength, 0.88, 1.12),
        headSize: blend(a.headSize, b.headSize, 0.92, 1.08),
      },
      coat: choose(mother.coat, father.coat),
      secondaryCoat: choose(mother.secondaryCoat, father.secondaryCoat),
      pattern: choose(mother.pattern, father.pattern),
      eyeColor: choose(mother.eyeColor, father.eyeColor),
      ear: Math.max(
        0.65,
        Math.min(1.4, (mother.ear + father.ear) / 2 + this.rng.range(-0.13, 0.13)),
      ),
      size: Math.max(
        0.8,
        Math.min(1.2, (mother.size + father.size) / 2 + this.rng.range(-0.09, 0.09)),
      ),
      speed: rating(mother.speed, father.speed),
      vitality: rating(mother.vitality, father.vitality),
      endurance: rating(mother.endurance, father.endurance),
      immunity: rating(mother.immunity, father.immunity),
      metabolism: rating(mother.metabolism, father.metabolism),
      coldResistance: rating(mother.coldResistance, father.coldResistance),
      stability: rating(mother.stability, father.stability),
      anatomy,
    };
    if (this.rng.chance(GenomeInheritance.risk(mother, father, related))) this.mutate(genes);
    if (genes.anatomy.fangs) genes.eyeColor = 'red';
    return genes;
  }

  private mutate(genes: Genes): void {
    const variant = this.rng.int(0, 4);
    if (variant === 0) genes.anatomy.legs = this.rng.pick([0, 2, 3, 6]);
    else if (variant === 1) genes.anatomy.ears = this.rng.pick([0, 1, 3, 4]);
    else if (variant === 2) genes.anatomy.eyes = this.rng.pick([0, 1, 3]);
    else if (variant === 3) genes.anatomy.fangs = true;
    else {
      genes.pattern = this.rng.pick(['spotted', 'piebald']);
      genes.eyeColor = this.rng.pick(['blue', 'green', 'amber']);
      genes.eyeShape = this.rng.pick(EYE_SHAPES);
      genes.earType = this.rng.pick(EAR_TYPES);
      genes.shape = {
        ...RabbitConformation.shape(genes),
        earBend: this.rng.range(-0.12, 0.38),
        legLength: this.rng.range(0.86, 1.14),
      };
    }
  }
}
