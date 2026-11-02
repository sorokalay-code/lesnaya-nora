import { ModelAssets, type ModelInstance } from '../ModelAssets';
import { animatePredator } from '../Models';
import { Random } from '../Random';
import { Predator } from './Predator';
import type { GroundHeight } from './types';
import { RABBIT_BODY } from '../RabbitBody';

/** Паук охраняет паутину возле дерева и преследует крольчиху после срабатывания ловушки. */
export class Spider extends Predator {
  private alertedUntil = 0;
  private weaving = false;

  constructor(x: number, z: number, rng: Random) {
    super('spider', x, z, rng, {
      health: 28,
      range: 8,
      runSpeed: 2.6,
      walkSpeed: 0.7,
      playerReach: 1.4,
      playerCooldown: 2.5,
      preyReach: 0,
      preyCooldown: 3,
      damage: 6,
      counterDamage: 4,
      dayRange: 8,
      alwaysHunts: false,
      radius: 0.68,
      mass: 1.2,
    });
  }

  override get huntsWildlife(): boolean {
    return false;
  }

  alert(time: number): void {
    this.alertedUntil = time + 3;
  }

  weave(active: boolean): void {
    this.weaving = active;
  }

  override update(
    dt: number,
    time: number,
    px: number,
    pz: number,
    hidden: boolean,
    _day: boolean,
    groundAt: GroundHeight,
    _scent = 0,
    _activity = 1,
    _prey?: { x: number; z: number },
    playerSize = 1,
  ): boolean {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.huntingPlayer = !hidden && time < this.alertedUntil;
    const tx = this.huntingPlayer ? px : this.origin.x,
      tz = this.huntingPlayer ? pz : this.origin.z;
    const dx = tx - this.x,
      dz = tz - this.z,
      distance = Math.hypot(dx, dz);
    const moving = distance > 0.15;
    if (moving) {
      const step = Math.min(
        distance,
        dt * (this.huntingPlayer ? this.profile.runSpeed : this.profile.walkSpeed),
      );
      this.x += (dx / distance) * step;
      this.z += (dz / distance) * step;
      this.root.rotation.y = Math.atan2(-dx, -dz);
    }
    this.root.position.set(this.x, groundAt(this.x, this.z), this.z);
    const reach = Math.max(
      1.6,
      this.profile.radius + (RABBIT_BODY.radius + RABBIT_BODY.halfLength) * playerSize + 0.08,
    );
    const strike =
      this.huntingPlayer &&
      Math.hypot(px - this.x, pz - this.z) < reach &&
      this.attackCooldown <= 0;
    if (strike) {
      this.attackCooldown = this.profile.playerCooldown;
      this.playAttack(time);
    }
    if (this.weaving && !moving && !this.huntingPlayer)
      ModelAssets.shared.play(this.root.userData.model as ModelInstance, 'spin', dt);
    else
      animatePredator(
        this.root,
        time,
        this.huntingPlayer,
        dt,
        moving,
        this.attackCooldown > this.profile.playerCooldown - 0.6,
      );
    return strike;
  }
}
