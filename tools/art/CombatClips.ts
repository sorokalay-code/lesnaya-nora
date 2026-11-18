import * as THREE from 'three';
import { RABBIT_ATTACKS } from '../../src/game/combat/AttackProfiles';

type Pose = readonly [number, number, number];
type Style = 'bite' | 'claw' | 'ram' | 'peck' | 'snake' | 'bird';
const STYLES: Record<string, Style> = {
  lynx: 'claw',
  bear: 'claw',
  deer: 'ram',
  'roe-deer': 'ram',
  moose: 'ram',
  boar: 'ram',
  duck: 'peck',
  pheasant: 'peck',
  snake: 'snake',
  hawk: 'bird',
  owl: 'bird',
};

/** Добавляет отдельный визуальный корень: выпад не меняет физические координаты и коллизии животного. */
function motionRoot(root: THREE.Group): void {
  const motion = new THREE.Group();
  motion.name = 'CombatMotion';
  motion.add(...root.children.slice());
  root.add(motion);
}

/** Создаёт клипы замаха, контакта и возврата; ключи используют исходные локальные позы каждого LOD. */
export function combatClips(kind: string, root: THREE.Group): THREE.AnimationClip[] {
  if (kind === 'hunter' || kind === 'leech') return [];
  motionRoot(root);
  const rotation = (
    name: string,
    times: number[],
    poses: readonly Pose[],
  ): THREE.KeyframeTrack[] => {
    const node = root.getObjectByName(name);
    if (!node) return [];
    return [
      new THREE.QuaternionKeyframeTrack(
        `${name}.quaternion`,
        times,
        poses.flatMap(([x, y, z]) =>
          node.quaternion
            .clone()
            .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)))
            .toArray(),
        ),
      ),
    ];
  };
  const position = (
    name: string,
    times: number[],
    poses: readonly Pose[],
  ): THREE.KeyframeTrack[] => {
    const node = root.getObjectByName(name);
    if (!node) return [];
    return [
      new THREE.VectorKeyframeTrack(
        `${name}.position`,
        times,
        poses.flatMap(([x, y, z]) => [
          node.position.x + x,
          node.position.y + y,
          node.position.z + z,
        ]),
      ),
    ];
  };
  const pitch = (name: string, times: number[], angles: number[]) =>
    rotation(
      name,
      times,
      angles.map((x): Pose => [x, 0, 0]),
    );
  if (kind === 'rabbit')
    return (['swipe', 'bite'] as const).map((name) => {
      const profile = RABBIT_ATTACKS[name];
      const times = [
        0,
        profile.windup * 0.55,
        profile.windup,
        profile.windup + 0.07,
        profile.windup + 0.18,
        profile.recovery * 0.82,
        profile.recovery,
      ];
      const swipe = name === 'swipe';
      return new THREE.AnimationClip(name, profile.recovery, [
        ...position('CombatMotion', times, [
          [0, 0, 0],
          [0, -0.045, 0.08],
          [0, 0.025, swipe ? -0.15 : -0.24],
          [0, -0.02, -0.2],
          [0, -0.03, -0.1],
          [0, 0.015, 0.025],
          [0, 0, 0],
        ]),
        ...rotation('CombatMotion', times, [
          [0, 0, 0],
          [-0.12, swipe ? -0.1 : 0, 0],
          [0.12, swipe ? 0.12 : 0, 0],
          [0.16, 0.08, 0],
          [0.04, 0, 0],
          [-0.03, 0, 0],
          [0, 0, 0],
        ]),
        ...pitch('Head', times, [
          0,
          swipe ? -0.1 : 0.14,
          swipe ? -0.06 : -0.32,
          -0.22,
          -0.08,
          0.04,
          0,
        ]),
        ...rotation('PawFL', times, [
          [0, 0, 0],
          [swipe ? -1.05 : -0.22, 0, swipe ? -0.3 : 0],
          [swipe ? 0.85 : 0.25, 0, swipe ? 0.28 : 0],
          [swipe ? 0.9 : 0.35, 0, swipe ? 0.12 : 0],
          [0.2, 0, 0],
          [-0.05, 0, 0],
          [0, 0, 0],
        ]),
        ...rotation('PawFR', times, [
          [0, 0, 0],
          [swipe ? -0.85 : -0.2, 0, swipe ? 0.25 : 0],
          [swipe ? 0.65 : 0.25, 0, swipe ? -0.25 : 0],
          [swipe ? 0.95 : 0.35, 0, swipe ? -0.15 : 0],
          [0.25, 0, 0],
          [-0.05, 0, 0],
          [0, 0, 0],
        ]),
        ...pitch('PawBL', times, [0, -0.22, 0.22, 0.28, 0.1, -0.03, 0]),
        ...pitch('PawBR', times, [0, -0.22, 0.22, 0.28, 0.1, -0.03, 0]),
        ...pitch('EarL', times, [0, 0.16, -0.2, -0.24, -0.05, 0.06, 0]),
        ...pitch('EarR', times, [0, 0.14, -0.17, -0.22, -0.04, 0.05, 0]),
      ]);
    });

  const style = STYLES[kind] ?? 'bite';
  const claw = style === 'claw';
  const ram = style === 'ram';
  const readyTimes = [0, 0.55, 1];
  const attackTimes = [0, 0.08, 0.22, 0.43, 0.6];
  const ready = new THREE.AnimationClip('attack-ready', 1, [
    ...pitch('CombatMotion', readyTimes, [0, -0.01, -0.02]),
    ...position('CombatMotion', readyTimes, [
      [0, 0, 0],
      [0, 0.015, 0.06],
      [0, 0.02, 0.1],
    ]),
    ...pitch('Head', readyTimes, [0, ram ? -0.25 : 0.08, ram ? -0.4 : 0.16]),
    ...pitch('LegFL', readyTimes, [0, claw ? -0.45 : -0.12, claw ? -0.95 : -0.2]),
    ...pitch('LegFR', readyTimes, [0, -0.12, -0.22]),
    ...pitch('Jaw', readyTimes, [0, 0.2, 0.42]),
  ]);
  const attack = new THREE.AnimationClip('attack', 0.6, [
    ...position('CombatMotion', attackTimes, [
      [0, 0.015, -0.2],
      [0, 0.035, ram ? -0.34 : -0.27],
      [0, 0.015, -0.15],
      [0, 0.01, 0.025],
      [0, 0, 0],
    ]),
    ...rotation('CombatMotion', attackTimes, [
      [0.04, claw ? -0.12 : 0, 0],
      [0.06, claw ? 0.18 : 0, 0],
      [0.02, 0.04, 0],
      [-0.03, 0, 0],
      [0, 0, 0],
    ]),
    ...pitch('Head', attackTimes, [
      ram || style === 'peck' ? -0.55 : -0.16,
      ram ? -0.65 : -0.25,
      -0.1,
      0.04,
      0,
    ]),
    ...rotation('LegFL', attackTimes, [
      [claw ? 0.5 : 0.25, 0, claw ? 0.35 : 0],
      [claw ? 0.95 : 0.4, 0, claw ? -0.25 : 0],
      [0.15, 0, 0],
      [-0.05, 0, 0],
      [0, 0, 0],
    ]),
    ...pitch('LegFR', attackTimes, [0.22, 0.35, 0.12, -0.04, 0]),
    ...pitch('LegBL', attackTimes, [-0.28, -0.35, -0.1, 0.04, 0]),
    ...pitch('LegBR', attackTimes, [-0.25, -0.32, -0.1, 0.04, 0]),
    ...pitch('Jaw', attackTimes, [0.12, 0, 0.06, 0.02, 0]),
    ...pitch('Tail', attackTimes, [0.12, -0.2, 0.1, 0.03, 0]),
    ...rotation('WingL', attackTimes, [
      [0, 0, -0.65],
      [0, 0, -0.9],
      [0, 0, -0.3],
      [0, 0, -0.1],
      [0, 0, 0],
    ]),
    ...rotation('WingR', attackTimes, [
      [0, 0, 0.65],
      [0, 0, 0.9],
      [0, 0, 0.3],
      [0, 0, 0.1],
      [0, 0, 0],
    ]),
  ]);
  if (style !== 'bird') return [ready, attack];
  const strike = attack.clone();
  strike.name = 'strike';
  return [ready, attack, strike];
}
