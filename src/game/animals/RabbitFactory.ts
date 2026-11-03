import { Random } from '../Random';
import type { Genes, PartnerTraits } from '../types';
import { GenomeInheritance } from '../genetics/GenomeInheritance';
import { Genealogy } from '../genetics/Genealogy';
import { EYE_SHAPES } from '../genetics/RabbitFeatures';
const names = [
  'Листик',
  'Тимофей',
  'Пушок',
  'Рыжик',
  'Ветерок',
  'Клевер',
  'Туман',
  'Шорох',
  'Орешек',
  'Бор',
];
const coats: Genes['coat'][] = ['cream', 'brown', 'gray', 'black', 'white'];
/** Фабрика генов и наследования для процедурных семей кроликов. */
export class RabbitFactory {
  constructor(private readonly rng: Random) {}

  genes(): Genes {
    const genes: Genes = {
      coat: this.rng.pick(coats),
      ear: this.rng.range(0.75, 1.28),
      speed: this.rng.int(1, 5),
      vitality: this.rng.int(1, 5),
      size: this.rng.range(0.88, 1.13),
      shape: {
        earWidth: this.rng.range(0.86, 1.14),
        earBend: this.rng.range(-0.08, 0.3),
        legLength: this.rng.range(0.9, 1.1),
        bodyWidth: this.rng.range(0.92, 1.08),
        bodyLength: this.rng.range(0.92, 1.08),
        headSize: this.rng.range(0.95, 1.05),
      },
      pattern: this.rng.pick(['solid', 'solid', 'spotted', 'piebald'] as const),
      secondaryCoat: this.rng.pick(coats),
      eyeColor: this.rng.pick(['brown', 'amber', 'blue', 'green'] as const),
      eyeShape: this.rng.pick(EYE_SHAPES),
      earType: this.rng.pick(['upright', 'upright', 'upright', 'half-lop', 'lop'] as const),
      endurance: this.rng.int(1, 5),
      immunity: this.rng.int(1, 5),
      metabolism: this.rng.int(1, 5),
      coldResistance: this.rng.int(1, 5),
      stability: this.rng.int(1, 5),
      anatomy: { legs: 4, ears: 2, eyes: 2, fangs: this.rng.chance(0.035) },
    };
    if (genes.anatomy.fangs) genes.eyeColor = 'red';
    return genes;
  }

  partners(count: number): PartnerTraits[] {
    const out: PartnerTraits[] = [];
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2),
        d = this.rng.range(15, 72);
      out.push({
        id: i,
        lineage: Genealogy.founder('wild:' + i),
        name: this.rng.pick(names),
        x: Math.cos(a) * d,
        z: Math.sin(a) * d,
        genes: this.genes(),
        preference: this.rng.pick(['speed', 'vitality', 'rare-coat', 'bond'] as const),
        temperament: this.rng.pick(['смелый', 'заботливый', 'осторожный', 'любопытный'] as const),
        trust: this.rng.int(0, 18),
        familySize: this.rng.int(0, 5),
      });
      if (out[i].genes.anatomy.fangs) out[i].familySize = 0;
    }

    return out;
  }

  inherit(mother: Genes, father: Genes, related = false): Genes {
    return new GenomeInheritance(this.rng).inherit(mother, father, related);
  }
}
export function partnerScore(p: PartnerTraits, genes: Genes): number {
  const base = p.trust;
  switch (p.preference) {
    case 'speed':
      return base + genes.speed * 5;
    case 'vitality':
      return base + genes.vitality * 5;
    case 'rare-coat':
      return base + (genes.coat === 'white' || genes.coat === 'black' ? 27 : 8);
    case 'bond':
      return base + 14;
  }
}
