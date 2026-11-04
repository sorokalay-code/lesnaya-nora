import * as THREE from 'three';
import { hash2, Random } from '../../src/game/Random';
import type { TreeSpecies } from '../../src/game/TreeSpecies';

type BarkStyle = 'scales' | 'ridges' | 'smooth';
type RGB = readonly [number, number, number];
type TrunkProfile = {
  color: RGB;
  style: BarkStyle;
  grain: readonly [number, number];
  contrast: number;
  scars: number;
  bend: readonly [number, number];
  flare: number;
  ridges: number;
};

const trunks: Record<TreeSpecies, TrunkProfile> = {
  oak: {
    color: [111, 84, 62],
    style: 'ridges',
    grain: [9, 3],
    contrast: 43,
    scars: 5,
    bend: [0.22, -0.16],
    flare: 1.62,
    ridges: 0.13,
  },
  pine: {
    color: [151, 98, 65],
    style: 'scales',
    grain: [8, 9],
    contrast: 39,
    scars: 3,
    bend: [0.22, 0.09],
    flare: 1.36,
    ridges: 0.075,
  },
  spruce: {
    color: [104, 80, 66],
    style: 'scales',
    grain: [14, 15],
    contrast: 29,
    scars: 3,
    bend: [0.035, -0.05],
    flare: 1.31,
    ridges: 0.048,
  },
  larch: {
    color: [130, 86, 69],
    style: 'ridges',
    grain: [12, 6],
    contrast: 44,
    scars: 4,
    bend: [-0.09, 0.13],
    flare: 1.44,
    ridges: 0.084,
  },
  birch: {
    color: [218, 209, 185],
    style: 'smooth',
    grain: [4, 17],
    contrast: 15,
    scars: 17,
    bend: [-0.29, 0.16],
    flare: 1.19,
    ridges: 0.034,
  },
  maple: {
    color: [132, 113, 91],
    style: 'scales',
    grain: [10, 6],
    contrast: 26,
    scars: 7,
    bend: [0.34, 0.14],
    flare: 1.36,
    ridges: 0.069,
  },
  ash: {
    color: [128, 123, 101],
    style: 'ridges',
    grain: [13, 5],
    contrast: 35,
    scars: 4,
    bend: [-0.12, -0.09],
    flare: 1.29,
    ridges: 0.076,
  },
  aspen: {
    color: [163, 165, 142],
    style: 'smooth',
    grain: [6, 13],
    contrast: 17,
    scars: 11,
    bend: [0.14, -0.18],
    flare: 1.18,
    ridges: 0.038,
  },
  linden: {
    color: [119, 100, 80],
    style: 'ridges',
    grain: [17, 4],
    contrast: 31,
    scars: 5,
    bend: [-0.32, -0.18],
    flare: 1.57,
    ridges: 0.11,
  },
  rowan: {
    color: [149, 123, 108],
    style: 'smooth',
    grain: [5, 16],
    contrast: 19,
    scars: 12,
    bend: [0.38, -0.21],
    flare: 1.24,
    ridges: 0.047,
  },
};

export const TREE_BARK_SIZE = 128;

export function treeBarkMaterial(species: TreeSpecies): THREE.MeshStandardMaterial {
  const [r, g, b] = trunks[species].color;
  return new THREE.MeshStandardMaterial({
    name: `bark_${species}_texture`,
    color: new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace),
    roughness: 1,
  });
}

export function trunkCenter(species: TreeSpecies, t: number): [number, number] {
  const [x, z] = trunks[species].bend;
  return [x * Math.sin(t * 2.9) + x * t * 0.45, z * Math.sin(t * 4.1) + z * t];
}

