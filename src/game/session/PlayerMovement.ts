import type { PlayerRabbit } from '../animals';
import type { Soundscape } from '../Audio';
import type { Excavation } from '../Excavation';
import type { ViewCamera } from '../ViewCamera';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** Управляет направлением, ускорением, шагами и высотой крольчихи относительно рельефа. */
export class PlayerMovement {
  private footstepAt = 0;

  constructor(
    private readonly player: PlayerRabbit,
    private readonly keys: Set<string>,
    private readonly view: ViewCamera,
    private readonly earth: Excavation,
    private readonly sound: Soundscape,
  ) {}

  private get sheltered(): boolean {
    const p = this.player.data;
    return this.earth.isSheltered(p.x, p.y, p.z);
  }

  move(dt: number, elapsed: number, blocked: boolean): boolean {
    const p = this.player.data;
    if (blocked) return false;

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
    const speed = (sprint ? 9.2 : 4.5) * (0.82 + p.genes.speed * 0.06) * (p.energy < 15 ? 0.75 : 1);
    const desired = Math.atan2(-dx, -dz);
    const turn = Math.atan2(
      Math.sin(desired - this.player.rig.root.rotation.y),
      Math.cos(desired - this.player.rig.root.rotation.y),
    );
    this.player.rig.root.rotation.y += clamp(turn, -dt * 8, dt * 8);
    const facingX = -Math.sin(this.player.rig.root.rotation.y),
      facingZ = -Math.cos(this.player.rig.root.rotation.y);
    const speedScale = this.sheltered ? 0.68 : 1;
    const nx = clamp(p.x + facingX * speed * dt * speedScale, -103, 103),
      nz = clamp(p.z + facingZ * speed * dt * speedScale, -103, 103);
    if (this.earth.canMoveTo(nx, p.z, p.y, this.sheltered)) p.x = nx;

    if (this.earth.canMoveTo(p.x, nz, p.y, this.sheltered)) p.z = nz;

    if (elapsed > this.footstepAt) {
      this.footstepAt = elapsed + (sprint ? 0.17 : 0.28);
      this.sound.play('step');
    }

    return true;
  }

  settle(dt: number): void {
    const p = this.player.data,
      target = this.earth.floorAt(p.x, p.z, p.y);
    p.y += clamp(target - p.y, -dt * 3.5, dt * 2.4);
  }
}
