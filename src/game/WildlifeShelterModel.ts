import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from './Random';
import type { WildlifeShelterProfile } from './WildlifeShelterProfiles';

/** Создаёт одну геометрию на вид: входы в норы, кротовины, кучу листьев или гнездо из веток. */
export function wildlifeShelterGeometry(profile: WildlifeShelterProfile): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rng = new Random(profile.earth);
  const dirt = new THREE.Color(profile.earth);
  const edge = new THREE.Color(profile.edge);
  const { radius: r, height: h, shape } = profile;
  const bake = (source: THREE.BufferGeometry, color: THREE.Color) => {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    const colors = [];
    for (let i = 0; i < geometry.getAttribute('position').count; i += 3) {
      const light = rng.range(0.8, 1.15);
      for (let vertex = 0; vertex < 3; vertex++)
        colors.push(color.r * light, color.g * light, color.b * light);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    parts.push(geometry);
  };
  const clod = (
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    length: number,
    color = dirt,
  ) =>
    bake(
      new THREE.IcosahedronGeometry(1, 1).scale(width, height, length).translate(x, y, z),
      color,
    );

  if (shape === 'molehills') {
    clod(-r * 0.37, 0, r * 0.15, r * 0.6, h, r * 0.55);
    clod(r * 0.49, 0, r * 0.3, r * 0.42, h * 0.69, r * 0.43, edge);
    clod(r * 0.23, 0, -r * 0.45, r * 0.35, h * 0.43, r * 0.34);
  } else {
    clod(0, 0, 0, r, h, r * 0.88);
  }

  if (shape === 'burrow' || shape === 'leaf-nest') {
    // Тёмная ниша закрывает торец маленького муляжа. Под поверхностью мира геометрии нет.
    const mouth = new THREE.CircleGeometry(1, 14, 0, Math.PI * 2)
      .scale(r * 0.45, h * 0.55, 1)
      .translate(0, h * 0.39, -r * 0.9);
    bake(mouth, new THREE.Color(0x1b130e));
    for (const side of [-1, 1])
      clod(side * r * 0.57, h * 0.13, -r * 0.65, r * 0.29, h * 0.32, r * 0.24, edge);
  }

  if (shape === 'leaf-nest' || shape === 'tree-nest') {
    for (let i = 0; i < 17; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const distance = rng.range(r * 0.29, r * 0.82);
      const fragment =
        shape === 'leaf-nest'
          ? new THREE.IcosahedronGeometry(1, 0).scale(r * 0.26, h * 0.055, r * 0.13)
          : new THREE.CylinderGeometry(r * 0.04, r * 0.064, r * 0.88, 5).rotateZ(Math.PI / 2);
      fragment
        .rotateY(angle + rng.range(-1, 1))
        .translate(
          Math.cos(angle) * distance,
          h * rng.range(0.38, 0.92),
          Math.sin(angle) * distance,
        );
      bake(fragment, edge.clone().lerp(dirt, rng.range(0, 0.75)));
    }
  }

  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  geometry.computeVertexNormals();
  return geometry;
}
