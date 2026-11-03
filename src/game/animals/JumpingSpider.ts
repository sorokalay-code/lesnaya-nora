import type { AppearanceOptions } from '../AnimalAppearance';
import { ModelAssets, type ModelInstance } from '../ModelAssets';
import { Random } from '../Random';
import { RABBIT_BODY } from '../RabbitBody';
import { PounceAttack } from './PounceAttack';
import { Predator } from './Predator';
import type { GroundHeight } from './types';

/** Наземный паук-прыгун патрулирует окрестность дерева и атакует повторными короткими прыжками без паутины. */
export class JumpingSpider extends Predator {
  private readonly leap = new PounceAttack({
    range: 6.5,
    distance: 5.5,
    minimum: 1.9,
    windup: 0.18,
    duration: 0.48,
    height: 0.95,
  });
  private nextLeap = 0;

  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'jumping-spider',
      x,
      z,
      rng,
      {
        health: 26,
        range: 10,
        runSpeed: 2.7,
        walkSpeed: 0.85,
        playerReach: 1.4,
        playerCooldown: 2.8,
        preyReach: 1.4,
        preyCooldown: 3,
        damage: 12,
        counterDamage: 4,
        dayRange: 8,
        alwaysHunts: false,
        radius: 0.6,
        mass: 1,
      },
      appearance,
    );
  }

  override get canMelee(): boolean {
    return !this.leap.active;
  }

  protected override specialApproach(
    dt: number,
    time: number,
    chasing: boolean,
    groundAt: GroundHeight,
    player: { x: number; z: number },
    playerSize: number,
  ): boolean | undefined {
    if (!chasing && !this.leap.active) {
      this.targetX = this.origin.x + Math.cos(time * 0.25 + this.origin.x) * 3;
      this.targetZ = this.origin.z + Math.sin(time * 0.31 + this.origin.z) * 3;
    }
    if (time >= this.nextLeap && !this.leap.active) this.leap.rearm();
    const step = this.leap.update(
      dt,
      chasing && time >= this.nextLeap && this.attackCooldown <= 0,
      this,
      { x: this.targetX, z: this.targetZ },
      groundAt,
    );
    if (!step) return;
    if (step.started) this.signalAttack(time, 'leap');
    this.root.rotation.y = Math.atan2(this.x - this.targetX, this.z - this.targetZ);
    this.x = step.x;
    this.z = step.z;
    this.root.position.set(this.x, step.y, this.z);
    ModelAssets.shared.play(this.root.userData.model as ModelInstance, 'jump', dt);
    if (step.landed) this.nextLeap = time + 4;
    const reach =
      this.profile.radius + (RABBIT_BODY.radius + RABBIT_BODY.halfLength) * playerSize + 0.1;
    if (
      step.landed &&
      this.huntingPlayer &&
      this.attackCooldown <= 0 &&
      Math.hypot(player.x - this.x, player.z - this.z) < reach
    ) {
      this.attackCooldown = this.profile.playerCooldown;
      this.playAttack(time);
      return true;
    }
    return false;
  }
}
