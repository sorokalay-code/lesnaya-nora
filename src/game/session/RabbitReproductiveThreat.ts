import { Random } from '../Random';
import type { DigNode, SaveData } from '../types';
import type { RabbitActor } from '../animals/RabbitActor';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { GeneticTraits } from '../genetics/GeneticTraits';
import { animateRabbit } from '../Models';
import { SWIM_DEPTH } from '../WaterNavigation';

const CHASE = {
  checkSeconds: 4,
  warningSeconds: 0.8,
  durationSeconds: 8,
  recoverySeconds: 18,
  detectionRange: 8,
  escapeRange: 13,
  contactRange: 1.25,
  ordinaryChance: 0.06,
  mutantChance: 0.2,
  fangedChance: 0.4,
} as const;

interface ChaseTerrain {
  sheltered: (point: DigNode) => boolean;
  floorAt: (x: number, z: number, y: number) => number;
  waterDepthAt: (x: number, z: number) => number;
}

export interface RabbitChaseView {
  name: string;
  phase: 'warning' | 'chase';
}

interface Pursuit {
  actor: RabbitActor;
  startsAt: number;
  endsAt: number;
}

/** Ведёт одну погоню за крольчихой и сообщает, какой крол её догнал. */
export class RabbitReproductiveThreat {
  private readonly rng: Random;
  private nextCheck = 0;
  private pursuit?: Pursuit;
  private time = 0;

  constructor(
    private readonly save: SaveData,
    private readonly terrain: ChaseTerrain,
  ) {
    this.rng = new Random(save.seed + 63491);
  }

  get actor(): RabbitActor | undefined {
    return this.pursuit?.actor;
  }

  get view(): RabbitChaseView | undefined {
    if (!this.pursuit) return;
    return {
      name: this.pursuit.actor.data.name,
      phase: this.time < this.pursuit.startsAt ? 'warning' : 'chase',
    };
  }

  update(
    dt: number,
    time: number,
    actors: readonly RabbitActor[],
    allowed: boolean,
  ): RabbitActor | undefined {
    this.time = time;
    const player = this.save.player;
    if (
      !allowed ||
      this.save.pregnancy ||
      player.health <= 0 ||
      player.hidden ||
      this.terrain.sheltered(player) ||
      this.inDeepWater(player.x, player.z)
    ) {
      if (this.pursuit) this.finish(time);
      return;
    }

    if (!this.pursuit) {
      if (time < this.nextCheck) return;
      this.nextCheck = time + CHASE.checkSeconds;
      this.start(time, actors);
    }

    const pursuit = this.pursuit;
    if (!pursuit) return;
    const { actor, startsAt, endsAt } = pursuit;
    const distance = Math.hypot(actor.x - player.x, actor.z - player.z);
    if (time >= endsAt || distance > CHASE.escapeRange || !this.canPursue(actor)) {
      this.finish(time);
      return;
    }

    const dx = player.x - actor.x;
    const dz = player.z - actor.z;
    if (distance > 0.01) actor.root.rotation.y = Math.atan2(-dx, -dz);
    if (time < startsAt) {
      animateRabbit(actor.rig, time + actor.data.id, false, false, dt);
      return;
    }

    const baseY = actor.data.y ?? actor.root.position.y;
    const speed = (3.3 + actor.data.genes.speed * 0.3) * GeneticTraits.mobility(actor.data.genes);
    const step = Math.min(Math.max(0, distance - CHASE.contactRange * 0.8), speed * dt);
    const x = actor.x + (dx / (distance || 1)) * step;
    const z = actor.z + (dz / (distance || 1)) * step;
    const y = this.terrain.floorAt(x, z, baseY);
    const canStep =
      step > 0 &&
      Math.abs(y - baseY) <= 0.5 &&
      !this.terrain.sheltered({ x, y, z }) &&
      !this.inDeepWater(x, z);
    if (canStep) actor.moveTo(x, z, y);
    animateRabbit(actor.rig, time + actor.data.id, canStep, true, dt);

    if (
      Math.hypot(actor.x - player.x, (actor.data.y ?? baseY) - player.y, actor.z - player.z) >
      CHASE.contactRange
    )
      return;

    this.finish(time);
    return actor;
  }

  private start(time: number, actors: readonly RabbitActor[]): void {
    const player = this.save.player;
    for (const actor of actors) {
      const { anatomy } = actor.data.genes;
      if (
        Math.hypot(actor.x - player.x, actor.z - player.z) > CHASE.detectionRange ||
        Math.abs(actor.root.position.y - player.y) > 1.5 ||
        !this.canPursue(actor)
      )
        continue;
      const mutated = anatomy.legs !== 4 || anatomy.ears !== 2 || anatomy.eyes !== 2;
      const chance = anatomy.fangs
        ? CHASE.fangedChance
        : mutated
          ? CHASE.mutantChance
          : CHASE.ordinaryChance;
      if (!this.rng.chance(chance)) continue;

      const startsAt = time + CHASE.warningSeconds;
      this.pursuit = { actor, startsAt, endsAt: startsAt + CHASE.durationSeconds };
      return;
    }
  }

  private canPursue(actor: RabbitActor): boolean {
    const player = this.save.player;
    const y = actor.data.y ?? actor.root.position.y;
    const inReach =
      Math.hypot(actor.x - player.x, y - player.y, actor.z - player.z) <= CHASE.contactRange;
    return (
      actor.alive &&
      !actor.root.userData.conversing &&
      !AnimalRestraint.active(actor.root) &&
      (inReach || GeneticTraits.mobility(actor.data.genes) > 0) &&
      !this.terrain.sheltered({
        x: actor.x,
        y,
        z: actor.z,
      }) &&
      !this.inDeepWater(actor.x, actor.z)
    );
  }

  private inDeepWater(x: number, z: number): boolean {
    return this.terrain.waterDepthAt(x, z) > SWIM_DEPTH;
  }

  private finish(time: number): void {
    this.pursuit = undefined;
    this.nextCheck = time + CHASE.recoverySeconds;
  }
}
