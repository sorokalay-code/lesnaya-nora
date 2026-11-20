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
import type { WildlifeRoutine } from '../WildlifeRoutine';
import { SurfaceRoute } from '../SurfaceRoute';
/** Шаблон поведения хищника: поиск цели, погоня, атака и отступление. Вид задаёт свои параметры. */
export abstract class Predator extends Animal<PredatorKind> {
  get swimSpeed(): number {
    return this.profile.swimSpeed ?? 0;
  }

  private attackListener?: AttackListener;
  private territory?: TerritoryIntent;
  private routine?: WildlifeRoutine;
  destination?: HabitatPoint;
  provisionHome?: HabitatPoint;
  private readonly provisionRoute = new SurfaceRoute();
  restAt?: HabitatPoint;
  foragingAllowed = true;
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
  private pendingStrike?: { at: number; x: number; z: number };

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
    return !this.juvenile;
  }

  get homeTerritory(): Habitat | undefined {
    return this.territory?.home;
  }

  get shelter(): WildlifeRoutine['shelter'] {
    return this.routine?.shelter;
  }

  get inShelter(): boolean {
    return this.inDen;
  }

  useRoutine(routine: WildlifeRoutine, inside = false): void {
    this.routine = routine;
    const at = inside ? routine.restore() : undefined;
    if (at) this.moveTo(at.x, at.z, at.y);
  }

  get huntingOpen(): boolean {
    if (this.provisionHome || this.broodDefense) return false;
    return (
      !this.juvenile && !this.restAt && this.foragingAllowed && (this.territory?.hunting ?? true)
    );
  }

  followTerritory(intent: TerritoryIntent): void {
    this.territory = intent;
    this.destination = intent.destination;
  }

  canPursue(x: number, z: number): boolean {
    if (!this.huntingOpen || this.inDen) return false;
    const intent = this.territory;
    if (!intent) return true;
    return (
      intent.hunting && Math.hypot(x - intent.home.x, z - intent.home.z) < intent.home.radius * 1.15
    );
  }

  get defenseRival(): Predator | undefined {
    return undefined;
  }

  canEngagePrey(prey: HabitatPoint): boolean {
    return prey === this.defenseRival || this.canPursue(prey.x, prey.z);
  }

  protected defendsPlayer(_x: number, _z: number): boolean {
    return false;
  }

  protected pursuitDestination(target: HabitatPoint, time: number): HabitatPoint {
    const flank = this.profile.combat?.flank ?? 0;
    const distance = Math.hypot(target.x - this.x, target.z - this.z);
    if (!flank || distance < this.profile.playerReach * 1.5 || distance > 6) return target;

    const side = Math.sin(time * 0.7 + this.root.id) >= 0 ? 1 : -1;
    return {
      x: target.x + ((target.z - this.z) / distance) * flank * side,
      z: target.z - ((target.x - this.x) / distance) * flank * side,
    };
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
    return this.routine?.inside ?? false;
  }

  protected moveInDen(
    dt: number,
    time: number,
    mayEnter: boolean,
    groundAt: GroundHeight,
  ): boolean {
    const action = this.routine?.update(
      this.root.position,
      time,
      mayEnter ? this.restAt : undefined,
      undefined,
      false,
    );
    if (!action) return false;

    let moving = false;
    if (action.kind === 'move') {
      const dx = action.target.x - this.x;
      const dz = action.target.z - this.z;
      const step = Math.min(1, (dt * this.profile.walkSpeed) / Math.max(0.001, Math.hypot(dx, dz)));
      moving = this.surfaceStep(this.x + dx * step, this.z + dz * step, dt, groundAt);
      if (moving) this.root.rotation.y = Math.atan2(-dx, -dz);
    } else if (action.kind === 'enter' || action.kind === 'emerge') {
      this.moveTo(action.at.x, action.at.z, action.at.y);
      if (action.kind === 'emerge') this.root.rotation.y = action.heading;
    }
    animatePredator(this.root, time, false, dt, moving, false);
    return true;
  }

  protected territoryDestination(intent: TerritoryIntent, _time: number): HabitatPoint {
    return this.destination ?? intent.destination;
  }

  moveTo(x: number, z: number, y: number): void {
    this.x = x;
    this.z = z;
    this.root.position.set(x, y, z);
    if (this.tunnelPosition) this.tunnelPosition = { x, y, z };
  }

  playAttack(time: number): void {
    this.attackAnimUntil = Math.max(this.attackAnimUntil, time + 0.6);
    this.root.userData.attackStartedAt = time;
    this.root.userData.attackDuration = 0.6;
    this.root.userData.attackPreparing = false;
    this.signalAttack(time, 'strike');
  }

  protected prepareStrike(time: number): void {
    this.root.userData.attackStartedAt = time;
    this.root.userData.attackDuration = this.profile.combat?.windup ?? 0.35;
    this.root.userData.attackPreparing = true;
    this.signalAttack(time, 'warning');
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
    // Обычный удар кролика не оглушает хищника: иначе его можно безнаказанно держать в бегстве.
    if (
      damage < this.profile.counterDamage &&
      this.health > this.maxHealth * (this.profile.combat?.retreatHealth ?? 0.25)
    )
      return;

    this.pendingStrike = undefined;
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
    const defense = this.broodDefense;
    if (
      this.moveInDen(dt, time, time >= this.retreatUntil && defense?.phase !== 'pursuit', groundAt)
    )
      return false;

    const player = { x: px, z: pz };
    const dist = Math.hypot(px - this.x, pz - this.z);
    const hunting =
      time >= this.retreatUntil &&
      !hidden &&
      (defense
        ? defense.phase === 'pursuit'
        : !this.provisionHome &&
          (this.defendsPlayer(px, pz) ||
            (dist < this.range * activity * (1 + scent * 0.4) &&
              this.canPursue(px, pz) &&
              this.canHuntPlayer(dist, day))));
    this.huntingPlayer = hunting;
    const chasingPrey = !hunting && time >= this.retreatUntil && prey && this.canEngagePrey(prey);
    if (time < this.retreatUntil) {
      this.targetX = this.retreatX;
      this.targetZ = this.retreatZ;
    } else if (defense && !hunting) {
      this.targetX = defense.phase === 'return' ? defense.home.x : this.x;
      this.targetZ = defense.phase === 'return' ? defense.home.z : this.z;
    } else if (this.provisionHome && !defense) {
      const waypoint = this.provisionRoute.step(
        this.root.position,
        this.provisionHome,
        time,
        groundAt,
      );
      this.targetX = waypoint.x;
      this.targetZ = waypoint.z;
    } else if (hunting) {
      const destination = defense ? player : this.pursuitDestination(player, time);
      this.targetX = destination.x;
      this.targetZ = destination.z;
    } else if (chasingPrey) {
      const destination = this.pursuitDestination(prey, time);
      this.targetX = destination.x;
      this.targetZ = destination.z;
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
    const special =
      blockedByWater || this.pendingStrike
        ? undefined
        : this.specialApproach(dt, time, hunting || !!chasingPrey, groundAt, player, playerSize);
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
    const step = this.pendingStrike
      ? 0
      : Math.min(speed * dt * Math.sqrt(this.growthScale), distance);
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
    if (defense?.phase === 'warning')
      this.root.rotation.y = Math.atan2(px - this.x, pz - this.z) + Math.PI;
    else this.root.rotation.y = angle + Math.PI;
    // Дальность укуса согласована с капсулой крольчихи: коллизия не делает её неуязвимой спереди.
    const biteReach = Math.max(
      this.profile.playerReach,
      this.profile.radius + (RABBIT_BODY.radius + RABBIT_BODY.halfLength) * playerSize + 0.08,
    );
    let strike = false;
    if (this.pendingStrike) {
      const pending = this.pendingStrike;
      if (!hunting) this.pendingStrike = undefined;
      else if (time >= pending.at) {
        this.pendingStrike = undefined;
        this.root.userData.attackStartedAt = pending.at;
        this.root.userData.attackDuration = 0.6;
        this.root.userData.attackPreparing = false;
        this.attackAnimUntil = pending.at + 0.6;
        this.attackCooldown = this.profile.playerCooldown;
        strike =
          Math.hypot(px - this.x, pz - this.z) < biteReach &&
          Math.hypot(px - pending.x, pz - pending.z) < biteReach * 0.85;
      }
    } else if (
      hunting &&
      Math.hypot(px - this.x, pz - this.z) < biteReach &&
      this.attackCooldown <= 0
    ) {
      this.pendingStrike = { at: time + (this.profile.combat?.windup ?? 0.35), x: px, z: pz };
      this.attackAnimUntil = this.pendingStrike.at + 0.25;
      this.prepareStrike(time);
    }
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
