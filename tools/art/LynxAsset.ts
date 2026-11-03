import * as THREE from 'three';

/** Рысь с коротким хвостом, бакенбардами, пятнами и кисточками; детали объединяются экспортёром. */
export function createLynxModel(low = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Lynx';
  const visual = new THREE.Group();
  visual.name = 'Visual';
  root.add(visual);
  const fur = new THREE.MeshStandardMaterial({
    name: 'fur_base',
    color: 0xb59a69,
    roughness: 0.94,
  });
  const light = new THREE.MeshStandardMaterial({
    name: 'lynx_light',
    color: 0xe9dfc3,
    roughness: 1,
  });
  const dark = new THREE.MeshStandardMaterial({
    name: 'lynx_dark',
    color: 0x3c3027,
    roughness: 0.9,
  });
  const eyes = new THREE.MeshStandardMaterial({
    name: 'lynx_eyes',
    color: 0xbfa54b,
    roughness: 0.35,
  });
  const geometry = new THREE.SphereGeometry(1, low ? 6 : 8, low ? 4 : 6);
  const cone = new THREE.ConeGeometry(1, 1, low ? 4 : 6);
  const spotGeometry = new THREE.CircleGeometry(1, low ? 5 : 6);
  const blob = (
    parent: THREE.Object3D,
    name: string,
    material: THREE.Material,
    position: [number, number, number],
    scale: [number, number, number],
    pointed = false,
  ) => {
    const mesh = new THREE.Mesh(pointed ? cone : geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  };
  blob(visual, 'Body', fur, [0, 0.87, 0.07], [0.4, 0.39, 0.75]);
  blob(visual, 'Chest', light, [0, 0.76, -0.43], [0.3, 0.31, 0.26]);
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.12, -0.62);
  visual.add(head);
  blob(head, 'Skull', fur, [0, 0.02, 0], [0.35, 0.31, 0.3]);
  blob(head, 'Muzzle', light, [0, -0.12, -0.24], [0.21, 0.13, 0.14]);
  blob(head, 'Nose', dark, [0, -0.045, -0.365], [0.065, 0.045, 0.035]);
  for (const side of [-1, 1]) {
    const cheek = blob(head, 'Ruff', light, [side * 0.32, -0.08, -0.02], [0.18, 0.23, 0.17], true);
    cheek.rotation.z = side * 0.75;
    blob(head, 'Eye', eyes, [side * 0.23, 0.08, -0.235], [0.065, 0.06, 0.035]);
    blob(head, 'Pupil', dark, [side * 0.23, 0.08, -0.266], [0.018, 0.045, 0.012]);
    blob(head, 'Ear', fur, [side * 0.23, 0.34, 0.015], [0.14, 0.28, 0.12], true);
    blob(head, 'Tuft', dark, [side * 0.24, 0.56, 0.015], [0.038, 0.23, 0.028], true);
    for (let index = 0; index < (low ? 3 : 6); index++) {
      const y = 0.77 + (index % 2) * 0.17;
      const z = -0.4 + index * (low ? 0.36 : 0.18);
      const x =
        side *
        0.4 *
        Math.sqrt(Math.max(0.1, 1 - ((y - 0.87) / 0.39) ** 2 - ((z - 0.07) / 0.75) ** 2));
      const normal = new THREE.Vector3(
        x / 0.16,
        (y - 0.87) / 0.1521,
        (z - 0.07) / 0.5625,
      ).normalize();
      const spot = new THREE.Mesh(spotGeometry, dark);
      spot.name = 'Spot';
      spot.position.set(x, y, z).addScaledVector(normal, 0.006);
      spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      spot.scale.set(0.065, 0.08, 1);
      visual.add(spot);
    }
    for (const back of [false, true]) {
      const leg = new THREE.Group();
      leg.name = 'Leg' + (back ? 'B' : 'F') + (side < 0 ? 'L' : 'R');
      leg.position.set(side * 0.29, 0.65, back ? 0.5 : -0.43);
      visual.add(leg);
      blob(leg, 'Limb', fur, [0, -0.22, 0], [0.12, 0.36, 0.14]);
      blob(leg, 'Paw', light, [0, -0.55, -0.065], [0.17, 0.1, 0.2]);
    }
  }
  const tail = new THREE.Group();
  tail.name = 'Tail';
  tail.position.set(0, 0.95, 0.69);
  visual.add(tail);
  blob(tail, 'ShortTail', fur, [0, 0, 0.1], [0.11, 0.11, 0.2]);
  blob(tail, 'BlackTip', dark, [0, 0, 0.27], [0.11, 0.11, 0.08]);
  return root;
}

export function lynxPounceClip(): THREE.AnimationClip {
  const times = [0, 0.24, 0.5, 0.72, 0.89];
  const angles = [0, -0.65, 0.7, 0.4, 0];
  return new THREE.AnimationClip(
    'pounce',
    0.89,
    ['LegFL', 'LegFR', 'LegBL', 'LegBR'].map(
      (name, index) =>
        new THREE.QuaternionKeyframeTrack(
          name + '.quaternion',
          times,
          angles.flatMap((angle) =>
            new THREE.Quaternion()
              .setFromEuler(new THREE.Euler(angle * (index < 2 ? 1 : -1), 0, 0))
              .toArray(),
          ),
        ),
    ),
  );
}
