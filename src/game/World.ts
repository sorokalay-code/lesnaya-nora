import * as THREE from 'three';
import { Random, smoothNoise } from './Random';
import { type Biome, type FoodKind, type Weather } from './types';

export interface Resource { id: number; x: number; z: number; kind: FoodKind; mesh: THREE.Group; available: boolean; regrowAt: number; }
export interface LandMark { x: number; z: number; label: string; biome: Biome; }

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
const sphere = new THREE.SphereGeometry(1, 8, 6);
const cone = new THREE.ConeGeometry(1, 1, 7);

function blob(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const mesh = new THREE.Mesh(sphere, material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

export class World {
  readonly size = 110;
  readonly scene: THREE.Scene;
  readonly resources: Resource[] = [];
  readonly landmarks: LandMark[] = [
    { x: 0, z: 0, biome: 'meadow', label: 'Родная поляна' },
    { x: 34, z: 31, biome: 'garden', label: 'Дачный огород' },
    { x: -35, z: 29, biome: 'garden', label: 'Старый огород' },
    { x: -31, z: -25, biome: 'swamp', label: 'Тихая топь' },
    { x: 27, z: -34, biome: 'forest', label: 'Сосновая чаща' },
  ];
  readonly seed: number;
  private rng: Random;
  private rain?: THREE.Points;

  constructor(scene: THREE.Scene, seed: number) {
    this.scene = scene; this.seed = seed; this.rng = new Random(seed);
    this.buildGround(); this.buildDecorations(); this.buildResources();
  }

  biomeAt(x: number, z: number): Biome {
    if (Math.hypot(x - 34, z - 31) < 15 || Math.hypot(x + 35, z - 29) < 12) return 'garden';
    if (Math.hypot(x + 31, z + 25) < 19 && smoothNoise(x / 12, z / 12, this.seed + 78) > 0.25) return 'swamp';
    if (Math.hypot(x, z) < 12) return 'meadow';
    const n = smoothNoise(x / 19, z / 19, this.seed) * 0.7 + smoothNoise(x / 8, z / 8, this.seed + 19) * 0.3;
    return n > 0.53 ? 'forest' : 'meadow';
  }

  private buildGround(): void {
    const verts: number[] = [], colors: number[] = [], indices: number[] = [];
    const color = new THREE.Color();
    const n = 55, step = this.size * 2 / n;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const wx = -this.size + x * step, wz = -this.size + z * step;
      const biome = this.biomeAt(wx + step / 2, wz + step / 2);
      const palette = biome === 'forest' ? [0x496d4b, 0x54754f, 0x5a7952] : biome === 'meadow' ? [0x789d62, 0x81a769, 0x8caf70] : biome === 'swamp' ? [0x5b795f, 0x688363, 0x7e8d6a] : [0x997e55, 0xa48b60, 0x8e7651];
      color.setHex(palette[this.rng.int(0, 2)]);
      const j = verts.length / 3;
      verts.push(wx, 0, wz, wx + step, 0, wz, wx + step, 0, wz + step, wx, 0, wz + step);
      for (let k = 0; k < 4; k++) colors.push(color.r, color.g, color.b);
      indices.push(j, j + 2, j + 1, j, j + 3, j + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    ground.receiveShadow = true; this.scene.add(ground);
  }

  private buildDecorations(): void {
    const bark = mat(0x735b43), leaves = [mat(0x447349), mat(0x54844e), mat(0x3e6948)], pine = mat(0x355f46);
    const water = new THREE.MeshStandardMaterial({ color: 0x6c9c94, transparent: true, opacity: 0.74, roughness: 0.3 });
    const flower = [mat(0xf5d277), mat(0xf5e6db), mat(0xe9b3bb), mat(0xcabfe8)];
    for (let i = 0; i < 580; i++) {
      const x = this.rng.range(-105, 105), z = this.rng.range(-105, 105), biome = this.biomeAt(x, z);
      if (Math.hypot(x, z) < 6) continue;
      if (biome === 'garden') continue;
      if (biome === 'swamp' && this.rng.chance(0.28)) {
        const puddle = new THREE.Mesh(new THREE.CircleGeometry(this.rng.range(1.5, 4), 12), water);
        puddle.rotation.x = -Math.PI / 2; puddle.position.set(x, 0.012, z); this.scene.add(puddle);
      }
      if (biome === 'forest' && this.rng.chance(0.58)) {
        const g = new THREE.Group(); g.position.set(x, 0, z); const h = this.rng.range(2.8, 5.7);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, h * 0.62, 7), bark);
        trunk.position.y = h * 0.31; trunk.castShadow = true; g.add(trunk);
        if (this.rng.chance(0.45)) {
          for (let l = 0; l < 3; l++) {
            const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4 - l * 0.2, 2.2, 7), pine);
            crown.position.y = h * 0.5 + l * 0.65; crown.castShadow = true; g.add(crown);
          }
        } else {
          blob(g, this.rng.pick(leaves), 0, h * 0.8, 0, 1.3, 1.15, 1.3);
          blob(g, this.rng.pick(leaves), -0.65, h * 0.65, 0.2, 0.8, 0.75, 0.8);
        }
        this.scene.add(g);
      } else if (this.rng.chance(0.55)) {
        const g = new THREE.Group(); g.position.set(x, 0, z);
        const bushMat = biome === 'swamp' ? leaves[0] : leaves[1];
        blob(g, bushMat, 0, 0.27, 0, 0.62, 0.38, 0.56);
        if (this.rng.chance(0.2)) for (let k = 0; k < 3; k++) blob(g, this.rng.pick(flower), this.rng.range(-0.4, 0.4), 0.56, this.rng.range(-0.3, 0.3), 0.07, 0.07, 0.07);
        this.scene.add(g);
      }
    }
    this.makeGarden(34, 31, 16); this.makeGarden(-35, 29, 13);
    this.makeBoundary();
  }

  private makeGarden(x: number, z: number, r: number): void {
    const fence = mat(0xbca277);
    for (let i = -r; i <= r; i += 2) for (const side of [-1, 1]) {
      if (Math.abs(i) < 3 && side === -1) continue;
      for (const [px, pz] of [[x + i, z + side * r], [x + side * r, z + i]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), fence);
        post.position.set(px, 0.55, pz); post.castShadow = true; this.scene.add(post);
      }
    }
    const hut = new THREE.Group(); hut.position.set(x + r * 0.58, 0, z + r * 0.58);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.7), mat(0xd5c19a)); wall.position.y = 1.1; wall.castShadow = true; hut.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.5, 4), mat(0x915b47)); roof.position.y = 2.8; roof.rotation.y = Math.PI / 4; hut.add(roof); this.scene.add(hut);
    for (let row = -r + 3; row < r - 3; row += 3) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, r * 1.3), mat(0x6e583d));
      strip.position.set(x + row, 0.05, z); this.scene.add(strip);
    }
  }

  private makeBoundary(): void {
    const fog = new THREE.FogExp2(0xb9d3ba, 0.012); this.scene.fog = fog;
  }

  private buildResources(): void {
    let id = 0;
    for (let i = 0; i < 410; i++) {
      const x = this.rng.range(-100, 100), z = this.rng.range(-100, 100);
      const biome = this.biomeAt(x, z);
      const kind: FoodKind = biome === 'garden' ? this.rng.pick(['carrot', 'carrot', 'cabbage']) : biome === 'swamp' ? this.rng.pick(['mushroom', 'berries', 'clover']) : biome === 'forest' ? this.rng.pick(['berries', 'mushroom', 'clover']) : 'clover';
      const mesh = this.resourceModel(kind); mesh.position.set(x, 0, z); this.scene.add(mesh);
      this.resources.push({ id: id++, x, z, kind, mesh, available: true, regrowAt: 0 });
    }
  }

  private resourceModel(kind: FoodKind): THREE.Group {
    const g = new THREE.Group();
    const green = mat(0x4a8c48), darkGreen = mat(0x3f7040);
    if (kind === 'carrot') {
      const root = new THREE.Mesh(cone, mat(0xe58b44)); root.rotation.x = Math.PI; root.position.y = 0.18; root.scale.set(0.14, 0.48, 0.14); g.add(root);
      for (let i = 0; i < 3; i++) { const leaf = new THREE.Mesh(cone, green); leaf.position.set((i - 1) * 0.12, 0.5, 0); leaf.scale.set(0.08, 0.4, 0.07); g.add(leaf); }
    } else if (kind === 'cabbage') {
      blob(g, green, 0, 0.22, 0, 0.35, 0.28, 0.35);
      for (let i = 0; i < 4; i++) blob(g, darkGreen, Math.cos(i * Math.PI / 2) * 0.23, 0.13, Math.sin(i * Math.PI / 2) * 0.23, 0.22, 0.1, 0.15);
    } else if (kind === 'mushroom') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.35, 7), mat(0xf2e9cb)); stem.position.y = 0.19; g.add(stem);
      blob(g, mat(0xa26d5b), 0, 0.38, 0, 0.27, 0.11, 0.27);
    } else if (kind === 'berries') {
      blob(g, darkGreen, 0, 0.24, 0, 0.33, 0.26, 0.33);
      const berry = mat(0x6d4e8a);
      for (let i = 0; i < 5; i++) blob(g, berry, Math.cos(i * 2.5) * 0.2, 0.37, Math.sin(i * 2.5) * 0.2, 0.07, 0.07, 0.07);
    } else {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        blob(g, green, Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17, 0.16, 0.06, 0.11);
      }
      blob(g, mat(0xeed9d8), 0, 0.18, 0, 0.07, 0.08, 0.07);
    }
    return g;
  }

  nearestResource(x: number, z: number, radius = 2): Resource | undefined {
    let best: Resource | undefined, dist = radius;
    for (const r of this.resources) if (r.available) {
      const d = Math.hypot(r.x - x, r.z - z);
      if (d < dist) { dist = d; best = r; }
    }
    return best;
  }

  harvest(resource: Resource, clock: number): void {
    resource.available = false; resource.mesh.visible = false; resource.regrowAt = clock + 110 + (resource.id % 60);
  }

  update(clock: number, time: number, weather: Weather): void {
    for (const r of this.resources) if (!r.available && clock >= r.regrowAt) { r.available = true; r.mesh.visible = true; }
    for (const r of this.resources) if (r.available && r.mesh.visible) r.mesh.rotation.y = Math.sin(time * 0.7 + r.id) * 0.04;
    if (this.rain) this.rain.visible = weather === 'rain';
  }

  setRain(): void {
    const count = 800, pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { pos[i * 3] = this.rng.range(-70, 70); pos[i * 3 + 1] = this.rng.range(1, 20); pos[i * 3 + 2] = this.rng.range(-70, 70); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc7d9db, size: 0.09, transparent: true, opacity: 0.55 }));
    this.rain.visible = false; this.scene.add(this.rain);
  }

  updateRain(dt: number, x: number, z: number): void {
    if (!this.rain?.visible) return;
    const attr = this.rain.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) { let y = attr.getY(i) - dt * 15; if (y < 0) y = 20; attr.setY(i, y); }
    attr.needsUpdate = true; this.rain.position.x = x; this.rain.position.z = z;
  }
}
