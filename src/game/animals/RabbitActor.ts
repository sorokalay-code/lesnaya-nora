import * as THREE from 'three';
import type { Excavation } from '../Excavation';
import { animateRabbit } from '../Models';
import { Random } from '../Random';
import type { PartnerTraits } from '../types';
import { Rabbit } from './Rabbit';
import type { GroundHeight } from './types';
/** Взрослый крол: самостоятельные прогулки и физическое перемещение партнёра по ходам. */
export class RabbitActor extends Rabbit {
  private wanderAngle = 0;
  private nextTurn = 0;
  private activity: 'forage' | 'rest' | 'explore' = 'explore';
  private targetX: number;
  private targetZ: number;
  private tunnelPosition?: { x: number; y: number; z: number };
  private mateForageUntil = 0;
  private mateForageTarget?: { x: number; z: number };

  constructor(
    readonly data: PartnerTraits,
    private readonly rng: Random,
  ) {
    super(data, data.genes);
    this.targetX = data.x;
    this.targetZ = data.z;
  }

  moveTo(x: number, z: number, y: number): void {
    this.data.x = x;
    this.data.z = z;
    this.rig.root.position.set(x, y, z);
    this.rig.root.userData.baseY = y;
    if (this.tunnelPosition) this.tunnelPosition = { x, y, z };
  }

  enterTunnel(x: number, y: number, z: number): void {
    this.tunnelPosition = { x, y, z };
    this.data.x = x;
    this.data.z = z;
    this.rig.root.position.set(x, y, z);
    this.rig.root.userData.baseY = y;
  }

  leaveTunnel(): void {
    this.tunnelPosition = undefined;
  }

  navigateMate(
    dt: number,
    time: number,
    target: { x: number; y: number; z: number },
    earth: Excavation,
    groundAt: GroundHeight,
    speed = 2.3,
  ): void {
    this.tunnelPosition = undefined;
    const from = {
      x: this.data.x,
      y: (this.rig.root.userData.baseY as number) ?? this.rig.root.position.y,
      z: this.data.z,
    };
    const waypoint = earth.nextStep(from, target) ?? target;
    const dx = waypoint.x - this.data.x,
      dz = waypoint.z - this.data.z,
      distance = Math.hypot(dx, dz);
    const moving = distance > 0.2;
    if (moving) {
      const step = Math.min(distance, speed * dt);
      this.data.x = THREE.MathUtils.clamp(this.data.x + (dx / distance) * step, -97, 97);
      this.data.z = THREE.MathUtils.clamp(this.data.z + (dz / distance) * step, -97, 97);
      const desired = Math.atan2(-dx, -dz);
      const turn = Math.atan2(
        Math.sin(desired - this.rig.root.rotation.y),
        Math.cos(desired - this.rig.root.rotation.y),
      );
      this.rig.root.rotation.y += THREE.MathUtils.clamp(turn, -dt * 4, dt * 4);
    }

    const y = earth.floorAt(this.data.x, this.data.z, from.y);
    this.rig.root.position.x = this.data.x;
    this.rig.root.position.z = this.data.z;
    this.rig.root.userData.baseY = earth.isSheltered(this.data.x, y, this.data.z)
      ? y
      : groundAt(this.data.x, this.data.z);
    animateRabbit(this.rig, time + this.data.id, moving, false, dt);
  }

