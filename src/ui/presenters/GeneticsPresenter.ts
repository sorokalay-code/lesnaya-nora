import { Genealogy } from '../../game/genetics/Genealogy';
import { GeneticTraits } from '../../game/genetics/GeneticTraits';
import { RabbitConformation } from '../../game/genetics/RabbitConformation';
import { RabbitFeatures } from '../../game/genetics/RabbitFeatures';
import { GenomeInheritance } from '../../game/genetics/GenomeInheritance';
import type { Lineage } from '../../game/genetics/types';
import type { Genes } from '../../game/types';

export interface GeneticsView {
  generation: number;
  appearance: string;
  ratings: string[];
  effects: string[];
  anatomy: string;
  solitary: boolean;
  ancestors: { id: string; name: string; label: string }[];
  risk?: number;
  related: boolean;
}

/** Готовит читаемый снимок фенотипа, родословной и риска пары; React только отображает данные. */
export class GeneticsPresenter {
  static build(
    genes: Genes,
    lineage?: Lineage,
    mate?: { genes: Genes; lineage?: Lineage },
  ): GeneticsView {
    const eye = genes.anatomy.fangs ? 'red' : genes.eyeColor;
    const eyes = {
      brown: 'карие',
      amber: 'янтарные',
      blue: 'голубые',
      green: 'зелёные',
      red: 'красные',
    };
    const pattern = {
      solid: 'однотонная шерсть',
      spotted: 'пятнистая шерсть',
      piebald: 'разноцветная шерсть',
    };
    const related = Genealogy.related(lineage, mate?.lineage);
    const shape = RabbitConformation.shape(genes);
    return {
      generation: lineage?.generation ?? 1,
      appearance:
        pattern[genes.pattern] + (genes.anatomy.eyes ? ', глаза ' + eyes[eye] : ', глаз нет'),
      ratings: [
        'Скорость: ' + genes.speed + '/5',
        'Крепость здоровья: ' + genes.vitality + '/5',
        'Выносливость: ' + genes.endurance + '/5',
        'Иммунитет: ' + genes.immunity + '/5',
        'Экономность питания: ' + genes.metabolism + '/5',
        'Защита от холода: ' + genes.coldResistance + '/5',
        'Генетическая устойчивость: ' + genes.stability + '/5',
      ],
      effects: [
        'Глаза: ' +
          RabbitFeatures.eyes(genes).label +
          ' · уши: ' +
          RabbitFeatures.ears(genes).label,
        'Пропорции: ширина ушей ' +
          Math.round(shape.earWidth * 100) +
          '%, длина лап ' +
          Math.round(shape.legLength * 100) +
          '%, длина тела ' +
          Math.round(shape.bodyLength * 100) +
          '%',
        'Скорость движения от анатомии: ' + Math.round(GeneticTraits.mobility(genes) * 100) + '%',
        'Расход сил: ' + Math.round(GeneticTraits.energyCost(genes) * 100) + '%',
        'Относительный запас здоровья: ' + Math.round(GeneticTraits.resilience(genes) * 100) + '%',
        'Чувствительность слуха: ' + Math.round(GeneticTraits.hearing(genes) * 100) + '%',
      ],
      anatomy:
        'Лапы: ' +
        genes.anatomy.legs +
        ' · уши: ' +
        genes.anatomy.ears +
        ' · глаза: ' +
        genes.anatomy.eyes +
        (genes.anatomy.fangs ? ' · хищные клыки' : ''),
      solitary: genes.anatomy.fangs,
      ancestors: (lineage?.ancestors ?? []).map((ancestor) => ({
        id: ancestor.id,
        name: ancestor.name,
        label:
          'поколение ' +
          ancestor.generation +
          (ancestor.distance === 1
            ? ' · родитель'
            : ' · предок через ' + ancestor.distance + ' поколения'),
      })),
      risk: mate ? Math.round(GenomeInheritance.risk(genes, mate.genes, related) * 100) : undefined,
      related,
    };
  }
}
