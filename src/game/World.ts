import { AmbientFlight, type FlightAnchor } from './AmbientFlight';
import { isShrubSpecies } from './ShrubSpecies';
import { BROADLEAF_TREES, isEvergreen, NEEDLE_TREES } from './TreeSpecies';
import { SeasonalGround } from './SeasonalGround';
import { caveMaterial } from './CaveMaterial';
import { GroundCover } from './GroundCover';
import { GroundOpenings } from './GroundOpenings';
import type { CaveBounds } from './CaveMesher';
import { groundColor } from './TerrainColors';
import { WorldBoundary } from './WorldBoundary';
import * as THREE from 'three';
import { ModelAssets } from './ModelAssets';
import { hash2, Random } from './Random';
import { ResourceInstances } from './ResourceInstances';
import { SeasonSystem } from './systems';
import { Terrain } from './Terrain';
import { type Biome, type FoodKind, type SaveData, type Weather } from './types';
import { WorldChunks } from './WorldChunks';
import { GardenCrops } from './GardenCrops';
import { RockField } from './RockField';
import { WaterScenery } from './WaterScenery';
import type { WaterSample } from './WaterMap';
import { defaultWorldConfig, type WorldConfig } from './WorldConfig';
import { WorldLayout } from './WorldLayout';

export interface Resource {
  id: number;
  x: number;
  z: number;
  kind: FoodKind;
  mesh: THREE.Group;
  available: boolean;
  regrowAt: number;
}
export interface TreeRoot {
  kind: 'acorn';
  available: boolean;
  tree: true;
  id: number;
}
export interface LandMark {
  x: number;
  z: number;
  label: string;
  biome: Biome;
}

const mat = (color: number) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
/** Создаёт процедурный мир и управляет ресурсами, погодой, сезонами и декорациями. */
export class World {
  readonly size: number;
  readonly config: WorldConfig;
  readonly scale: number;
  readonly scene: THREE.Scene;
  readonly resources: Resource[] = [];
  readonly waterSources: { x: number; z: number }[] = [];
  readonly treeLocations: { x: number; z: number }[] = [];
  readonly landmarks: LandMark[];
  readonly layout: WorldLayout;
  readonly seed: number;
  readonly chunks: WorldChunks;
  readonly terrain: Terrain;
  private readonly boundary: WorldBoundary;
  private seasons: SeasonSystem;
  private currentDay = 1;
  private displayedSeason = '';
  private readonly seasonalGround = new SeasonalGround();
  private groundMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private groundOpenings?: GroundOpenings;
  private treeRootRegrow = new Map<number, number>();
  private currentClock = 0;
  private nextResourceSync = 0;
  private resourceInstances!: ResourceInstances;
  private foliageMaterials = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private deciduousCrowns: THREE.Object3D[] = [];
  private fallenLeaves: THREE.Object3D[] = [];
  private groundCover?: GroundCover;
  readonly soilMaterial = caveMaterial();
  private rng: Random;
  private rain?: THREE.Points;
  private readonly ambientFlight: AmbientFlight;
  private heightCache = new Map<string, number>();

  constructor(
    scene: THREE.Scene,
    seed: number,
    private readonly save?: SaveData,
  ) {
    this.scene = scene;
    this.seed = seed;
    this.config = save?.worldConfig ?? defaultWorldConfig();
    this.size = this.config.size;
    this.scale = this.size / 110;
    this.layout = new WorldLayout(seed, this.config.map);
    this.landmarks = this.layout.regions.map(({ x, z, biome, label }) => ({
      x: x * this.scale,
      z: z * this.scale,
      biome,
      label,
    }));
    this.rng = new Random(seed);
    this.seasons = new SeasonSystem(seed, this.config.seasonLengths);
    this.chunks = new WorldChunks(scene);
    this.terrain = new Terrain(seed, this.scale, this.config.water, this.layout);
    this.boundary = new WorldBoundary(
      this.terrain,
      seed,
      this.size,
      (x, z) => this.biomeAt(x, z),
      this.config.vegetation,
      this.seasonalGround.material,
    );
    this.scene.add(this.boundary.root);
    for (const [id, time] of Object.entries(save?.gnawedRoots ?? {}))
      this.treeRootRegrow.set(Number(id), time);

    this.buildGround();
    this.buildDecorations();
    this.ambientFlight = this.makeAmbientFlight();
    this.makeBoundary();
    this.updateSeason(save?.day ?? 1, save?.clock ?? 0);
    new WaterScenery(
      this.terrain.water,
      (x, z) => this.heightAt(x, z),
      this.chunks,
      this.config.vegetation,
    );
    for (const body of this.terrain.water.bodies) this.waterSources.push(...body.points);
    new RockField(
      seed,
      this.chunks,
      (x, z) => this.heightAt(x, z),
      (x, z) => this.biomeAt(x, z) !== 'garden' && !this.nearWater(x, z, 3),
      this.scale,
    );
    this.buildResources();
    this.resourceInstances = new ResourceInstances(this.resources, this.chunks, (root) =>
      this.trackFoliage(root),
    );
  }

