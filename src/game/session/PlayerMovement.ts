import { JumpMotion } from './JumpMotion';
import { playableWorldLimit } from '../WorldConfig';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { GeneticTraits } from '../genetics/GeneticTraits';
import type { PlayerRabbit } from '../animals';
import type { Soundscape } from '../Audio';
import type { Excavation } from '../Excavation';
import type { ViewCamera } from '../ViewCamera';
import {
  WaterNavigation,
  RABBIT_SWIM_SPEED,
  RABBIT_SWIM_IMMERSION,
  type WaterTerrain,
} from '../WaterNavigation';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** Управляет направлением, ускорением, шагами и высотой крольчихи относительно рельефа. */
export class PlayerMovement {
  private footstepAt = 0;
  private readonly jump = new JumpMotion();
  private nextJumpAt = 0;
  private readonly water?: WaterNavigation;
  private readonly movementLimit: number;

  constructor(
    private readonly player: PlayerRabbit,
    private readonly keys: Set<string>,
    private readonly view: ViewCamera,
    private readonly earth: Excavation,
    private readonly sound: Soundscape,
    private readonly canOccupy: (
      x: number,
      z: number,
      y: number,
      heading: number,
    ) => boolean = () => true,
    terrain?: WaterTerrain & { readonly size?: number },
  ) {
    if (terrain) this.water = new WaterNavigation(terrain);
    this.movementLimit = playableWorldLimit(terrain?.size);
  }

  private get sheltered(): boolean {
    const p = this.player.data;
    return this.earth.isSheltered(p.x, p.y, p.z);
  }

  reset(): void {
    this.jump.cancel();
    this.nextJumpAt = 0;
  }

  requestJump(elapsed: number): boolean {
    const p = this.player.data;
    if (
      AnimalRestraint.active(this.player.root) ||
      this.jump.active ||
      elapsed < this.nextJumpAt ||
      p.energy < 9 * GeneticTraits.energyCost(p.genes) ||
      !GeneticTraits.canJump(p.genes) ||
      this.sheltered ||
      this.water?.swimming(p.x, p.z) ||
      ((this.player.rig.root.userData.actionUntil as number | undefined) ?? 0) > elapsed
    )
      return false;
    const direction = {
      x: -Math.sin(this.player.root.rotation.y),
      z: -Math.cos(this.player.root.rotation.y),
    };
    if (!this.jump.start(direction.x, direction.z)) return false;
    this.nextJumpAt = elapsed + 1.05;
    p.energy -= 9 * GeneticTraits.energyCost(p.genes);
    this.sound.play('hop');
    return true;
  }

  private advanceJump(dt: number): boolean {
    const step = this.jump.advance(dt);
    const p = this.player.data;
    // Малые шаги не позволяют рывку перескочить проверку стен тоннеля или границы карты.
    const steps = Math.max(1, Math.ceil(Math.hypot(step.x, step.z) / 0.18));
    for (let i = 0; i < steps; i++) {
      const x = clamp(p.x + step.x / steps, -this.movementLimit, this.movementLimit),
        z = clamp(p.z + step.z / steps, -this.movementLimit, this.movementLimit);
      if (
        this.earth.canMoveTo(x, p.z, p.y, this.sheltered) &&
        this.canOccupy(x, p.z, p.y, this.player.root.rotation.y)
      )
        p.x = x;
      if (
        this.earth.canMoveTo(p.x, z, p.y, this.sheltered) &&
        this.canOccupy(p.x, z, p.y, this.player.root.rotation.y)
      )
        p.z = z;
    }
    this.player.rig.root.userData.jumpHeight = step.height;
    this.player.rig.root.userData.jumpPitch = step.pitch;
    this.player.rig.root.userData.jumping = this.jump.active;
    if (step.landed) this.sound.play('step');
    return true;
  }

  move(dt: number, elapsed: number, blocked: boolean): boolean {
    if (AnimalRestraint.active(this.player.root)) {
      this.jump.cancel();
      return false;
    }
    const p = this.player.data;
    if (blocked || GeneticTraits.mobility(p.genes) === 0) return false;

    if (this.jump.active) return this.advanceJump(dt);

    if (((this.player.rig.root.userData.actionUntil as number | undefined) ?? 0) > elapsed)
      return false;

    let forward = 0,
      right = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward++;

    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward--;

    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right++;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right--;

    if (!forward && !right) return false;

    const d = Math.hypot(forward, right);
    forward /= d;
    right /= d;
    const direction = this.view.forwardAt(),
      fx = direction.x,
      fz = direction.z;
    const dx = fx * forward - fz * right;
    const dz = fz * forward + fx * right;
    const sprint = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && p.energy > 8;
    const speed =
      (sprint ? 9.2 : 4.5) *
      (0.82 + p.genes.speed * 0.06) *
      (p.energy < 15 ? 0.75 : 1) *
      GeneticTraits.mobility(p.genes);
    const desired = Math.atan2(-dx, -dz);
    const turn = Math.atan2(
      Math.sin(desired - this.player.rig.root.rotation.y),
      Math.cos(desired - this.player.rig.root.rotation.y),
    );
    this.player.rig.root.rotation.y += clamp(turn, -dt * 8, dt * 8);
    this.player.rig.root.userData.turnLean = clamp(turn, -0.8, 0.8) * -0.14;
    const facingX = -Math.sin(this.player.rig.root.rotation.y),
      facingZ = -Math.cos(this.player.rig.root.rotation.y);
    const swimming = !this.sheltered && !!this.water?.swimming(p.x, p.z);
    const speedScale = swimming ? RABBIT_SWIM_SPEED / speed : this.sheltered ? 0.68 : 1;
    const nx = clamp(
        p.x + facingX * speed * dt * speedScale,
        -this.movementLimit,
        this.movementLimit,
      ),
      nz = clamp(p.z + facingZ * speed * dt * speedScale, -this.movementLimit, this.movementLimit);
    if (
      this.earth.canMoveTo(nx, p.z, p.y, this.sheltered) &&
      this.canOccupy(nx, p.z, p.y, this.player.root.rotation.y)
    )
      p.x = nx;

    if (
      this.earth.canMoveTo(p.x, nz, p.y, this.sheltered) &&
      this.canOccupy(p.x, nz, p.y, this.player.root.rotation.y)
    )
      p.z = nz;

    if (!swimming && elapsed > this.footstepAt) {
      this.footstepAt = elapsed + (sprint ? 0.17 : 0.28);
      this.sound.play('step');
    }

    return true;
  }

  settle(dt: number): void {
    if (AnimalRestraint.active(this.player.root)) return;
    const p = this.player.data;
    const surfaceWater = !this.sheltered && this.water?.swimming(p.x, p.z);
    this.player.root.userData.swimming = !!surfaceWater && !this.jump.active;
    const floor = this.earth.floorAt(p.x, p.z, p.y);
    const target =
      !this.sheltered && this.water
        ? this.water.height(p.x, p.z, RABBIT_SWIM_IMMERSION * p.genes.size, floor)
        : floor;
    if (surfaceWater && p.y < target - 0.5) p.y = target;
    p.y += clamp(target - p.y, -dt * 3.5, dt * 2.4);
  }
}
