import * as THREE from 'three';
import type { GardenPlot } from './GardenPlot';
import type { DigNode } from './types';
import { ModelAssets, type ModelInstance } from './ModelAssets';
import { SurfaceRoute } from './SurfaceRoute';
import { traceGround } from './GroundContact';

export type HunterPhase = 'home' | 'pursuing' | 'aiming' | 'returning';
export interface HunterState {
  garden: number;
  x: number;
  z: number;
  phase: HunterPhase;
  target?: string;
  alarmUntil: number;
  readyAt: number;
}

export const HUNTER = {
  speed: 2.5,
  range: 18,
  leash: 12,
  alarmMinutes: 180,
  aimMinutes: 8,
  reloadMinutes: 25,
  damage: 35,
};

/** Ведёт выход охотника, подход к цели, прицеливание и возвращение к двери своего дома. */
export class Hunter {
  readonly model: ModelInstance;
  readonly root: THREE.Group;
  private readonly route = new SurfaceRoute();
  private aimAt = Infinity;
  private lastShot = -Infinity;
  private readonly muzzle = new THREE.Vector3();
  private readonly flash: THREE.Mesh;
  private readonly tracer: THREE.Line;
  private readonly tracePositions = new Float32Array(6);
  private effectUntil = 0;
  private lastProgress = 0;
  private previous = new THREE.Vector2();

  constructor(
    readonly garden: GardenPlot,
    readonly state: HunterState,
    private readonly heightAt: (x: number, z: number) => number | undefined,
  ) {
    this.model = ModelAssets.shared.create('hunter');
    this.root = this.model.root;
    this.root.name = `garden-hunter-${garden.id}`;
    this.root.position.set(state.x, heightAt(state.x, state.z) ?? garden.door.y, state.z);
    this.previous.set(state.x, state.z);
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd17c, transparent: true, opacity: 0.95 }),
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.tracePositions, 3));
    this.tracer = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xf5d599, transparent: true, opacity: 0.7 }),
    );
    this.tracer.frustumCulled = false;
    this.flash.visible = this.tracer.visible = false;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.root, this.flash, this.tracer);
  }

  alarm(target: string, clock: number): void {
    this.state.target = target;
    this.state.alarmUntil = clock + HUNTER.alarmMinutes;
    if (this.state.phase === 'home' || this.state.phase === 'returning') {
      this.state.phase = 'pursuing';
      this.aimAt = Infinity;
      this.lastProgress = 0;
    }
  }

  update(
    dt: number,
    time: number,
    clock: number,
    target: DigNode | undefined,
    canShoot: boolean,
    lineClear: (from: DigNode, to: DigNode) => boolean,
    shoot: (from: DigNode, to: DigNode) => void,
  ): void {
    const data = this.state;
    this.flash.visible = this.tracer.visible = time < this.effectUntil;
    const insideLeash =
      target &&
      Math.hypot(target.x - this.garden.x, target.z - this.garden.z) <=
        this.garden.radius + HUNTER.leash;
    if (
      data.phase !== 'home' &&
      data.phase !== 'returning' &&
      (!insideLeash || clock >= data.alarmUntil)
    ) {
      data.phase = 'returning';
      delete data.target;
      this.aimAt = Infinity;
    }
    let moving = false;
    if (data.phase === 'returning') {
      moving = this.walk(this.garden.door, dt, time);
      if (Math.hypot(data.x - this.garden.door.x, data.z - this.garden.door.z) < 0.3) {
        data.phase = 'home';
        delete data.target;
      }
    } else if (data.phase !== 'home' && target) {
      const dx = target.x - data.x;
      const dz = target.z - data.z;
      this.root.rotation.y = Math.atan2(-dx, -dz);
      this.root.updateMatrixWorld(true);
      const muzzle = this.root.getObjectByName('Muzzle');
      if (muzzle) muzzle.getWorldPosition(this.muzzle);
      else this.muzzle.set(data.x, this.root.position.y + 1.3, data.z);
      const origin = { x: this.muzzle.x, y: this.muzzle.y, z: this.muzzle.z };
      const outsideDoor =
        Math.hypot(data.x - this.garden.door.x, data.z - this.garden.door.z) >= 1.2;
      const canAim = outsideDoor && Math.hypot(dx, dz) <= HUNTER.range && lineClear(origin, target);
      if (canAim) {
        if (data.phase !== 'aiming' || !Number.isFinite(this.aimAt))
          this.aimAt = clock + HUNTER.aimMinutes;
        data.phase = 'aiming';
        if (canShoot && clock >= this.aimAt && clock >= data.readyAt) {
          data.readyAt = clock + HUNTER.reloadMinutes;
          this.lastShot = time;
          this.effectUntil = time + 0.09;
          this.showShot(origin, target);
          shoot(origin, target);
        }
      } else {
        data.phase = 'pursuing';
        this.aimAt = Infinity;
        moving = this.walk(target, dt, time);
      }
    }
    this.root.visible = data.phase !== 'home';
    const clip =
      time - this.lastShot < 0.3
        ? 'shoot'
        : moving
          ? 'walk'
          : data.phase === 'aiming'
            ? 'aim'
            : 'idle';
    ModelAssets.shared.play(this.model, clip, dt);
  }

  dispose(): void {
    ModelAssets.shared.release(this.root);
    this.root.removeFromParent();
    for (const object of [this.flash, this.tracer]) {
      object.removeFromParent();
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  }

  private walk(target: DigNode, dt: number, time: number): boolean {
    const data = this.state;
    const waypoint = this.route.step(this.root.position, target, time, this.heightAt);
    const dx = waypoint.x - data.x;
    const dz = waypoint.z - data.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(distance, dt * HUNTER.speed);
    const point = traceGround(
      this.root.position,
      data.x + (dx * step) / (distance || 1),
      data.z + (dz * step) / (distance || 1),
      { heightAt: this.heightAt },
    );
    if (Math.hypot(point.x - this.previous.x, point.z - this.previous.y) > 0.25) {
      this.previous.set(point.x, point.z);
      this.lastProgress = time;
    }
    // Недоступная цель не удерживает охотника за пределами дома бессрочно.
    if (data.phase === 'pursuing' && this.lastProgress && time - this.lastProgress > 5)
      data.phase = 'returning';
    data.x = point.x;
    data.z = point.z;
    this.root.position.set(point.x, point.y, point.z);
    if (step > 0.001) this.root.rotation.y = Math.atan2(-dx, -dz);
    return step > 0.001;
  }

  private showShot(from: DigNode, to: DigNode): void {
    this.flash.position.set(from.x, from.y, from.z);
    this.flash.visible = this.tracer.visible = true;
    this.tracePositions.set([from.x, from.y, from.z, to.x, to.y, to.z]);
    this.tracer.geometry.attributes.position.needsUpdate = true;
  }
}
