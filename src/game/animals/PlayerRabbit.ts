import type { SaveData } from '../types';
import { Rabbit } from './Rabbit';
import { createRabbit } from '../Models';
import { ModelAssets } from '../ModelAssets';
import { CoatDirt } from '../CoatDirt';
import { RabbitAppearance } from '../genetics/RabbitAppearance';
import { RabbitGait } from '../RabbitGait';
import { playerSex } from '../RabbitSex';

/** Персонаж игрока использует пол, координаты и здоровье из сохранения. */
export class PlayerRabbit extends Rabbit {
  constructor(readonly data: SaveData['player']) {
    super(data, data.genes, false, data, playerSex(data));
  }

  refreshAppearance(): void {
    CoatDirt.forget(this.rig);
    const replacement = createRabbit(this.data.genes, false, playerSex(this.data));
    RabbitAppearance.rebind(replacement.root, this.root);
    RabbitGait.reset(this.root);
    ModelAssets.shared.replace(this.rig, replacement);
    this.root.position.set(this.data.x, this.data.y, this.data.z);
    this.root.userData.baseY = this.data.y;
    CoatDirt.update(this.rig, this.data.dirtiness);
  }
}
