import { createTreeTrunk, treeBarkMaterial, trunkCenter } from './TreeTrunks';
import * as THREE from 'three';
import { Random } from '../../src/game/Random';
import { NEEDLE_TREES, type TreeSpecies } from '../../src/game/TreeSpecies';
import { OAK_FOLIAGE_SIZE } from './OakFoliage';

type Species = Exclude<TreeSpecies, 'oak'>;
type Point = readonly [number, number, number];
type Shape = 'needle' | 'lobe' | 'triangle' | 'oval' | 'round' | 'heart' | 'compound';
type Profile = {
  height: number;
  radius: number;
  trunk: number;
  tint: number;
  shape: Shape;
  crownStart: number;
  tiers: number;
};

const profiles: Record<Species, Profile> = {
  pine: {
    height: 10.4,
    radius: 2.45,
    trunk: 0.3,
    tint: 0x557b58,
    shape: 'needle',
    crownStart: 0.64,
    tiers: 4,
  },
  spruce: {
    height: 10.8,
    radius: 2.45,
    trunk: 0.31,
    tint: 0x466b53,
    shape: 'needle',
    crownStart: 0.25,
    tiers: 7,
  },
  larch: {
    height: 10.1,
    radius: 2.05,
    trunk: 0.27,
    tint: 0x8ba464,
    shape: 'needle',
    crownStart: 0.37,
    tiers: 6,
  },
  birch: {
    height: 9.6,
    radius: 1.83,
    trunk: 0.19,
    tint: 0x8fb875,
    shape: 'triangle',
    crownStart: 0.53,
    tiers: 4,
  },
  maple: {
    height: 8.2,
    radius: 2.8,
    trunk: 0.37,
    tint: 0x86a95c,
    shape: 'lobe',
    crownStart: 0.5,
    tiers: 4,
  },
  ash: {
    height: 10,
    radius: 2.24,
    trunk: 0.27,
    tint: 0x839760,
    shape: 'compound',
    crownStart: 0.55,
    tiers: 5,
  },
  aspen: {
    height: 9.2,
    radius: 1.63,
    trunk: 0.21,
    tint: 0x91b47a,
    shape: 'round',
    crownStart: 0.52,
    tiers: 4,
  },
  linden: {
    height: 8.7,
    radius: 2.75,
    trunk: 0.34,
    tint: 0x789a60,
    shape: 'heart',
    crownStart: 0.48,
    tiers: 5,
  },
  rowan: {
    height: 6.8,
    radius: 1.9,
    trunk: 0.2,
    tint: 0xc3cd9f,
    shape: 'compound',
    crownStart: 0.5,
    tiers: 4,
  },
};

export function createTreeModel(species: Species): THREE.Group {
  const p = profiles[species];
  const needle = NEEDLE_TREES.some((kind) => kind === species);
  const root = new THREE.Group();
  root.name = species;
  const crown = new THREE.Group();
  crown.name = 'Foliage';
  root.add(crown);

  const bark = treeBarkMaterial(species);
  const foliage = new THREE.MeshStandardMaterial({
    name: `leaf_${species}_cards`,
    color: p.tint,
    roughness: 1,
    alphaTest: 0.48,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.PlaneGeometry(1, 1);

  function wood(from: Point, to: Point, radius: number, taper: number): void {
    const direction = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * taper, radius, direction.length(), 7),
      bark,
    );
    mesh.position.set(...from).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    root.add(mesh);
  }

  function cluster(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    angle: number,
  ): void {
    for (let i = 0; i < 3; i++) {
      const card = new THREE.Mesh(plane, foliage);
      card.position.set(x, y, z);
      card.scale.set(width, height, 1);
      card.rotation.set(
        i === 0 ? 0.08 : i === 1 ? 0.56 : -0.56,
        angle + (i * Math.PI) / 3,
        i === 0 ? 0 : 0.15,
      );
      crown.add(card);
    }
  }

  const trunkHeight = p.height * 0.95;
  root.add(new THREE.Mesh(createTreeTrunk(species, trunkHeight, p.trunk), bark));

  for (let tier = 0; tier < p.tiers; tier++) {
    const t = tier / p.tiers;
    const y = p.height * (p.crownStart + (0.92 - p.crownStart) * t);
    const radius =
      species === 'pine'
        ? p.radius * (0.62 + Math.sin(t * Math.PI) * 0.38)
        : needle
          ? p.radius * (1 - t * 0.83)
          : p.radius * (0.62 + Math.sin(t * Math.PI) * 0.38);
    const branches = needle ? 3 : 4;
    for (let branch = 0; branch < branches; branch++) {
      const angle = (branch * 2 * Math.PI) / branches + tier * 1.17;
      const x = Math.cos(angle) * radius * 0.62;
      const z = Math.sin(angle) * radius * 0.62;
      const tipY = y + (species === 'spruce' ? -0.22 : 0.22);
      const [trunkX, trunkZ] = trunkCenter(species, (y - 0.53) / trunkHeight);
      wood([trunkX, y - 0.53, trunkZ], [x, tipY, z], p.trunk * (1 - 0.45 * t) * 0.28, 0.3);
      cluster(
        x,
        tipY + 0.23,
        z,
        radius * (needle ? 1.36 : 1.12),
        radius * (needle ? 0.86 : 1.08),
        angle,
      );
    }
  }
  cluster(0, p.height * 0.92, 0, p.radius * 0.72, p.radius * (needle ? 0.86 : 1.08), 0.6);

  return root;
}

