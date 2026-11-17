import { Mesh, MeshStandardMaterial, DoubleSide, type BufferGeometry, type Scene } from 'three';
import type { Habitat, HabitatPoint } from './AnimalHabitats';
import { traceGround } from './GroundContact';
import { Random } from './Random';
import type { DigNode, SaveData } from './types';
import type { WolfDens } from './WolfDens';
import type { World } from './World';
import { playableWorldLimit } from './WorldConfig';
import { wildlifeShelterGeometry } from './WildlifeShelterModel';
import {
  isShelteredWildlife,
  wildlifeShelterProfile,
  type ShelteredWildlife,
} from './WildlifeShelterProfiles';

export interface WildlifeShelterSite extends HabitatPoint {
  kind: ShelteredWildlife;
  slot: number;
  angle: number;
  treeHeight?: number;
}

export interface WildlifeShelter {
  readonly site: WildlifeShelterSite;
  readonly entrance: DigNode;
  readonly approach: DigNode;
}

type ShelterWorld = Pick<World, 'heightAt' | 'biomeAt'> &
  Partial<
    Pick<World, 'waterAt' | 'treeLocations' | 'shelterObstacles' | 'chunks' | 'clearGroundCover'>
  >;

const CELL_SIZE = 8;
const WATER_DEPTH_LIMIT = 0.035;
const APPROACH_CLEARANCE = 1.6;
const MAX_SITE_ATTEMPTS = 44;

