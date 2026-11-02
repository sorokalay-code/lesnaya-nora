import type { SaveData } from '../types';
import { Rabbit } from './Rabbit';

/** Крольчиха игрока использует координаты и здоровье непосредственно из сохранения. */
export class PlayerRabbit extends Rabbit {
  constructor(readonly data: SaveData['player']) {
    super(data, data.genes, false, data);
  }
}
