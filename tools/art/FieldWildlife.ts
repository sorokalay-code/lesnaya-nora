import * as THREE from 'three';
import { quadrupedGait } from './Locomotion';

export type FieldModel = 'badger' | 'mole' | 'marmot' | 'pheasant' | 'chipmunk' | 'owl';
type Point = readonly [number, number, number];

function part(parent: THREE.Object3D, name: string, point: Point = [0, 0, 0]): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...point);
  parent.add(group);
  return group;
}

function shapes(low: boolean) {
  const sphere = new THREE.SphereGeometry(1, low ? 7 : 13, low ? 5 : 9);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  return (
    parent: THREE.Object3D,
    name: string,
    color: number,
    point: Point,
    size: Point,
    tilt = 0,
  ) => {
    const key = `${color}:${/eye|beak|claw/i.test(name) ? name : 'body'}`;
    let material = materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ name, color, roughness: 0.87 });
      materials.set(key, material);
    }
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.set(...point);
    mesh.scale.set(...size);
    mesh.rotation.x = tilt;
    parent.add(mesh);
    return mesh;
  };
}

const MAMMALS = {
  badger: {
    back: 0x787771,
    dark: 0x312e2d,
    light: 0xe4dfce,
    width: 0.34,
    height: 0.31,
    length: 0.6,
  },
  mole: {
    back: 0x484751,
    dark: 0x302e36,
    light: 0xd78c83,
    width: 0.165,
    height: 0.145,
    length: 0.29,
  },
  marmot: {
    back: 0xb78b57,
    dark: 0x63412f,
    light: 0xe4bc7e,
    width: 0.26,
    height: 0.27,
    length: 0.45,
  },
  chipmunk: {
    back: 0xb77b46,
    dark: 0x452c24,
    light: 0xf7e1b6,
    width: 0.133,
    height: 0.16,
    length: 0.25,
  },
} as const;

