import { Animal } from './Animal';
import { ModelAssets, type ModelInstance } from '../ModelAssets';
import type { WaterBody } from '../WaterMap';
import type { WaterTerrain } from '../WaterNavigation';
import { inWaterPath, PIKE_MIN_DEPTH } from '../AquaticHabitats';
import { Random } from '../Random';

export interface WaterPrey {
  x: number;
  z: number;
}

const STRIKE_RANGE = 6.8;
const AMBUSH_LEASH = 9.5;
const LUNGE_SECONDS = 1.9;
const BITE_REACH = 1.15;
const BITE_COOLDOWN = 3.5;

/** Подкарауливает добычу в одном водоёме, совершает короткий бросок и возвращается в засаду. */
export class Pike extends Animal<'pike'> {
  readonly model: ModelInstance;
  readonly waterBody: string;
  private ambush: WaterPrey;
  private lungeUntil?: number;
  private biteAt = 0;
  private attackUntil = 0;

  constructor(x: number, z: number, habitat: WaterBody, rng: Random) {
    const model = ModelAssets.shared.create('pike');
    super('pike', model.root, { x, z }, 60);
    this.model = model;
    this.waterBody = habitat.id;
    this.ambush = { x, z };
    this.root.rotation.y = rng.range(0, 2 * Math.PI);
  }

  setAmbush(ambush: WaterPrey): void {
    this.ambush = ambush;
  }

  get ambushPoint(): WaterPrey {
    return this.ambush;
  }

  accepts(prey: WaterPrey, terrain: WaterTerrain): boolean {
    return (
      Math.hypot(prey.x - this.x, prey.z - this.z) < STRIKE_RANGE &&
      Math.hypot(prey.x - this.ambush.x, prey.z - this.ambush.z) < AMBUSH_LEASH &&
      this.clear(terrain, this, prey)
    );
  }

  update(dt: number, time: number, terrain: WaterTerrain, prey?: WaterPrey): boolean {
    if (!this.alive) return false;
    const reachable = prey && this.accepts(prey, terrain);
    if (this.lungeUntil !== undefined && (!reachable || time > this.lungeUntil)) {
      this.lungeUntil = undefined;
      this.biteAt = Math.max(this.biteAt, time + 0.8);
    }
    if (reachable && time >= this.biteAt) this.lungeUntil ??= time + LUNGE_SECONDS;

    const target = reachable && this.lungeUntil !== undefined ? prey : undefined;
    const moved = this.moveTowards(target ?? this.ambush, dt, terrain, target ? 3.8 : 1.1);
    const water = terrain.waterAt(this.x, this.z);
    if (water)
      this.root.position.set(
        this.x,
        Math.max(terrain.heightAt(this.x, this.z) + 0.15, water.level - (target ? 0.38 : 0.58)),
        this.z,
      );

    const bite = !!target && Math.hypot(target.x - this.x, target.z - this.z) < BITE_REACH;
    if (bite) {
      this.biteAt = time + BITE_COOLDOWN;
      this.attackUntil = time + 0.45;
      this.lungeUntil = undefined;
    }
    ModelAssets.shared.play(
      this.model,
      time < this.attackUntil ? 'attack' : 'swim',
      dt,
      target ? 1.65 : moved ? 0.8 : 0.18,
    );
    return bite;
  }

  private moveTowards(
    target: WaterPrey,
    dt: number,
    terrain: WaterTerrain,
    speed: number,
  ): boolean {
    const dx = target.x - this.x,
      dz = target.z - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.08 || dt <= 0) return false;
    const amount = Math.min(speed * dt, distance);
    const next = { x: this.x + (dx * amount) / distance, z: this.z + (dz * amount) / distance };
    if (!this.clear(terrain, this, next)) return false;

    this.x = next.x;
    this.z = next.z;
    const desired = Math.atan2(-dx, -dz);
    const turn = Math.atan2(
      Math.sin(desired - this.root.rotation.y),
      Math.cos(desired - this.root.rotation.y),
    );
    this.root.rotation.y += Math.max(-dt * 5, Math.min(dt * 5, turn));
    return true;
  }

  private clear(terrain: WaterTerrain, from: WaterPrey, to: WaterPrey): boolean {
    return inWaterPath((x, z) => terrain.waterAt(x, z), from, to, this.waterBody, PIKE_MIN_DEPTH);
  }
}
