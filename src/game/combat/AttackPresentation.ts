import type { Object3D } from 'three';

export interface AttackTimeline {
  elapsed: number;
  duration: number;
}

export interface RabbitAttackPresentation extends AttackTimeline {
  kind: 'swipe' | 'bite';
}

/** Снимок атаки для модели и камеры; игровое решение о попадании остаётся в PlayerCombat. */
export function rabbitAttackPresentation(
  root: Object3D,
  time: number,
): RabbitAttackPresentation | undefined {
  const { action, actionStartedAt, actionUntil } = root.userData;
  if (
    (action !== 'swipe' && action !== 'bite') ||
    typeof actionStartedAt !== 'number' ||
    typeof actionUntil !== 'number' ||
    time < actionStartedAt ||
    time >= actionUntil
  )
    return undefined;

  return { kind: action, elapsed: time - actionStartedAt, duration: actionUntil - actionStartedAt };
}
