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
import type { DigNode } from '../types';
import type { HabitatPoint } from '../AnimalHabitats';
export type RaptorKind = 'hawk' | 'owl';
export type RaptorFlight =
  | { mode: 'hunting'; grounds: HabitatPoint; angle: number }
  | { mode: 'landing' | 'practice'; target: DigNode; support?: THREE.Object3D };

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
  private schedule?: RaptorFlight;
  private arrived = false;
  private growingWings?: { part: THREE.Object3D; adultScale: THREE.Vector3 }[];
  private down?: {
    mesh: THREE.Mesh;
    adult: THREE.MeshStandardMaterial;
    pale: THREE.MeshStandardMaterial;
  }[];

  override updateGrowth(progress: number): void {
    super.updateGrowth(progress);
    if (progress === 1 && !this.growingWings) return;
    if (!this.growingWings) {
      const wings: NonNullable<FlyingRaptor['growingWings']> = [];
      this.root.traverse((part) => {
        if (/^Wing[LR]$/.test(part.name)) wings.push({ part, adultScale: part.scale.clone() });
      });
      this.growingWings = wings;
    }
    for (const { part, adultScale } of this.growingWings) {
      part.scale.copy(adultScale);
      part.scale.x *= 0.48 + progress * 0.52;
      part.scale.z *= 0.72 + progress * 0.28;
    }
    if (progress < 0.7 && !this.down) {
      const feathers: NonNullable<FlyingRaptor['down']> = [];
      this.root.traverse((part) => {
        if (!(part instanceof THREE.Mesh) || !(part.material instanceof THREE.MeshStandardMaterial))
          return;
        const adult = part.material;
        if (!/^(fur_|Mantle|Breast|Flight feather|Tail)/.test(adult.name)) return;
        const pale = adult.clone();
        pale.color.set(this.kind === 'owl' ? 0xd8cbbb : 0xcbb17d);
        part.material = pale;
        feathers.push({ mesh: part, adult, pale });
      });
      this.down = feathers;
    }
    if (progress >= 0.7 && this.down) {
      for (const { mesh, adult, pale } of this.down) {
        mesh.material = adult;
        pale.dispose();
      }
      this.down = undefined;
    }
  }

  get territorial(): boolean {
    return this.schedule !== undefined;
  }

  get perched(): boolean {
    return this.schedule?.mode === 'landing' && this.arrived;
  }

  get supportVisible(): boolean {
    if (this.schedule?.mode !== 'landing') return true;
    for (let object = this.schedule.support; object; object = object.parent ?? undefined)
      if (!object.visible) return false;
    return true;
  }

  get huntingAllowed(): boolean {
    return !this.schedule || (this.schedule.mode === 'hunting' && this.arrived);
  }

  followFlight(schedule: RaptorFlight): void {
    if (schedule.mode !== this.schedule?.mode) {
      this.arrived = false;
      this.cancelDive();
    }
    this.schedule = schedule;
  }

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
    if (this.schedule && this.schedule.mode !== 'hunting') {
      this.approachPerch(dt, this.schedule, groundAt);
      return false;
    }
    if (this.schedule?.mode === 'hunting')
      this.arrived =
        Math.hypot(this.x - this.schedule.grounds.x, this.z - this.schedule.grounds.z) < 25;
    exposed &&= this.huntingAllowed;
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
      } else if (this.schedule?.mode === 'hunting') {
        const { grounds, angle } = this.schedule;
        const radius = this.arrived ? 5 : 0;
        this.targetX = grounds.x + Math.cos(angle + time * 0.36) * radius;
        this.targetZ = grounds.z + Math.sin(angle + time * 0.36) * radius;
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
    animateHawk(
      this.root,
      this.diveUntil > time || Math.sin(time * 2) > 0.3,
      dt,
      striking,
      striking
        ? { elapsed: time - (this.diveUntil - 2.5 * 0.58), duration: 2.5 * 0.58 }
        : undefined,
    );
    this.shadow.position.set(this.x, groundAt(this.x, this.z) + 0.05, this.z);
    this.shadow.scale.setScalar(this.diveUntil > time ? 1.5 : 0.85);
    return false;
  }

  private approachPerch(
    dt: number,
    plan: Extract<RaptorFlight, { target: DigNode }>,
    groundAt: GroundHeight,
  ): void {
    const { x, y, z } = plan.target;
    const landing = plan.mode === 'landing';
    const speed = landing ? this.flight.cruiseSpeed * 0.92 : this.flight.cruiseSpeed * 0.7;
    const dx = x - this.x;
    const dz = z - this.z;
    const distance = Math.hypot(dx, dz);
    const horizontal = Math.min(distance, dt * speed);
    const nextX = distance > 0 ? this.x + (dx * horizontal) / distance : x;
    const nextZ = distance > 0 ? this.z + (dz * horizontal) / distance : z;
    const clearance = landing ? 0.45 * this.root.scale.y : 0.9;
    const floor = groundAt(nextX, nextZ);
    // При дальнем подлёте птица держится над препятствиями, затем опускается на площадку.
    const targetY = landing
      ? Math.max(floor + clearance, y + clearance) + Math.min(5, distance * 0.32)
      : Math.max(floor + clearance, y);
    const nextY =
      this.root.position.y + THREE.MathUtils.clamp(targetY - this.root.position.y, -dt * 5, dt * 6);
    this.moveTo(nextX, nextZ, nextY);
    if (horizontal > 0.005) this.root.rotation.y = Math.atan2(dx, dz) + Math.PI;
    this.arrived = landing && distance < 0.08 && Math.abs(targetY - nextY) < 0.08;
    if (this.perched) {
      ModelAssets.shared.play(this.root.userData.model as ModelInstance, 'perch', dt);
    } else animateHawk(this.root, true, dt);
    this.shadow.position.set(this.x, floor + 0.05, this.z);
    this.shadow.scale.setScalar(0.85);
  }
}
