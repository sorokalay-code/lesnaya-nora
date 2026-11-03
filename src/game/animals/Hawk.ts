import * as THREE from 'three';
import { animateHawk, createHawk } from '../Models';
import { Random } from '../Random';
import { Animal } from './Animal';
import type { GroundHeight } from './types';
import type { AttackListener } from '../audio/AttackCue';
import {
  AnimalAppearance,
  type AppearanceOptions,
  type AppearanceTraits,
} from '../AnimalAppearance';
import type { ModelInstance } from '../ModelAssets';
/** Сокол летит между случайными целями и пикирует на добычу в открытом пространстве. */
export class Hawk extends Animal<'hawk'> {
  readonly appearance: AppearanceTraits;
  readonly shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 24),
    new THREE.MeshBasicMaterial({
      color: 0x222a23,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  );
  private targetX: number;
  private targetZ: number;
  private nextTurn = 0;
  private diveUntil = 0;
  private cooldown = 0;
  private diveStartY = 13;
  private readonly rng: Random;
  private attackListener?: AttackListener;

  setAttackListener(listener?: AttackListener): void {
    this.attackListener = listener;
  }

  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('hawk', createHawk(), { x, z }, 60);
    this.appearance = AnimalAppearance.normalize(appearance);
    AnimalAppearance.apply(this.root.userData.model as ModelInstance, this.appearance);
    this.x = this.targetX = x;
    this.z = this.targetZ = z;
    this.rng = rng;
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.position.y = 13;
  }

  isDiving(time: number): boolean {
    return this.diveUntil > time;
  }

  update(
    dt: number,
    time: number,
    px: number,
    pz: number,
    exposed: boolean,
    groundAt: GroundHeight,
  ): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const distance = Math.hypot(px - this.x, pz - this.z);
    if (exposed && distance < 18 && this.cooldown <= 0 && this.diveUntil <= time) {
      this.diveUntil = time + 2.5;
      this.diveStartY = this.root.position.y;
      this.cooldown = 35;
      this.attackListener?.({
        kind: 'hawk',
        phase: 'leap',
        x: this.x,
        y: this.root.position.y,
        z: this.z,
        time,
      });
    }

    if (this.diveUntil > time) {
      const fraction = 1 - (this.diveUntil - time) / 2.5;
      const direction = Math.atan2(px - this.x, pz - this.z);
      const step = Math.min(dt * 9, Math.hypot(px - this.x, pz - this.z));
      this.x += Math.sin(direction) * step;
      this.z += Math.cos(direction) * step;
      const floor = groundAt(this.x, this.z);
      const altitude =
        fraction < 0.6
          ? floor + 0.95 + Math.max(0, this.diveStartY - floor - 0.95) * (1 - fraction / 0.6) ** 1.4
          : floor + 0.95 + ((fraction - 0.6) / 0.4) * 10.5;
      this.root.position.set(this.x, altitude, this.z);
      this.root.rotation.y = direction + Math.PI;
      if (
        fraction > 0.5 &&
        fraction < 0.75 &&
        Math.hypot(px - this.x, pz - this.z) < 2 &&
        Math.abs(this.root.position.y - groundAt(px, pz) - 1) < 0.8 &&
        exposed
      ) {
        this.diveUntil = 0;
        this.attackListener?.({
          kind: 'hawk',
          phase: 'strike',
          x: this.x,
          y: this.root.position.y,
          z: this.z,
          time,
        });
        return true;
      }
    } else {
      if (time >= this.nextTurn || Math.hypot(this.targetX - this.x, this.targetZ - this.z) < 3) {
        this.nextTurn = time + this.rng.range(7, 15);
        this.targetX = this.rng.range(-85, 85);
        this.targetZ = this.rng.range(-85, 85);
      }

      const heading = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
      this.x += Math.sin(heading) * dt * 5.5;
      this.z += Math.cos(heading) * dt * 5.5;
      this.root.position.set(
        this.x,
        THREE.MathUtils.damp(
          this.root.position.y,
          groundAt(this.x, this.z) + 13 + Math.sin(time * 1.4) * 0.5,
          2,
          dt,
        ),
        this.z,
      );
      this.root.rotation.y = heading + Math.PI;
    }

    const striking = this.diveUntil > time && 1 - (this.diveUntil - time) / 2.5 > 0.42;
    animateHawk(this.root, this.diveUntil > time || Math.sin(time * 2) > 0.3, dt, striking);
    this.shadow.position.set(this.x, groundAt(this.x, this.z) + 0.05, this.z);
    this.shadow.scale.setScalar(this.diveUntil > time ? 1.5 : 0.85);
    return false;
  }
}
