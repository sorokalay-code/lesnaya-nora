import {
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Scene,
} from 'three';
import type { HabitatPoint } from './AnimalHabitats';
import type { RaptorKind } from './animals/FlyingRaptor';
import { Random } from './Random';
import type { DigNode } from './types';
import type { World } from './World';
import { playableWorldLimit } from './WorldConfig';
import { wildlifeShelterGeometry } from './WildlifeShelterModel';

export interface RaptorNest {
  bowl: DigNode;
  perch: DigNode;
  care: DigNode;
  grounds: HabitatPoint;
}

type NestWorld = Pick<World, 'heightAt' | 'biomeAt'> &
  Partial<Pick<World, 'treeLocations' | 'shelterObstacles' | 'waterAt' | 'chunks'>>;

/** Выбирает сухие места гнёзд и строит присады сов и скальные полки соколов. */
export class RaptorNests {
  private readonly sites = new Map<string, RaptorNest>();
  private readonly models: Group[] = [];
  private readonly occupied: HabitatPoint[] = [];
  private readonly stone = new DodecahedronGeometry(1, 0);
  private readonly branch = new CylinderGeometry(0.065, 0.115, 1, 6);
  private readonly rockMaterial = new MeshStandardMaterial({ color: 0x7d827c, roughness: 0.98 });
  private readonly woodMaterial = new MeshStandardMaterial({ color: 0x695039, roughness: 1 });
  private readonly nestMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private readonly twigs = wildlifeShelterGeometry({
    shape: 'duck-nest',
    radius: 0.85,
    height: 0.17,
    earth: 0x654b34,
    edge: 0xa17b50,
  });
  private readonly limit: number;

  constructor(
    private readonly world: NestWorld,
    private readonly scene: Scene,
    size: number,
  ) {
    this.limit = playableWorldLimit(size) - 3;
  }

  get(kind: RaptorKind, slot: number): RaptorNest | undefined {
    return this.sites.get(`${kind}:${slot}`);
  }

  place(kind: RaptorKind, slot: number, anchor: HabitatPoint, rng: Random): void {
    const tree = kind === 'owl' ? this.closestTree(anchor) : undefined;
    const point = tree ?? this.findClearing(anchor, rng);
    if (!point) return;

    const ground = this.world.heightAt(point.x, point.z);
    const height = kind === 'hawk' ? 2.35 : (tree?.nestHeight ?? 2.7);
    const direction = Math.atan2(anchor.x - point.x, anchor.z - point.z);
    const shift = tree ? 0.78 : 0;
    const x = point.x + Math.sin(direction) * shift;
    const z = point.z + Math.cos(direction) * shift;
    const bowl = { x, y: ground + height + 0.15, z };
    const heightOnLedge = ground + height;
    const stand = (offset: number): DigNode => ({
      x: x + Math.cos(direction) * offset,
      y: heightOnLedge,
      z: z - Math.sin(direction) * offset,
    });
    const perch = stand(1.05);
    const care = stand(-0.72);
    const grounds = this.findGrounds(kind, bowl, rng);
    this.sites.set(`${kind}:${slot}`, { bowl, perch, care, grounds });
    this.occupied.push(point);

    const model = new Group();
    model.name = `bird-nest-${kind}-${slot}`;
    model.position.set(x, ground + height, z);
    model.rotation.y = direction;
    if (kind === 'hawk') {
      const base = new Mesh(this.stone, this.rockMaterial);
      base.position.set(0.05, -1.24, 0.2);
      base.rotation.y = 0.24;
      base.scale.set(1.35, 1.55, 1.16);
      const shelf = new Mesh(this.stone, this.rockMaterial);
      shelf.position.set(0.32, -0.24, -0.06);
      shelf.rotation.y = -0.46;
      shelf.scale.set(1.83, 0.39, 0.94);
      const support = new Mesh(this.stone, this.rockMaterial);
      support.position.set(-0.72, -1.65, -0.19);
      support.rotation.y = -0.33;
      support.scale.set(0.79, 0.95, 0.78);
      model.add(base, shelf, support);
    } else {
      const limb = new Mesh(this.branch, this.woodMaterial);
      limb.scale.y = 2.75;
      limb.rotation.z = Math.PI / 2 - 0.045;
      limb.position.set(0.22, -0.085, 0);
      model.add(limb);
      if (!tree) {
        const trunk = new Mesh(this.branch, this.woodMaterial);
        trunk.position.set(-0.24, -height / 2 + 0.14, 0.09);
        trunk.rotation.z = -0.13;
        trunk.scale.set(2.4, height + 0.38, 2.4);
        const fork = new Mesh(this.branch, this.woodMaterial);
        fork.position.set(-0.58, -0.71, -0.14);
        fork.rotation.set(-0.64, 0.2, 0.7);
        fork.scale.set(0.87, 1.48, 0.86);
        const twig = new Mesh(this.branch, this.woodMaterial);
        twig.position.set(0.81, 0.02, 0.18);
        twig.rotation.set(0.75, -0.15, -0.45);
        twig.scale.set(0.55, 0.62, 0.55);
        model.add(trunk, fork, twig);
      }
    }
    const nest = new Mesh(this.twigs, this.nestMaterial);
    nest.scale.set(1, 1, 0.81);
    model.add(nest);
    model.traverse((part) => {
      if (part instanceof Mesh) part.receiveShadow = true;
    });
    if (this.world.chunks) this.world.chunks.add(model, x, z);
    else this.scene.add(model);
    this.models.push(model);
  }