export function createTreeTrunk(
  species: TreeSpecies,
  height: number,
  radius: number,
): THREE.BufferGeometry {
  const profile = trunks[species];
  const rings = [0, 0.045, 0.13, 0.31, 0.53, 0.73, 0.9, 1];
  const sides = 10;
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];

  // Кольца непрерывны, а нижний раструб образует корневые наплывы без отдельных мешей.
  for (const t of rings) {
    const [cx, cz] = trunkCenter(species, t);
    const foot = Math.max(0, 1 - t / 0.15) ** 2;
    const taper = (1 - t) * 0.85 + 0.15;
    for (let side = 0; side <= sides; side++) {
      const angle = ((side % sides) * 2 * Math.PI) / sides;
      const rib = Math.cos(angle * 3 + t * 2) * profile.ridges;
      const root = foot * (profile.flare - 1) * (0.68 + 0.32 * Math.cos(angle * 4 + 0.6));
      const r = radius * (taper * (1 + rib + Math.sin(angle * 2 - t * 3) * 0.04) + root);
      positions.push(cx + Math.cos(angle) * r, t * height, cz + Math.sin(angle) * r);
      uvs.push(side / sides, (t * height) / 2.35);
    }
  }
  const stride = sides + 1;
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * stride + side;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const top = positions.length / 3;
  const [tx, tz] = trunkCenter(species, 1);
  positions.push(tx, height, tz);
  uvs.push(0.5, height / 2.35);
  for (let side = 0; side < sides; side++)
    indices.push(top, (rings.length - 1) * stride + side + 1, (rings.length - 1) * stride + side);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const smooth = new THREE.Vector3();
  const edge = new THREE.Vector3();
  for (let ring = 0; ring < rings.length; ring++) {
    const a = ring * stride,
      b = a + sides;
    smooth.fromBufferAttribute(normals, a).add(edge.fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, smooth.x, smooth.y, smooth.z);
    normals.setXYZ(b, smooth.x, smooth.y, smooth.z);
  }
  return geometry;
}

export function treeBarkPixels(species: TreeSpecies): Buffer {
  const size = TREE_BARK_SIZE;
  const p = trunks[species];
  const [gx, gy] = p.grain;
  const seed = species.charCodeAt(0) * 37 + species.charCodeAt(1);
  const rng = new Random(seed);
  const pixels = Buffer.alloc(size * size * 4);
  const scars = Array.from({ length: p.scars }, () => ({
    x: rng.next(),
    y: rng.next(),
    width: rng.range(0.025, p.style === 'smooth' ? 0.18 : 0.08),
    height: rng.range(0.008, p.style === 'smooth' ? 0.048 : 0.04),
    strength: rng.range(0.55, 1),
  }));
  const wrap = (v: number, n: number) => ((v % n) + n) % n;
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const px = u * gx + Math.sin(v * Math.PI * 4 + u * Math.PI * 2) * 0.24;
      const py = v * gy + Math.sin(u * Math.PI * 6) * 0.15;
      let first = Infinity,
        second = Infinity,
        shade = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ix = Math.floor(px) + dx,
            iy = Math.floor(py) + dy;
          const a = wrap(ix, gx),
            b = wrap(iy, gy);
          const cx = ix + 0.2 + hash2(a, b, seed) * 0.6;
          const cy = iy + 0.2 + hash2(a, b, seed + 1) * 0.6;
          const d = Math.hypot(px - cx, py - cy);
          if (d < first) {
            second = first;
            first = d;
            shade = hash2(a, b, seed + 2) - 0.5;
          } else if (d < second) second = d;
        }
      }
      const edge = 1 - Math.min(1, (second - first) * 6);
      const pattern =
        p.style === 'smooth'
          ? Math.sin(py * Math.PI * 2) * 0.17 + shade * 0.28
          : shade * 0.53 - edge ** 2 + (1 - first) * 0.2;
      let light = pattern * p.contrast + (hash2(x, y, seed + 9) - 0.5) * 12;
      for (const scar of scars) {
        const ellipse =
          (distance(u, scar.x) / scar.width) ** 2 + (distance(v, scar.y) / scar.height) ** 2;
        if (ellipse < 1)
          light -= (1 - ellipse * 0.6) * scar.strength * (p.style === 'smooth' ? 126 : 39);
      }
      const i = (y * size + x) * 4;
      p.color.forEach((channel, c) => {
        pixels[i + c] = Math.max(0, Math.min(255, channel + light));
      });
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}
