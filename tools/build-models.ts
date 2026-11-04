import {
  createTreeTrunk,
  treeBarkMaterial,
  treeBarkPixels,
  TREE_BARK_SIZE,
  trunkCenter,
} from './art/TreeTrunks';
import { createTreeModel, treeFoliagePixels } from './art/TreeAssets';
import { isTreeSpecies, TREE_SPECIES } from '../src/game/TreeSpecies';
import { oakFoliagePixels, OAK_FOLIAGE_SIZE } from './art/OakFoliage';
// Offline art pipeline. The game only loads the exported GLB files.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  createRockModel,
  createSpiderModel,
  spiderClips,
  spiderLowClips,
  spiderJumpClip,
} from './art/WildAssets';
import { createLynxModel, lynxPounceClip } from './art/LynxAsset';
import { createRabbitEye } from './art/RabbitEye';
import { quadrupedGait } from './art/Locomotion';
import { rabbitLocomotion } from './art/RabbitLocomotion';
import { createBoarModel } from './art/BoarAsset';
import { createPikeModel, pikeClips } from './art/PikeAsset';
import { swimmingClip, SWIMMING_MODELS } from './art/Swimming';

/** Адаптер Blob для офлайн-экспорта GLB средствами Three.js в Node.js. */
class NodeFileReader {
  result: ArrayBuffer | string;
  onloadend?: () => void;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((data) => {
      this.result = data;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((data) => {
      this.result = `data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
// Экспортёр использует только два метода этого адаптера; DOM FileReader в Node отсутствует.
globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;

let sphere = new THREE.SphereGeometry(1, 16, 12);
let smallSphere = new THREE.SphereGeometry(1, 10, 8);
const cone = new THREE.ConeGeometry(1, 1, 9);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 9);
const materials = new Map();
const mat = (name, color, roughness = 0.92) => {
  const key = `${name}:${color}`;
  if (!materials.has(key))
    materials.set(key, new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0 }));
  return materials.get(key);
};
const fur = (color = 0xc9aa83) => mat('fur_base', color);
const pale = (color = 0xf1dec3) => mat('fur_light', color);
const pink = mat('pink', 0xd68f9d);
const eye = mat('eye', 0x171d1d, 0.24);
const shine = mat('eye_shine', 0xffffff, 0.12);
const dark = mat('dark', 0x332b29);
const dirt = mat('twig', 0x6e513a);
function group(parent, name, x = 0, y = 0, z = 0) {
  const item = new THREE.Group();
  item.name = name;
  item.position.set(x, y, z);
  parent.add(item);
  return item;
}
type VectorTuple = [number, number, number];
function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  position: VectorTuple,
  scale: VectorTuple,
  rotation?: VectorTuple,
) {
  const item = new THREE.Mesh(geometry, material);
  item.name = name;
  item.position.set(...position);
  item.scale.set(...scale);
  if (rotation) item.rotation.set(...rotation);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}
const ell = (
  p: THREE.Object3D,
  m: THREE.Material,
  n: string,
  xyz: VectorTuple,
  s: VectorTuple,
  r?: VectorTuple,
) => mesh(p, sphere, m, n, xyz, s, r);
const mini = (
  p: THREE.Object3D,
  m: THREE.Material,
  n: string,
  xyz: VectorTuple,
  s: VectorTuple,
  r?: VectorTuple,
) => mesh(p, smallSphere, m, n, xyz, s, r);
const tip = (
  p: THREE.Object3D,
  m: THREE.Material,
  n: string,
  xyz: VectorTuple,
  s: VectorTuple,
  r?: VectorTuple,
) => mesh(p, cone, m, n, xyz, s, r);
const stick = (p, m, n, a, b, radius) => {
  const midpoint = new THREE.Vector3()
    .addVectors(new THREE.Vector3(...a), new THREE.Vector3(...b))
    .multiplyScalar(0.5);
  const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const item = mesh(p, cylinder, m, n, midpoint.toArray(), [radius, direction.length(), radius]);
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return item;
};
const curve = (p, m, n, points, radius) => {
  const path = new THREE.CatmullRomCurve3(points.map((v) => new THREE.Vector3(...v)));
  return mesh(p, new THREE.TubeGeometry(path, 9, radius, 4, false), m, n, [0, 0, 0], [1, 1, 1]);
};
function whiskers(parent, x, y, z) {
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++)
      curve(
        parent,
        pale(0xe5ded3),
        `Whisker${side}_${i}`,
        [
          [side * x, y + i * 0.027, z],
          [side * (x + 0.17), y + (i - 1) * 0.045, z - 0.06],
          [side * (x + 0.37), y + (i - 1) * 0.07, z - 0.01],
        ],
        0.004,
      );
}
function face(parent, width, y, z, muzzle, earY, ears = 'point') {
  for (const side of [-1, 1]) {
    const e = mini(
      parent,
      eye,
      `Eye${side < 0 ? 'L' : 'R'}`,
      [side * width, y, z],
      [0.053, 0.062, 0.04],
    );
    mini(
      parent,
      shine,
      `Glint${side}`,
      [side * width - 0.014, y + 0.023, z - 0.036],
      [0.016, 0.018, 0.01],
    );
    if (ears === 'point')
      tip(
        parent,
        fur(),
        `Ear${side}`,
        [side * (width + 0.02), earY, z + 0.2],
        [0.12, 0.31, 0.12],
        [0, 0, side * -0.12],
      );
    if (ears === 'round')
      mini(
        parent,
        fur(),
        `Ear${side}`,
        [side * (width + 0.08), earY, z + 0.12],
        [0.16, 0.17, 0.09],
      );
  }
  mini(parent, dark, 'Nose', [0, y - 0.12, muzzle], [0.085, 0.055, 0.065]);
}
function rabbit() {
  const root = group(new THREE.Group(), 'Rabbit');
  const visual = group(root, 'Visual');
  ell(visual, fur(), 'Body', [0, 0.52, 0.08], [0.41, 0.35, 0.59]);
  ell(visual, pale(), 'Belly', [0, 0.31, -0.08], [0.29, 0.14, 0.4]);
  ell(visual, fur(), 'Shoulders', [0, 0.59, -0.33], [0.32, 0.29, 0.28]);
  const head = group(visual, 'Head', 0, 0.72, -0.45);
  ell(head, fur(), 'Skull', [0, 0, 0], [0.32, 0.3, 0.31]);
  ell(head, pale(), 'Muzzle', [0, -0.1, -0.27], [0.2, 0.13, 0.18]);
  for (const side of [-1, 1]) {
    ell(head, pale(), `Cheek${side}`, [side * 0.16, -0.12, -0.22], [0.14, 0.1, 0.13]);
    const eyeGroup = group(head, side < 0 ? 'EyeL' : 'EyeR', side * 0.255, 0.065, -0.17);
    eyeGroup.add(createRabbitEye(sphere.parameters.widthSegments <= 8));
    const ear = group(head, side < 0 ? 'EarL' : 'EarR', side * 0.18, 0.18, 0.07);
    ell(ear, fur(), `EarOuter${side}`, [0, 0.34, 0], [0.112, 0.41, 0.067], [0, 0, side * -0.08]);
    ell(
      ear,
      pink,
      `EarInner${side}`,
      [0, 0.34, -0.058],
      [0.067, 0.31, 0.018],
      [0, 0, side * -0.08],
    );
    mini(ear, pale(), `EarTip${side}`, [0, 0.72, 0.008], [0.07, 0.06, 0.045]);
  }
  mini(head, pink, 'Nose', [0, -0.075, -0.382], [0.064, 0.047, 0.04]);
  const fangs = group(head, 'Fangs');
  for (const side of [-1, 1]) {
    const fang = mesh(
      fangs,
      new THREE.ConeGeometry(1, 1, 5),
      pale(),
      'Fang',
      [side * 0.1, -0.23, -0.43],
      [0.04, 0.23, 0.04],
    );
    fang.rotation.z = Math.PI;
  }
  curve(
    head,
    dark,
    'Mouth',
    [
      [0, -0.13, -0.39],
      [0, -0.175, -0.39],
      [-0.055, -0.185, -0.38],
    ],
    0.006,
  );
  whiskers(head, 0.11, -0.12, -0.36);
  for (const side of [-1, 1])
    for (const back of [false, true]) {
      const name = `Paw${back ? 'B' : 'F'}${side < 0 ? 'L' : 'R'}`;
      const suffix = name.slice(3);
      const limb = group(
        visual,
        name,
        side * (back ? 0.31 : 0.265),
        back ? 0.4 : 0.42,
        back ? 0.38 : -0.3,
      );
      const length = back ? 0.33 : 0.35;
      const upper = group(limb, 'Upper' + suffix);
      const foot = group(limb, 'Foot' + suffix, 0, -length, 0);
      ell(
        upper,
        fur(),
        `${name}Limb`,
        [0, -length * 0.44, back ? 0.015 : 0],
        [back ? 0.16 : 0.095, length * 0.55, back ? 0.16 : 0.1],
      );
      ell(
        foot,
        pale(),
        `${name}Foot`,
        [0, -0.035, back ? -0.09 : -0.065],
        [back ? 0.16 : 0.105, 0.035, back ? 0.22 : 0.14],
      );
      for (let t = 0; t < 3; t++)
        mini(
          foot,
          pale(),
          `${name}Toe${t}`,
          [(t - 1) * (back ? 0.08 : 0.055), -0.04, back ? -0.26 : -0.17],
          [0.03, 0.025, 0.045],
        );
    }
  const tail = group(visual, 'Tail', 0, 0.58, 0.62);
  mini(tail, pale(), 'TailPuff', [0, 0, 0], [0.18, 0.18, 0.18]);
  for (let i = 0; i < 5; i++)
    mini(
      tail,
      pale(),
      `TailTuft${i}`,
      [Math.sin(i * 2.5) * 0.11, Math.cos(i * 2.5) * 0.1, 0.06],
      [0.07, 0.085, 0.08],
    );
  return root;
}
function quadruped(kind) {
  const settings = {
    fox: {
      color: 0xbb6b3b,
      light: 0xf5e5c9,
      scale: 1,
      body: [0.4, 0.4, 0.78],
      head: [0.3, 0.27, 0.35],
      ear: 'point',
    },
    wolf: {
      color: 0x777b7c,
      light: 0xd4d1c4,
      scale: 1.4,
      body: [0.43, 0.46, 0.84],
      head: [0.33, 0.3, 0.39],
      ear: 'point',
    },
    dog: {
      color: 0x9d7955,
      light: 0xe9d4b2,
      scale: 1.18,
      body: [0.43, 0.42, 0.78],
      head: [0.32, 0.28, 0.35],
      ear: 'round',
    },
    lynx: {
      color: 0xb49068,
      light: 0xead9b9,
      scale: 1.1,
      body: [0.4, 0.4, 0.69],
      head: [0.31, 0.29, 0.34],
      ear: 'point',
    },
    weasel: {
      color: 0x8d6246,
      light: 0xe8d7bc,
      scale: 0.68,
      body: [0.35, 0.3, 0.91],
      head: [0.27, 0.25, 0.32],
      ear: 'round',
    },
    bear: {
      color: 0x654635,
      light: 0xa57a58,
      scale: 1.55,
      body: [0.69, 0.66, 0.87],
      head: [0.49, 0.42, 0.44],
      ear: 'round',
    },
  }[kind];
  const root = group(new THREE.Group(), kind);
  root.scale.setScalar(settings.scale);
  const visual = group(root, 'Visual');
  const base = fur(settings.color),
    light = pale(settings.light);
  const bear = kind === 'bear';
  const bodyY = bear ? 0.82 : 0.68;
  ell(visual, base, 'Body', [0, bodyY, 0.1], settings.body);
  ell(
    visual,
    light,
    'Chest',
    [0, bear ? 0.67 : 0.51, -0.5],
    [bear ? 0.42 : 0.29, bear ? 0.4 : 0.29, 0.3],
  );
  if (bear) ell(visual, base, 'ShoulderHump', [0, 1.17, -0.35], [0.65, 0.51, 0.52]);
  if (kind === 'wolf' || kind === 'lynx')
    for (let i = 0; i < 6; i++)
      tip(
        visual,
        base,
        `Ruff${i}`,
        [(i - 2.5) * 0.14, 0.95, -0.36],
        [0.14, 0.3, 0.15],
        [0.6, 0, (i - 2.5) * 0.15],
      );
  const head = group(visual, 'Head', 0, bear ? 1.1 : 0.91, bear ? -0.67 : -0.67);
  ell(head, base, 'Skull', [0, 0, 0], settings.head);
  ell(
    head,
    light,
    'Snout',
    [0, -0.14, bear ? -0.39 : -0.39],
    [bear ? 0.32 : 0.19, bear ? 0.2 : 0.14, bear ? 0.37 : 0.3],
  );
  if (bear) ell(head, base, 'Brow', [0, 0.19, -0.23], [0.43, 0.17, 0.28]);
  face(
    head,
    bear ? 0.33 : 0.23,
    bear ? 0.09 : 0.06,
    bear ? -0.32 : -0.25,
    bear ? -0.74 : -0.67,
    bear ? 0.43 : 0.33,
    settings.ear,
  );
  if (kind === 'lynx')
    for (const side of [-1, 1])
      tip(
        head,
        dark,
        `EarTuft${side}`,
        [side * 0.25, 0.62, 0.02],
        [0.045, 0.18, 0.055],
        [0, 0, side * -0.15],
      );
  if (kind === 'fox' || kind === 'wolf')
    for (const side of [-1, 1])
      ell(head, light, `FaceMark${side}`, [side * 0.19, -0.13, -0.35], [0.12, 0.12, 0.17]);
  if (kind === 'dog')
    ell(visual, mat('collar', 0x558d80), 'Collar', [0, 0.79, -0.52], [0.32, 0.07, 0.31]);
  for (const side of [-1, 1])
    for (const back of [false, true]) {
      const name = `Leg${back ? 'B' : 'F'}${side < 0 ? 'L' : 'R'}`;
      const pivot = group(
        visual,
        name,
        side * (bear ? 0.48 : 0.28),
        bear ? 0.58 : 0.46,
        back ? 0.56 : -0.47,
      );
      ell(
        pivot,
        base,
        `${name}Upper`,
        [0, -0.17, 0],
        [bear ? 0.24 : 0.14, bear ? 0.34 : 0.29, bear ? 0.25 : 0.15],
      );
      ell(
        pivot,
        base,
        `${name}Foot`,
        [0, bear ? -0.47 : -0.4, -0.11],
        [bear ? 0.25 : 0.16, 0.09, bear ? 0.27 : 0.2],
      );
      for (let t = 0; t < 3; t++)
        mini(
          pivot,
          bear ? dark : light,
          `${name}Claw${t}`,
          [(t - 1) * (bear ? 0.13 : 0.08), bear ? -0.49 : -0.42, -(bear ? 0.35 : 0.28)],
          [0.035, 0.027, 0.07],
        );
    }
  const tail = group(visual, 'Tail', 0, bear ? 0.81 : 0.75, bear ? 0.96 : 0.82);
  if (bear) ell(tail, base, 'TailFur', [0, 0, 0.05], [0.15, 0.13, 0.16]);
  else if (kind === 'lynx') ell(tail, dark, 'TailFur', [0, 0, 0.15], [0.14, 0.14, 0.25]);
  else {
    ell(
      tail,
      base,
      'TailFur',
      [0, 0, 0.25],
      [0.19, 0.19, kind === 'weasel' ? 0.62 : 0.48],
      [0.4, 0, 0],
    );
    ell(tail, light, 'TailTip', [0, 0.13, kind === 'weasel' ? 0.67 : 0.64], [0.13, 0.12, 0.18]);
  }
  if (bear)
    for (const side of [-1, 1])
      ell(visual, light, `CheekFur${side}`, [side * 0.42, 0.93, -0.72], [0.18, 0.2, 0.15]);
  return root;
}
function snake() {
  const root = group(new THREE.Group(), 'snake'),
    visual = group(root, 'Visual');
  const skin = fur(0x60774b),
    belly = pale(0xc8bc82);
  for (let i = 0; i < 9; i++) {
    const seg = group(visual, `Segment${i}`, 0, 0.15, 0.88 - i * 0.25);
    ell(seg, skin, `Scale${i}`, [0, 0, 0], [0.19 - i * 0.009, 0.13, 0.23]);
    ell(seg, belly, `Belly${i}`, [0, -0.08, -0.02], [0.14, 0.055, 0.2]);
    if (i < 6)
      for (const side of [-1, 1])
        mini(seg, dark, `Spot${i}_${side}`, [side * 0.13, 0.085, 0], [0.045, 0.025, 0.075]);
  }
  const head = group(visual, 'Head', 0, 0.21, -1.14);
  ell(head, skin, 'Skull', [0, 0, 0], [0.25, 0.15, 0.28]);
  ell(head, belly, 'Jaw', [0, -0.08, -0.19], [0.18, 0.07, 0.19]);
  for (const side of [-1, 1]) {
    mini(head, eye, `Eye${side}`, [side * 0.18, 0.07, -0.15], [0.05, 0.055, 0.04]);
    mini(head, shine, `Glint${side}`, [side * 0.18, 0.09, -0.185], [0.012, 0.014, 0.008]);
  }
  const tongue = group(head, 'Tongue', 0, -0.08, -0.35);
  stick(tongue, pink, 'TongueStem', [0, 0, 0], [0, 0, -0.21], 0.014);
  for (const side of [-1, 1])
    stick(tongue, pink, `Fork${side}`, [0, 0, -0.2], [side * 0.07, 0, -0.29], 0.009);
  return root;
}
function hawk() {
  const root = group(new THREE.Group(), 'hawk');
  root.scale.setScalar(1.55);
  const visual = group(root, 'Visual');
  const brown = fur(0x77503a),
    cream = pale(0xe2cc9d),
    gold = mat('beak', 0xd7a748);
  ell(visual, brown, 'Body', [0, 0, 0], [0.4, 0.28, 0.72]);
  ell(visual, cream, 'Breast', [0, -0.16, -0.18], [0.31, 0.16, 0.48]);
  const head = group(visual, 'Head', 0, 0.17, -0.6);
  ell(head, brown, 'Skull', [0, 0, 0], [0.27, 0.25, 0.28]);
  tip(head, gold, 'Beak', [0, -0.08, -0.33], [0.12, 0.26, 0.12], [-Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    mini(head, eye, `Eye${side}`, [side * 0.2, 0.09, -0.19], [0.05, 0.05, 0.04]);
    mini(head, shine, `Glint${side}`, [side * 0.21, 0.11, -0.22], [0.015, 0.016, 0.008]);
  }
  for (const side of [-1, 1]) {
    const wing = group(visual, side < 0 ? 'WingL' : 'WingR', side * 0.3, 0.05, 0.02);
    ell(
      wing,
      brown,
      `WingBone${side}`,
      [side * 0.67, 0, 0.08],
      [0.82, 0.075, 0.3],
      [0, side * 0.15, 0],
    );
    for (let i = 0; i < 6; i++)
      ell(
        wing,
        i % 2 ? cream : brown,
        `Feather${side}_${i}`,
        [side * (0.46 + i * 0.21), -0.018, 0.31 + i * 0.015],
        [0.23, 0.035, 0.3],
        [0, side * 0.2, 0],
      );
    for (let t = 0; t < 3; t++)
      stick(
        visual,
        gold,
        `Talon${side}_${t}`,
        [side * 0.2, -0.23, -0.04],
        [side * (0.2 + (t - 1) * 0.06), -0.43, -0.17],
        0.024,
      );
  }
  for (let i = -2; i <= 2; i++)
    ell(
      visual,
      brown,
      `TailFeather${i}`,
      [i * 0.1, -0.02, 0.78],
      [0.1, 0.035, 0.47],
      [0, i * 0.13, 0],
    );
  return root;
}
function peaceful(kind) {
  const root = group(new THREE.Group(), kind),
    visual = group(root, 'Visual');
  const data = {
    deer: [0xa9784f, 1.13, 0.53, 0.87],
    moose: [0x70523e, 1.65, 0.72, 1.08],
    squirrel: [0xb66f3e, 0.43, 0.28, 0.39],
    hedgehog: [0x765b44, 0.34, 0.43, 0.55],
    beaver: [0x79523b, 0.5, 0.47, 0.67],
  }[kind];
  const [color, by, bw, bl] = data,
    base = fur(color),
    light = pale(kind === 'squirrel' ? 0xeccf9c : 0xe7d7bb);
  ell(
    visual,
    base,
    'Body',
    [0, by, 0.06],
    [bw, kind === 'moose' ? 0.67 : kind === 'deer' ? 0.54 : by * 0.78, bl],
  );
  const head = group(
    visual,
    'Head',
    0,
    kind === 'moose'
      ? 2.38
      : kind === 'deer'
        ? 1.93
        : kind === 'squirrel'
          ? 0.78
          : kind === 'beaver'
            ? 0.66
            : 0.36,
    kind === 'moose' ? -1.1 : kind === 'deer' ? -0.81 : -0.5,
  );
  ell(
    head,
    base,
    'Skull',
    [0, 0, 0],
    kind === 'moose'
      ? [0.48, 0.39, 0.48]
      : kind === 'deer'
        ? [0.38, 0.35, 0.37]
        : [0.3, 0.25, 0.31],
  );
  ell(
    head,
    light,
    'Muzzle',
    [0, -0.13, kind === 'moose' ? -0.53 : -0.31],
    kind === 'moose' ? [0.34, 0.23, 0.4] : [0.2, 0.14, 0.21],
  );
  for (const side of [-1, 1]) {
    const w = kind === 'moose' ? 0.36 : kind === 'deer' ? 0.29 : 0.23;
    mini(head, eye, `Eye${side}`, [side * w, 0.07, -0.25], [0.048, 0.054, 0.04]);
    mini(head, shine, `Glint${side}`, [side * w - 0.012, 0.09, -0.286], [0.014, 0.015, 0.009]);
    if (kind === 'moose' || kind === 'deer') {
      ell(
        head,
        base,
        `Ear${side}`,
        [side * 0.4, 0.32, 0.05],
        [0.21, 0.12, 0.13],
        [0, 0, side * 0.3],
      );
      const antler = group(head, `Antler${side}`, side * 0.24, 0.35, 0.04);
      const horn = mat('antler', kind === 'moose' ? 0xb9a078 : 0xc7ad82);
      if (kind === 'moose') {
        ell(
          antler,
          horn,
          `Palm${side}`,
          [side * 0.5, 0.43, 0],
          [0.44, 0.16, 0.25],
          [0, 0, side * 0.3],
        );
        for (let i = 0; i < 4; i++)
          tip(
            antler,
            horn,
            `Tine${side}_${i}`,
            [side * (0.2 + i * 0.22), 0.66 + (i % 2) * 0.09, 0],
            [0.065, 0.31, 0.07],
          );
      } else {
        stick(antler, horn, `Beam${side}`, [0, 0, 0], [side * 0.3, 0.78, 0], 0.045);
        for (let i = 0; i < 3; i++)
          stick(
            antler,
            horn,
            `Tine${side}_${i}`,
            [side * (0.1 + i * 0.09), 0.28 + i * 0.2, 0],
            [side * (0.3 + i * 0.1), 0.48 + i * 0.2, -0.1],
            0.027,
          );
      }
    } else mini(head, base, `Ear${side}`, [side * 0.22, 0.24, 0.08], [0.11, 0.13, 0.09]);
  }
  mini(head, dark, 'Nose', [0, -0.12, kind === 'moose' ? -0.91 : -0.51], [0.065, 0.045, 0.055]);
  if (kind === 'beaver')
    for (const side of [-1, 1])
      ell(head, pale(0xfff7df), `Tooth${side}`, [side * 0.075, -0.25, -0.48], [0.07, 0.12, 0.06]);
  if (kind === 'hedgehog')
    for (let i = 0; i < 42; i++) {
      const angle = i * 2.399,
        forward = (i % 7) / 7,
        x = Math.sin(angle) * 0.34,
        z = -0.33 + forward * 0.8;
      tip(visual, dark, `Spine${i}`, [x, 0.61, z], [0.07, 0.37, 0.07], [z * 0.5, 0, -x * 0.8]);
    }
  if (kind === 'squirrel') {
    const tail = group(visual, 'Tail', 0, 0.54, 0.38);
    ell(tail, base, 'TailFur', [0, 0.47, 0.35], [0.25, 0.62, 0.32], [0.4, 0, 0]);
    ell(tail, light, 'TailTip', [0, 1.0, 0.48], [0.2, 0.2, 0.21]);
  } else if (kind === 'beaver') ell(visual, dark, 'Paddle', [0, 0.2, 0.97], [0.3, 0.07, 0.63]);
  else mini(visual, light, 'Tail', [0, by + 0.08, bl + 0.04], [0.16, 0.15, 0.18]);
  const legY =
    kind === 'moose'
      ? 1.2
      : kind === 'deer'
        ? 0.91
        : kind === 'squirrel'
          ? 0.3
          : kind === 'beaver'
            ? 0.31
            : 0.23;
  const legLen =
    kind === 'moose'
      ? 1.1
      : kind === 'deer'
        ? 0.82
        : kind === 'squirrel'
          ? 0.26
          : kind === 'beaver'
            ? 0.26
            : 0.17;
  for (const side of [-1, 1])
    for (const back of [false, true]) {
      const name = `Leg${back ? 'B' : 'F'}${side < 0 ? 'L' : 'R'}`;
      const leg = group(visual, name, side * bw * 0.72, legY, back ? bl * 0.58 : -bl * 0.58);
      ell(
        leg,
        base,
        `${name}Limb`,
        [0, -legLen * 0.48, 0],
        [kind === 'moose' ? 0.16 : 0.11, legLen * 0.55, kind === 'moose' ? 0.17 : 0.12],
      );
      ell(
        leg,
        kind === 'deer' || kind === 'moose' ? dark : base,
        `${name}Foot`,
        [0, -legLen, -0.07],
        [0.14, 0.07, 0.18],
      );
    }
  return root;
}
function nest() {
  const root = group(new THREE.Group(), 'nest'),
    straw = mat('straw', 0xc1a174),
    twigs = mat('twig', 0x74553b),
    fluff = pale(0xe6dcc7);
  ell(root, straw, 'Bowl', [0, 0.08, 0], [0.85, 0.16, 0.72]);
  ell(root, fluff, 'Lining', [0, 0.16, 0], [0.56, 0.09, 0.48]);
  for (let i = 0; i < 22; i++) {
    const a = (i * Math.PI * 2) / 22,
      r = 0.64 + (i % 3) * 0.05;
    stick(
      root,
      i % 4 ? straw : twigs,
      `Strand${i}`,
      [Math.cos(a) * r, 0.2, Math.sin(a) * r * 0.82],
      [Math.cos(a + 0.5) * r, 0.23, Math.sin(a + 0.5) * r * 0.82],
      0.023,
    );
  }
  for (let i = 0; i < 9; i++)
    mini(
      root,
      fluff,
      `Fluff${i}`,
      [Math.sin(i * 2.4) * 0.4, 0.23, Math.cos(i * 2.4) * 0.33],
      [0.08, 0.04, 0.08],
    );
  return root;
}
function stash() {
  const root = group(new THREE.Group(), 'stash'),
    twigs = mat('twig', 0x75553b),
    straw = mat('straw', 0xba955f),
    food = mat('carrot', 0xd28e4c);
  ell(root, straw, 'Pile', [0, 0.11, 0], [0.55, 0.15, 0.45]);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4;
    stick(
      root,
      twigs,
      `Twig${i}`,
      [Math.sin(a) * 0.4, 0.14, Math.cos(a) * 0.3],
      [Math.sin(a + 0.7) * 0.47, 0.28, Math.cos(a + 0.7) * 0.4],
      0.03,
    );
  }
  for (let i = 0; i < 4; i++)
    ell(
      root,
      food,
      `Food${i}`,
      [Math.sin(i * 2) * 0.24, 0.26, Math.cos(i * 2) * 0.18],
      [0.12, 0.1, 0.15],
    );
  return root;
}
function branchItem() {
  const root = group(new THREE.Group(), 'branch'),
    wood = mat('twig', 0x775338),
    bud = mat('leaf_branch', 0x77955b);
  stick(root, wood, 'Stem', [-0.38, 0.05, 0], [0.42, 0.08, 0], 0.052);
  stick(root, wood, 'Fork', [0.12, 0.07, 0], [0.34, 0.21, 0.2], 0.029);
  stick(root, wood, 'ForkSmall', [-0.18, 0.06, 0], [-0.3, 0.16, -0.15], 0.022);
  mini(root, bud, 'Bud', [0.35, 0.21, 0.2], [0.06, 0.035, 0.04]);
  return root;
}
function grassItem() {
  const root = group(new THREE.Group(), 'grass_bundle'),
    green = mat('leaf_grass', 0x77a45e),
    straw = mat('straw', 0xb7a176);
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4,
      x = Math.sin(a) * 0.18,
      z = Math.cos(a) * 0.13;
    ell(
      root,
      i % 4 ? green : straw,
      `Blade${i}`,
      [x, 0.13 + (i % 3) * 0.035, z],
      [0.045, 0.22, 0.035],
      [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4],
    );
  }
  return root;
}
function twigsItem() {
  const root = group(new THREE.Group(), 'twig_bundle'),
    wood = mat('twig', 0x75543c);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      x = Math.sin(a) * 0.13,
      z = Math.cos(a) * 0.12;
    stick(root, wood, `Twig${i}`, [x - 0.21, 0.07, z], [x + 0.23, 0.1, z + 0.08], 0.022);
  }
  return root;
}
function furItem() {
  const root = group(new THREE.Group(), 'fur_tuft'),
    fluff = pale(0xe9dfd0);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4,
      r = 0.06 + (i % 3) * 0.05;
    ell(
      root,
      fluff,
      `Tuft${i}`,
      [Math.cos(a) * r, 0.11 + (i % 4) * 0.027, Math.sin(a) * r],
      [0.1, 0.065, 0.1],
    );
  }
  return root;
}
function oak() {
  const root = group(new THREE.Group(), 'oak');
  const bark = treeBarkMaterial('oak');
  const trunkHeight = 5.9;
  const leaves = new THREE.MeshStandardMaterial({
    name: 'leaf_oak_cards',
    color: 0x6e9b60,
    roughness: 1,
    alphaTest: 0.48,
    side: THREE.DoubleSide,
  });
  const card = new THREE.PlaneGeometry(1, 1);
  const cluster = (crown: THREE.Group, center: VectorTuple, size: number, phase: number) => {
    for (let i = 0; i < 3; i++) {
      mesh(
        crown,
        card,
        leaves,
        'OakLeafCard',
        center,
        [size, size * 0.88, 1],
        [i === 0 ? 0.15 : i === 1 ? 0.78 : -0.63, phase + (i * Math.PI) / 3, phase * 0.45],
      );
    }
  };
  root.add(new THREE.Mesh(createTreeTrunk('oak', trunkHeight, 0.44), bark));
  const crown = group(root, 'Foliage');
  cluster(crown, [0, 7.65, 0], 3.4, 0.4);
  cluster(crown, [0.25, 7.1, 0.25], 3.5, 1.1);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4,
      x = Math.cos(a) * 1.38,
      z = Math.sin(a) * 1.34;
    const [trunkX, trunkZ] = trunkCenter('oak', 4.8 / trunkHeight);
    stick(root, bark, `Branch${i}`, [trunkX, 4.8, trunkZ], [x, 6.45, z], 0.115);
    cluster(crown, [x, 6.78 + (i % 3) * 0.28, z], 2.6, a);
  }
  const litter = group(root, 'Litter');
  for (let i = 0; i < 18; i++) {
    const a = i * 2.399,
      r = 0.6 + (i % 5) * 0.39;
    ell(
      litter,
      mat('fallen_leaf', i % 3 ? 0xc5a061 : 0xb77846),
      `Leaf${i}`,
      [Math.cos(a) * r, 0.035, Math.sin(a) * r],
      [0.14, 0.018, 0.07],
      [0, a, 0],
    );
  }
  return root;
}
function fern() {
  const root = group(new THREE.Group(), 'fern'),
    green = mat('leaf_fern', 0x4e8054);
  green.side = THREE.DoubleSide;
  const blade = new THREE.BufferGeometry();
  blade.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.12, 0, 0, 0, 0.025, -0.055, 0.12, 0, 0, 0, -0.015, 0.055],
      3,
    ),
  );
  blade.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 0.5, 0, 1, 0.5, 0.5, 1], 2));
  blade.setIndex([0, 1, 2, 0, 2, 3]);
  blade.computeVertexNormals();
  for (let i = 0; i < 9; i++) {
    const a = (i * Math.PI * 2) / 9;
    const pivot = group(root, `Frond${i}`);
    stick(
      pivot,
      green,
      `Stem${i}`,
      [0, 0.04, 0],
      [Math.cos(a) * 0.57, 0.66, Math.sin(a) * 0.57],
      0.018,
    );
    for (let j = 0; j < 6; j++) {
      const t = (j + 1) / 7,
        x = Math.cos(a) * 0.57 * t,
        z = Math.sin(a) * 0.57 * t,
        y = 0.04 + 0.62 * t;
      for (const side of [-1, 1])
        mesh(
          pivot,
          blade,
          green,
          `Leaflet${i}_${j}_${side}`,
          [x + Math.sin(a) * side * 0.13 * (1 - t), y, z - Math.cos(a) * side * 0.13 * (1 - t)],
          [1 - t * 0.5, 1, 1],
          [0, a, 0],
        );
    }
  }
  return root;
}
function reed() {
  const root = group(new THREE.Group(), 'reed'),
    green = mat('leaf_reed', 0x78975d),
    seed = mat('reed_seed', 0x8e7453);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      r = 0.08 + (i % 3) * 0.13,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r,
      h = 0.76 + (i % 4) * 0.17;
    stick(root, green, `Stalk${i}`, [x, 0, z], [x + 0.1, h, z], 0.021);
    ell(root, seed, `Seed${i}`, [x + 0.1, h + 0.12, z], [0.045, 0.17, 0.045]);
  }
  return root;
}
function bush() {
  const root = group(new THREE.Group(), 'bush'),
    green = mat('leaf_bush', 0x568653),
    darkGreen = mat('leaf_bush_dark', 0x3f7148);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      x = Math.cos(a) * 0.38,
      z = Math.sin(a) * 0.35;
    ell(
      root,
      i % 2 ? green : darkGreen,
      `Clump${i}`,
      [x, 0.32 + (i % 3) * 0.08, z],
      [0.38, 0.32, 0.35],
    );
  }
  for (let i = 0; i < 5; i++)
    mini(
      root,
      mat('flower', 0xe9c9d4),
      `Blossom${i}`,
      [Math.cos(i * 2.4) * 0.4, 0.61, Math.sin(i * 2.4) * 0.37],
      [0.055, 0.045, 0.055],
    );
  return root;
}
function foodPlant(kind) {
  const root = group(new THREE.Group(), kind),
    green = mat('leaf_food', 0x54904d),
    darkGreen = mat('leaf_food_dark', 0x407349);
  if (kind === 'carrot') {
    tip(
      root,
      mat('root_carrot', 0xe2924d),
      'Root',
      [0, 0.04, 0],
      [0.16, 0.49, 0.16],
      [Math.PI, 0, 0],
    );
    for (let i = -2; i <= 2; i++) {
      const leaf = ell(
        root,
        green,
        `Leaf${i}`,
        [i * 0.085, 0.53, 0],
        [0.08, 0.34, 0.045],
        [0, 0, -i * 0.23],
      );
      leaf.rotation.y = i * 0.2;
    }
  } else if (kind === 'cabbage') {
    ell(root, green, 'Heart', [0, 0.23, 0], [0.31, 0.28, 0.31]);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ell(
        root,
        i % 2 ? green : darkGreen,
        `Leaf${i}`,
        [Math.cos(a) * 0.22, 0.22, Math.sin(a) * 0.22],
        [0.23, 0.16, 0.19],
        [0.17 * Math.sin(a), a, 0.17 * Math.cos(a)],
      );
    }
  } else if (kind === 'mushroom' || kind === 'toadstool') {
    stick(root, pale(0xe8dbc4), 'Stem', [0, 0, 0], [0, 0.39, 0], 0.075);
    ell(
      root,
      mat('cap', kind === 'toadstool' ? 0xb94f4a : 0x98735c),
      'Cap',
      [0, 0.39, 0],
      [0.28, 0.13, 0.28],
    );
    if (kind === 'toadstool')
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        mini(
          root,
          pale(0xf9eadb),
          `Spot${i}`,
          [Math.cos(a) * 0.17, 0.485, Math.sin(a) * 0.17],
          [0.04, 0.015, 0.04],
        );
      }
  } else if (kind === 'berries') {
    ell(root, darkGreen, 'Bush', [0, 0.25, 0], [0.35, 0.28, 0.32]);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      mini(
        root,
        mat('berry', 0x73508d),
        `Berry${i}`,
        [Math.cos(a) * 0.24, 0.36 + (i % 3) * 0.05, Math.sin(a) * 0.2],
        [0.065, 0.065, 0.065],
      );
    }
  } else if (kind === 'acorn') {
    ell(root, mat('acorn', 0x93623f), 'Nut', [0, 0.15, 0], [0.17, 0.2, 0.16]);
    ell(root, mat('acorn_cap', 0x654936), 'Cap', [0, 0.28, 0], [0.18, 0.07, 0.17]);
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ell(
        root,
        kind === 'bitterleaf' ? mat('leaf_bitter', 0x74816a) : green,
        `Leaf${i}`,
        [Math.cos(a) * 0.17, 0.14, Math.sin(a) * 0.17],
        [0.18, 0.045, 0.11],
        [0, a, 0],
      );
    }
    mini(
      root,
      mat('flower', kind === 'bitterleaf' ? 0x947b9e : 0xece2d5),
      'Flower',
      [0, 0.2, 0],
      [0.075, 0.075, 0.075],
    );
  }
  return root;
}

const q = (x = 0, y = 0, z = 0) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
function rotation(name, frames) {
  return new THREE.QuaternionKeyframeTrack(
    `${name}.quaternion`,
    [0, 0.25, 0.5, 0.75, 1],
    frames.flatMap((v) => q(...v)),
  );
}
function position(name, frames, base = [0, 0, 0]) {
  return new THREE.VectorKeyframeTrack(
    `${name}.position`,
    [0, 0.25, 0.5, 0.75, 1],
    frames.flatMap((v) => [base[0] + v[0], base[1] + v[1], base[2] + v[2]]),
  );
}
function sequence(a, b = 0) {
  return [
    [a, b, 0],
    [0, b, 0],
    [-a, b, 0],
    [0, b, 0],
    [a, b, 0],
  ];
}
const pose = (x, y = 0, z = 0) => [
  [x, y, z],
  [x, y, z],
  [x, y, z],
  [x, y, z],
  [x, y, z],
];
function rabbitClips(root) {
  const clips = [];
  const make = (name, tracks, duration = 1) =>
    clips.push(new THREE.AnimationClip(name, duration, tracks));
  const paw = (amplitude, phase = 1) =>
    ['PawFL', 'PawFR', 'PawBL', 'PawBR'].map((n, i) =>
      rotation(n, sequence(amplitude * (i % 2 ? 1 : -1) * (i < 2 ? 1 : phase))),
    );
  const head = (v) => rotation('Head', sequence(v));
  make('idle', [
    head(0.035),
    rotation('EarL', sequence(0.03)),
    rotation('EarR', sequence(-0.04)),
    position('Visual', [
      [0, 0, 0],
      [0, 0.012, 0],
      [0, 0.025, 0],
      [0, 0.012, 0],
      [0, 0, 0],
    ]),
  ]);
  clips.push(...(['hop', 'run', 'jump'] as const).map((name) => rabbitLocomotion(root, name)));
  make(
    'dig',
    [
      rotation('Head', pose(0.24)),
      rotation('PawFL', [
        [0.8, 0, 0],
        [-0.6, 0, 0],
        [0.8, 0, 0],
        [-0.6, 0, 0],
        [0.8, 0, 0],
      ]),
      rotation('PawFR', [
        [-0.6, 0, 0],
        [0.8, 0, 0],
        [-0.6, 0, 0],
        [0.8, 0, 0],
        [-0.6, 0, 0],
      ]),
      position('Visual', [
        [0, -0.08, 0],
        [0, -0.11, 0],
        [0, -0.08, 0],
        [0, -0.11, 0],
        [0, -0.08, 0],
      ]),
    ],
    0.65,
  );
  make('eat', [
    rotation('Head', [
      [0.34, 0, 0],
      [0.42, 0, 0],
      [0.36, 0, 0],
      [0.43, 0, 0],
      [0.34, 0, 0],
    ]),
    rotation('PawFL', pose(-0.32)),
    rotation('PawFR', pose(-0.32)),
  ]);
  make('groom', [
    rotation('Head', [
      [0.2, -0.35, 0],
      [0.37, 0.25, 0],
      [0.2, -0.35, 0],
      [0.37, 0.25, 0],
      [0.2, -0.35, 0],
    ]),
    rotation('PawFL', sequence(-0.65)),
    rotation('PawFR', sequence(0.65)),
  ]);
  make('lie', [
    position('Visual', [
      [0, -0.17, 0],
      [0, -0.17, 0],
      [0, -0.16, 0],
      [0, -0.17, 0],
      [0, -0.17, 0],
    ]),
    rotation('Head', pose(0.1)),
  ]);
  make('sit', [
    position('Visual', [
      [0, -0.08, 0],
      [0, -0.08, 0],
      [0, -0.07, 0],
      [0, -0.08, 0],
      [0, -0.08, 0],
    ]),
    rotation('Head', pose(-0.12)),
  ]);
  make('mate', [
    position('Visual', [
      [0, 0.18, 0],
      [0, 0.22, 0],
      [0, 0.18, 0],
      [0, 0.22, 0],
      [0, 0.18, 0],
    ]),
    ...paw(0.24),
  ]);
  make('defecate', [
    position('Visual', [
      [0, -0.06, 0],
      [0, -0.08, 0],
      [0, -0.06, 0],
      [0, -0.08, 0],
      [0, -0.06, 0],
    ]),
    rotation('PawBL', pose(0.3)),
    rotation('PawBR', pose(0.3)),
  ]);
  make('pluck', [
    rotation('Head', pose(-0.27, 0.48)),
    rotation('PawFL', sequence(-0.48)),
    rotation('PawFR', sequence(0.48)),
  ]);
  make('nurse', [
    position('Visual', [
      [0, -0.15, 0],
      [0, -0.16, 0],
      [0, -0.15, 0],
      [0, -0.16, 0],
      [0, -0.15, 0],
    ]),
    rotation('Head', pose(0.08)),
  ]);
  return clips;
}
function quadrupedClips(kind, root) {
  const clips = [];
  const gait = (name, duration) => quadrupedGait(root, name, duration, kind);
  clips.push(
    new THREE.AnimationClip('idle', 1, [
      rotation('Head', sequence(0.03)),
      rotation('Tail', sequence(0.08)),
    ]),
  );
  clips.push(gait('walk', 1.1), gait('run', 0.62));
  clips.push(
    new THREE.AnimationClip('attack', 0.6, [
      rotation('Head', [
        [0, 0, 0],
        [0.25, 0, 0],
        [-0.25, 0, 0],
        [0.2, 0, 0],
        [0, 0, 0],
      ]),
    ]),
  );
  return clips;
}
function snakeClips() {
  const clips = ['idle', 'walk', 'run'].map(
    (name, index) =>
      new THREE.AnimationClip(name, index === 2 ? 0.65 : 1.2, [
        ...Array.from({ length: 9 }, (_, i) =>
          rotation(
            `Segment${i}`,
            sequence((index === 0 ? 0.04 : 0.15) * (i % 2 ? 1 : -1), Math.sin(i) * 0.08),
          ),
        ),
        rotation('Head', sequence(index === 0 ? 0.03 : 0.11)),
      ]),
  );
  clips.push(
    new THREE.AnimationClip('attack', 0.5, [
      position(
        'Head',
        [
          [0, 0, 0],
          [0, 0.04, -0.19],
          [0, 0.03, -0.32],
          [0, 0.04, -0.19],
          [0, 0, 0],
        ],
        [0, 0.21, -1.14],
      ),
      rotation('Head', [
        [0, 0, 0],
        [-0.22, 0, 0],
        [0.16, 0, 0],
        [-0.12, 0, 0],
        [0, 0, 0],
      ]),
    ]),
  );
  return clips;
}
function hawkClips() {
  const clips = ['glide', 'flap'].map(
    (name, index) =>
      new THREE.AnimationClip(name, index ? 0.72 : 1.6, [
        rotation('WingL', sequence(index ? 0.47 : 0.06)),
        rotation('WingR', sequence(index ? -0.47 : -0.06)),
        rotation('Head', sequence(0.025)),
      ]),
  );
  clips.push(
    new THREE.AnimationClip('strike', 0.6, [
      rotation('WingL', pose(-0.52)),
      rotation('WingR', pose(0.52)),
      rotation('Head', pose(0.21)),
    ]),
  );
  return clips;
}
function peacefulClips(kind, root) {
  const legs = ['LegFL', 'LegFR', 'LegBL', 'LegBR'];
  const tail = kind === 'squirrel' ? 'Tail' : undefined;
  return ['idle', 'walk', 'run', 'graze'].map((name, index) => {
    if (name === 'walk' || name === 'run')
      return quadrupedGait(root, name, name === 'run' ? 0.65 : 1, kind);
    return new THREE.AnimationClip(name, [1.2, 1, 0.65, 1.1][index], [
      rotation(
        'Head',
        index === 3
          ? [
              [0.18, 0, 0],
              [0.28, 0, 0],
              [0.2, 0, 0],
              [0.3, 0, 0],
              [0.18, 0, 0],
            ]
          : sequence(0.035),
      ),
      ...legs.map((name) => rotation(name, sequence(0))),
      ...(tail ? [rotation(tail, sequence(0.08))] : []),
    ]);
  });
}

function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function texture(name, base) {
  const width = 64,
    height = 64,
    raw = Buffer.alloc(height * (width * 4 + 1));
  let seed = 31857 + base;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (width * 4 + 1) + 1 + x * 4,
        v = Math.round(base + rand() * 22 + Math.sin(x * 0.65 + y * 0.18) * 5);
      raw[i] = Math.min(255, v);
      raw[i + 1] = Math.min(255, v - 2);
      raw[i + 2] = Math.min(255, v - 5);
      raw[i + 3] = 255;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/textures/${name}.png`,
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
function terrainTexture(name, soil = false) {
  const width = 128,
    height = 128,
    raw = Buffer.alloc(height * (width * 4 + 1));
  let seed = soil ? 72091 : 44017;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const flecks = Array.from({ length: soil ? 160 : 125 }, () => ({
    x: Math.floor(random() * width),
    y: Math.floor(random() * height),
    r: 1 + Math.floor(random() * 4),
  }));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const variation =
        Math.sin(((x * Math.PI * 2) / width) * 3 + ((y * Math.PI * 2) / height) * 2) * 7 +
        Math.sin(((x * Math.PI * 2) / width) * 7 - ((y * Math.PI * 2) / height) * 5) * 5;
      let v = 225 + variation + (random() - 0.5) * 22;
      for (const f of flecks) {
        const dx = Math.min(Math.abs(x - f.x), width - Math.abs(x - f.x)),
          dy = Math.min(Math.abs(y - f.y), height - Math.abs(y - f.y));
        if (dx * dx + dy * dy < f.r * f.r) v -= soil ? 32 : 20;
      }
      const i = y * (width * 4 + 1) + 1 + x * 4;
      raw[i] = Math.max(165, Math.min(255, v));
      raw[i + 1] = Math.max(165, Math.min(255, v + (soil ? 1 : 3)));
      raw[i + 2] = Math.max(165, Math.min(255, v - (soil ? 3 : 1)));
      raw[i + 3] = 255;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/textures/${name}.png`,
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
function writeTreeTexture(name: string, size: number, pixels: Buffer): void {
  const stride = size * 4;
  const rows = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++)
    pixels.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/textures/${name}.png`,
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
mkdirSync('public/models', { recursive: true });
mkdirSync('public/textures', { recursive: true });
const requested = new Set(process.argv.slice(2).filter((name) => name !== '--'));
if (!requested.size) {
  texture('fur', 222);
  texture('leaf', 210);
  terrainTexture('ground');
  terrainTexture('soil', true);
}
for (const species of TREE_SPECIES) {
  if (requested.size && !requested.has(species)) continue;
  const foliage = species === 'oak' ? oakFoliagePixels() : treeFoliagePixels(species);
  writeTreeTexture(`${species}-foliage`, OAK_FOLIAGE_SIZE, foliage);
  writeTreeTexture(`${species}-bark`, TREE_BARK_SIZE, treeBarkPixels(species));
}
const models = {
  pike: () => createPikeModel(),
  boar: () => createBoarModel(),
  'jumping-spider': () => createSpiderModel(false, true),
  spider: () => createSpiderModel(),
  rock_granite: () => createRockModel('granite'),
  rock_moss: () => createRockModel('moss'),
  rock_slate: () => createRockModel('slate'),
  rabbit,
  fox: () => quadruped('fox'),
  wolf: () => quadruped('wolf'),
  dog: () => quadruped('dog'),
  lynx: () => createLynxModel(),
  weasel: () => quadruped('weasel'),
  bear: () => quadruped('bear'),
  snake,
  hawk,
  deer: () => peaceful('deer'),
  squirrel: () => peaceful('squirrel'),
  hedgehog: () => peaceful('hedgehog'),
  beaver: () => peaceful('beaver'),
  moose: () => peaceful('moose'),
  nest,
  stash,
  branch: branchItem,
  grass_bundle: grassItem,
  twig_bundle: twigsItem,
  fur_tuft: furItem,
  oak,
  pine: () => createTreeModel('pine'),
  spruce: () => createTreeModel('spruce'),
  larch: () => createTreeModel('larch'),
  birch: () => createTreeModel('birch'),
  maple: () => createTreeModel('maple'),
  ash: () => createTreeModel('ash'),
  aspen: () => createTreeModel('aspen'),
  linden: () => createTreeModel('linden'),
  rowan: () => createTreeModel('rowan'),
  fern,
  reed,
  bush,
  carrot: () => foodPlant('carrot'),
  cabbage: () => foodPlant('cabbage'),
  mushroom: () => foodPlant('mushroom'),
  toadstool: () => foodPlant('toadstool'),
  berries: () => foodPlant('berries'),
  acorn: () => foodPlant('acorn'),
  clover: () => foodPlant('clover'),
  bitterleaf: () => foodPlant('bitterleaf'),
};
const creatures = new Set([
  'pike',
  'boar',
  'jumping-spider',
  'spider',
  'rabbit',
  'fox',
  'wolf',
  'dog',
  'lynx',
  'weasel',
  'bear',
  'snake',
  'hawk',
  'deer',
  'squirrel',
  'hedgehog',
  'beaver',
  'moose',
]);
function mergeParts(root, flatten = false) {
  // Bake rigid details into their pivot. Animated groups and seasonal groups remain intact.
  if (flatten) {
    root.updateMatrixWorld(true);
    const parts = [];
    root.traverse((object) => {
      if (object.isMesh) parts.push(object);
    });
    const inverse = root.matrixWorld.clone().invert();
    for (const part of parts) {
      const transform = inverse.clone().multiply(part.matrixWorld);
      part.removeFromParent();
      root.add(part);
      part.matrix.copy(transform);
      part.matrix.decompose(part.position, part.quaternion, part.scale);
    }
    for (const child of [...root.children]) if (!child.isMesh) root.remove(child);
  }
  for (const child of [...root.children]) if (!child.isMesh) mergeParts(child);
  const buckets = new Map();
  for (const child of root.children)
    if (child.isMesh) {
      const list = buckets.get(child.material) ?? [];
      list.push(child);
      buckets.set(child.material, list);
    }
  for (const [material, parts] of buckets) {
    if (parts.length < 2) continue;
    const geometries = parts.map((part) => {
      part.updateMatrix();
      return part.geometry.clone().applyMatrix4(part.matrix);
    });
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error('Cannot merge ' + root.name);
    const combined = new THREE.Mesh(geometry, material);
    combined.name = parts[0].name;
    root.add(combined);
    parts.forEach((part) => root.remove(part));
    geometries.forEach((g) => g.dispose());
  }
}
for (const [name, build] of Object.entries(models)) {
  if (requested.size && !requested.has(name)) continue;
  sphere = new THREE.SphereGeometry(1, creatures.has(name) ? 16 : 8, creatures.has(name) ? 12 : 5);
  smallSphere = new THREE.SphereGeometry(
    1,
    creatures.has(name) ? 10 : 6,
    creatures.has(name) ? 8 : 4,
  );
  const model = build();
  const animations =
    name === 'pike'
      ? pikeClips()
      : name === 'spider' || name === 'jumping-spider'
        ? [...spiderClips(), ...(name === 'jumping-spider' ? [spiderJumpClip()] : [])]
        : name === 'rabbit'
          ? rabbitClips(model)
          : ['fox', 'wolf', 'dog', 'lynx', 'weasel', 'bear'].includes(name)
            ? [...quadrupedClips(name, model), ...(name === 'lynx' ? [lynxPounceClip()] : [])]
            : name === 'snake'
              ? snakeClips()
              : name === 'hawk'
                ? hawkClips()
                : ['deer', 'squirrel', 'hedgehog', 'beaver', 'moose', 'boar'].includes(name)
                  ? peacefulClips(name, model)
                  : [];
  if (SWIMMING_MODELS.has(name)) animations.push(swimmingClip(model, name));
  mergeParts(model, !creatures.has(name) && !isTreeSpecies(name));
  const buffer = (await new GLTFExporter().parseAsync(model, {
    binary: true,
    animations,
  })) as ArrayBuffer;
  writeFileSync(`public/models/${name}.glb`, Buffer.from(buffer));
  console.log(
    name,
    Math.round(buffer.byteLength / 1024) + ' KiB',
    animations.map((a) => a.name).join(','),
  );
  if (creatures.has(name)) {
    sphere = new THREE.SphereGeometry(1, 8, 5);
    smallSphere = new THREE.SphereGeometry(1, 6, 4);
    const arachnid = name === 'spider' || name === 'jumping-spider';
    const distant =
      name === 'pike'
        ? createPikeModel(true)
        : name === 'boar'
          ? createBoarModel(true)
          : arachnid
            ? createSpiderModel(true, name === 'jumping-spider')
            : name === 'lynx'
              ? createLynxModel(true)
              : build();
    mergeParts(distant, arachnid);
    const lod = (await new GLTFExporter().parseAsync(distant, {
      binary: true,
      animations: arachnid
        ? [...spiderLowClips(), ...(name === 'jumping-spider' ? [spiderJumpClip(true)] : [])]
        : animations,
    })) as ArrayBuffer;
    writeFileSync(`public/models/${name}-low.glb`, Buffer.from(lod));
  }
}
