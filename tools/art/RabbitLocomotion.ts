import * as THREE from 'three';

const PAWS = ['FL', 'FR', 'BL', 'BR'] as const;

/** Строит заячий бег: задние лапы толкают корпус, передние принимают вес, стопы сохраняют опору. */
export function rabbitLocomotion(
  root: THREE.Object3D,
  name: 'hop' | 'run' | 'jump',
): THREE.AnimationClip {
  const sprint = name === 'run';
  const jumping = name === 'jump';
  const duration = jumping ? 0.58 : sprint ? 0.52 : 0.72;
  const samples = 32;
  const times = Array.from({ length: samples + 1 }, (_, index) => (index / samples) * duration);
  const tracks: THREE.KeyframeTrack[] = [];
  const bounce = (phase: number) => {
    // Полёт следует за толчком задних лап и заканчивается перед опорой на передние.
    if (jumping || phase < 0.27 || phase > 0.62) return 0;
    return Math.sin(((phase - 0.27) / 0.35) * Math.PI) * (sprint ? 0.16 : 0.09);
  };
  for (const suffix of PAWS) {
    const paw = root.getObjectByName('Paw' + suffix);
    const foot = root.getObjectByName('Foot' + suffix);
    if (!paw || !foot) throw new Error('Неполный риг лапы кролика: ' + suffix);
    const rear = suffix.startsWith('B');
    const rotations: number[] = [],
      footRotations: number[] = [],
      positions: number[] = [],
      scales: number[] = [];
    const restingLength = -foot.position.y;
    for (let sample = 0; sample <= samples; sample++) {
      const phase = sample / samples;
      const legPhase = (phase + (rear ? 0.15 : 0.42)) % 1;
      const stance = legPhase < 0.42;
      const fraction = stance ? legPhase / 0.42 : (legPhase - 0.42) / 0.58;
      const ease = fraction * fraction * (3 - 2 * fraction);
      const reach = (rear ? 0.28 : 0.22) * (sprint ? 1.15 : 1);
      const trail = rear ? 0.16 : 0.12;
      const z = stance ? -reach + (reach + trail) * fraction : trail - (reach + trail) * ease;
      const lift = stance ? 0 : Math.sin(fraction * Math.PI) ** 1.3 * (rear ? 0.19 : 0.14);
      const y = 0.07 + lift - paw.position.y - bounce(phase);
      const length = Math.hypot(y, z);
      const angle = Math.atan2(-z, -y);
      // Плечо остаётся на корпусе, а длина сегмента достигает цели стопы без новой геометрии.
      // Обратный поворот стопы компенсирует поворот лапы и сохраняет плоскость опоры.
      rotations.push(
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)).toArray(),
      );
      footRotations.push(
        ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-angle, 0, 0)).toArray(),
      );
      positions.push(0, -length, 0);
      scales.push(1, length / restingLength, 1);
    }
    tracks.push(
      new THREE.QuaternionKeyframeTrack('Paw' + suffix + '.quaternion', times, rotations),
    );
    tracks.push(new THREE.VectorKeyframeTrack('Upper' + suffix + '.scale', times, scales));
    tracks.push(new THREE.VectorKeyframeTrack('Foot' + suffix + '.position', times, positions));
    tracks.push(
      new THREE.QuaternionKeyframeTrack('Foot' + suffix + '.quaternion', times, footRotations),
    );
  }
  tracks.push(
    new THREE.VectorKeyframeTrack(
      'Visual.position',
      times,
      times.flatMap((_, i) => [0, bounce(i / samples), 0]),
    ),
  );
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      'Head.quaternion',
      times,
      times.flatMap((_, i) =>
        new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(-bounce(i / samples) * 0.25, 0, 0))
          .toArray(),
      ),
    ),
  );
  return new THREE.AnimationClip(name, duration, tracks);
}
