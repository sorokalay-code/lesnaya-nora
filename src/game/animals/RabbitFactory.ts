import { Random } from '../Random';
import type { Genes, PartnerTraits } from '../types';
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
    return {
      coat: this.rng.pick(coats),
      ear: this.rng.range(0.75, 1.28),
      speed: this.rng.int(1, 5),
      vitality: this.rng.int(1, 5),
      size: this.rng.range(0.88, 1.13),
    };
  }

  partners(count: number): PartnerTraits[] {
    const out: PartnerTraits[] = [];
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2),
        d = this.rng.range(15, 72);
      out.push({
        id: i,
        name: this.rng.pick(names),
        x: Math.cos(a) * d,
        z: Math.sin(a) * d,
        genes: this.genes(),
        preference: this.rng.pick(['speed', 'vitality', 'rare-coat', 'bond'] as const),
        temperament: this.rng.pick(['смелый', 'заботливый', 'осторожный', 'любопытный'] as const),
        trust: this.rng.int(0, 18),
        familySize: this.rng.int(0, 5),
      });
    }

    return out;
  }

  inherit(mother: Genes, father: Genes): Genes {
    return {
      coat: this.rng.chance(0.5) ? mother.coat : father.coat,
      ear: Math.max(
        0.65,
        Math.min(1.4, (mother.ear + father.ear) / 2 + this.rng.range(-0.13, 0.13)),
      ),
      speed: Math.max(
        1,
        Math.min(5, Math.round((mother.speed + father.speed) / 2 + this.rng.range(-1.1, 1.1))),
      ),
      vitality: Math.max(
        1,
        Math.min(
          5,
          Math.round((mother.vitality + father.vitality) / 2 + this.rng.range(-1.1, 1.1)),
        ),
      ),
      size: Math.max(
        0.8,
        Math.min(1.2, (mother.size + father.size) / 2 + this.rng.range(-0.09, 0.09)),
      ),
    };
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
