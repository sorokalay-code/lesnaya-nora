import { Vector3, type Object3D } from 'three';
import { Hunter, HUNTER } from '../Hunter';
import type { GardenPlot } from '../GardenPlot';
import type { DigNode } from '../types';
import type { World } from '../World';
import type { Excavation } from '../Excavation';
import { HawkVictims, type HawkPopulation, type HawkVictim } from './HawkVictims';
import { AnimalRestraint } from '../animals/AnimalRestraint';

interface Context extends HawkPopulation {
  world: World;
  earth: Pick<Excavation, 'isSheltered'>;
  shotSound?: (at: DigNode) => void;
  toast: (text: string) => void;
}

interface GardenObstacle {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** Реагирует на поедание огородного урожая, назначает нарушителя и проверяет попадание выстрела. */
export class GardenHunters {
  readonly hunters: Hunter[] = [];
  private readonly sources: HawkVictims;
  private readonly targets = new Map<string, HawkVictim>();
  private readonly unobserve: () => void;
  private nextRefresh = 0;
  private readonly targetPosition = new Vector3();
  private readonly obstacles = new Map<GardenPlot, GardenObstacle[]>();
  private obstacleCount = -1;

  constructor(private readonly context: Context) {
    this.sources = new HawkVictims(context);
    const states = (context.save.hunters ??= []);
    for (const garden of context.world.gardens) {
      let data = states.find((state) => state.garden === garden.id);
      if (!data) {
        data = {
          garden: garden.id,
          x: garden.door.x,
          z: garden.door.z,
          phase: 'home',
          alarmUntil: 0,
          readyAt: 0,
        };
        states.push(data);
      }
      const hunter = new Hunter(garden, data, (x, z) => this.navigationHeight(x, z, garden));
      hunter.addTo(context.world.scene);
      this.hunters.push(hunter);
    }
    this.refresh();
    this.unobserve = context.world.observeHarvest((crop, consumer) => {
      if ((crop.kind !== 'carrot' && crop.kind !== 'cabbage') || !consumer) return;
      const root = consumer === 'player' ? context.player.root : consumer;
      this.refresh();
      const id = this.identity(root);
      if (!id || !this.targets.has(id)) return;
      const hunter = this.hunters.find(
        ({ garden }) =>
          Math.abs(crop.x - garden.x) <= garden.radius &&
          Math.abs(crop.z - garden.z) <= garden.radius,
      );
      if (!hunter) return;
      hunter.alarm(id, context.save.clock);
      if (root === context.player.root)
        context.toast('Хозяин огорода заметил кражу овощей и выходит с ружьём!');
    });
  }

  update(dt: number, time: number, combat: boolean): void {
    this.refreshObstacles();
    if (time >= this.nextRefresh) {
      this.nextRefresh = time + 0.75;
      this.refresh();
    }
    const { save } = this.context;
    for (const hunter of this.hunters) {
      const victim = hunter.state.target ? this.targets.get(hunter.state.target) : undefined;
      let target: DigNode | undefined;
      if (victim && this.available(victim)) {
        victim.root.getWorldPosition(this.targetPosition);
        target = {
          x: this.targetPosition.x,
          y: this.targetPosition.y + victim.bodyHeight * 0.55,
          z: this.targetPosition.z,
        };
      }
      hunter.update(
        dt,
        time,
        save.clock,
        target,
        combat,
        (from, to) => this.lineClear(from, to, hunter.garden),
        (from) => {
          if (!victim || !this.available(victim)) return;
          const animal = this.context.wildlife.find((actor) => actor.root === victim.root);
          if (animal) animal.receiveAttack(HUNTER.damage, time, from);
          else victim.hurt(HUNTER.damage);
          this.context.shotSound?.(from);
          if (victim.related)
            this.context.toast(
              victim.player
                ? 'Охотник выстрелил! Уходи от огорода и ищи укрытие.'
                : `Охотник попал в члена семьи: ${victim.name}.`,
            );
        },
      );
      const visible =
        hunter.state.phase !== 'home' &&
        Math.hypot(hunter.state.x - save.player.x, hunter.state.z - save.player.z) < 90;
      hunter.root.visible = visible;
    }
  }

