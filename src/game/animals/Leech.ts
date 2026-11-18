import { Vector3, type Object3D } from 'three';
import { Animal } from './Animal';
import { ModelAssets, type ModelInstance } from '../ModelAssets';
import { inWaterPath } from '../AquaticHabitats';
import type { WaterTerrain } from '../WaterNavigation';
import type { SaveData } from '../types';

export const LEECH = {
  maxPopulation: 64,
  perWaterBody: 6,
  maxAttached: 3,
  minDepth: 0.12,
  searchRadius: 4,
  contactRadius: 0.75,
  swimSpeed: 0.65,
  feedingSeconds: 30,
  satedSeconds: 90,
  bloodPerSecond: 0.22,
  energyPerSecond: 0.08,
} as const;

export type LeechPhase =
  | { kind: 'hungry' }
  | { kind: 'attached'; slot: number; fedSeconds: number }
  | { kind: 'sated'; remainingSeconds: number };

export interface LeechState {
  id: number;
  waterBody: string;
  x: number;
  y: number;
  z: number;
  phase: LeechPhase;
}

const ATTACHMENTS = [
  { x: -0.41, y: 0.5, z: 0.14, roll: -Math.PI / 2 },
  { x: 0.41, y: 0.5, z: 0.14, roll: Math.PI / 2 },
  { x: 0, y: 0.9, z: 0.12, roll: 0 },
] as const;

/** Водный паразит: плывёт, крепится к телу, пьёт кровь до насыщения и затем отпадает. */
export class Leech extends Animal<'leech'> {
  readonly model: ModelInstance;
  private readonly worldPosition = new Vector3();

  constructor(readonly state: LeechState) {
    const model = ModelAssets.shared.create('leech');
    super('leech', model.root, state, 3);
    this.model = model;
    this.root.position.y = state.y;
  }

  attach(host: Object3D, slot: number): void {
    this.state.phase = { kind: 'attached', slot, fedSeconds: 0 };
    this.mount(host, slot);
  }

  restoreAttachment(host: Object3D): void {
    if (this.state.phase.kind === 'attached') this.mount(host, this.state.phase.slot);
  }

  release(scene: Object3D): void {
    // Сначала переводим локальное положение в мировое, иначе паразит телепортируется к началу мира.
    if (this.root.parent) this.root.getWorldPosition(this.worldPosition);
    else this.worldPosition.set(this.state.x, this.state.y + 0.4, this.state.z);
    scene.add(this.root);
    this.root.position.copy(this.worldPosition);
    this.state.x = this.worldPosition.x;
    this.state.y = this.worldPosition.y;
    this.state.z = this.worldPosition.z;
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1.5);
    this.state.phase = { kind: 'sated', remainingSeconds: LEECH.satedSeconds };
  }

  feed(dt: number, player: SaveData['player']): boolean {
    const phase = this.state.phase;
    if (phase.kind !== 'attached') return false;

    const seconds = Math.min(Math.max(0, dt), LEECH.feedingSeconds - phase.fedSeconds);
    phase.fedSeconds += seconds;
    player.health = Math.max(0, player.health - seconds * LEECH.bloodPerSecond);
    player.energy = Math.max(0, player.energy - seconds * LEECH.energyPerSecond);
    this.state.x = player.x;
    this.state.y = player.y;
    this.state.z = player.z;
    const fullness = phase.fedSeconds / LEECH.feedingSeconds;
    this.root.scale.set(1 + fullness * 0.9, 1 + fullness * 0.5, 1 + fullness * 0.25);
    ModelAssets.shared.play(this.model, 'feed', Math.max(0, dt));
    return phase.fedSeconds >= LEECH.feedingSeconds;
  }

  swim(dt: number, terrain: WaterTerrain, prey?: { x: number; z: number }): void {
    const phase = this.state.phase;
    if (phase.kind === 'attached') return;
    if (phase.kind === 'sated') {
      phase.remainingSeconds = Math.max(0, phase.remainingSeconds - Math.max(0, dt));
      if (phase.remainingSeconds === 0) {
        this.state.phase = { kind: 'hungry' };
        this.root.scale.setScalar(1);
      }
    }

    if (prey && this.state.phase.kind === 'hungry') {
      const dx = prey.x - this.x;
      const dz = prey.z - this.z;
      const distance = Math.hypot(dx, dz);
      const step = Math.min(Math.max(0, dt) * LEECH.swimSpeed, distance);
      if (distance > 0.001 && this.reaches(terrain, prey)) {
        this.x += (dx / distance) * step;
        this.z += (dz / distance) * step;
        this.root.rotation.y = Math.atan2(-dx, -dz);
      }
    }
    const water = terrain.waterAt(this.x, this.z);
    this.state.y = water
      ? Math.max(terrain.heightAt(this.x, this.z) + 0.04, water.level - 0.18)
      : terrain.heightAt(this.x, this.z) + 0.04;
    this.root.position.set(this.x, this.state.y, this.z);
    ModelAssets.shared.play(this.model, 'swim', Math.max(0, dt), prey ? 1.4 : 0.35);
  }

  reaches(terrain: WaterTerrain, prey: { x: number; z: number }): boolean {
    return inWaterPath(
      (x, z) => terrain.waterAt(x, z),
      this,
      prey,
      this.state.waterBody,
      LEECH.minDepth,
    );
  }

  dispose(): void {
    ModelAssets.shared.release(this.root);
    this.root.removeFromParent();
  }

  private mount(host: Object3D, slot: number): void {
    const at = ATTACHMENTS[slot];
    // Визуальный корень делает выпад отдельно от коллизии; паразит следует именно за телом.
    const body = host.getObjectByName('CombatMotion') ?? host;
    body.add(this.root);
    this.root.position.set(at.x, at.y, at.z);
    this.root.rotation.set(0, 0, at.roll);
    this.root.visible = true;
  }
}
