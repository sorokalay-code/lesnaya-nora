import { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { Predator } from './Predator';
import type { HabitatPoint, TerritoryIntent } from '../AnimalHabitats';
import { animatePredator } from '../Models';
import { DEN_APPROACH, DEN_BED, type WolfDen } from '../WolfDen';
import { SurfaceRoute } from '../SurfaceRoute';
import type { DigNode } from '../types';
import type { WolfDenDefense } from '../WolfDenDefense';

const CHAMBER_WALK_SPEED = 1.35;
const ENTRANCE_REACH = 0.21;
const PATROL_LEG_SECONDS = 6;

interface DenAccess {
  den: WolfDen;
  member: number;
  restInside: boolean;
  entry: DigNode;
  approach: DigNode;
  defense: WolfDenDefense;
  patrol: readonly HabitatPoint[];
  heightAt: (x: number, z: number) => number | undefined;
}

/** Волк быстро преследует добычу и опасен на открытых тропах. */
export class Wolf extends Predator {
  private access?: DenAccess;
  private readonly route = new SurfaceRoute();
  private depth = 0;
  private atApproach = false;
  private leavingApproach = false;
  private nurseryTarget?: HabitatPoint;
  private huntRadius?: number;

  stayWithLitter(target?: HabitatPoint, huntRadius?: number): void {
    this.nurseryTarget = target;
    this.huntRadius = huntRadius;
  }

  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'wolf',
      x,
      z,
      rng,
      {
        swimSpeed: 1.8,
        health: 75,
        range: 15,
        runSpeed: 3.7,
        walkSpeed: 0.75,
        playerReach: 1.5,
        playerCooldown: 3,
        preyReach: 1.9,
        preyCooldown: 3,
        damage: 38,
        counterDamage: 22,
        dayRange: 7,
        alwaysHunts: false,
        radius: 0.77,
        mass: 3,
      },
      appearance,
    );
  }

  useDen(access: Omit<DenAccess, 'entry' | 'approach'>): void {
    this.access = {
      ...access,
      entry: access.den.chamberPoint(0, access.member),
      approach: access.den.chamberPoint(-DEN_APPROACH, access.member),
    };
    this.surfaceAllowed = (x, z) => {
      const depth = access.den.penetration(x, z);
      return depth <= 0.03 || depth < access.den.penetration(this.x, this.z);
    };
  }

  get denDepth(): number {
    return this.depth;
  }

  restoreDen(depth: number): void {
    if (!this.access) return;
    this.depth = depth;
    this.placeInDen();
  }

  override get inDen(): boolean {
    return this.depth > 0;
  }

  override canPursue(x: number, z: number): boolean {
    if (this.juvenile || this.inDen || this.leavingApproach || !super.canPursue(x, z)) return false;
    const entrance = this.access?.den.entrance;
    return (
      !this.huntRadius || !entrance || Math.hypot(x - entrance.x, z - entrance.z) < this.huntRadius
    );
  }

  override get canMelee(): boolean {
    return !this.juvenile;
  }

  override get huntingOpen(): boolean {
    return !this.juvenile && super.huntingOpen;
  }

  warnIntruder(time: number): void {
    this.signalAttack(time, 'warning');
  }

  override get defenseRival(): Predator | undefined {
    if (!this.juvenile && !this.inDen && !this.leavingApproach)
      return this.access?.defense.rivalFor(this);
  }

  protected override defendsPlayer(x: number, z: number): boolean {
    if (this.juvenile || this.inDen || this.leavingApproach) return false;
    const target = this.access?.defense.playerTargetFor(this);
    return target?.x === x && target?.z === z;
  }

  protected override pursuitDestination(target: HabitatPoint, time: number): HabitatPoint {
    const access = this.access;
    if (!access || !access.defense.targetFor(this)) return target;
    return this.routeTo(target, time, access);
  }

  protected override territoryDestination(intent: TerritoryIntent, time: number): HabitatPoint {
    const access = this.access;
    if (!access) return intent.destination;

    const { den, entry, approach } = access;
    if (this.leavingApproach && this.near(approach, 0.65)) this.leavingApproach = false;
    if (this.leavingApproach) return approach;
    if (this.nurseryTarget && this.nurseryTarget !== den.entrance) {
      this.atApproach = false;
      return this.routeTo(this.nurseryTarget, time, access);
    }
    if (intent.hunting) {
      this.atApproach = false;
      return this.routeTo(intent.destination, time, access);
    }

    if (intent.destination !== den.entrance) {
      const index = (Math.floor(time / PATROL_LEG_SECONDS) + access.member) % access.patrol.length;
      return this.routeTo(access.patrol[index] ?? intent.destination, time, access);
    }
    if (this.near(approach, 0.6)) this.atApproach = true;
    return this.atApproach ? entry : this.routeTo(approach, time, access);
  }

  protected override travelsToTerritory(distance: number): boolean {
    if (this.juvenile) return false;
    if (!this.huntingOpen && this.access && !this.access.restInside) return distance > 7;
    return distance > (this.access && !this.atApproach ? 1.5 : 7);
  }

  protected override moveInDen(dt: number, time: number, mayEnter: boolean): boolean {
    const access = this.access;
    if (!access) return false;

    const stayInside = this.nurseryTarget
      ? this.nurseryTarget === access.den.entrance
      : !this.huntingOpen && access.restInside;
    const entering = stayInside && (this.juvenile || !access.defense.targetFor(this));
    if (
      !this.inDen &&
      !(entering && mayEnter && this.atApproach && this.near(access.entry, ENTRANCE_REACH))
    )
      return false;

    const depth = this.depth;
    const step = dt * CHAMBER_WALK_SPEED * this.growthScale;
    this.depth = entering ? Math.min(DEN_BED, depth + step) : Math.max(0, depth - step);
    this.placeInDen();
    if (this.depth === 0) {
      this.atApproach = false;
      this.leavingApproach = true;
    }
    animatePredator(this.root, time, false, dt, this.depth !== depth, false);
    return true;
  }

  private placeInDen(): void {
    if (!this.access) return;
    const { den, member, entry } = this.access;
    const point = this.depth === 0 ? entry : den.chamberPoint(this.depth, member);
    this.moveTo(point.x, point.z, point.y);
    const outward =
      (this.nurseryTarget && this.nurseryTarget !== den.entrance) ||
      this.huntingOpen ||
      this.access.defense.targetFor(this);
    this.root.rotation.y = den.site.angle + (outward ? 0 : Math.PI);
    this.root.userData.swimming = false;
  }

  private routeTo(target: HabitatPoint, time: number, access: DenAccess): HabitatPoint {
    return this.route.step(
      { x: this.x, y: this.root.position.y, z: this.z },
      target,
      time,
      access.heightAt,
    );
  }

  private near(point: HabitatPoint, distance: number): boolean {
    return Math.hypot(this.x - point.x, this.z - point.z) < distance;
  }
}
