import type { Genes } from '../types';
import { EYE_SHAPES, EAR_TYPES, TAIL_TYPES } from './RabbitFeatures';

/** Проверяет геном из сохранения до создания моделей; старые и неполные структуры не дополняются. */
export class GenomeValidation {
  static valid(value: unknown): value is Genes {
    if (!value || typeof value !== 'object') return false;
    const genes = value as Record<string, unknown>;
    if (genes.tailType !== undefined && !TAIL_TYPES.some((type) => type === genes.tailType))
      return false;
    if (genes.eyeShape !== undefined && !EYE_SHAPES.some((shape) => shape === genes.eyeShape))
      return false;
    if (genes.earType !== undefined && !EAR_TYPES.some((type) => type === genes.earType))
      return false;
    const colours = ['cream', 'brown', 'gray', 'black', 'white'];
    const between = (number: unknown, min: number, max: number) =>
      typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max;
    if (
      genes.cleanliness !== undefined &&
      (!between(genes.cleanliness, 1, 5) || !Number.isInteger(genes.cleanliness))
    )
      return false;
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
    if (genes.shape !== undefined) {
      if (!genes.shape || typeof genes.shape !== 'object') return false;
      const shape = genes.shape as Record<string, unknown>;
      if (
        !['earWidth', 'legLength', 'bodyWidth', 'bodyLength', 'headSize'].every((key) =>
          between(shape[key], 0.75, 1.25),
        ) ||
        !between(shape.earBend, -0.2, 0.5)
      )
        return false;
    }
    return (
      [anatomy.legs, anatomy.ears, anatomy.eyes].every(Number.isInteger) &&
      between(anatomy.legs, 0, 6) &&
      between(anatomy.ears, 0, 4) &&
      between(anatomy.eyes, 0, 3) &&
      typeof anatomy.fangs === 'boolean'
    );
  }
}
