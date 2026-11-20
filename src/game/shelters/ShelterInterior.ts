import type { ShelteredWildlife } from '../WildlifeShelterProfiles';
import { FRIENDSHIP_TRUST } from '../Friendship';

export type InteriorKind = ShelteredWildlife | 'wolf';
export type Welcome = 'friendly' | 'warning' | 'hostile';

export interface InteriorProfile {
  kind: InteriorKind;
  title: string;
  scale: number;
  decor: 'pantry' | 'bones' | 'branches' | 'leaves';
}

const hunters = new Set<InteriorKind>([
  'wolf',
  'fox',
  'lynx',
  'weasel',
  'snake',
  'spider',
  'jumping-spider',
]);
const inaccessible = new Set<InteriorKind>([
  'squirrel',
  'duck',
  'pheasant',
  'mouse',
  'chipmunk',
  'weasel',
  'snake',
  'spider',
  'jumping-spider',
]);

const titles: Record<InteriorKind, string> = {
  badger: 'Барсучья нора',
  marmot: 'Нора сурка',
  mouse: 'Мышиная норка',
  chipmunk: 'Норка бурундука',
  mole: 'Кротовина',
  hedgehog: 'Убежище ежа',
  squirrel: 'Гнездо белки',
  fox: 'Лисья нора',
  lynx: 'Логово рыси',
  bear: 'Медвежья берлога',
  weasel: 'Нора ласки',
  snake: 'Убежище змеи',
  rabbit: 'Нора кроличьей семьи',
  beaver: 'Бобровая хатка',
  duck: 'Гнездо утки',
  pheasant: 'Гнездо фазана',
  spider: 'Убежище паука',
  'jumping-spider': 'Убежище паука-скакунчика',
  wolf: 'Волчье логово',
};

export function canVisitShelter(kind: InteriorKind): boolean {
  // Дупла, открытые гнёзда и ходы меньше тела взрослого кролика не являются локациями.
  return !inaccessible.has(kind);
}

export function interiorProfile(kind: InteriorKind): InteriorProfile {
  const title = titles[kind];
  if (hunters.has(kind))
    return {
      kind,
      title,
      scale: kind === 'wolf' || kind === 'lynx' ? 1.25 : 1,
      decor: 'bones',
    };
  if (kind === 'bear') return { kind, title, scale: 1.5, decor: 'leaves' };
  if (kind === 'beaver') return { kind, title, scale: 1.1, decor: 'branches' };
  if (kind === 'hedgehog') return { kind, title, scale: 0.85, decor: 'leaves' };
  return {
    kind,
    title,
    scale: kind === 'badger' ? 1.1 : 0.9,
    decor: 'pantry',
  };
}

export function shelterWelcome(kind: InteriorKind, trust: number, grievance = 0): Welcome {
  if (hunters.has(kind) || grievance > 0) return 'hostile';
  return trust >= FRIENDSHIP_TRUST ? 'friendly' : 'warning';
}

// Контур типовой локации: тамбур, общий зал, боковая кладовая и спальня в глубине.
export const INTERIOR_OUTLINE: readonly (readonly [number, number])[] = [
  [-1.2, 5],
  [1.2, 5],
  [1.2, 3],
  [3, 3],
  [3, 1.8],
  [5.5, 1.8],
  [5.5, -1.8],
  [3, -1.8],
  [3, -3],
  [1.8, -3],
  [1.8, -5.5],
  [-1.8, -5.5],
  [-1.8, -3],
  [-3, -3],
  [-3, 3],
  [-1.2, 3],
];

export function insideInterior(x: number, z: number, scale: number, margin = 0.25): boolean {
  const contains = (px: number, pz: number): boolean => {
    let inside = false;
    for (let i = 0, j = INTERIOR_OUTLINE.length - 1; i < INTERIOR_OUTLINE.length; j = i++) {
      const a = INTERIOR_OUTLINE[i];
      const b = INTERIOR_OUTLINE[j];
      if (a[1] > pz !== b[1] > pz && px < ((b[0] - a[0]) * (pz - a[1])) / (b[1] - a[1]) + a[0])
        inside = !inside;
    }
    return inside;
  };
  return [
    [0, 0],
    [-margin, 0],
    [margin, 0],
    [0, -margin],
    [0, margin],
  ].every(([dx, dz]) => contains((x + dx) / scale, (z + dz) / scale));
}
