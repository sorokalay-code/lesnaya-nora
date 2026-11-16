import * as THREE from 'three';
import { animateHawk, createRaptor } from '../Models';
import { Random } from '../Random';
import { Animal } from './Animal';
import type { GroundHeight } from './types';
import type { AttackListener } from '../audio/AttackCue';
import {
  AnimalAppearance,
  type AppearanceOptions,
  type AppearanceTraits,
} from '../AnimalAppearance';
import { ModelAssets, type ModelInstance } from '../ModelAssets';
import { HAWK_HUNT } from './HawkProfile';
export type RaptorKind = 'hawk' | 'owl';

interface FlightProfile {
  height: number;
  diveCooldown: number;
  cruiseSpeed: number;
}

/** Выполняет общий полёт, пикирование и синхронизацию тени хищных птиц. */
export abstract class FlyingRaptor extends Animal<RaptorKind> {
  readonly diet: 'small-game' | 'rodents' = 'small-game';
  readonly strikeDamage?: number;

  get present(): boolean {
    return this.alive;
  }

  updatePresence(_night: boolean, _scene: THREE.Scene | undefined, _groundAt: GroundHeight): void {}

  dispose(): void {
    ModelAssets.shared.release(this.root);
    this.root.removeFromParent();
    this.shadow.removeFromParent();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }

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

  protected constructor(
    kind: RaptorKind,
    x: number,
    z: number,
    rng: Random,
    protected readonly flight: FlightProfile,
    appearance?: AppearanceOptions,
  ) {
    super(kind, createRaptor(kind), { x, z }, 60);
    this.appearance = AnimalAppearance.normalize(appearance);
    AnimalAppearance.apply(this.root.userData.model as ModelInstance, this.appearance);
    this.x = this.targetX = x;
    this.z = this.targetZ = z;
    this.rng = rng;
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.position.y = flight.height;
  }

  isDiving(time: number): boolean {
    return this.diveUntil > time;
  }

  get readyToHunt(): boolean {
    return this.cooldown <= 0;
  }

  cancelDive(): void {
    this.diveUntil = 0;
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
    if (
      exposed &&
      distance < HAWK_HUNT.preyRadius &&
      this.cooldown <= 0 &&
      this.diveUntil <= time
    ) {
      this.diveUntil = time + 2.5;
      this.diveStartY = this.root.position.y;
      this.cooldown = this.flight.diveCooldown;
      this.attackListener?.({
        kind: this.kind,
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
          kind: this.kind,
          phase: 'strike',
          x: this.x,
          y: this.root.position.y,
          z: this.z,
          time,
        });
        return true;
      }
    } else {
      if (exposed && distance < HAWK_HUNT.disengageRadius && this.readyToHunt) {
        this.targetX = px;
        this.targetZ = pz;
      } else if (
        time >= this.nextTurn ||
        Math.hypot(this.targetX - this.x, this.targetZ - this.z) < 3
      ) {
        this.nextTurn = time + this.rng.range(7, 15);
        this.targetX = (this.rng.range(-this.movementLimit, this.movementLimit) * 85) / 97;
        this.targetZ = (this.rng.range(-this.movementLimit, this.movementLimit) * 85) / 97;
      }

      const heading = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
      const speed =
        exposed && this.readyToHunt ? this.flight.cruiseSpeed + 1 : this.flight.cruiseSpeed;
      this.x += Math.sin(heading) * dt * speed;
      this.z += Math.cos(heading) * dt * speed;
      this.root.position.set(
        this.x,
        THREE.MathUtils.damp(
          this.root.position.y,
          groundAt(this.x, this.z) + this.flight.height + Math.sin(time * 1.4) * 0.5,
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
