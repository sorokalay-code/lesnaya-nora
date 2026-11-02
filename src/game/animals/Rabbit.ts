import { createRabbit, type RabbitRig } from '../Models';
import type { Genes } from '../types';
import { Animal, type AnimalPosition } from './Animal';

/** Общая основа кроликов связывает гены, GLB-модель и состояние здоровья. */
export abstract class Rabbit extends Animal<'rabbit'> {
  readonly rig: RabbitRig;

  protected constructor(
    position: AnimalPosition,
    genes: Genes,
    baby = false,
    vitality = { health: 100 },
  ) {
    const rig = createRabbit(genes, baby);
    super('rabbit', rig.root, position, 100, vitality);
    this.rig = rig;
  }
}
