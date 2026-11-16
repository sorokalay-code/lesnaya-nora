import { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { Predator } from './Predator';
import type { HabitatPoint, TerritoryIntent } from '../AnimalHabitats';
import { animatePredator } from '../Models';
import { DEN_APPROACH, DEN_BED, type WolfDen } from '../WolfDen';
import { WolfDenRoute } from '../WolfDenRoute';
import type { DigNode } from '../types';

const CHAMBER_WALK_SPEED = 1.35;
const ENTRANCE_REACH = 0.21;

interface DenAccess {
  den: WolfDen;
  member: number;
  restInside: boolean;
  entry: DigNode;
  approach: DigNode;
  heightAt: (x: number, z: number) => number | undefined;
}

/** Волк быстро преследует добычу и опасен на открытых тропах. */
export class Wolf extends Predator {
  private access?: DenAccess;
  private readonly route = new WolfDenRoute();
  private depth = 0;
  private atApproach = false;
  private leavingApproach = false;

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
    return !this.inDen && !this.leavingApproach && super.canPursue(x, z);
  }

  protected override territoryDestination(intent: TerritoryIntent, time: number): HabitatPoint {
    const access = this.access;
    if (!access) return intent.destination;

    const { den, entry, approach } = access;
    if (intent.hunting) {
      this.atApproach = false;
      if (this.leavingApproach && this.near(approach, 0.65)) this.leavingApproach = false;
      return this.leavingApproach ? approach : this.routeTo(intent.destination, time, access);
    }

    if (intent.destination !== den.entrance) return this.routeTo(intent.destination, time, access);
    if (this.near(approach, 0.6)) this.atApproach = true;
    return this.atApproach ? entry : this.routeTo(approach, time, access);
  }

  protected override travelsToTerritory(distance: number): boolean {
    return distance > (this.access && !this.atApproach ? 1.5 : 7);
  }

  protected override moveInDen(dt: number, time: number, mayEnter: boolean): boolean {
    const access = this.access;
    if (!access) return false;

    const entering = !this.huntingOpen && access.restInside;
    if (
      !this.inDen &&
      !(entering && mayEnter && this.atApproach && this.near(access.entry, ENTRANCE_REACH))
    )
      return false;

    const depth = this.depth;
    const step = dt * CHAMBER_WALK_SPEED;
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
    this.root.rotation.y = den.site.angle + (this.huntingOpen ? 0 : Math.PI);
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
