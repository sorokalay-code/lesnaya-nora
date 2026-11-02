import type { Group } from 'three';

export interface AnimalPosition {
  x: number;
  z: number;
}

/** Базовая сущность животного: единые координаты, здоровье и физическое перемещение. */
export abstract class Animal<K extends string = string> {
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
