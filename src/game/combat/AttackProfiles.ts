export type RabbitAttack = 'swipe' | 'bite';

/** Параметры удара общие для игровой логики, генератора анимаций и камеры. */
export const RABBIT_ATTACKS = {
  swipe: { damage: 2, energy: 7, windup: 0.16, recovery: 0.65, reach: 0.55, arc: 0.1 },
  bite: { damage: 4, energy: 14, windup: 0.28, recovery: 1.1, reach: 0.4, arc: 0.4 },
} as const;
