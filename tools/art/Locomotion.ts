import * as THREE from 'three';

/** Четырёхтактный шаг и парный бег с фазой опоры, переносом лапы и компенсацией касания земли. */
export function quadrupedGait(
  root: THREE.Object3D,
  name: 'walk' | 'run',
  duration: number,
  kind: string,
): THREE.AnimationClip {
  const running = name === 'run';
  const gallop = running && !['bear', 'beaver', 'hedgehog'].includes(kind);
  const phases = running
    ? gallop
      ? [0, 0.08, 0.5, 0.58]
      : [0, 0.5, 0.5, 0]
    : [0, 0.5, 0.75, 0.25];
  const amplitude = running ? (kind === 'bear' ? 0.65 : 0.85) : 0.52;
  const stance = running ? 0.48 : 0.64;
  const times = Array.from({ length: 17 }, (_, i) => (i / 16) * duration);
  const tracks: THREE.KeyframeTrack[] = [];
  ['LegFL', 'LegFR', 'LegBL', 'LegBR'].forEach((name, index) => {
    const leg = root.getObjectByName(name);
    if (!leg) return;
    const rotations: number[] = [],
      positions: number[] = [];
    for (let sample = 0; sample < times.length; sample++) {
      const phase = (sample / 16 + phases[index]) % 1;
      const contact = phase < stance;
      const part = contact ? phase / stance : (phase - stance) / (1 - stance);
      const ease = part * part * (3 - 2 * part);
      const angle = amplitude * (contact ? 1 - 2 * ease : -1 + 2 * ease);
      rotations.push(
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)).toArray(),
      );
      const lift = contact ? 0 : Math.sin(part * Math.PI) * (running ? 0.13 : 0.085);
      const compensation = -leg.position.y * (1 - Math.cos(angle)) - 0.05 * Math.sin(angle);
      const bodyBob = Math.sin((sample / 16) * Math.PI * 4) ** 2 * (running ? 0.065 : 0.025);
      positions.push(
        leg.position.x,
        leg.position.y + compensation + lift - bodyBob,
        leg.position.z - Math.sin(angle) * (running ? 0.065 : 0.035),
      );
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, rotations));
    tracks.push(new THREE.VectorKeyframeTrack(name + '.position', times, positions));
  });
  const bob = times.flatMap((_, i) => [
    0,
    Math.sin((i / 16) * Math.PI * 4) ** 2 * (running ? 0.065 : 0.025),
    0,
  ]);
  tracks.push(new THREE.VectorKeyframeTrack('Visual.position', times, bob));
  return new THREE.AnimationClip(name, duration, tracks);
}
