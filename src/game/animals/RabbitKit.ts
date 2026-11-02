import type { KitData } from '../types';
import { Rabbit } from './Rabbit';

/** Крольчонок сохраняет собственные координаты, рост и здоровье при смене модели на взрослую. */
export class RabbitKit extends Rabbit {
  constructor(readonly data: KitData) {
    data.x ??= data.homeX + Math.cos(data.id * 2.4) * 0.7;
    data.z ??= data.homeZ + Math.sin(data.id * 2.4) * 0.7;
    data.y ??= data.homeY;
    super(data as KitData & { x: number; z: number }, data.genes, data.age < 3, data);
    this.root.position.y = data.y;
  }

  get alive(): boolean {
    return this.data.alive && super.alive;
  }
}