  updateMate(
    dt: number,
    time: number,
    home: { x: number; y: number; z: number },
    food: { x: number; z: number }[],
    earth: Excavation,
    groundAt: GroundHeight,
  ): void {
    this.tunnelPosition = undefined;
    if (time > this.mateForageUntil) {
      this.mateForageUntil = time + this.rng.range(10, 22);
      this.mateForageTarget = this.rng.chance(0.5)
        ? this.rng.pick(food.filter((f) => Math.hypot(f.x - home.x, f.z - home.z) < 18))
        : undefined;
    }

    let target = this.mateForageTarget ?? home;
    const opening = earth.openings
      .slice()
      .sort(
        (a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z),
      )[0];
    const inside = earth.isSheltered(this.data.x, this.rig.root.position.y, this.data.z);
    if (opening && this.mateForageTarget && inside) {
      const angle = Math.atan2(
        this.mateForageTarget.x - opening.x,
        this.mateForageTarget.z - opening.z,
      );
      target = { x: opening.x + Math.sin(angle) * 2.4, z: opening.z + Math.cos(angle) * 2.4 };
    } else if (
      opening &&
      !this.mateForageTarget &&
      earth.isSheltered(home.x, home.y, home.z) &&
      !inside
    )
      target = opening;

    const distance = Math.hypot(target.x - this.data.x, target.z - this.data.z);
    const moving = distance > 0.7;
    if (moving) {
      const heading = Math.atan2(target.x - this.data.x, target.z - this.data.z);
      this.data.x += Math.sin(heading) * dt * 2.2;
      this.data.z += Math.cos(heading) * dt * 2.2;
      const desired = heading + Math.PI;
      const turn = Math.atan2(
        Math.sin(desired - this.rig.root.rotation.y),
        Math.cos(desired - this.rig.root.rotation.y),
      );
      this.rig.root.rotation.y += THREE.MathUtils.clamp(turn, -dt * 3, dt * 3);
    }

    const y = earth.floorAt(this.data.x, this.data.z, this.rig.root.position.y);
    this.rig.root.position.x = this.data.x;
    this.rig.root.position.z = this.data.z;
    this.rig.root.userData.baseY = earth.isSheltered(this.data.x, y, this.data.z)
      ? y
      : groundAt(this.data.x, this.data.z);
    animateRabbit(this.rig, time + this.data.id, moving, false, dt);
  }

  update(dt: number, time: number, playerX: number, playerZ: number, groundAt: GroundHeight): void {
    if (this.tunnelPosition) {
      this.rig.root.position.set(
        this.tunnelPosition.x,
        this.tunnelPosition.y,
        this.tunnelPosition.z,
      );
      this.rig.root.userData.baseY = this.tunnelPosition.y;
      animateRabbit(this.rig, time + this.data.id, false, false, dt);
      return;
    }

    if (
      time > this.nextTurn ||
      Math.hypot(this.targetX - this.data.x, this.targetZ - this.data.z) < 0.7
    ) {
      this.nextTurn = time + this.rng.range(4, 9);
      this.activity = this.rng.pick(['forage', 'forage', 'rest', 'explore'] as const);
      this.wanderAngle = this.rng.range(-Math.PI, Math.PI);
      const distance = this.activity === 'explore' ? this.rng.range(4, 9) : this.rng.range(1.5, 4);
      this.targetX = this.data.x + Math.sin(this.wanderAngle) * distance;
      this.targetZ = this.data.z + Math.cos(this.wanderAngle) * distance;
    }

    const near = Math.hypot(playerX - this.data.x, playerZ - this.data.z) < 3;
    const moving = !near && this.activity !== 'rest';
    if (moving) {
      const direction = Math.atan2(this.targetX - this.data.x, this.targetZ - this.data.z);
      const nx =
        this.data.x + Math.sin(direction) * dt * (this.activity === 'explore' ? 1.4 : 0.75);
      const nz =
        this.data.z + Math.cos(direction) * dt * (this.activity === 'explore' ? 1.4 : 0.75);
      if (Math.hypot(nx, nz) < 95) {
        this.data.x = nx;
        this.data.z = nz;
      }

      this.wanderAngle = direction;
    }

    this.rig.root.position.x = this.data.x;
    this.rig.root.position.z = this.data.z;
    this.rig.root.userData.baseY = groundAt(this.data.x, this.data.z);
    const targetRotation = near
      ? Math.atan2(-(playerX - this.data.x), -(playerZ - this.data.z))
      : this.wanderAngle + Math.PI;
    const turn = Math.atan2(
      Math.sin(targetRotation - this.rig.root.rotation.y),
      Math.cos(targetRotation - this.rig.root.rotation.y),
    );
    this.rig.root.rotation.y += THREE.MathUtils.clamp(turn, -2.7 * dt, 2.7 * dt);
    animateRabbit(this.rig, time + this.data.id, moving, false, dt);
  }
}