export function createFieldModel(kind: FieldModel, low = false): THREE.Group {
  const root = part(new THREE.Group(), kind);
  const v = part(root, 'Visual');
  const ell = shapes(low);
  if (kind === 'owl') {
    const brown = 0x75604f;
    const ivory = 0xe1c7a3;
    ell(v, 'Mantle', brown, [0, 0, 0], [0.37, 0.29, 0.62]);
    ell(v, 'Breast', ivory, [0, -0.13, -0.15], [0.33, 0.22, 0.45]);
    const head = part(v, 'Head', [0, 0.16, -0.43]);
    ell(head, 'Rounded skull', brown, [0, 0, 0], [0.36, 0.32, 0.31]);
    for (const side of [-1, 1]) {
      const x = side * 0.154;
      ell(head, 'Facial disc', 0xe6d7bc, [x, 0.015, -0.25], [0.185, 0.23, 0.086]);
      ell(head, 'Dark rim', 0x4c392f, [x, 0.045, -0.308], [0.102, 0.105, 0.041]);
      ell(head, 'Gold eye', 0xf7b451, [x, 0.047, -0.338], [0.081, 0.086, 0.024]);
      ell(head, 'Pupil', 0x171719, [x, 0.047, -0.358], [0.049, 0.057, 0.014]);
      const wing = part(v, side < 0 ? 'WingL' : 'WingR', [side * 0.27, 0.035, 0.04]);
      ell(wing, 'Broad wing', brown, [side * 0.62, 0, 0.12], [0.79, 0.078, 0.335]);
      const featherCount = low ? 4 : 7;
      for (let i = 0; i < featherCount; i++) {
        const t = i / (featherCount - 1);
        ell(
          wing,
          'Flight feather',
          i % 2 ? 0x514236 : 0x9d8468,
          [side * (0.32 + t * 0.96), -0.024, 0.36 - t * 0.13],
          [0.19, 0.043, 0.31 - t * 0.08],
        ).rotation.y = side * (0.22 + t * 0.27);
      }
      ell(v, 'Claw', 0x493c30, [side * 0.16, -0.28, -0.12], [0.07, 0.09, 0.14]);
    }
    ell(head, 'Beak', 0x7c553b, [0, -0.085, -0.329], [0.078, 0.085, 0.1], 0.35);
    ell(v, 'Tail', 0x59493d, [0, -0.025, 0.59], [0.3, 0.065, 0.35]);
    return root;
  }

  if (kind === 'pheasant') {
    const copper = 0xaa5734;
    ell(v, 'Copper body', copper, [0, 0.43, 0.02], [0.25, 0.24, 0.43], -0.18);
    for (const side of [-1, 1]) {
      ell(v, 'Mottled wing', 0x805637, [side * 0.195, 0.47, 0.12], [0.092, 0.146, 0.35], 0.14);
      const leg = part(v, side < 0 ? 'LegFL' : 'LegFR', [side * 0.105, 0.28, 0.05]);
      ell(leg, 'Shin', 0x9b8866, [0, -0.12, 0], [0.027, 0.14, 0.03], -0.14);
      ell(leg, 'Toes', 0xa59474, [0, -0.255, -0.07], [0.045, 0.026, 0.105]);
    }
    ell(v, 'Green neck', 0x295f4d, [0, 0.6, -0.25], [0.13, 0.27, 0.15], 0.33);
    ell(v, 'White collar', 0xe9e4d7, [0, 0.56, -0.246], [0.138, 0.048, 0.144], -0.16);
    const head = part(v, 'Head', [0, 0.78, -0.35]);
    ell(head, 'Green head', 0x286d58, [0, 0, 0], [0.129, 0.135, 0.166]);
    for (const side of [-1, 1]) {
      ell(head, 'Red face', 0xb63d31, [side * 0.096, 0.014, -0.069], [0.048, 0.074, 0.084]);
      ell(head, 'Eye', 0x191411, [side * 0.13, 0.031, -0.079], [0.021, 0.021, 0.021]);
    }
    ell(head, 'Beak', 0xceb37e, [0, -0.035, -0.163], [0.051, 0.043, 0.106]);
    const tail = part(v, 'Tail', [0, 0.45, 0.29]);
    ell(tail, 'Long central feathers', 0xa47c45, [0, 0.12, 0.42], [0.106, 0.036, 0.57], -0.28);
    const bars = low ? 3 : 7;
    for (let i = 0; i < bars; i++) {
      const t = i / bars;
      ell(
        tail,
        'Tail bars',
        0x68472f,
        [0, 0.08 + t * 0.15, 0.26 + t * 0.65],
        [0.102 - t * 0.038, 0.024, 0.042],
        -0.28,
      );
    }
    return root;
  }

  const { back, dark, light, width, height, length } = MAMMALS[kind];
  const shoulder = height + width * 0.26;
  ell(v, 'Coat', back, [0, shoulder, 0], [width, height, length]);
  ell(
    v,
    'Flank',
    kind === 'badger' ? dark : back,
    [0, shoulder * 0.63, -length * 0.1],
    [width * 0.91, height * 0.59, length * 0.84],
  );
  const head = part(v, 'Head', [0, shoulder, -length * 0.83]);
  ell(
    head,
    'Skull',
    kind === 'badger' ? light : back,
    [0, 0, -length * 0.06],
    [width * 0.65, height * 0.64, length * 0.49],
  );
  ell(
    head,
    'Muzzle',
    kind === 'mole' ? 0x68575e : light,
    [0, -height * 0.16, -length * 0.39],
    [width * 0.47, height * 0.36, length * (kind === 'mole' ? 0.54 : 0.32)],
    -0.18,
  );
  ell(
    head,
    'Nose',
    kind === 'mole' ? light : dark,
    [0, -height * 0.31, -length * 0.69],
    [width * 0.29, height * 0.21, length * 0.13],
  );
  for (const side of [-1, 1]) {
    if (kind !== 'mole') {
      ell(
        head,
        'Rounded ear',
        dark,
        [side * width * 0.47, height * 0.51, length * 0.12],
        [width * 0.28, height * 0.38, length * 0.13],
      );
    }
    if (kind === 'badger') {
      ell(
        head,
        'Face stripe',
        dark,
        [side * width * 0.42, height * 0.115, -length * 0.16],
        [width * 0.19, height * 0.28, length * 0.46],
        -0.24,
      ).rotation.y = side * 0.21;
    }
    const eyeSize = kind === 'mole' ? 0.013 : kind === 'badger' ? 0.03 : 0.037;
    ell(
      head,
      'Eye',
      0x1c1516,
      [side * width * 0.54, height * 0.16, -length * 0.3],
      [eyeSize, eyeSize, eyeSize],
    );
    for (const front of [true, false]) {
      const name = `Leg${front ? 'F' : 'B'}${side < 0 ? 'L' : 'R'}`;
      const leg = part(v, name, [
        side * width * 0.58,
        shoulder * 0.61,
        length * (front ? -0.57 : 0.54),
      ]);
      const digging = kind === 'mole' && front;
      ell(
        leg,
        'Paw',
        digging ? light : dark,
        [0, -shoulder * 0.34, -length * 0.055],
        [width * (digging ? 0.6 : 0.32), shoulder * 0.3, length * (digging ? 0.33 : 0.21)],
      );
      if (digging) {
        for (let i = -1; i <= 1; i++)
          ell(
            leg,
            'Claw',
            0xf0c4ad,
            [i * 0.042, -shoulder * 0.48, -length * 0.31],
            [0.012, 0.014, 0.043],
          );
      }
    }
  }
  const tail = part(v, 'Tail', [0, shoulder, length * 0.78]);
  if (kind === 'chipmunk') {
    ell(tail, 'Raised tail', back, [0, 0.11, 0.11], [0.061, 0.074, 0.215], -0.83);
    for (const stripe of [-2, -1, 0, 1, 2]) {
      const x = stripe * 0.031;
      const points = [-0.19, -0.12, -0.035, 0.06, 0.145, 0.195].map(
        (z) =>
          new THREE.Vector3(
            x,
            shoulder + height * Math.sqrt(1 - (x / width) ** 2 - (z / length) ** 2),
            z,
          ),
      );
      const curve = new THREE.CatmullRomCurve3(points);
      const material = new THREE.MeshStandardMaterial({
        name: 'Dorsal stripe',
        color: stripe % 2 ? light : dark,
      });
      v.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, low ? 6 : 12, 0.014, low ? 4 : 6, false),
          material,
        ),
      );
    }
  } else {
    ell(
      tail,
      'Tail coat',
      kind === 'mole' ? light : dark,
      [0, -height * 0.14, length * 0.24],
      [width * 0.3, height * 0.25, length * (kind === 'marmot' ? 0.55 : 0.31)],
      0.17,
    );
  }

  return root;
}

