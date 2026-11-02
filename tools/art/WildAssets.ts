import * as THREE from 'three';

const chitin = new THREE.MeshStandardMaterial({ name: 'chitin', color: 0x4a3b42, roughness: 0.85 });
const shell = new THREE.MeshStandardMaterial({ name: 'shell', color: 0x9c7857, roughness: 0.95 });
const amber = new THREE.MeshStandardMaterial({ name: 'eyes', color: 0xd6aa60, roughness: 0.4 });

function ellipsoid(
  parent: THREE.Object3D,
  name: string,
  position: [number, number, number],
  scale: [number, number, number],
  material: THREE.Material,
  low: boolean,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, low ? 6 : 8, low ? 4 : 6), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function limb(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, low: boolean): void {
  const vector = to.clone().sub(from);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.045, vector.length(), low ? 4 : 6),
    chitin,
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  parent.add(mesh);
}

/** Компактная модель паука с восемью шарнирными лапами и общей палитрой из трёх материалов. */
export function createSpiderModel(low = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Spider';
  const body = new THREE.Group();
  body.name = 'SpiderBody';
  root.add(body);
  ellipsoid(body, 'Abdomen', [0, 0.39, 0.26], [0.3, 0.27, 0.4], chitin, low);
  ellipsoid(body, 'Back', [0, 0.56, 0.32], [0.22, 0.11, 0.28], shell, low);
  ellipsoid(body, 'Head', [0, 0.36, -0.3], [0.24, 0.2, 0.23], chitin, low);
  for (const side of [-1, 1]) {
    ellipsoid(body, `Eye${side}`, [side * 0.1, 0.42, -0.49], [0.058, 0.062, 0.03], amber, low);
    ellipsoid(body, `Fang${side}`, [side * 0.1, 0.26, -0.46], [0.045, 0.065, 0.075], shell, low);
    for (let index = 0; index < 4; index++) {
      const leg = new THREE.Group();
      leg.name = `Leg${side < 0 ? 'L' : 'R'}${index}`;
      leg.position.set(side * 0.16, 0.34, -0.28 + index * 0.18);
      root.add(leg);
      const knee = new THREE.Vector3(
        side * (0.46 + Math.sin(index) * 0.06),
        0.14,
        (index - 1.5) * 0.17,
      );
      const foot = new THREE.Vector3(
        side * (0.65 + Math.sin(index) * 0.05),
        -0.3,
        (index - 1.5) * 0.28,
      );
      limb(leg, new THREE.Vector3(), knee, low);
      limb(leg, knee, foot, low);
      if (!low)
        ellipsoid(leg, 'Knee', [knee.x, knee.y, knee.z], [0.047, 0.047, 0.047], chitin, low);
    }
  }
  return root;
}

/** Вдали лапы объединены с корпусом: остаётся дешёвая анимация всего силуэта. */
export function spiderLowClips(): THREE.AnimationClip[] {
  return ['idle', 'walk', 'run', 'spin', 'attack'].map((name) => {
    const duration = name === 'run' ? 0.55 : 1;
    const height = name === 'idle' ? 0 : name === 'run' ? 0.055 : 0.025;
    return new THREE.AnimationClip(name, duration, [
      new THREE.VectorKeyframeTrack(
        'Spider.position',
        [0, duration / 2, duration],
        [0, 0, 0, 0, height, 0, 0, 0, 0],
      ),
    ]);
  });
}

export function spiderClips(): THREE.AnimationClip[] {
  const rotation = (name: string, times: number[], angles: [number, number, number][]) =>
    new THREE.QuaternionKeyframeTrack(
      `${name}.quaternion`,
      times,
      angles.flatMap(([x, y, z]) =>
        new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray(),
      ),
    );
  const gait = (amplitude: number, duration: number) => {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const side of ['L', 'R'])
      for (let index = 0; index < 4; index++) {
        const phase = (index + (side === 'L' ? 0 : 1)) % 2 ? 1 : -1;
        tracks.push(
          rotation(
            `Leg${side}${index}`,
            [0, duration / 4, duration / 2, (duration * 3) / 4, duration],
            [
              [0, 0, 0],
              [0, amplitude * phase, -amplitude * phase * 0.35],
              [0, 0, 0],
              [0, -amplitude * phase, amplitude * phase * 0.35],
              [0, 0, 0],
            ],
          ),
        );
      }
    return tracks;
  };
  return [
    new THREE.AnimationClip('idle', 2, [
      new THREE.VectorKeyframeTrack('SpiderBody.scale', [0, 1, 2], [1, 1, 1, 1, 1.035, 1, 1, 1, 1]),
    ]),
    new THREE.AnimationClip('walk', 1, gait(0.2, 1)),
    new THREE.AnimationClip('run', 0.55, gait(0.35, 0.55)),
    new THREE.AnimationClip('spin', 1.5, gait(0.08, 1.5)),
    new THREE.AnimationClip('attack', 0.6, [
      ...gait(0.2, 0.6),
      rotation(
        'SpiderBody',
        [0, 0.2, 0.4, 0.6],
        [
          [0, 0, 0],
          [-0.2, 0, 0],
          [0.16, 0, 0],
          [0, 0, 0],
        ],
      ),
    ]),
  ];
}

/** Низкополигональные камни с общей геометрией корпуса и тонким слоем мха на верхних гранях. */
export function createRockModel(kind: 'granite' | 'moss' | 'slate'): THREE.Group {
  const root = new THREE.Group();
  root.name = `Rock-${kind}`;
  const source = new THREE.DodecahedronGeometry(1, 0);
  const geometry = source.index ? source.toNonIndexed() : source;
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    const noise = 1 + Math.sin(x * 17 + y * 29 + z * 11) * 0.12;
    position.setXYZ(
      i,
      x * noise * (kind === 'slate' ? 1.3 : 1),
      y * noise * (kind === 'slate' ? 0.35 : 0.72),
      z * noise * 0.9,
    );
  }
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    name: 'stone',
    color: kind === 'slate' ? 0x747d86 : 0xaaa28c,
    roughness: 1,
    flatShading: true,
  });
  root.add(new THREE.Mesh(geometry, material));
  if (kind === 'moss') {
    const vertices: number[] = [],
      a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      normal = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      normal.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.y > 0.3)
        for (const point of [a, b, c]) vertices.push(point.x, point.y + 0.008, point.z);
    }
    const moss = new THREE.BufferGeometry();
    moss.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    moss.computeVertexNormals();
    root.add(
      new THREE.Mesh(
        moss,
        new THREE.MeshStandardMaterial({
          name: 'moss',
          color: 0x647447,
          roughness: 1,
          flatShading: true,
        }),
      ),
    );
  }
  return root;
}
