import type { Genes } from '../types';

/** Проверяет геном из сохранения до создания моделей; старые и неполные структуры не дополняются. */
export class GenomeValidation {
  static valid(value: unknown): value is Genes {
    if (!value || typeof value !== 'object') return false;
    const genes = value as Record<string, unknown>;
    const colours = ['cream', 'brown', 'gray', 'black', 'white'];
    const between = (number: unknown, min: number, max: number) =>
      typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max;
    if (
      !colours.includes(String(genes.coat)) ||
      !colours.includes(String(genes.secondaryCoat)) ||
      !['solid', 'spotted', 'piebald'].includes(String(genes.pattern)) ||
      !['brown', 'amber', 'blue', 'green', 'red'].includes(String(genes.eyeColor)) ||
      !between(genes.ear, 0.5, 1.6) ||
      !between(genes.size, 0.5, 1.5)
    )
      return false;
    for (const key of [
      'speed',
      'vitality',
      'endurance',
      'immunity',
      'metabolism',
      'coldResistance',
      'stability',
    ])
      if (!between(genes[key], 1, 5) || !Number.isInteger(genes[key])) return false;
    if (!genes.anatomy || typeof genes.anatomy !== 'object') return false;
    const anatomy = genes.anatomy as Record<string, unknown>;
    return (
      [anatomy.legs, anatomy.ears, anatomy.eyes].every(Number.isInteger) &&
      between(anatomy.legs, 0, 6) &&
      between(anatomy.ears, 0, 4) &&
      between(anatomy.eyes, 0, 3) &&
      typeof anatomy.fangs === 'boolean'
    );
  }
}
