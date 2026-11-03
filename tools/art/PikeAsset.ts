import * as THREE from 'three';

/** Щука с длинной пастью и задними плавниками: одна палитра вершин, четыре анимируемых узла. */
export function createPikeModel(low = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Pike';
  const visual = new THREE.Group();
  visual.name = 'Visual';
  root.add(visual);
  const material = new THREE.MeshStandardMaterial({
    name: 'pike_palette',
    vertexColors: true,
    roughness: 0.63,
    side: THREE.DoubleSide,
  });
  const add = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: number,
    p: number[],
    s: number[],
  ) => {
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.deleteAttribute('uv');
    const c = new THREE.Color(color),
      colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(p[0], p[1], p[2]);
    mesh.scale.set(s[0], s[1], s[2]);
    parent.add(mesh);
    return mesh;
  };
  const ell = (parent: THREE.Object3D, color: number, p: number[], s: number[]) =>
    add(parent, new THREE.SphereGeometry(1, low ? 7 : 10, low ? 4 : 6), color, p, s);
  const fin = (parent: THREE.Object3D, points: number[], color: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    g.computeVertexNormals();
    add(parent, g, color, [0, 0, 0], [1, 1, 1]);
  };
  ell(visual, 0x596b39, [0, 0, 0.1], [0.19, 0.23, 0.86]);
  ell(visual, 0xc0c69a, [0, -0.1, -0.08], [0.17, 0.13, 0.65]);
  fin(visual, [0, 0.16, 0.35, 0, 0.5, 0.6, 0, 0.12, 0.82], 0x889347);
  for (const side of [-1, 1]) {
    fin(
      visual,
      [side * 0.13, -0.07, -0.35, side * 0.48, -0.12, -0.05, side * 0.12, -0.15, 0.05],
      0x95965a,
    );
    if (!low)
      for (let i = 0; i < 8; i++)
        ell(
          visual,
          0xb4bc72,
          [side * 0.182, ((i % 3) - 1) * 0.08, -0.45 + i * 0.14],
          [0.01, 0.028, 0.055],
        );
  }
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.z = -0.65;
  visual.add(head);
  ell(head, 0x70804b, [0, 0, -0.12], [0.145, 0.155, 0.4]);
  ell(head, 0x4d6134, [0, -0.01, -0.43], [0.12, 0.06, 0.23]);
  for (const side of [-1, 1]) {
    ell(head, 0xbca453, [side * 0.13, 0.07, -0.2], [0.034, 0.043, 0.048]);
    ell(head, 0x101b15, [side * 0.153, 0.07, -0.215], [0.012, 0.025, 0.025]);
  }
  const jaw = new THREE.Group();
  jaw.name = 'Jaw';
  jaw.position.set(0, -0.08, -0.13);
  head.add(jaw);
  ell(jaw, 0xc2c69a, [0, -0.005, -0.26], [0.125, 0.045, 0.35]);
  const tail = new THREE.Group();
  tail.name = 'Tail';
  tail.position.z = 0.72;
  visual.add(tail);
  ell(tail, 0x637545, [0, 0, 0.16], [0.09, 0.1, 0.3]);
  fin(
    tail,
    [0, 0, 0.24, 0, 0.34, 0.7, 0, 0, 0.56, 0, 0, 0.24, 0, 0, 0.56, 0, -0.34, 0.7],
    0x89934c,
  );
  return root;
}

/** Плавание хвостом и раскрытие пасти при броске без дополнительных скелетов и материалов. */
export function pikeClips(): THREE.AnimationClip[] {
  return ['swim', 'attack'].map((name) => {
    const duration = name === 'swim' ? 1 : 0.45,
      times = Array.from({ length: 17 }, (_, i) => (i * duration) / 16);
    const tail: number[] = [],
      body: number[] = [],
      jaw: number[] = [];
    for (const time of times) {
      const phase = (time / duration) * Math.PI * 2;
      tail.push(
        ...new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0, Math.sin(phase) * 0.48, 0))
          .toArray(),
      );
      body.push(
        ...new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0, Math.sin(phase) * -0.055, 0))
          .toArray(),
      );
      jaw.push(
        ...new THREE.Quaternion()
          .setFromEuler(
            new THREE.Euler(name === 'attack' ? -Math.sin(phase / 2) * 0.55 : -0.06, 0, 0),
          )
          .toArray(),
      );
    }
    return new THREE.AnimationClip(name, duration, [
      new THREE.QuaternionKeyframeTrack('Tail.quaternion', times, tail),
      new THREE.QuaternionKeyframeTrack('Visual.quaternion', times, body),
      new THREE.QuaternionKeyframeTrack('Jaw.quaternion', times, jaw),
    ]);
  });
}
