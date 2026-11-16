import type { Object3D } from 'three';
import { traceGround } from './GroundContact';
import type { HabitatPoint } from './AnimalHabitats';
import type { SaveData } from './types';
import type { World } from './World';
import { playableWorldLimit } from './WorldConfig';
import { denFloor, DEN_APPROACH, DEN_DEPTH, DEN_HALF_WIDTH, DEN_HEIGHT, WolfDen } from './WolfDen';
import { wolfDenModel } from './WolfDenModel';

type DenTerrain = Pick<World, 'heightAt' | 'biomeAt'> &
  Partial<Pick<World, 'waterAt' | 'treeLocations' | 'shelterObstacles'>>;

const SITE_OFFSETS = [0, 3, 6, 9, 13, 18, 23];
const ANGLES = 12;

/** Размещает логовища, показывает их в чанках и проверяет доступ игрока и камеры. */
export class WolfDens {
  private readonly homes = new Map<number, WolfDen>();
  private template?: ReturnType<typeof wolfDenModel>;
  private readonly limit: number;

  constructor(
    private readonly world: DenTerrain,
    private readonly save: SaveData,
    private readonly addModel: (model: Object3D, den: WolfDen) => void,
  ) {
    this.limit = playableWorldLimit(save.worldConfig?.size);
  }

  place(id: number, home: HabitatPoint, seed: number): WolfDen | undefined {
    const stored = this.save.wolfDens?.[id];
    const den = stored ? new WolfDen(id, stored, this.heightAt) : this.findSite(id, home, seed);
    if (!den) return;

    (this.save.wolfDens ??= {})[id] = den.site;
    this.homes.set(id, den);
    this.template ??= wolfDenModel();
    const model = this.template.clone();
    const { x, y, z } = den.entrance;
    model.name = `wolf-den-${id}`;
    model.position.set(x, y, z);
    model.rotation.y = den.site.angle;
    this.addModel(model, den);
    return den;
  }

  canMove(from: HabitatPoint, x: number, z: number, y: number, margin: number): boolean {
    for (const den of this.homes.values()) {
      if (y < den.entrance.y - 0.65 || y > den.entrance.y + DEN_HEIGHT) continue;

      const depth = den.penetration(x, z, margin);
      // Старое сохранение может поставить игрока прямо на месте новой модели.
      if (depth > 0 && depth >= den.penetration(from.x, from.z, margin)) return false;
    }
    return true;
  }

  heightForCamera(x: number, z: number): number {
    let height = this.heightAt(x, z);
    for (const den of this.homes.values())
      if (den.penetration(x, z) >= 0) height = Math.max(height, den.entrance.y + DEN_HEIGHT);
    return height;
  }

  private readonly heightAt = (x: number, z: number) => this.world.heightAt(x, z);

  private findSite(id: number, home: HabitatPoint, seed: number): WolfDen | undefined {
    const obstacles = (this.world.shelterObstacles ?? []).filter(
      (point) => Math.hypot(point.x - home.x, point.z - home.z) < 32,
    );
    const trees = (this.world.treeLocations ?? []).filter(
      (tree) => Math.hypot(tree.x - home.x, tree.z - home.z) < 32,
    );
    const excavated = this.save.excavation.filter(
      (point) => Math.hypot(point.x - home.x, point.z - home.z) < 32,
    );
    const turn = ((seed % 360) * Math.PI) / 180;
    for (const offset of SITE_OFFSETS) {
      for (let i = 0; i < (offset === 0 ? 1 : ANGLES); i++) {
        const direction = turn + (i * 2 * Math.PI) / ANGLES;
        const x = home.x + Math.sin(direction) * offset;
        const z = home.z + Math.cos(direction) * offset;
        if (this.world.biomeAt(x, z) === 'garden') continue;
        for (let facing = 0; facing < ANGLES; facing++) {
          const angle = (turn + (facing * 2 * Math.PI) / ANGLES) % (2 * Math.PI);
          const den = new WolfDen(id, { x, z, angle }, this.heightAt);
          if (!this.fitsTerrain(den)) continue;
          if (
            trees.some((point) => this.overlapsApproach(den, point, 1.15)) ||
            obstacles.some((point) => this.overlapsApproach(den, point, point.radius)) ||
            excavated.some((point) => den.penetration(point.x, point.z, 1.3) > 0) ||
            [...this.homes.values()].some(
              (other) => Math.hypot(x - other.entrance.x, z - other.entrance.z) < 9,
            )
          )
            continue;

          return den;
        }
      }
    }
  }

  private fitsTerrain(den: WolfDen): boolean {
    for (const side of [-DEN_HALF_WIDTH, -1, 0, 1, DEN_HALF_WIDTH]) {
      for (const depth of [-2.75, -DEN_APPROACH, -1, 0, 1, 2, 3, DEN_DEPTH]) {
        const { x, y, z } = den.point(side, depth);
        if (
          Math.max(Math.abs(x), Math.abs(z)) > this.limit - 0.8 ||
          (this.world.waterAt?.(x, z)?.depth ?? 0) > 0.035 ||
          Math.abs(y - den.entrance.y) > (depth < 0 ? 1.1 : 0.52) ||
          (depth > 0 &&
            depth <= 3 &&
            Math.abs(side) <= 1 &&
            y > den.entrance.y + denFloor(depth) - 0.03)
        )
          return false;
      }
    }

    const heightAt = (x: number, z: number) =>
      (this.world.waterAt?.(x, z)?.depth ?? 0) > 0.035 ? undefined : this.heightAt(x, z);
    const outside = den.point(0, -DEN_APPROACH - 2);
    const final = traceGround(outside, den.entrance.x, den.entrance.z, { heightAt });
    return Math.hypot(final.x - den.entrance.x, final.z - den.entrance.z) < 0.01;
  }

  private overlapsApproach(den: WolfDen, point: HabitatPoint, radius: number): boolean {
    return (
      den.penetration(point.x, point.z, radius) > 0 ||
      Math.hypot(point.x - den.approach.x, point.z - den.approach.z) < radius + 1.35
    );
  }
}
