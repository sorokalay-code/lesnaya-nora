import * as THREE from 'three';

type Point = readonly [number, number, number];
const segmentCount = (low: boolean) => (low ? 7 : 14);

export function createScolopendra(low = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'scolopendra';
  const body = new THREE.Group();
  body.name = 'Visual';
  root.add(body);
  const ellipsoid = new THREE.SphereGeometry(1, low ? 7 : 11, low ? 4 : 7);
  const tube = new THREE.CylinderGeometry(0.72, 1, 1, low ? 4 : 6);
  const shell = new THREE.MeshStandardMaterial({
    name: 'Chestnut shell',
    color: 0x65341f,
    roughness: 0.72,
  });
  const rim = new THREE.MeshStandardMaterial({
    name: 'Shell rims',
    color: 0x9e5630,
    roughness: 0.82,
  });
  const leg = new THREE.MeshStandardMaterial({
    name: 'Amber legs',
    color: 0xc3823b,
    roughness: 0.86,
  });
  const face = new THREE.MeshStandardMaterial({
    name: 'Head shell',
    color: 0x9c4b27,
    roughness: 0.73,
  });
  const dark = new THREE.MeshStandardMaterial({
    name: 'Dark claws',
    color: 0x40271d,
    roughness: 0.85,
  });

  const ell = (parent: THREE.Group, material: THREE.Material, point: Point, size: Point) => {
    const mesh = new THREE.Mesh(ellipsoid, material);
    mesh.position.set(...point);
    mesh.scale.set(...size);
    parent.add(mesh);
  };
  const limb = (
    parent: THREE.Group,
    material: THREE.Material,
    a: Point,
    b: Point,
    radius: number,
  ) => {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const mesh = new THREE.Mesh(tube, material);
    mesh.position.copy(start).lerp(end, 0.5);
    mesh.scale.set(radius, delta.length(), radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    parent.add(mesh);
  };

  const count = segmentCount(low);
  const pitch = 1.38 / count;
  for (let i = 0; i < count; i++) {
    const z = -0.62 + i * pitch;
    const width = 0.15 - (i / count) ** 3 * 0.06;
    ell(body, shell, [0, 0.19, z], [width, 0.088, pitch * 0.6]);
    ell(body, rim, [0, 0.188, z + pitch * 0.45], [width * 0.94, 0.066, pitch * 0.18]);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = `Leg${side < 0 ? 'L' : 'R'}${i}`;
      pivot.position.set(side * width * 0.8, 0.159, z);
      body.add(pivot);
      const posterior = i === count - 1;
      const knee: Point = [side * 0.14, -0.014, posterior ? 0.19 : 0.06];
      const end: Point = [side * 0.24, -0.15, posterior ? 0.34 : 0.11];
      limb(pivot, leg, [0, 0, 0], knee, 0.022);
      limb(pivot, leg, knee, end, 0.016);
    }
  }
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0.18, -0.74);
  body.add(head);
  ell(head, face, [0, 0, 0], [0.15, 0.093, 0.14]);
  for (const side of [-1, 1]) {
    const antenna: Point = [side * 0.23, 0.09, -0.22];
    limb(head, leg, [side * 0.07, 0.05, -0.07], antenna, 0.014);
    limb(head, leg, antenna, [side * 0.33, 0.045, -0.39], 0.009);
    limb(head, dark, [side * 0.09, -0.035, -0.06], [side * 0.06, -0.08, -0.2], 0.034);
  }
  return root;
}

export function scolopendraClips(low = false): THREE.AnimationClip[] {
  return (['idle', 'walk', 'run', 'attack'] as const).map((name) => {
    const duration = { idle: 1.6, walk: 0.84, run: 0.4, attack: 0.6 }[name];
    const time = Array.from({ length: 9 }, (_, i) => (i / 8) * duration);
    const motion = (bone: string, pose: (phase: number) => THREE.Euler) =>
      new THREE.QuaternionKeyframeTrack(
        `${bone}.quaternion`,
        time,
        time.flatMap((sample) =>
          new THREE.Quaternion().setFromEuler(pose(sample / duration)).toArray(),
        ),
      );
    if (name === 'attack')
      return new THREE.AnimationClip(name, duration, [
        motion('Visual', (t) => new THREE.Euler(-0.24 * Math.sin(t * Math.PI), 0, 0)),
      ]);

    const amplitude = name === 'idle' ? 0.025 : name === 'walk' ? 0.16 : 0.26;
    const tracks = [
      motion('Visual', (t) => new THREE.Euler(0, Math.sin(t * 2 * Math.PI) * amplitude * 0.4, 0)),
    ];
    if (!low) {
      for (let i = 0; i < segmentCount(low); i++) {
        for (const side of [-1, 1]) {
          tracks.push(
            motion(`Leg${side < 0 ? 'L' : 'R'}${i}`, (t) => {
              const wave = (t - i * 0.105 + (side < 0 ? 0.5 : 0)) * 2 * Math.PI;
              return new THREE.Euler(
                0,
                Math.sin(wave) * amplitude,
                Math.max(0, Math.cos(wave)) * amplitude * side,
              );
            }),
          );
        }
      }
    }
    return new THREE.AnimationClip(name, duration, tracks);
  });
}
