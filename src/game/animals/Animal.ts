import type { Group, Object3D, Vector3 } from 'three';
import type { WaterNavigation } from '../WaterNavigation';
import { traceGround } from '../GroundContact';
import { GroundPose } from '../GroundPose';
import type { MammalOrigin } from '../MammalNursery';

export interface AnimalPosition {
  x: number;
  z: number;
}

/** Базовая сущность животного: единые координаты, здоровье и физическое перемещение. */
export abstract class Animal<K extends string = string> {
  protected waterNavigation?: WaterNavigation;
  protected surfaceAllowed?: (x: number, z: number, y: number) => boolean;
  protected movementLimit = 97;
  private scaleAtMaturity?: Vector3;
  private heads?: { object: Object3D; scale: Vector3 }[];
  growthScale = 1;
  mammalOrigin?: MammalOrigin;
  mammalId?: number;
  habitatSlot?: number;

  get juvenile(): boolean {
    return this.growthScale < 1;
  }

  updateGrowth(progress: number): void {
    if (progress === 1 && !this.juvenile) return;
    if (!this.scaleAtMaturity) {
      this.scaleAtMaturity = this.root.scale.clone();
      this.heads = [];
      this.root.traverse((object) => {
        if (object.name === 'Head') this.heads?.push({ object, scale: object.scale.clone() });
      });
    }

    this.growthScale = 0.4 + progress * 0.6;
    this.root.scale.copy(this.scaleAtMaturity).multiplyScalar(this.growthScale);
    const headSize = 1 + (1 - progress) * 0.28;
    for (const { object, scale } of this.heads ?? [])
      object.scale.copy(scale).multiplyScalar(headSize);
  }

  useWorldBounds(size: number): void {
    this.movementLimit = (size * 97) / 110;
  }

  useWater(navigation: WaterNavigation): void {
    this.waterNavigation = navigation;
  }

  protected surfaceStep(
    x: number,
    z: number,
    dt: number,
    groundAt: (x: number, z: number) => number,
  ): boolean {
    x = Math.max(-this.movementLimit, Math.min(this.movementLimit, x));
    z = Math.max(-this.movementLimit, Math.min(this.movementLimit, z));
    const water = this.waterNavigation;
    if (water) {
      if (!this.swimSpeed) {
        const step = water.dryStep({ x: this.x, y: this.root.position.y, z: this.z }, x, z);
        x = step.x;
        z = step.z;
      } else if (water.swimming(this.x, this.z) || water.swimming(x, z)) {
        const distance = Math.hypot(x - this.x, z - this.z),
          maximum = this.swimSpeed * dt;
        if (distance > maximum) {
          x = this.x + ((x - this.x) * maximum) / distance;
          z = this.z + ((z - this.z) * maximum) / distance;
        }
      }
    }
    const immersion =
      this.kind === 'snake' ? 0.06 : Number(this.root.userData.swimImmersion ?? 0.45);
    const support = (nx: number, nz: number) =>
      water?.height(nx, nz, immersion) ?? groundAt(nx, nz);
    const from = { x: this.x, y: support(this.x, this.z), z: this.z };
    const point = traceGround(from, x, z, {
      heightAt: support,
      canOccupy: this.surfaceAllowed,
      surfaceSpeed: true,
      slopeLimit: water
        ? (previous, nx, nz) =>
            !water.terrain.waterAt(previous.x, previous.z) && !water.terrain.waterAt(nx, nz)
        : undefined,
    });
    this.root.userData.swimming = !!this.swimSpeed && !!water?.swimming(point.x, point.z);
    this.moveTo(point.x, point.z, point.y);
    if (!water?.terrain.waterAt(point.x, point.z))
      GroundPose.contact(this.root, point.x, point.z, groundAt);
    return point !== from;
  }

  get swimSpeed(): number {
    return 0;
  }

  protected constructor(
    readonly kind: K,
    readonly root: Group,
    private readonly position: AnimalPosition,
    readonly maxHealth: number,
    private readonly vitality = { health: maxHealth },
  ) {
    root.position.set(position.x, 0, position.z);
  }

  get x(): number {
    return this.position.x;
  }

  set x(value: number) {
    this.position.x = value;
  }

  get z(): number {
    return this.position.z;
  }

  set z(value: number) {
    this.position.z = value;
  }

  get health(): number {
    return this.vitality.health;
  }

  set health(value: number) {
    this.vitality.health = value;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  moveTo(x: number, z: number, y: number): void {
    this.x = x;
    this.z = z;
    this.root.position.set(x, y, z);
  }
}
