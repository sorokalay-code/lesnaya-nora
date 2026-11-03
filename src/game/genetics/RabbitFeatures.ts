import type { Genes } from '../types';
import type { EarType, EyeShape, TailType } from './types';

export const EYE_SHAPES = ['round', 'almond', 'tall'] as const;
export const EAR_TYPES = ['upright', 'half-lop', 'lop'] as const;
export const TAIL_TYPES = ['fluffy', 'short', 'elongated', 'drooping'] as const;
const TAILS: Record<TailType, { scale: [number, number, number]; angle: number; label: string }> = {
  fluffy: { scale: [1.15, 1.1, 1.05], angle: 0, label: 'пышный' },
  short: { scale: [0.7, 0.7, 0.65], angle: 0, label: 'короткий круглый' },
  elongated: { scale: [0.86, 0.85, 1.85], angle: -0.3, label: 'удлинённый' },
  drooping: { scale: [0.85, 0.9, 1.55], angle: 0.85, label: 'опущенный' },
};
const EYES: Record<EyeShape, { width: number; height: number; label: string }> = {
  round: { width: 1.18, height: 0.95, label: 'круглые' },
  almond: { width: 1.36, height: 0.7, label: 'миндалевидные' },
  tall: { width: 0.9, height: 1.16, label: 'вытянутые' },
};
const EARS: Record<EarType, { angle: number; width: number; label: string }> = {
  upright: { angle: 0, width: 1, label: 'стоячие' },
  'half-lop': { angle: 1, width: 1.04, label: 'полувисячие' },
  lop: { angle: 2.6, width: 1.12, label: 'висячие' },
};

/** Общие наследуемые формы глаз и постановки ушей для модели, генетики и описания в интерфейсе. */
export class RabbitFeatures {
  static tail(genes: Genes): (typeof TAILS)[TailType] {
    return TAILS[genes.tailType ?? 'fluffy'];
  }

  static eyes(genes: Genes): (typeof EYES)[EyeShape] {
    return EYES[genes.eyeShape ?? 'round'];
  }

  static ears(genes: Genes): (typeof EARS)[EarType] {
    return EARS[genes.earType ?? 'upright'];
  }
}
