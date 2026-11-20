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
    const uvs = [];
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i += 3) {
      const light = rng.range(0.8, 1.15);
      for (let vertex = 0; vertex < 3; vertex++) {
        const index = i + vertex;
        colors.push(color.r * light, color.g * light, color.b * light);
        const nx = Math.abs(normal.getX(index));
        const ny = Math.abs(normal.getY(index));
        const nz = Math.abs(normal.getZ(index));
        if (ny >= nx && ny >= nz) uvs.push(position.getX(index) * 2, position.getZ(index) * 2);
        else if (nx >= nz) uvs.push(position.getZ(index) * 2, position.getY(index) * 2);
        else uvs.push(position.getX(index) * 2, position.getY(index) * 2);
      }
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
  } else if (shape !== 'cave' && shape !== 'crevice') {
    clod(0, 0, 0, r, h, r * 0.88);
  }

  if (shape === 'burrow' || shape === 'cave' || shape === 'roots') {
    const stones = new THREE.Color(0x756b5a);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3;
      const distance = r * (0.62 + (i % 2) * 0.1);
      clod(
        Math.sin(angle) * distance,
        h * 0.035,
        Math.cos(angle) * distance,
        r * 0.11,
        h * 0.12,
        r * 0.09,
        stones,
      );
    }
  }

  if (shape === 'beaver-lodge' || shape === 'duck-nest') {
    const lodge = shape === 'beaver-lodge';
    for (let index = 0; index < (lodge ? 24 : 16); index++) {
      const angle = index * 2.399963;
      const drift = rng.range(0.55, 0.99);
      const length = r * rng.range(0.65, lodge ? 1.5 : 0.9);
      const stick = new THREE.CylinderGeometry(r * 0.031, r * 0.049, length, 5)
        .rotateZ(Math.PI / 2)
        .rotateX(rng.range(-0.14, 0.14))
        .rotateY(angle + rng.range(-0.35, 0.35));
      stick.translate(
        Math.sin(angle) * r * drift,
        lodge ? h * rng.range(0.29, 0.8) : h * rng.range(0.44, 0.96),
        Math.cos(angle) * r * drift * 0.85,
      );
      bake(stick, dirt.clone().lerp(edge, rng.range(0.3, 1)));
    }
  }

  if (shape === 'cave' || shape === 'crevice') {
    clod(0, h * 0.12, r * 0.18, r, h * 0.84, r * 0.69);
    for (const side of [-1, 1])
      clod(side * r * 0.62, h * 0.15, -r * 0.42, r * 0.38, h * 0.66, r * 0.38, edge);
    clod(r * 0.05, h * 0.64, -r * 0.33, r * 0.81, h * 0.42, r * 0.51, edge);
  }

  if (shape === 'roots') {
    clod(0, h * 0.52, r * 0.22, r * 0.54, h * 0.61, r * 0.47, edge);
    for (const side of [-1, 1])
      bake(
        new THREE.CylinderGeometry(r * 0.07, r * 0.17, r * 1.56, 6)
          .rotateX(Math.PI * 0.4)
          .rotateY(side * 0.54)
          .translate(side * r * 0.52, h * 0.37, -r * 0.23),
        edge,
      );
  }

  if (shape !== 'tree-nest' && shape !== 'molehills' && shape !== 'duck-nest') {
    // Тёмная ниша закрывает торец маленького муляжа. Под поверхностью мира геометрии нет.
    const lodge = shape === 'beaver-lodge';
    const mouth = new THREE.CircleGeometry(1, 14, 0, Math.PI * 2)
      .scale(r * 0.45, h * (lodge ? 0.23 : 0.55), 1)
      .translate(0, h * (lodge ? 0.19 : 0.39), -r * 0.9);
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

  if (shape === 'duck-nest') {
    const bowl = new THREE.CircleGeometry(1, 16)
      .rotateX(-Math.PI / 2)
      .scale(r * 0.34, r * 0.34, 1)
      .translate(0, h * 0.46, 0);
    bake(bowl, new THREE.Color(0x443428));
  }

  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  geometry.computeVertexNormals();
  return geometry;
}