  /** Игровая высота вычисляется по тем же двум треугольникам метровой ячейки, что и видимая поверхность. */
  heightAt(x: number, z: number): number {
    const ix = Math.floor(x),
      iz = Math.floor(z),
      u = x - ix,
      v = z - iz;
    const sample = (gx: number, gz: number) => {
      const key = `${gx},${gz}`;
      let value = this.heightCache.get(key);
      if (value === undefined) {
        value = this.terrain.heightAt(gx, gz);
        this.heightCache.set(key, value);
      }

      return value;
    };
    const h00 = sample(ix, iz);
    if (u === 0 && v === 0) return h00;

    const h11 = sample(ix + 1, iz + 1);
    if (u >= v) {
      const h10 = sample(ix + 1, iz);
      return h00 + (h10 - h00) * u + (h11 - h10) * v;
    }

    const h01 = sample(ix, iz + 1);
    return h00 + (h11 - h01) * u + (h01 - h00) * v;
  }

  waterAt(x: number, z: number): WaterSample | undefined {
    if (!this.terrain.water.near(x, z, 0)) return undefined;

    return this.terrain.water.sample(x, z, this.heightAt(x, z));
  }

  temperatureOffset(x: number, z: number): number {
    return this.terrain.temperatureOffset(x, z);
  }

  rootAt(x: number, z: number, depth: number): Resource | TreeRoot | undefined {
    if (depth <= 4) {
      let best: Resource | undefined,
        dist = 1.45;
      for (const resource of this.resources) {
        if (!['carrot', 'cabbage', 'clover', 'bitterleaf', 'berries'].includes(resource.kind))
          continue;

        const d = Math.hypot(resource.x - x, resource.z - z);
        if (d < dist) {
          best = resource;
          dist = d;
        }
      }

      if (best) return best;
    }

    if (depth > 8) return undefined;

    let index = -1,
      dist = 2.4;
    this.treeLocations.forEach((tree, i) => {
      const d = Math.hypot(tree.x - x, tree.z - z);
      if (d < dist) {
        index = i;
        dist = d;
      }
    });
    return index < 0
      ? undefined
      : {
          kind: 'acorn',
          available: this.currentClock >= (this.treeRootRegrow.get(index) ?? 0),
          tree: true,
          id: index,
        };
  }

  gnawTreeRoot(id: number, clock: number): void {
    this.treeRootRegrow.set(id, clock + 260);
    if (this.save) {
      this.save.gnawedRoots ??= {};
      this.save.gnawedRoots[id] = clock + 260;
    }
  }

  gnawBark(x: number, z: number, clock: number): boolean {
    const index = this.treeLocations.findIndex((t) => Math.hypot(t.x - x, t.z - z) < 2.2);
    if (index < 0) return false;

    const cooldown = this.save?.gnawedBark?.[index] ?? 0;
    if (clock < cooldown) return false;

    if (this.save) {
      this.save.gnawedBark ??= {};
      this.save.gnawedBark[index] = clock + 240;
    }

    return true;
  }

  biomeAt(x: number, z: number): Biome {
    return this.layout.biomeAt(x / this.scale, z / this.scale, this.config.biome);
  }

