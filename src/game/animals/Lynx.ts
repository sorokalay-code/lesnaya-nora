import { Random } from '../Random';
import { Predator } from './Predator';
import { PounceAttack } from './PounceAttack';
import { ModelAssets, type ModelInstance } from '../ModelAssets';
import type { GroundHeight } from './types';
import { RABBIT_BODY } from '../RabbitBody';

/** Рысь замечает добычу дальше днём и быстро сокращает дистанцию. */
export class Lynx extends Predator {
  private readonly pounce = new PounceAttack();

  override get canMelee(): boolean {
    return !this.pounce.active;
  }

  override playAttack(time: number): void {
    this.pounce.consume();
    super.playAttack(time);
  }

  constructor(x: number, z: number, rng: Random) {
    super('lynx', x, z, rng, {
      health: 60,
      range: 14,
      runSpeed: 4.15,
      walkSpeed: 0.75,
      playerReach: 1.5,
      playerCooldown: 3,
      preyReach: 1.45,
      preyCooldown: 3,
      damage: 31,
      counterDamage: 12,
      dayRange: 10,
      alwaysHunts: false,
      radius: 0.62,
      mass: 3,
    });
  }

  protected override specialApproach(
    dt: number,
    time: number,
    chasing: boolean,
    groundAt: GroundHeight,
    player: { x: number; z: number },
    playerSize: number,
  ): boolean | undefined {
    const step = this.pounce.update(
      dt,
      chasing,
      this,
      { x: this.targetX, z: this.targetZ },
      groundAt,
    );
    if (!step) return;
    this.root.rotation.y = Math.atan2(this.x - this.targetX, this.z - this.targetZ);
    this.x = step.x;
    this.z = step.z;
    this.root.position.set(step.x, step.y, step.z);
    ModelAssets.shared.play(this.root.userData.model as ModelInstance, 'pounce', dt);
    const reach =
      this.profile.radius + (RABBIT_BODY.radius + RABBIT_BODY.halfLength) * playerSize + 0.2;
    if (
      step.landed &&
      this.huntingPlayer &&
      Math.hypot(player.x - this.x, player.z - this.z) < reach &&
      this.attackCooldown <= 0
    ) {
      this.attackCooldown = this.profile.playerCooldown;
      this.playAttack(time);
      return true;
    }
    return false;
  }
}
