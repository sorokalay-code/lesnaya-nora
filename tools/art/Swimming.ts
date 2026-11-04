import * as THREE from 'three';

export const SWIMMING_MODELS = new Set([
  'rabbit',
  'beaver',
  'moose',
  'boar',
  'bear',
  'duck',
  'wolf',
  'dog',
  'snake',
]);

/** Гребки попеременно вытянутыми лапами без наземного подскока; клип сохраняется в обоих GLB LOD. */
export function swimmingClip(root: THREE.Object3D, kind: string): THREE.AnimationClip {
  const duration = 1.25,
    times = Array.from({ length: 25 }, (_, i) => (i * duration) / 24);
  const tracks: THREE.KeyframeTrack[] = [];
  const rabbit = kind === 'rabbit';
  const names = ['FL', 'FR', 'BL', 'BR'];
  names.forEach((suffix, index) => {
    const name = (rabbit ? 'Paw' : 'Leg') + suffix,
      leg = root.getObjectByName(name);
    if (!leg) return;
    const rotations: number[] = [],
      positions: number[] = [];
    for (const time of times) {
      const phase =
        (time / duration) * Math.PI * 2 + (index % 2 ? Math.PI : 0) + (index > 1 ? 0.7 : 0);
      const angle = -0.3 + Math.sin(phase) * 0.75;
      rotations.push(
        ...new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(angle, 0, Math.cos(phase) * 0.16))
          .toArray(),
      );
      positions.push(leg.position.x, leg.position.y + Math.cos(phase) * 0.025, leg.position.z);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, rotations));
    tracks.push(new THREE.VectorKeyframeTrack(name + '.position', times, positions));
  });
  const visual = root.getObjectByName('Visual');
  if (visual) {
    const values: number[] = [];
    for (const time of times)
      values.push(
        visual.position.x,
        visual.position.y + Math.sin((time / duration) * Math.PI * 4) * 0.018,
        visual.position.z,
      );
    tracks.push(new THREE.VectorKeyframeTrack('Visual.position', times, values));
  }
  if (kind === 'snake') {
    root.traverse((node) => {
      if (!/Segment|Body\d/.test(node.name)) return;
      const values: number[] = [];
      for (const time of times)
        values.push(
          ...new THREE.Quaternion()
            .setFromEuler(
              new THREE.Euler(
                0,
                Math.sin((time / duration) * Math.PI * 2 + node.position.z * 3) * 0.28,
                0,
              ),
            )
            .toArray(),
        );
      tracks.push(new THREE.QuaternionKeyframeTrack(node.name + '.quaternion', times, values));
    });
  }
  return new THREE.AnimationClip('swim', duration, tracks);
}
