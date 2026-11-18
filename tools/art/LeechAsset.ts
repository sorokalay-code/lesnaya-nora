import * as THREE from 'three';

/** Сегментированная пиявка с присосками; оба LOD используют общие анимируемые узлы. */
export function createLeechModel(low = false): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Leech';
  const skin = new THREE.MeshStandardMaterial({
    name: 'leech_skin',
    color: 0x343d24,
    roughness: 0.36,
  });
  const stripe = new THREE.MeshStandardMaterial({
    name: 'leech_stripe',
    color: 0x81613a,
    roughness: 0.5,
  });
  const geometry = new THREE.SphereGeometry(1, low ? 6 : 10, low ? 4 : 6);
  for (let index = 0; index < 7; index++) {
    const segment = new THREE.Group();
    segment.name = `Segment${index}`;
    segment.position.z = (index - 3) * 0.065;
    root.add(segment);
    const width = 0.035 + Math.sin((index / 6) * Math.PI) * 0.027;
    const body = new THREE.Mesh(geometry, skin);
    body.scale.set(width, 0.028, 0.058);
    segment.add(body);
    if (!low) {
      const marking = new THREE.Mesh(geometry, stripe);
      marking.position.y = 0.025;
      marking.scale.set(0.014, 0.005, 0.04);
      segment.add(marking);
    }
  }
  for (const z of [-0.245, 0.245]) {
    const sucker = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 4, low ? 6 : 10), skin);
    sucker.position.set(0, -0.012, z);
    sucker.rotation.x = Math.PI / 2;
    root.add(sucker);
  }
  return root;
}

/** Волнообразное плавание и слабая пульсация во время питания без скелета. */
export function leechClips(): THREE.AnimationClip[] {
  return (['swim', 'feed'] as const).map((name) => {
    const duration = name === 'swim' ? 1.2 : 1.8;
    const times = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * duration);
    const tracks: THREE.KeyframeTrack[] = [];
    for (let index = 0; index < 7; index++) {
      const values: number[] = [];
      for (let frame = 0; frame < 5; frame++) {
        const wave = Math.sin((frame / 4) * Math.PI * 2 - index * 0.7);
        values.push(
          name === 'swim' ? wave * 0.028 : 0,
          name === 'feed' ? wave * 0.005 : 0,
          (index - 3) * 0.065,
        );
      }
      tracks.push(new THREE.VectorKeyframeTrack(`Segment${index}.position`, times, values));
    }
    return new THREE.AnimationClip(name, duration, tracks);
  });
}
