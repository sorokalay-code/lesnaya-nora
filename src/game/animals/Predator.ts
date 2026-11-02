import * as THREE from 'three';
import { animatePredator, createPredator } from '../Models';
import { Random } from '../Random';
import type { PredatorKind } from '../types';
import { Animal } from './Animal';
import { RABBIT_BODY } from '../RabbitBody';
import type { GroundHeight, PredatorProfile } from './types';
/** Шаблон поведения хищника: поиск цели, погоня, атака и отступление. Вид задаёт свои параметры. */
export abstract class Predator extends Animal<PredatorKind> {
  targetX: number;
  targetZ: number;
  private nextTarget = 0;
  attackCooldown = 0;
  huntingPlayer = false;
  readonly range: number;
  private homeX: number;
  private homeZ: number;
  private tunnelPosition?: { x: number; y: number; z: number };
  private retreatUntil = 0;
  private attackAnimUntil = 0;
  private retreatX = 0;
  private retreatZ = 0;

  protected constructor(
    kind: PredatorKind,
    x: number,
    z: number,
    private readonly rng: Random,
    readonly profile: PredatorProfile,
  ) {
    super(kind, createPredator(kind), { x, z }, profile.health);
    this.targetX = x;
    this.targetZ = z;
    this.homeX = x;
    this.homeZ = z;
    this.range = profile.range;
  }

  protected canHuntPlayer(distance: number, day: boolean): boolean {
    return this.profile.alwaysHunts || !day || distance < this.profile.dayRange;
  }

  enterTunnel(x: number, y: number, z: number): void {
    this.tunnelPosition = { x, y, z };
    this.x = x;
    this.z = z;
    this.root.position.set(x, y, z);
  }

  leaveTunnel(): void {
    this.tunnelPosition = undefined;
  }

  get underground(): boolean {
    return this.tunnelPosition !== undefined;
  }

  moveTo(x: number, z: number, y: number): void {
    this.x = x;
    this.z = z;
    this.root.position.set(x, y, z);
    if (this.tunnelPosition) this.tunnelPosition = { x, y, z };
  }

  playAttack(time: number): void {
    this.attackAnimUntil = Math.max(this.attackAnimUntil, time + 0.6);
  }

  receiveAttack(damage: number, time: number, attacker: { x: number; z: number }): void {
    this.health = Math.max(0, this.health - damage);
    this.retreatUntil = time + 2.5;
    const angle = Math.atan2(this.x - attacker.x, this.z - attacker.z);
    this.retreatX = this.x + Math.sin(angle) * 9;
    this.retreatZ = this.z + Math.cos(angle) * 9;
  }

  update(
    dt: number,
    time: number,
    px: number,
    pz: number,
    hidden: boolean,
    day: boolean,
    groundAt: GroundHeight,
    scent = 0,
    activity = 1,
    prey?: { x: number; z: number },
    playerSize = 1,
  ): boolean {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.huntingPlayer = false;
    if (this.tunnelPosition) {
      this.x = this.tunnelPosition.x;
      this.z = this.tunnelPosition.z;
      this.root.position.set(this.x, this.tunnelPosition.y, this.z);
      animatePredator(this.root, time, false, dt, false);
      return false;
    }

    const dist = Math.hypot(px - this.x, pz - this.z);
    const hunting =
      time >= this.retreatUntil &&
      !hidden &&
      dist < this.range * activity * (1 + scent * 0.4) &&
      this.canHuntPlayer(dist, day);
    this.huntingPlayer = hunting;
    const chasingPrey = !hunting && time >= this.retreatUntil && prey !== undefined;
    if (time < this.retreatUntil) {
      this.targetX = this.retreatX;
      this.targetZ = this.retreatZ;
    } else if (hunting) {
      this.targetX = px;
      this.targetZ = pz;
    } else if (chasingPrey) {
      this.targetX = prey.x;
      this.targetZ = prey.z;
    } else if (Math.hypot(this.x - this.homeX, this.z - this.homeZ) > 20) {
      this.targetX = this.homeX;
      this.targetZ = this.homeZ;
    } else if (
      time > this.nextTarget ||
      Math.hypot(this.targetX - this.x, this.targetZ - this.z) < 1
    ) {
      this.nextTarget = time + this.rng.range(4, 10);
      this.targetX = Math.max(-95, Math.min(95, this.x + this.rng.range(-14, 14)));
      this.targetZ = Math.max(-95, Math.min(95, this.z + this.rng.range(-14, 14)));
    }

    const angle = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
    const speed =
      hunting || chasingPrey || time < this.retreatUntil
        ? this.profile.runSpeed
        : this.profile.walkSpeed;
    const step = Math.min(speed * dt, Math.hypot(this.targetX - this.x, this.targetZ - this.z));
    this.x = THREE.MathUtils.clamp(this.x + Math.sin(angle) * step, -97, 97);
    this.z = THREE.MathUtils.clamp(this.z + Math.cos(angle) * step, -97, 97);
    this.root.position.set(
      this.x,
      groundAt(this.x, this.z) +
        Math.abs(Math.sin(time * (hunting || chasingPrey ? 13 : 5))) *
          (hunting || chasingPrey ? 0.08 : 0.02),
      this.z,
    );
    this.root.rotation.y = angle + Math.PI;
    // Дальность укуса согласована с капсулой крольчихи: коллизия не делает её неуязвимой спереди.
    const biteReach = Math.max(
      this.profile.playerReach,
      this.profile.radius + (RABBIT_BODY.radius + RABBIT_BODY.halfLength) * playerSize + 0.08,
    );
    const strike =
      hunting && Math.hypot(px - this.x, pz - this.z) < biteReach && this.attackCooldown <= 0;
    if (strike) {
      this.attackCooldown = this.profile.playerCooldown;
      this.playAttack(time);
    }

    animatePredator(
      this.root,
      time,
      hunting || chasingPrey,
      dt,
      step > 0.005,
      time < this.attackAnimUntil,
    );
    if (strike) return true;

    return false;
  }
}
