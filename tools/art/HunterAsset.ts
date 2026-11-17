import * as THREE from 'three';

/** Собирает одежду, человеческий силуэт и ружьё с отдельными шарнирами для движения. */
export function createHunterModel(low = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'hunter';
  const coat = new THREE.MeshStandardMaterial({
    name: 'hunter_coat',
    color: 0x536247,
    roughness: 0.95,
  });
  const trousers = new THREE.MeshStandardMaterial({
    name: 'hunter_trousers',
    color: 0x584b38,
    roughness: 1,
  });
  const skin = new THREE.MeshStandardMaterial({
    name: 'hunter_skin',
    color: 0xc79a77,
    roughness: 0.85,
  });
  const leather = new THREE.MeshStandardMaterial({
    name: 'hunter_leather',
    color: 0x443322,
    roughness: 0.9,
  });
  const steel = new THREE.MeshStandardMaterial({
    name: 'hunter_steel',
    color: 0x444b4b,
    roughness: 0.35,
    metalness: 0.7,
  });
  const wood = new THREE.MeshStandardMaterial({
    name: 'hunter_stock',
    color: 0x805332,
    roughness: 0.8,
  });
  const visual = new THREE.Group();
  visual.name = 'Visual';
  root.add(visual);
  const box = (
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    length: number,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  box(visual, coat, 0, 1.2, 0.015, 0.56, 0.68, 0.29);
  box(visual, leather, 0, 0.98, -0.015, 0.58, 0.065, 0.33);
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.75, -0.025);
  visual.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.19, low ? 6 : 10, low ? 4 : 7), skin);
  face.scale.set(0.85, 1.1, 0.9);
  head.add(face);
  box(head, skin, 0, -0.005, -0.19, 0.055, 0.075, 0.07);
  box(head, coat, 0, 0.15, 0, 0.4, 0.12, 0.36);
  box(head, leather, 0, 0.095, -0.09, 0.54, 0.035, 0.43);
  if (!low) {
    for (const side of [-1, 1]) {
      box(head, steel, side * 0.076, 0.015, -0.165, 0.032, 0.027, 0.015);
      box(visual, leather, side * 0.2, 1.25, -0.158, 0.11, 0.14, 0.035);
    }
  }
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'LegL' : 'LegR';
    leg.position.set(side * 0.15, 0.93, 0);
    visual.add(leg);
    box(leg, trousers, 0, -0.36, 0, 0.2, 0.72, 0.23);
    box(leg, leather, 0, -0.82, -0.07, 0.23, 0.2, 0.37);
  }
  const arms = new THREE.Group();
  arms.name = 'Arms';
  arms.position.set(0, 1.46, -0.03);
  visual.add(arms);
  box(arms, coat, -0.31, -0.17, -0.06, 0.18, 0.4, 0.19).rotation.x = -0.3;
  box(arms, skin, -0.28, -0.32, -0.24, 0.13, 0.13, 0.14);
  box(arms, coat, 0.29, -0.17, -0.17, 0.18, 0.4, 0.19).rotation.x = -0.72;
  box(arms, skin, 0.24, -0.3, -0.41, 0.14, 0.13, 0.14);
  const gun = new THREE.Group();
  gun.name = 'Gun';
  gun.position.set(0.12, -0.26, -0.28);
  arms.add(gun);
  box(gun, wood, 0, 0, 0.12, 0.09, 0.14, 0.49);
  box(gun, steel, 0, 0.035, -0.32, 0.062, 0.065, 0.7);
  box(gun, wood, 0, -0.045, -0.2, 0.085, 0.06, 0.28);
  const muzzle = new THREE.Group();
  muzzle.name = 'Muzzle';
  muzzle.position.set(0, 0.035, -0.69);
  gun.add(muzzle);
  return root;
}

/** Задаёт шаг, ожидание, поднятие ружья и отдачу в обоих LOD охотника. */
export function hunterClips(): THREE.AnimationClip[] {
  const track = (bone: string, frames: readonly (readonly [number, number, number])[]) =>
    new THREE.QuaternionKeyframeTrack(
      `${bone}.quaternion`,
      [0, 0.25, 0.5, 0.75, 1],
      frames.flatMap(([x, y, z]) =>
        new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray(),
      ),
    );
  const still = (x: number) => Array.from({ length: 5 }, () => [x, 0, 0] as const);
  return [
    new THREE.AnimationClip('idle', 1, [
      track('LegL', still(0)),
      track('LegR', still(0)),
      track('Arms', still(-0.15)),
    ]),
    new THREE.AnimationClip('walk', 1, [
      track('LegL', [
        [0.42, 0, 0],
        [0, 0, 0],
        [-0.42, 0, 0],
        [0, 0, 0],
        [0.42, 0, 0],
      ]),
      track('LegR', [
        [-0.42, 0, 0],
        [0, 0, 0],
        [0.42, 0, 0],
        [0, 0, 0],
        [-0.42, 0, 0],
      ]),
      track('Arms', still(-0.15)),
    ]),
    new THREE.AnimationClip('aim', 1, [
      track('LegL', still(0)),
      track('LegR', still(0)),
      track('Arms', still(0.36)),
    ]),
    new THREE.AnimationClip('shoot', 1, [
      track('LegL', still(0)),
      track('LegR', still(0)),
      track('Arms', [
        [0.36, 0, 0],
        [0.53, 0, 0],
        [0.39, 0, 0],
        [0.36, 0, 0],
        [0.36, 0, 0],
      ]),
    ]),
  ];
}
