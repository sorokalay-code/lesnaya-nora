import type { Scene } from 'three';
import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { FlyingRaptor } from './FlyingRaptor';
import type { GroundHeight } from './types';

/** Сова выходит на охоту ночью, пикирует на кроликов и мышей и покидает сцену на рассвете. */
export class Owl extends FlyingRaptor {
  override readonly diet = 'rodents';
  override readonly strikeDamage = 26;
  private awake = false;

  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('owl', x, z, rng, { height: 9, diveCooldown: 22, cruiseSpeed: 4.8 }, appearance);
    this.root.visible = this.shadow.visible = false;
  }

  override get present(): boolean {
    return this.awake && this.alive;
  }

  override updatePresence(night: boolean, scene: Scene | undefined, groundAt: GroundHeight): void {
    const awake = night && this.alive;
    if (awake === this.awake) return;
    this.awake = awake;
    if (awake) {
      const ground = groundAt(this.x, this.z);
      this.moveTo(this.x, this.z, ground + this.flight.height);
      this.shadow.position.set(this.x, ground + 0.05, this.z);
      this.root.visible = this.shadow.visible = true;
      scene?.add(this.root, this.shadow);
      return;
    }

    this.cancelDive();
    this.root.visible = this.shadow.visible = false;
    this.root.removeFromParent();
    this.shadow.removeFromParent();
  }
}
