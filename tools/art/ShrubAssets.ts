import * as THREE from 'three';
import { Random } from '../../src/game/Random';
import type { ShrubSpecies } from '../../src/game/ShrubSpecies';

type RGB = readonly [number, number, number];
type Profile = {
  height: number;
  spread: number;
  stems: number;
  card: number;
  tint: number;
  leafWidth: number;
  accent?: RGB;
};

const profiles: Record<ShrubSpecies, Profile> = {
  hazel: { height: 2.55, spread: 1.04, stems: 8, card: 1.56, tint: 0x8cad66, leafWidth: 0.62 },
  dogrose: {
    height: 1.28,
    spread: 1.2,
    stems: 7,
    card: 1.15,
    tint: 0xe2deb4,
    leafWidth: 0.37,
    accent: [245, 126, 161],
  },
  viburnum: {
    height: 1.85,
    spread: 1.03,
    stems: 6,
    card: 1.5,
    tint: 0xdddfaa,
    leafWidth: 0.53,
    accent: [210, 45, 42],
  },
  juniper: { height: 2.18, spread: 0.48, stems: 9, card: 1.04, tint: 0x759b7d, leafWidth: 0.095 },
  spiraea: {
    height: 0.96,
    spread: 1.23,
    stems: 8,
    card: 1,
    tint: 0xd7e3a9,
    leafWidth: 0.28,
    accent: [248, 244, 221],
  },
};

export const SHRUB_TEXTURE_SIZE = 128;

export function createShrubModel(species: ShrubSpecies): THREE.Group {
  const p = profiles[species];
  const root = new THREE.Group();
  root.name = species;
  const foliage = new THREE.Group();
  foliage.name = 'Foliage';
  root.add(foliage);
  const wood = new THREE.MeshStandardMaterial({
    name: 'shrub_wood',
    color: 0x76604a,
    roughness: 1,
  });
  const leaves = new THREE.MeshStandardMaterial({
    name: `leaf_${species}_cards`,
    color: p.tint,
    alphaTest: 0.45,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.PlaneGeometry(1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const rng = new Random(species.charCodeAt(0) * 153);

  function branch(from: THREE.Vector3, to: THREE.Vector3, thickness: number): void {
    const axis = to.clone().sub(from);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(thickness * 0.46, thickness, axis.length(), 5, 1, true),
      wood,
    );
    mesh.position.copy(from).addScaledVector(axis, 0.5);
    mesh.quaternion.setFromUnitVectors(up, axis.normalize());
    root.add(mesh);
  }

  for (let i = 0; i < p.stems; i++) {
    const angle = i * 2.399;
    const reach = rng.range(0.48, 1) * p.spread;
    const height = rng.range(0.62, 0.95) * p.height;
    const tip = new THREE.Vector3(Math.cos(angle) * reach, height, Math.sin(angle) * reach);
    const knee = tip.clone().multiplyScalar(0.52);
    knee.y *= species === 'spiraea' ? 1.45 : 1.14;
    branch(new THREE.Vector3(tip.x * 0.09, 0, tip.z * 0.09), knee, 0.032);
    branch(knee, tip, 0.018);
    const size = p.card * rng.range(0.77, 1.1);
    for (let face = 0; face < 3; face++) {
      const card = new THREE.Mesh(plane, leaves);
      card.position.copy(tip).multiplyScalar(0.92);
      card.scale.set(size, size * (species === 'juniper' ? 1.35 : 0.85), 1);
      card.rotation.set((face - 1) * 0.56, angle + (face * Math.PI) / 3, 0.18);
      foliage.add(card);
    }
  }
  return root;
}

export function shrubFoliagePixels(species: ShrubSpecies): Buffer {
  const size = SHRUB_TEXTURE_SIZE;
  const pixels = Buffer.alloc(size * size * 4);
  const p = profiles[species];
  const rng = new Random(species.charCodeAt(1) * 319);
  const needle = species === 'juniper';

  function ellipse(
    cx: number,
    cy: number,
    angle: number,
    length: number,
    width: number,
    color: RGB,
  ): void {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const extent = Math.max(length, width);
    for (let y = Math.max(2, Math.floor(cy - extent)); y <= Math.min(size - 3, cy + extent); y++) {
      for (
        let x = Math.max(2, Math.floor(cx - extent));
        x <= Math.min(size - 3, cx + extent);
        x++
      ) {
        const u = ((x - cx) * c + (y - cy) * s) / length;
        const v = ((y - cy) * c - (x - cx) * s) / width;
        if (u * u + v * v > 1) continue;
        const light = Math.abs(v) < 0.095 ? 13 : -v * 12;
        const at = (y * size + x) * 4;
        color.forEach((value, channel) => {
          pixels[at + channel] = Math.min(255, Math.max(0, value + light));
        });
        pixels[at + 3] = 255;
      }
    }
  }

  for (let spray = 0; spray < (needle ? 13 : 9); spray++) {
    const angle = spray * 2.399;
    for (let pair = 0; pair < (needle ? 9 : 5); pair++) {
      const radius = 8 + pair * (needle ? 5 : 9);
      for (const side of [-1, 1]) {
        const direction = angle + side * rng.range(0.36, 1.14);
        const length = rng.range(needle ? 9 : 7, needle ? 16 : 14);
        const value = rng.int(136, 220);
        const color: RGB = [value * 0.69, value, value * (needle ? 0.75 : 0.57)];
        ellipse(
          64 + Math.cos(angle) * radius + Math.cos(direction) * 6,
          64 + Math.sin(angle) * radius + Math.sin(direction) * 6,
          direction,
          length,
          length * p.leafWidth,
          color,
        );
      }
    }
  }

  if (p.accent) {
    for (let bloom = 0; bloom < (species === 'dogrose' ? 6 : 11); bloom++) {
      const a = bloom * 2.399;
      const r = rng.range(15, 48);
      const x = 64 + Math.cos(a) * r,
        y = 64 + Math.sin(a) * r;
      const ring = species === 'dogrose' ? 4.8 : 3.2;
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5;
        ellipse(
          x + Math.cos(angle) * ring,
          y + Math.sin(angle) * ring,
          angle,
          ring * 0.73,
          ring * 0.64,
          p.accent,
        );
      }
      if (species !== 'viburnum') ellipse(x, y, 0, 1.7, 1.7, [244, 191, 73]);
    }
  }
  return pixels;
}
