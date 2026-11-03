import { ModelAssets, type ModelInstance } from '../ModelAssets';
import { animatePredator } from '../Models';
import { Random } from '../Random';
import { Predator } from './Predator';
import type { GroundHeight } from './types';
import { RABBIT_BODY } from '../RabbitBody';
import type { WebAnchor } from '../SpiderWeb';

/** Паук охраняет паутину возле дерева и преследует крольчиху после срабатывания ловушки. */
export class Spider extends Predator {
  private alertedUntil = 0;
  private weaving = false;
  habitat?: { a: WebAnchor; b: WebAnchor };
  private perch = 0;
  private height = 0;
  private awakeUntil = 0;

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

  override get canMelee(): boolean {
    return this.height <= 0;
  }

  alert(time: number): void {
    this.alertedUntil = time + 3;
    this.descend(time);
  }

  configureHabitat(a: WebAnchor, b: WebAnchor, groundAt: GroundHeight): void {
    this.habitat = { a, b };
    this.perch = this.height = 4.2;
    this.x = a.x + 0.65;
    this.z = a.z;
    this.root.position.set(this.x, groundAt(this.x, this.z) + this.height, this.z);
    this.root.rotation.x = Math.PI / 2;
  }

  descend(time: number): void {
    this.awakeUntil = time + 3;
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
    const awake = time < this.awakeUntil;
    if (awake) this.height = Math.max(0, this.height - dt * 1.6);
    const tx = this.huntingPlayer ? px : this.origin.x,
      tz = this.huntingPlayer ? pz : this.origin.z;
    const dx = tx - this.x,
      dz = tz - this.z,
      distance = Math.hypot(dx, dz);
    const moving = distance > 0.15 && this.height <= 0;
    if (moving) {
      const step = Math.min(
        distance,
        dt * (this.huntingPlayer ? this.profile.runSpeed : this.profile.walkSpeed),
      );
      this.x += (dx / distance) * step;
      this.z += (dz / distance) * step;
      this.root.rotation.y = Math.atan2(-dx, -dz);
    }
    if (!awake && distance < 0.8) this.height = Math.min(this.perch, this.height + dt * 1.2);
    this.root.position.set(this.x, groundAt(this.x, this.z) + this.height, this.z);
    const climbPitch = this.height > 0 ? (awake ? -Math.PI / 2 : Math.PI / 2) : 0;
    this.root.rotation.x += (climbPitch - this.root.rotation.x) * (1 - Math.exp(-dt * 8));
    const reach = Math.max(
      1.6,
      this.profile.radius + (RABBIT_BODY.radius + RABBIT_BODY.halfLength) * playerSize + 0.08,
    );
    const strike =
      this.huntingPlayer &&
      this.height <= 0 &&
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
        moving || (awake && this.height > 0),
        this.attackCooldown > this.profile.playerCooldown - 0.6,
      );
    return strike;
  }
}