export function fieldClips(
  kind: Exclude<FieldModel, 'owl'>,
  root: THREE.Object3D,
): THREE.AnimationClip[] {
  const rotation = (bone: string, axis: 'x' | 'y', time: number[], angles: number[]) =>
    new THREE.QuaternionKeyframeTrack(
      `${bone}.quaternion`,
      time,
      angles.flatMap((angle) =>
        new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(axis === 'x' ? angle : 0, axis === 'y' ? angle : 0, 0))
          .toArray(),
      ),
    );
  const moves = (['walk', 'run'] as const).map((name) => {
    const duration = name === 'walk' ? 0.86 : 0.48;
    if (kind !== 'pheasant') return quadrupedGait(root, name, duration, kind);
    const time = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration];
    const amplitude = name === 'walk' ? 0.4 : 0.68;
    return new THREE.AnimationClip(
      name,
      duration,
      ['LegFL', 'LegFR'].map((leg, i) =>
        rotation(
          leg,
          'x',
          time,
          [1, 0, -1, 0, 1].map((value) => value * amplitude * (i ? -1 : 1)),
        ),
      ),
    );
  });
  return [
    ...moves,
    new THREE.AnimationClip('idle', 1.6, [
      rotation('Head', 'y', [0, 0.8, 1.6], [-0.06, 0.06, -0.06]),
    ]),
    new THREE.AnimationClip('graze', 0.9, [
      rotation('Head', 'x', [0, 0.23, 0.6, 0.9], [0.1, -0.32, -0.23, 0.1]),
    ]),
  ];
}
