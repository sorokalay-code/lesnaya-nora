import * as THREE from 'three';
import { animatePredator, createPredator } from '../Models';
import { Random } from '../Random';
import type { PredatorKind } from '../types';
import { Animal } from './Animal';
import { RABBIT_BODY } from '../RabbitBody';
import type { AttackListener, AttackCue } from '../audio/AttackCue';
import type { GroundHeight, PredatorProfile } from './types';
import {
  AnimalAppearance,
  type AppearanceOptions,
  type AppearanceTraits,
} from '../AnimalAppearance';
import type { Habitat, HabitatPoint, TerritoryIntent } from '../AnimalHabitats';
/** Шаблон поведения хищника: поиск цели, погоня, атака и отступление. Вид задаёт свои параметры. */
export abstract class Predator extends Animal<PredatorKind> {
  get swimSpeed(): number {
    return this.profile.swimSpeed ?? 0;
  }

  private attackListener?: AttackListener;
  private territory?: TerritoryIntent;
  readonly appearance: AppearanceTraits;
  readonly origin: { x: number; z: number };
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
    appearance?: AppearanceOptions,
  ) {
    super(kind, createPredator(kind), { x, z }, profile.health);
    this.appearance = AnimalAppearance.normalize(appearance);
    AnimalAppearance.apply(
      this.root.userData.model as import('../ModelAssets').ModelInstance,
      this.appearance,
    );
    this.profile = {
      ...profile,
      radius: profile.radius * this.appearance.size * this.appearance.bodyWidth,
      mass: profile.mass * this.appearance.size ** 3,
    };
    this.origin = { x, z };
    this.targetX = x;
    this.targetZ = z;
    this.homeX = x;
    this.homeZ = z;
    this.range = profile.range;
  }

  protected canHuntPlayer(distance: number, day: boolean): boolean {
    return this.profile.alwaysHunts || !day || distance < this.profile.dayRange;
  }

  get huntsWildlife(): boolean {
    return true;
  }

  get canMelee(): boolean {
    return true;
  }

  get homeTerritory(): Habitat | undefined {
    return this.territory?.home;
  }

  get huntingOpen(): boolean {
    return this.territory?.hunting ?? true;
  }

  followTerritory(intent: TerritoryIntent): void {
    this.territory = intent;
  }

  canPursue(x: number, z: number): boolean {
    const intent = this.territory;
    if (!intent) return true;
    return (
      intent.hunting && Math.hypot(x - intent.home.x, z - intent.home.z) < intent.home.radius * 1.15
    );
  }

  protected specialApproach(
    _dt: number,
    _time: number,
    _chasing: boolean,
    _groundAt: GroundHeight,
    _player: { x: number; z: number },
    _playerSize: number,
  ): boolean | undefined {
    return undefined;
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

  get inDen(): boolean {
    return false;
  }

  protected moveInDen(_dt: number, _time: number, _mayEnter: boolean): boolean {
    return false;
  }

  protected territoryDestination(intent: TerritoryIntent, _time: number): HabitatPoint {
    return intent.destination;
  }

  moveTo(x: number, z: number, y: number): void {
    this.x = x;
    this.z = z;
    this.root.position.set(x, y, z);
    if (this.tunnelPosition) this.tunnelPosition = { x, y, z };
  }

  playAttack(time: number): void {
    this.attackAnimUntil = Math.max(this.attackAnimUntil, time + 0.6);
    this.signalAttack(time, 'strike');
  }

  setAttackListener(listener?: AttackListener): void {
    this.attackListener = listener;
  }

  protected signalAttack(time: number, phase: AttackCue['phase']): void {
    const { x, y, z } = this.root.position;
    this.attackListener?.({ kind: this.kind, phase, x, y, z, time });
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
    if (this.moveInDen(dt, time, time >= this.retreatUntil)) return false;

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
      this.canPursue(px, pz) &&
      this.canHuntPlayer(dist, day);
    this.huntingPlayer = hunting;
    const chasingPrey =
      !hunting && time >= this.retreatUntil && prey && this.canPursue(prey.x, prey.z);
    if (time < this.retreatUntil) {
      this.targetX = this.retreatX;
      this.targetZ = this.retreatZ;
    } else if (hunting) {
      this.targetX = px;
      this.targetZ = pz;
    } else if (chasingPrey) {
      this.targetX = prey.x;
      this.targetZ = prey.z;
    } else if (this.territory) {
      const destination = this.territoryDestination(this.territory, time);
      this.targetX = destination.x;
      this.targetZ = destination.z;
    } else if (Math.hypot(this.x - this.homeX, this.z - this.homeZ) > 20) {
      this.targetX = this.homeX;
      this.targetZ = this.homeZ;
    } else if (
      time > this.nextTarget ||
      Math.hypot(this.targetX - this.x, this.targetZ - this.z) < 1
    ) {
      this.nextTarget = time + this.rng.range(4, 10);
      this.targetX = Math.max(
        -this.movementLimit,
        Math.min(this.movementLimit, this.x + this.rng.range(-14, 14)),
      );
      this.targetZ = Math.max(
        -this.movementLimit,
        Math.min(this.movementLimit, this.z + this.rng.range(-14, 14)),
      );
    }

    const blockedByWater =
      !this.swimSpeed &&
      this.waterNavigation &&
      !this.waterNavigation.clear(this, this.targetX, this.targetZ);
    const special = blockedByWater
      ? undefined
      : this.specialApproach(
          dt,
          time,
          hunting || !!chasingPrey,
          groundAt,
          { x: px, z: pz },
          playerSize,
        );
    if (special !== undefined) return special;

    const angle = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
    const distance = Math.hypot(this.targetX - this.x, this.targetZ - this.z);
    const running = hunting || !!chasingPrey || time < this.retreatUntil;
    const travelling = this.territory && this.travelsToTerritory(distance);
    const speed = running
      ? this.profile.runSpeed
      : travelling
        ? Math.max(this.profile.walkSpeed, this.profile.runSpeed * 0.64)
        : this.profile.walkSpeed;
    const step = Math.min(speed * dt, distance);
    const moved = this.surfaceStep(
      THREE.MathUtils.clamp(
        this.x + Math.sin(angle) * step,
        -this.movementLimit,
        this.movementLimit,
      ),
      THREE.MathUtils.clamp(
        this.z + Math.cos(angle) * step,
        -this.movementLimit,
        this.movementLimit,
      ),
      dt,
      groundAt,
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
      running || !!travelling,
      dt,
      moved,
      time < this.attackAnimUntil,
    );
    if (strike) return true;

    return false;
  }

  protected travelsToTerritory(distance: number): boolean {
    return distance > 7;
  }
}
