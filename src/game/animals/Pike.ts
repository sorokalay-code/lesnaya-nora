import { Animal } from './Animal';
import { ModelAssets, type ModelInstance } from '../ModelAssets';
import type { WaterBody } from '../WaterMap';
import { SWIM_DEPTH, type WaterTerrain } from '../WaterNavigation';
import { Random } from '../Random';

export interface WaterPrey {
  x: number;
  z: number;
}

/** Щука патрулирует русло или озеро и преследует добычу в воде. */
export class Pike extends Animal<'pike'> {
  readonly model: ModelInstance;
  private target?: WaterPrey;
  private nextTurn = 0;
  private biteAt = 0;
  private attackUntil = 0;

  constructor(
    x: number,
    z: number,
    private readonly habitat: WaterBody,
    private readonly rng: Random,
  ) {
    const model = ModelAssets.shared.create('pike');
    super('pike', model.root, { x, z }, 60);
    this.model = model;
  }

  update(dt: number, time: number, terrain: WaterTerrain, prey?: WaterPrey): boolean {
    if (!this.alive) return false;
    if (prey && (terrain.waterAt(prey.x, prey.z)?.depth ?? 0) <= SWIM_DEPTH) prey = undefined;
    if (prey) this.target = prey;
    else if (
      time >= this.nextTurn ||
      !this.target ||
      Math.hypot(this.target.x - this.x, this.target.z - this.z) < 0.5
    ) {
      this.nextTurn = time + this.rng.range(3, 6);
      const point = this.patrolPoint();
      this.target = { x: point.x + this.rng.range(-1, 1), z: point.z + this.rng.range(-1, 1) };
    }
    const target = this.target!;
    const dx = target.x - this.x,
      dz = target.z - this.z,
      distance = Math.hypot(dx, dz);
    const speed = prey ? 3.8 : 1.1;
    const amount = Math.min(speed * dt, distance);
    if (distance > 0.01) {
      const nx = this.x + (dx / distance) * amount,
        nz = this.z + (dz / distance) * amount;
      const checks = Math.max(1, Math.ceil(amount / 0.15));
      let clear = true;
      for (let i = 1; i <= checks; i++) {
        const water = terrain.waterAt(
          this.x + ((nx - this.x) * i) / checks,
          this.z + ((nz - this.z) * i) / checks,
        );
        if (!water || water.depth < 0.65) {
          clear = false;
          break;
        }
      }
      if (clear) {
        this.x = nx;
        this.z = nz;
      } else {
        this.nextTurn = 0;
        this.target = undefined;
      }
      const desired = Math.atan2(-dx, -dz);
      const turn = Math.atan2(
        Math.sin(desired - this.root.rotation.y),
        Math.cos(desired - this.root.rotation.y),
      );
      this.root.rotation.y += Math.max(-dt * 5, Math.min(dt * 5, turn));
    }
    const water = terrain.waterAt(this.x, this.z);
    if (water)
      this.root.position.set(
        this.x,
        Math.max(terrain.heightAt(this.x, this.z) + 0.22, water.level - 0.5),
        this.z,
      );
    const bite =
      !!prey && Math.hypot(prey.x - this.x, prey.z - this.z) < 1.15 && time >= this.biteAt;
    if (bite) {
      this.biteAt = time + 3.5;
      this.attackUntil = time + 0.45;
    }
    ModelAssets.shared.play(
      this.model,
      time < this.attackUntil ? 'attack' : 'swim',
      dt,
      prey ? 1.65 : 0.8,
    );
    return bite;
  }

  private patrolPoint(): WaterPrey {
    const points = this.habitat.points;
    if (this.habitat.kind !== 'river' || this.habitat.bankWidth === undefined || points.length < 2)
      return this.rng.pick(points);

    // На изгибе движение к случайной дальней точке часто упирается в берег.
    let nearest = 0;
    for (let i = 1; i < points.length; i++)
      if (
        Math.hypot(points[i].x - this.x, points[i].z - this.z) <
        Math.hypot(points[nearest].x - this.x, points[nearest].z - this.z)
      )
        nearest = i;
    const neighbors = points.slice(Math.max(0, nearest - 1), nearest + 2);
    return this.rng.pick(neighbors);
  }
}
