import type { Object3D } from 'three';
import { AnimalFactory } from '../animals/AnimalFactory';
import { AnimalRestraint } from '../animals/AnimalRestraint';
import { LEECH, type Leech, type LeechState } from '../animals/Leech';
import type { SaveData } from '../types';
import type { WaterBody } from '../WaterMap';
import type { WaterTerrain } from '../WaterNavigation';

interface Context {
  save: SaveData;
  player: { root: Object3D };
  world: WaterTerrain & {
    scene?: Object3D;
    terrain?: { water?: { bodies: readonly WaterBody[] } };
  };
  earth: { isSheltered: (x: number, y: number, z: number) => boolean };
  toast: (message: string) => void;
}

/** Создаёт ограниченную водную популяцию и связывает насыщение паразитов с телом игрока и сохранением. */
export class LeechPopulation {
  readonly animals: Leech[] = [];
  private nextSearchAt = 0;
  private nextAttachAt = 0;
  private pendingSeconds = 0;
  private readonly scene?: Object3D;

  constructor(private readonly context: Context) {
    this.scene = context.world.scene;
    if (!this.scene) return;

    const states = context.save.leechPopulation ?? this.spawn();
    context.save.leechPopulation = states;
    for (const state of states) {
      const animal = AnimalFactory.leech(state);
      this.animals.push(animal);
      this.scene.add(animal.root);
      animal.restoreAttachment(context.player.root);
    }
  }

  update(dt: number, time: number, allowAttachment: boolean): void {
    if (!this.scene) return;
    const { save, player, world, earth } = this.context;
    const p = save.player;
    this.pendingSeconds += Math.max(0, dt);
    const search = time >= this.nextSearchAt;
    const stepSeconds = this.pendingSeconds;
    if (search) {
      this.nextSearchAt = time + 0.2;
      this.pendingSeconds = 0;
    }
    const water =
      search &&
      allowAttachment &&
      p.health > 0 &&
      !p.hidden &&
      !earth.isSheltered(p.x, p.y, p.z) &&
      !AnimalRestraint.active(player.root) &&
      player.root.userData.jumping !== true
        ? world.waterAt(p.x, p.z)
        : undefined;
    const exposed = water && water.depth >= LEECH.minDepth && p.y < water.level + 0.5;

    for (const animal of this.animals) {
      if (animal.state.phase.kind === 'attached') {
        if (p.health <= 0) animal.release(this.scene);
        else if (animal.feed(dt, p)) {
          animal.release(this.scene);
          this.context.toast('Пиявка напилась крови и отпала.');
        }
        continue;
      }
      if (!search) continue;

      const nearby = Math.hypot(animal.x - p.x, animal.z - p.z) < LEECH.searchRadius;
      const prey = exposed && nearby && water.body.id === animal.state.waterBody ? p : undefined;
      animal.swim(stepSeconds, world, prey);
      animal.root.visible = Math.hypot(animal.x - p.x, animal.z - p.z) < 40;
      if (
        !prey ||
        animal.state.phase.kind !== 'hungry' ||
        time < this.nextAttachAt ||
        Math.hypot(animal.x - p.x, animal.z - p.z) > LEECH.contactRadius * p.genes.size ||
        !animal.reaches(world, p)
      )
        continue;

      const occupied = new Set(
        this.animals.flatMap((other) =>
          other.state.phase.kind === 'attached' ? [other.state.phase.slot] : [],
        ),
      );
      const slot = [0, 1, 2].find((candidate) => !occupied.has(candidate));
      if (slot === undefined) continue;

      animal.attach(player.root, slot);
      this.nextAttachAt = time + 3;
      this.context.toast('Присосалась пиявка! Она пьёт кровь и отпадёт, когда насытится.');
    }
  }

  releasePlayer(): void {
    if (!this.scene) return;
    for (const animal of this.animals)
      if (animal.state.phase.kind === 'attached') animal.release(this.scene);
  }

  dispose(): void {
    for (const animal of this.animals) animal.dispose();
    this.animals.length = 0;
  }

  private spawn(): LeechState[] {
    const states: LeechState[] = [];
    const bound = this.context.save.worldConfig?.size ?? 110;
    for (const body of this.context.world.terrain?.water?.bodies ?? []) {
      let count = 0;
      // Выбираем точки один раз при создании мира, не ищем подходящие места в кадровом цикле.
      for (const center of body.points) {
        for (let direction = 0; direction < 12; direction++) {
          if (count >= LEECH.perWaterBody || states.length >= LEECH.maxPopulation) break;
          const angle = (direction * Math.PI) / 6 + (this.context.save.seed % 37);
          const x = center.x + Math.sin(angle) * body.radius * 0.65;
          const z = center.z + Math.cos(angle) * body.radius * 0.65;
          if (Math.abs(x) > bound || Math.abs(z) > bound) continue;
          const water = this.context.world.waterAt(x, z);
          if (!water || water.body.id !== body.id || water.depth < LEECH.minDepth) continue;
          states.push({
            id: states.length,
            waterBody: body.id,
            x,
            y: water.level - 0.18,
            z,
            phase: { kind: 'hungry' },
          });
          count++;
        }
        if (count >= LEECH.perWaterBody || states.length >= LEECH.maxPopulation) break;
      }
      if (states.length >= LEECH.maxPopulation) break;
    }
    return states;
  }
}