  private buildGround(): void {
    const verts: number[] = [],
      colors: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const color = new THREE.Color();
    const n = this.size * 2,
      step = (this.size * 2) / n;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const wx = -this.size + x * step,
          wz = -this.size + z * step;
        const j = verts.length / 3;
        verts.push(
          wx,
          this.heightAt(wx, wz),
          wz,
          wx + step,
          this.heightAt(wx + step, wz),
          wz,
          wx + step,
          this.heightAt(wx + step, wz + step),
          wz + step,
          wx,
          this.heightAt(wx, wz + step),
          wz + step,
        );
        for (const [vx, vz] of [
          [wx, wz],
          [wx + step, wz],
          [wx + step, wz + step],
          [wx, wz + step],
        ]) {
          groundColor(color, vx, vz, this.seed, this.biomeAt(vx, vz));
          colors.push(color.r, color.g, color.b);
          uvs.push(vx / 7, vz / 7);
        }

        const tileIndices = [j, j + 2, j + 1, j, j + 3, j + 2];
        indices.push(...tileIndices);
      }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, this.seasonalGround.material);
    ground.receiveShadow = true;
    ground.name = 'world-ground';
    this.scene.add(ground);
    this.groundMesh = ground;
    this.groundOpenings = new GroundOpenings(ground, this.size, (x, z) => this.heightAt(x, z));
  }

  surfaceHit(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): THREE.Vector3 | undefined {
    if (!this.groundMesh) return undefined;

    const ray = new THREE.Raycaster(origin, direction, 0, maxDistance);
    return ray.intersectObject(this.groundMesh, true)[0]?.point;
  }

  addGroundHole(bounds: CaveBounds, distanceAt: (x: number, y: number, z: number) => number): void {
    this.groundOpenings?.update(bounds, distanceAt);
    this.groundCover?.clearOpening(bounds, distanceAt);
  }

  private buildDecorations(): void {
    for (let i = 0; i < Math.round(580 * this.scale ** 2 * this.config.vegetation); i++) {
      const x = this.rng.range(-105, 105) * this.scale,
        z = this.rng.range(-105, 105) * this.scale,
        biome = this.biomeAt(x, z);
      if (Math.hypot(x, z) < 6) continue;

      if (biome === 'garden' || this.terrain.water.near(x, z, 0.8)) continue;

      if (biome === 'forest' && this.rng.chance(0.58)) {
        const pool = this.rng.chance(0.55) ? BROADLEAF_TREES : NEEDLE_TREES;
        const index = Math.floor(
          hash2(Math.floor(x * 100), Math.floor(z * 100), this.seed + 751) * pool.length,
        );
        const species = pool[index];
        const g = ModelAssets.shared.create(species).root;
        g.position.set(x, this.heightAt(x, z), z);
        g.scale.setScalar(this.rng.range(0.7, 1.38));
        g.rotation.y = this.rng.range(0, Math.PI * 2);
        this.treeLocations.push({ x, z });
        if (!isEvergreen(species)) {
          const crown = g.getObjectByName('Foliage'),
            litter = g.getObjectByName('Litter');
          if (crown) this.deciduousCrowns.push(crown);

          if (litter) {
            litter.visible = false;
            this.fallenLeaves.push(litter);
          }
        }

        this.trackFoliage(g);
        this.chunks.add(g, x, z);
      } else if (this.rng.chance(0.65)) {
        const shrubs =
          biome === 'swamp'
            ? (['bush', 'viburnum', 'spiraea'] as const)
            : biome === 'forest'
              ? (['bush', 'hazel', 'viburnum', 'juniper'] as const)
              : (['bush', 'dogrose', 'spiraea', 'juniper'] as const);
        const shrubIndex = Math.floor(
          hash2(Math.floor(x * 100), Math.floor(z * 100), this.seed + 917) * shrubs.length,
        );
        const kind = this.rng.chance(0.34)
          ? 'fern'
          : biome === 'swamp' && this.rng.chance(0.5)
            ? 'reed'
            : shrubs[shrubIndex];
        const g = ModelAssets.shared.create(kind).root;
        g.position.set(x, this.heightAt(x, z), z);
        g.scale.setScalar(this.rng.range(0.75, 1.25));
        g.rotation.y = this.rng.range(0, Math.PI * 2);
        if (isShrubSpecies(kind) && kind !== 'juniper') {
          const crown = g.getObjectByName('Foliage');
          if (crown) this.deciduousCrowns.push(crown);
        }
        this.trackFoliage(g);
        this.chunks.add(g, x, z);
      }
    }

    for (const garden of this.layout.gardens)
      this.makeGarden(garden.x * this.scale, garden.z * this.scale, garden.radius * this.scale);
    this.makeSmallDetails();
  }

  private trackFoliage(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshStandardMaterial)
      )
        return;

      const material = object.material;
      if (material.name.startsWith('leaf_') && !this.foliageMaterials.has(material)) {
        const base = new THREE.Color(
          (material.userData.baseColor as number) ?? material.color.getHex(),
        );
        material.color.copy(base);
        this.foliageMaterials.set(material, base);
      }
    });
  }

  private makeSmallDetails(): void {
    const vegetation = this.scale ** 2 * this.config.vegetation;
    const flowerCount = Math.round(620 * vegetation);
    this.groundCover = new GroundCover(this.chunks, this.rng, {
      seed: this.seed,
      scale: this.scale,
      density: this.config.vegetation,
      heightAt: (x, z) => this.heightAt(x, z),
      biomeAt: (x, z) => this.biomeAt(x, z),
      wet: (x, z) => !!this.waterAt(x, z),
    });
    const stoneModel = ModelAssets.shared.create('rock_granite').root;
    let stonePart: THREE.Mesh | undefined;
    stoneModel.traverse((part) => {
      if (part instanceof THREE.Mesh) stonePart = part;
    });
    if (!stonePart) throw new Error('Не найдена геометрия камня');
    const stones = new THREE.InstancedMesh(stonePart.geometry, stonePart.material, 370);
    const flowers = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.075, 0),
      mat(0xf4d7aa),
      flowerCount,
    );
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < 370; i++) {
      const sx = this.rng.range(-101, 101) * this.scale,
        sz = this.rng.range(-101, 101) * this.scale;
      dummy.position.set(sx, this.heightAt(sx, sz) - 0.025, sz);
      dummy.rotation.y = this.rng.range(0, 6.28);
      dummy.scale.setScalar(this.rng.range(0.6, 2.5) * 0.18);
      dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
    }

    for (let i = 0; i < flowerCount; i++) {
      const x = this.rng.range(-102, 102) * this.scale,
        z = this.rng.range(-102, 102) * this.scale;
      dummy.position.set(x, this.heightAt(x, z) + 0.47, z);
      dummy.rotation.y = 0;
      dummy.scale.setScalar(this.rng.range(0.8, 1.6));
      dummy.updateMatrix();
      if (this.waterAt(x, z)) dummy.scale.setScalar(0);
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
      flowers.setColorAt(i, color.setHex(this.rng.pick([0xf5e6d2, 0xeebfc5, 0xebdf8b, 0xc6b7dd])));
    }

    this.scene.add(stones, flowers);
    for (let i = 0; i < Math.round(65 * vegetation); i++) {
      const x = this.rng.range(-98, 98) * this.scale,
        z = this.rng.range(-98, 98) * this.scale;
      if (
        this.biomeAt(x, z) === 'garden' ||
        Math.hypot(x, z) < 12 ||
        this.terrain.water.near(x, z, 1)
      )
        continue;

      const length = this.rng.range(1.2, 3.1),
        angle = this.rng.range(0, Math.PI * 2);
      const dx = Math.cos(angle),
        dz = Math.sin(angle);
      const start = this.heightAt(x - (dx * length) / 2, z - (dz * length) / 2),
        end = this.heightAt(x + (dx * length) / 2, z + (dz * length) / 2);
      const log = ModelAssets.shared.create('fallen_log').root;
      log.scale.y = length;
      log.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx, (end - start) / length, dz).normalize(),
      );
      log.position.set(x, (start + end) / 2 + 0.19, z);
      log.castShadow = true;
      this.chunks.add(log, x, z);
    }
  }

  private makeAmbientFlight(): AmbientFlight {
    const butterflies: FlightAnchor[] = [];
    for (let i = 0; i < this.config.creatures.butterfly; i++) {
      const x = this.rng.range(-95, 95) * this.scale;
      const z = this.rng.range(-95, 95) * this.scale;
      if (this.biomeAt(x, z) === 'swamp') continue;

      // Этот шаг раньше выбирал цвет бабочки. Сохраняем последовательность генерации ресурсов.
      this.rng.next();
      butterflies.push({ x, z });
    }
    const extra = new Random(this.seed + 66071);
    while (butterflies.length < this.config.creatures.butterfly) {
      const x = extra.range(-95, 95) * this.scale;
      const z = extra.range(-95, 95) * this.scale;
      extra.next();
      butterflies.push({ x, z });
    }
    return new AmbientFlight(this.scene, {
      seed: this.seed,
      scale: this.scale,
      vegetation: this.config.vegetation,
      butterflies,
      heightAt: (x, z) => this.heightAt(x, z),
      biomeAt: (x, z) => this.biomeAt(x, z),
      nearWater: (x, z) => this.nearWater(x, z, 8),
    });
  }

  private makeGarden(x: number, z: number, r: number): void {
    const fence = mat(0xbca277);
    for (let i = -r; i <= r; i += 2)
      for (const side of [-1, 1]) {
        if (Math.abs(i) < 3 && side === -1) continue;

        for (const [px, pz] of [
          [x + i, z + side * r],
          [x + side * r, z + i],
        ]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), fence);
          post.position.set(px, this.heightAt(px, pz) + 0.55, pz);
          post.castShadow = true;
          this.chunks.add(post, px, pz);
        }
      }

    const hx = x + r * 0.58,
      hz = z + r * 0.58;
    const hutY = Math.min(
      ...[-1.5, 1.5].flatMap((dx) => [-1.35, 1.35].map((dz) => this.heightAt(hx + dx, hz + dz))),
    );
    const hut = new THREE.Group();
    hut.position.set(hx, hutY, hz);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.7), mat(0xd5c19a));
    wall.position.y = 1.1;
    wall.castShadow = true;
    hut.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.5, 4), mat(0x915b47));
    roof.position.y = 2.8;
    roof.rotation.y = Math.PI / 4;
    hut.add(roof);
    this.chunks.add(hut, hut.position.x, hut.position.z);
    for (let row = -r + 3; row < r - 3; row += 3) {
      const strip = this.terrainStrip(x + row, z, 1.4, r * 1.3);
      this.chunks.add(strip, x + row, z);
    }
  }

  private terrainStrip(x: number, z: number, width: number, length: number): THREE.Mesh {
    const columns = 4,
      rows = Math.ceil(length / 0.5),
      vertices: number[] = [],
      indices: number[] = [];
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        const vx = x - width / 2 + (width * column) / columns,
          vz = z - length / 2 + (length * row) / rows;
        vertices.push(vx, this.heightAt(vx, vz) + 0.045, vz);
      }

    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const a = row * (columns + 1) + column,
          b = a + 1,
          c = a + columns + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x6e583d, roughness: 1, side: THREE.DoubleSide }),
    );
    mesh.name = 'garden-soil';
    return mesh;
  }

  private makeBoundary(): void {
    const fog = new THREE.FogExp2(0xb9d3ba, 0.012);
    this.scene.fog = fog;
  }

  private buildResources(): void {
    let id = 0;
    const add = (x: number, z: number, kind: FoodKind) => {
      if (this.terrain.water.near(x, z, 0.4)) return;
      const mesh = new THREE.Group();
      mesh.name = `resource-${kind}`;
      mesh.position.set(x, this.heightAt(x, z), z);
      this.chunks.add(mesh, x, z);
      this.resources.push({ id: id++, x, z, kind, mesh, available: true, regrowAt: 0 });
    };
    for (let i = 0; i < Math.round(1050 * this.scale ** 2 * this.config.food); i++) {
      const x = this.rng.range(-100, 100) * this.scale,
        z = this.rng.range(-100, 100) * this.scale;
      const biome = this.biomeAt(x, z);
      const kind: FoodKind =
        biome === 'garden'
          ? this.rng.pick(['carrot', 'carrot', 'cabbage', 'bitterleaf'])
          : biome === 'swamp'
            ? this.rng.pick(['mushroom', 'berries', 'clover', 'toadstool', 'bitterleaf'])
            : biome === 'forest'
              ? this.rng.pick(['berries', 'mushroom', 'clover', 'acorn', 'toadstool'])
              : this.rng.pick(['clover', 'clover', 'bitterleaf', 'berries']);
      add(x, z, kind);
    }
    GardenCrops.plant(add, this.scale, this.config.food, [...this.layout.gardens]);
  }

  fertilize(x: number, z: number, clock: number): void {
    for (const resource of this.resources)
      if (!resource.available && Math.hypot(resource.x - x, resource.z - z) < 2.6)
        resource.regrowAt = Math.max(clock, resource.regrowAt - 90);
  }

  nearestResource(x: number, z: number, radius = 2): Resource | undefined {
    let best: Resource | undefined,
      dist = radius;
    for (const r of this.resources)
      if (r.available && r.mesh.visible && r.mesh.parent?.visible) {
        const d = Math.hypot(r.x - x, r.z - z);
        if (d < dist) {
          dist = d;
          best = r;
        }
      }

    return best;
  }

  nearWater(x: number, z: number, radius = 5): boolean {
    return this.terrain.water.near(x, z, radius);
  }

  hasCover(x: number, z: number): boolean {
    if (this.biomeAt(x, z) === 'forest') return true;

    return this.treeLocations.some((t) => Math.hypot(t.x - x, t.z - z) < 3.7);
  }

  harvest(resource: Resource, clock: number): void {
    resource.available = false;
    resource.mesh.visible = false;
    resource.regrowAt =
      clock + (this.seasons.name(this.currentDay) === 'Зима' ? 480 : 110) + (resource.id % 60);
    this.resourceInstances.sync(resource);
  }

  update(clock: number, time: number, weather: Weather, day: number, px: number, pz: number): void {
    this.currentDay = day;
    this.currentClock = clock;
    this.chunks.update(px, pz);
    this.updateSeason(day, clock);
    if (clock >= this.nextResourceSync) {
      this.nextResourceSync = clock + 1;
      for (const r of this.resources) {
        if (!r.available && clock >= r.regrowAt) r.available = true;

        r.mesh.visible = r.available && this.seasons.foodVisible(r.id, r.kind, day);
        r.mesh.scale.setScalar(
          r.regrowAt > 0 ? Math.min(1, 0.25 + Math.max(0, clock - r.regrowAt) / 90) : 1,
        );
        if (r.mesh.visible && Math.hypot(r.x - px, r.z - pz) < 28)
          r.mesh.rotation.y = Math.sin(time * 0.7 + r.id) * 0.04;

        this.resourceInstances.sync(r);
      }
    }

    if (this.rain) {
      this.rain.visible = weather === 'rain' || weather === 'snow';
      const material = this.rain.material as THREE.PointsMaterial;
      material.color.setHex(weather === 'snow' ? 0xf4f7f3 : 0xc7d9db);
      material.size = weather === 'snow' ? 0.2 : 0.09;
    }

    if (this.scene.fog instanceof THREE.FogExp2)
      this.scene.fog.density = weather === 'mist' ? 0.026 : weather === 'rain' ? 0.017 : 0.012;

    this.ambientFlight.update(time, px, pz, this.seasons.name(day));
  }

  private updateSeason(day: number, clock: number): void {
    const blend = this.seasons.visualBlend(day, clock);
    this.seasonalGround.update(blend);
    this.groundCover?.setSeason(blend);
    const season = blend.current;
    if (season === this.displayedSeason) return;
    this.displayedSeason = season;
    this.boundary.setSeason(season);
    this.soilMaterial.map = ModelAssets.shared.soilTexture(season) ?? null;
    this.soilMaterial.needsUpdate = true;

    this.foliageMaterials.forEach((base, material) => {
      material.color.copy(base);
      const species = material.name.replace(/^leaf_/, '').replace(/_cards$/, '');
      const evergreen = isEvergreen(species) || species === 'juniper';
      if (!evergreen && season === 'Осень') material.color.lerp(new THREE.Color(0xb88146), 0.6);

      if (!evergreen && season === 'Зима') material.color.lerp(new THREE.Color(0x8f9b88), 0.55);
    });
    this.deciduousCrowns.forEach((c) => {
      c.visible = season !== 'Зима';
    });
    this.fallenLeaves.forEach((c) => {
      c.visible = season === 'Осень' || season === 'Зима';
    });
  }

  setRain(): void {
    const count = 800,
      pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = this.rng.range(-70, 70);
      pos[i * 3 + 1] = this.rng.range(1, 20);
      pos[i * 3 + 2] = this.rng.range(-70, 70);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xc7d9db, size: 0.09, transparent: true, opacity: 0.55 }),
    );
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  updateRain(dt: number, x: number, z: number, weather: Weather): void {
    if (!this.rain?.visible) return;

    const attr = this.rain.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      let y = attr.getY(i) - dt * (weather === 'snow' ? 3.2 : 15);
      if (y < 0) y = 20;
      attr.setY(i, y);
    }

    attr.needsUpdate = true;
    this.rain.position.x = x;
    this.rain.position.z = z;
  }
}
