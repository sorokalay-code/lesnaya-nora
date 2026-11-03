import type { Group } from 'three';
import type { WaterNavigation } from '../WaterNavigation';

export interface AnimalPosition {
  x: number;
  z: number;
}

/** Базовая сущность животного: единые координаты, здоровье и физическое перемещение. */
export abstract class Animal<K extends string = string> {
  protected waterNavigation?: WaterNavigation;

  useWater(navigation: WaterNavigation): void {
    this.waterNavigation = navigation;
  }

  protected surfaceStep(
    x: number,
    z: number,
    dt: number,
    groundAt: (x: number, z: number) => number,
  ): void {
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
    this.root.userData.swimming = !!this.swimSpeed && !!water?.swimming(x, z);
    const immersion =
      this.kind === 'snake' ? 0.06 : Number(this.root.userData.swimImmersion ?? 0.45);
    this.moveTo(x, z, water?.height(x, z, immersion) ?? groundAt(x, z));
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