export function treeFoliagePixels(species: Species): Buffer {
  const size = OAK_FOLIAGE_SIZE;
  const pixels = Buffer.alloc(size * size * 4);
  const p = profiles[species];
  const rng = new Random(854 + species.charCodeAt(0) * 17 + species.charCodeAt(1));

  function leaf(cx: number, cy: number, angle: number, half: number, shade: number): void {
    const sin = Math.sin(angle),
      cos = Math.cos(angle);
    for (let y = Math.max(2, Math.floor(cy - half)); y <= Math.min(size - 3, cy + half); y++) {
      for (let x = Math.max(2, Math.floor(cx - half)); x <= Math.min(size - 3, cx + half); x++) {
        const u = ((x - cx) * cos + (y - cy) * sin) / half;
        const v = ((y - cy) * cos - (x - cx) * sin) / half;
        if (Math.abs(u) >= 1) continue;
        const base = Math.sqrt(1 - u * u);
        let width = base * 0.37;
        if (p.shape === 'needle') width = base * (species === 'pine' ? 0.09 : 0.125);
        else if (p.shape === 'round') width = base * 0.67;
        else if (p.shape === 'heart') width = base * (0.58 - u * 0.25);
        else if (p.shape === 'triangle') width = base * (0.49 - u * 0.24);
        else if (p.shape === 'lobe') width = base * (0.54 + 0.18 * Math.cos(u * Math.PI * 4.5));
        else if (p.shape === 'compound') width = base * 0.26;
        if (Math.abs(v) > width) continue;
        const light = Math.round(shade + v * 26 + (Math.abs(v) < 0.025 ? 18 : 0));
        const color =
          species === 'rowan'
            ? [light * 0.65, light, light * 0.54]
            : [light, light + 10, light - 14];
        pixels.set([...color, 255], (y * size + x) * 4);
      }
    }
  }

  const sprays = p.shape === 'needle' ? 12 : 9;
  const pairs = p.shape === 'needle' ? 8 : 5;
  for (let spray = 0; spray < sprays; spray++) {
    const angle = spray * 2.399;
    for (let pair = 0; pair < pairs; pair++) {
      const distance = 8 + pair * (p.shape === 'needle' ? 5.3 : 8.8);
      for (const side of [-1, 1]) {
        const direction = angle + side * rng.range(0.28, p.shape === 'needle' ? 1.22 : 0.87);
        leaf(
          64 + Math.cos(angle) * distance + Math.cos(direction) * 7,
          64 + Math.sin(angle) * distance + Math.sin(direction) * 7,
          direction,
          rng.range(8, p.shape === 'compound' ? 12 : 16),
          rng.int(153, 222),
        );
      }
    }
  }

  if (species === 'rowan') {
    for (let berry = 0; berry < 27; berry++) {
      const angle = Math.floor(berry / 9) * 2.15 + 0.4;
      const cx = Math.round(64 + Math.cos(angle) * 34 + rng.range(-8, 8));
      const cy = Math.round(64 + Math.sin(angle) * 34 + rng.range(-8, 8));
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          if (x * x + y * y <= 5)
            pixels.set([223 - y * 13, 69 - y * 5, 38, 255], ((cy + y) * size + cx + x) * 4);
        }
      }
    }
  }
  return pixels;
}
