import * as THREE from 'three';

/** Компактный кабан: цвета запечены в вершины, один материал и семь групп для головы, лап и хвоста. */
export function createBoarModel(low = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Boar';
  const visual = new THREE.Group();
  visual.name = 'Visual';
  root.add(visual);
  const material = new THREE.MeshStandardMaterial({
    name: 'boar_palette',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.82,
  });
  const add = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: number,
    position: number[],
    scale: number[],
  ) => {
    const rgb = new THREE.Color(color),
      colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = rgb.r;
      colors[i + 1] = rgb.g;
      colors[i + 2] = rgb.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    parent.add(mesh);
    return mesh;
  };
  const ell = (parent: THREE.Object3D, color: number, p: number[], s: number[]) =>
    add(parent, new THREE.SphereGeometry(1, low ? 7 : 11, low ? 4 : 7), color, p, s);
  const brown = 0x76543b,
    dark = 0x30291f,
    snout = 0x9a7057,
    ivory = 0xe3d5b5;
  ell(visual, brown, [0, 0.63, 0.13], [0.51, 0.46, 0.81]);
  ell(visual, brown, [0, 0.78, -0.25], [0.48, 0.48, 0.49]);
  for (let i = 0; i < 7; i++) {
    const bristle = add(
      visual,
      new THREE.ConeGeometry(1, 1, 3),
      dark,
      [0, 1.12 - Math.abs(i - 2) * 0.04, -0.45 + i * 0.16],
      [0.075, 0.18, 0.11],
    );
    bristle.rotation.x = -0.25;
  }
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0.7, -0.72);
  visual.add(head);
  ell(head, brown, [0, 0, 0], [0.35, 0.3, 0.43]);
  ell(head, snout, [0, -0.12, -0.4], [0.25, 0.18, 0.22]);
  for (const side of [-1, 1]) {
    ell(head, dark, [side * 0.1, -0.11, -0.6], [0.038, 0.035, 0.016]);
    ell(head, dark, [side * 0.27, 0.1, -0.22], [0.045, 0.05, 0.04]);
    ell(head, ivory, [side * 0.27, 0.12, -0.25], [0.012, 0.014, 0.008]);
    const ear = add(
      head,
      new THREE.ConeGeometry(1, 1, 3),
      brown,
      [side * 0.28, 0.31, 0.02],
      [0.17, 0.27, 0.11],
    );
    ear.rotation.z = side * -0.4;
    const tusk = add(
      head,
      new THREE.ConeGeometry(1, 1, 5),
      ivory,
      [side * 0.24, -0.12, -0.38],
      [0.045, 0.22, 0.045],
    );
    tusk.rotation.z = side * -0.35;
    for (const rear of [false, true]) {
      const leg = new THREE.Group();
      leg.name = 'Leg' + (rear ? 'B' : 'F') + (side < 0 ? 'L' : 'R');
      leg.position.set(side * 0.34, 0.4, rear ? 0.58 : -0.47);
      visual.add(leg);
      ell(leg, brown, [0, -0.15, 0], [0.14, 0.25, 0.16]);
      add(leg, new THREE.BoxGeometry(1, 1, 1), dark, [0, -0.34, -0.04], [0.22, 0.12, 0.24]);
    }
  }
  const tail = new THREE.Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.72, 0.88);
  visual.add(tail);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.08, 0.1, 0.16),
    new THREE.Vector3(-0.02, 0.17, 0.26),
    new THREE.Vector3(-0.08, 0.08, 0.22),
  ]);
  add(
    tail,
    new THREE.TubeGeometry(curve, low ? 4 : 7, 0.035, 3, false),
    dark,
    [0, 0, 0],
    [1, 1, 1],
  );
  return root;
}