  dispose(): void {
    for (const model of this.models) model.removeFromParent();
    for (const resource of [
      this.stone,
      this.branch,
      this.twigs,
      this.rockMaterial,
      this.woodMaterial,
      this.nestMaterial,
    ])
      resource.dispose();
  }

  private closestTree(
    anchor: HabitatPoint,
  ): NonNullable<NestWorld['treeLocations']>[number] | undefined {
    let best = 25;
    let selected: NonNullable<NestWorld['treeLocations']>[number] | undefined;
    for (const tree of this.world.treeLocations ?? []) {
      const distance = Math.hypot(tree.x - anchor.x, tree.z - anchor.z);
      if (distance < best && this.dry(tree) && this.free(tree)) {
        best = distance;
        selected = tree;
      }
    }
    return selected;
  }

  private findClearing(anchor: HabitatPoint, rng: Random): HabitatPoint | undefined {
    let fallback: HabitatPoint | undefined;
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const distance = attempt ? rng.range(2, 28) : 0;
      const point = {
        x: anchor.x + Math.cos(angle) * distance,
        z: anchor.z + Math.sin(angle) * distance,
      };
      if (!this.dry(point) || !this.free(point)) continue;
      if (
        this.world.shelterObstacles?.some(
          (o) => Math.hypot(o.x - point.x, o.z - point.z) < o.radius + 1.6,
        )
      )
        continue;
      if (this.world.treeLocations?.some((t) => Math.hypot(t.x - point.x, t.z - point.z) < 1.75))
        continue;
      if (
        [
          [1.25, 0],
          [-1.25, 0],
          [0, 1.25],
          [0, -1.25],
        ].some(([dx, dz]) => !this.dry({ x: point.x + dx, z: point.z + dz }))
      )
        continue;
      if (this.world.biomeAt(point.x, point.z) === 'meadow') return point;
      fallback ??= point;
    }
    return fallback;
  }

  private findGrounds(kind: RaptorKind, nest: HabitatPoint, rng: Random): HabitatPoint {
    let fallback = nest;
    for (let attempt = 0; attempt < 26; attempt++) {
      const angle = rng.range(0, Math.PI * 2);
      const distance = rng.range(16, 31);
      const point = {
        x: nest.x + Math.cos(angle) * distance,
        z: nest.z + Math.sin(angle) * distance,
      };
      if (!this.dry(point)) continue;
      fallback = point;
      const biome = this.world.biomeAt(point.x, point.z);
      if (kind === 'hawk' && biome === 'meadow') return point;
      if (
        kind === 'owl' &&
        biome === 'forest' &&
        this.world.biomeAt((point.x + nest.x) / 2, (point.z + nest.z) / 2) !== 'forest'
      )
        return point;
    }
    return fallback;
  }

  private dry(point: HabitatPoint): boolean {
    const { x, z } = point;
    return (
      Math.abs(x) <= this.limit &&
      Math.abs(z) <= this.limit &&
      this.world.biomeAt(x, z) !== 'garden' &&
      (this.world.waterAt?.(x, z)?.depth ?? 0) < 0.035
    );
  }

  private free(point: HabitatPoint): boolean {
    return this.occupied.every((other) => Math.hypot(other.x - point.x, other.z - point.z) > 5);
  }
}