/** Размещает укрытия у участков животных и сохраняет их независимо от заселения. */
export class WildlifeShelters {
  private readonly homes = new Map<string, WildlifeShelter>();
  private readonly unavailable = new Set<string>();
  private readonly obstacles = new Map<string, (HabitatPoint & { radius: number })[]>();
  private readonly trees = new Map<string, NonNullable<World['treeLocations']>[number][]>();
  private readonly geometry = new Map<ShelteredWildlife, BufferGeometry>();
  private readonly occupiedTrees = new Set<string>();
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    side: DoubleSide,
    roughness: 1,
  });
  private readonly limit: number;

  constructor(
    private readonly world: ShelterWorld,
    private readonly scene: Scene,
    private readonly save?: SaveData,
    private readonly wolfDens?: WolfDens,
  ) {
    const size = save?.worldConfig?.size ?? 110;
    this.limit = Math.min(playableWorldLimit(size), (size * 97) / 110) - 0.25;
    for (const tree of world.treeLocations ?? []) {
      this.add(this.trees, tree);
      this.add(this.obstacles, { ...tree, radius: 0.68 });
    }
    for (const obstacle of world.shelterObstacles ?? []) this.add(this.obstacles, obstacle);
    for (const site of save?.wildlifeShelters ?? []) this.mount(site);
  }

  place(kind: ShelteredWildlife, slot: number, habitat: Habitat): WildlifeShelter | undefined {
    const id = `${kind}:${slot}`;
    const existing = this.homes.get(id);
    if (existing) return existing;
    if (this.unavailable.has(id)) return;

    const site = this.findSite(kind, slot, habitat);
    if (!site) {
      this.unavailable.add(id);
      return;
    }
    if (this.save) (this.save.wildlifeShelters ??= []).push(site);
    return this.mount(site);
  }

  routeHeight = (x: number, z: number): number | undefined => {
    if (
      Math.max(Math.abs(x), Math.abs(z)) >= this.limit ||
      (this.world.waterAt?.(x, z)?.depth ?? 0) > WATER_DEPTH_LIMIT
    )
      return;
    const y = this.world.heightAt(x, z);
    if (this.wolfDens?.canMove({ x, z }, x, z, y, 0.2) === false) return;
    return y;
  };

  private findSite(
    kind: ShelteredWildlife,
    slot: number,
    home: Habitat,
  ): WildlifeShelterSite | undefined {
    const profile = wildlifeShelterProfile(kind);
    const rng = new Random(home.key ^ 184616);
    if (profile.shape === 'tree-nest') {
      const trees = this.near(this.trees, home, home.radius)
        .filter((tree) => Math.hypot(tree.x - home.x, tree.z - home.z) <= home.radius)
        .sort(
          (a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z),
        );
      for (const tree of trees) {
        const { x, z, nestHeight } = tree;
        if (this.occupiedTrees.has(`${x}:${z}`)) continue;
        const angle = rng.range(0, Math.PI * 2);
        const site = { kind, slot, x, z, angle, treeHeight: nestHeight ?? 2.4 };
        if (this.fits(site, profile.radius, tree)) return site;
      }
      return;
    }

    let fallback: WildlifeShelterSite | undefined;
    for (let attempt = 0; attempt < MAX_SITE_ATTEMPTS; attempt++) {
      const direction = rng.range(0, Math.PI * 2);
      const distance = attempt === 0 ? 0 : rng.range(1, home.radius * 0.8);
      const x = home.x + Math.sin(direction) * distance;
      const z = home.z + Math.cos(direction) * distance;
      const site = { kind, slot, x, z, angle: rng.range(0, Math.PI * 2) };
      if (!this.fits(site, profile.radius)) continue;
      if (home.profile.biomes.includes(this.world.biomeAt(x, z))) return site;
      fallback ??= site;
    }
    return fallback;
  }

  private fits(site: WildlifeShelterSite, radius: number, tree?: HabitatPoint): boolean {
    const centerY = this.routeHeight(site.x, site.z);
    if (centerY === undefined || this.world.biomeAt(site.x, site.z) === 'garden') return false;

    const shelter = this.frame(site);
    const { approach, entrance } = shelter;
    // Близкая к диаметру модели сетка отсекает воду и ступеньки по всему пятну.
    for (const dx of [-radius, 0, radius]) {
      for (const dz of [-radius, 0, radius]) {
        const x = site.x + dx;
        const z = site.z + dz;
        const y = this.routeHeight(x, z);
        if (y === undefined || Math.abs(y - centerY) > radius * 0.55) return false;
        if (this.world.biomeAt(x, z) === 'garden') return false;
      }
    }

    const reached = traceGround(approach, entrance.x, entrance.z, { heightAt: this.routeHeight });
    if (
      Math.hypot(reached.x - entrance.x, reached.z - entrance.z) > 0.01 ||
      this.routeHeight(approach.x, approach.z) === undefined
    )
      return false;

    const dx = approach.x - entrance.x;
    const dz = approach.z - entrance.z;
    const pathLengthSquared = dx * dx + dz * dz;
    for (const obstacle of this.near(this.obstacles, site, radius + 4)) {
      if (tree && obstacle.x === tree.x && obstacle.z === tree.z) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((obstacle.x - entrance.x) * dx + (obstacle.z - entrance.z) * dz) / pathLengthSquared,
        ),
      );
      if (
        Math.hypot(obstacle.x - site.x, obstacle.z - site.z) < radius + obstacle.radius + 0.25 ||
        Math.hypot(obstacle.x - entrance.x - t * dx, obstacle.z - entrance.z - t * dz) <
          obstacle.radius + 0.38
      )
        return false;
    }

    return !(this.save?.excavation ?? []).some(
      ({ x, y, z }) =>
        Math.hypot(x - site.x, z - site.z) < radius + 1.1 && y >= this.world.heightAt(x, z) - 1.5,
    );
  }

  private frame(site: WildlifeShelterSite): WildlifeShelter {
    const { x, z, angle, kind } = site;
    const radius = wildlifeShelterProfile(kind).radius;
    const point = (distance: number): DigNode => {
      const px = x - Math.sin(angle) * distance;
      const pz = z - Math.cos(angle) * distance;
      return { x: px, z: pz, y: this.world.heightAt(px, pz) };
    };
    return { site, entrance: point(radius * 0.9), approach: point(radius + APPROACH_CLEARANCE) };
  }

  private mount(site: WildlifeShelterSite): WildlifeShelter {
    const { x, z, kind, slot, treeHeight } = site;
    const profile = wildlifeShelterProfile(kind);
    const model = new Mesh(this.geometryFor(kind), this.material);
    model.name = `wildlife-shelter-${kind}-${slot}`;
    model.position.set(x, this.world.heightAt(x, z) + (treeHeight ?? 0), z);
    if (treeHeight) {
      this.occupiedTrees.add(`${x}:${z}`);
      model.position.x -= Math.sin(site.angle) * profile.radius * 0.6;
      model.position.z -= Math.cos(site.angle) * profile.radius * 0.6;
    }
    model.rotation.y = site.angle;
    model.receiveShadow = true;
    if (this.world.chunks) this.world.chunks.add(model, x, z);
    else this.scene.add(model);

    if (!treeHeight) {
      const r = profile.radius * 0.9;
      this.world.clearGroundCover?.(
        { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, maxY: model.position.y + 0.5 },
        (px, _py, pz) => Math.hypot(px - x, pz - z) - r,
      );
    }
    this.add(this.obstacles, { x, z, radius: profile.radius });
    const shelter = this.frame(site);
    this.homes.set(`${kind}:${slot}`, shelter);
    return shelter;
  }

  private geometryFor(kind: ShelteredWildlife): BufferGeometry {
    const previous = this.geometry.get(kind);
    if (previous) return previous;

    const geometry = wildlifeShelterGeometry(wildlifeShelterProfile(kind));
    this.geometry.set(kind, geometry);
    return geometry;
  }

  private add<T extends HabitatPoint>(grid: Map<string, T[]>, point: T): void {
    const key = `${Math.floor(point.x / CELL_SIZE)}:${Math.floor(point.z / CELL_SIZE)}`;
    const cell = grid.get(key);
    if (cell) cell.push(point);
    else grid.set(key, [point]);
  }

  private near<T>(grid: ReadonlyMap<string, T[]>, center: HabitatPoint, range: number): T[] {
    const result: T[] = [];
    for (
      let x = Math.floor((center.x - range) / CELL_SIZE);
      x <= Math.floor((center.x + range) / CELL_SIZE);
      x++
    ) {
      for (
        let z = Math.floor((center.z - range) / CELL_SIZE);
        z <= Math.floor((center.z + range) / CELL_SIZE);
        z++
      ) {
        const cell = grid.get(`${x}:${z}`);
        if (cell) result.push(...cell);
      }
    }
    return result;
  }
}

export function isWildlifeShelterSite(value: unknown, size: number): value is WildlifeShelterSite {
  if (!value || typeof value !== 'object') return false;
  const site = value as Record<string, unknown>;
  return (
    isShelteredWildlife(site.kind) &&
    typeof site.slot === 'number' &&
    Number.isSafeInteger(site.slot) &&
    site.slot >= 0 &&
    typeof site.x === 'number' &&
    Math.abs(site.x) < size &&
    typeof site.z === 'number' &&
    Math.abs(site.z) < size &&
    typeof site.angle === 'number' &&
    site.angle >= 0 &&
    site.angle < 2 * Math.PI &&
    (site.kind === 'squirrel'
      ? typeof site.treeHeight === 'number' && site.treeHeight > 0 && site.treeHeight <= 8
      : site.treeHeight === undefined)
  );
}