  dispose(): void {
    this.unobserve();
    for (const hunter of this.hunters) hunter.dispose();
  }

  private refresh(): void {
    this.refreshObstacles();
    this.targets.clear();
    for (const victim of this.sources.all(true)) {
      const id = this.identity(victim.root);
      if (id) this.targets.set(id, victim);
    }
  }

  private refreshObstacles(): void {
    const { world } = this.context;
    const trees = world.treeLocations ?? [];
    const count = world.shelterObstacles.length + trees.length;
    if (count === this.obstacleCount) return;
    this.obstacleCount = count;
    for (const plot of world.gardens) {
      const nearby = world.shelterObstacles
        .filter(
          (obstacle) =>
            Math.hypot(obstacle.x - plot.x, obstacle.z - plot.z) < plot.radius + HUNTER.leash + 10,
        )
        .map((obstacle) => ({ ...obstacle, height: Math.max(1.8, obstacle.radius * 2) }));
      for (const tree of trees)
        if (Math.hypot(tree.x - plot.x, tree.z - plot.z) < plot.radius + HUNTER.leash + 10)
          nearby.push({ x: tree.x, z: tree.z, radius: 0.35, height: 6 });
      this.obstacles.set(plot, nearby);
    }
  }

  private identity(root: Object3D): string | undefined {
    if (root === this.context.player.root) return 'player';
    const identity: unknown = root.userData.remainsIdentity;
    if (typeof identity === 'string') return identity;
    for (const actor of [...this.context.rabbits, ...this.context.families])
      if (actor.root === root) return `rabbit:${actor.data.id}`;
    for (const [id, rig] of this.context.family?.rigs ?? [])
      if (rig.root === root) return `kit:${id}`;
  }

  private available(victim: HawkVictim): boolean {
    const point = victim.root.position;
    return (
      victim.alive() &&
      !AnimalRestraint.active(victim.root) &&
      !this.context.earth.isSheltered(point.x, point.y, point.z) &&
      (!victim.player || !this.context.save.player.hidden)
    );
  }

  private navigationHeight(x: number, z: number, plot: GardenPlot): number | undefined {
    const { world } = this.context;
    if (
      Math.hypot(x - plot.x, z - plot.z) > plot.radius + HUNTER.leash + 6 ||
      (world.waterAt(x, z)?.depth ?? 0) > 0.05
    )
      return;
    const house = plot.house;
    if (
      house &&
      Math.abs(x - house.x) < house.halfWidth + 0.2 &&
      Math.abs(z - house.z) < house.halfDepth + 0.2
    )
      return;
    for (const obstacle of this.obstacles.get(plot) ?? []) {
      if (Math.hypot(obstacle.x - plot.door.x, obstacle.z - plot.door.z) < 2.2) continue;
      if (Math.hypot(obstacle.x - x, obstacle.z - z) < obstacle.radius + 0.24) return;
    }
    return world.heightAt(x, z);
  }

  private lineClear(from: DigNode, to: DigNode, plot: GardenPlot): boolean {
    const { world } = this.context;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const square = dx * dx + dz * dz;
    const distance = Math.sqrt(square);
    for (let step = 0.6; step < distance - 0.3; step += 0.6) {
      const fraction = step / distance;
      if (
        world.heightAt(from.x + dx * fraction, from.z + dz * fraction) >
        from.y + (to.y - from.y) * fraction - 0.08
      )
        return false;
    }
    for (const obstacle of this.obstacles.get(plot) ?? []) {
      const t = ((obstacle.x - from.x) * dx + (obstacle.z - from.z) * dz) / (square || 1);
      if (t <= 0.02 || t >= 0.98) continue;
      const y = from.y + (to.y - from.y) * t;
      if (
        Math.hypot(obstacle.x - from.x - dx * t, obstacle.z - from.z - dz * t) <
          obstacle.radius + 0.04 &&
        y < world.heightAt(obstacle.x, obstacle.z) + obstacle.height
      )
        return false;
    }
    return true;
  }
}
