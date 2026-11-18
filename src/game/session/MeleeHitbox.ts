export interface MeleeSector {
  x: number;
  z: number;
  direction: { x: number; z: number };
  reach: number;
  arcCosine: number;
}

export interface MeleeBody {
  x: number;
  z: number;
  radius: number;
}

/** Расстояние до поверхности цели в секторе удара; центр за спиной не считается целью. */
export function meleeContact(sector: MeleeSector, target: MeleeBody): number | undefined {
  const dx = target.x - sector.x;
  const dz = target.z - sector.z;
  const forward = dx * sector.direction.x + dz * sector.direction.z;
  if (forward < 0) return undefined;

  const distance = Math.hypot(dx, dz);
  if (distance > sector.reach + target.radius) return undefined;

  // Внутри конуса достаточно радиальной дистанции. Снаружи проверяем ближайшую
  // точку его бокового отрезка: крупную цель можно задеть краем лапы или пасти.
  let separation = Math.max(0, distance - sector.reach);
  if (distance > 0.001 && forward / distance < sector.arcCosine) {
    const side = Math.abs(dx * sector.direction.z - dz * sector.direction.x);
    const sine = Math.sqrt(1 - sector.arcCosine ** 2);
    const along = Math.max(0, Math.min(sector.reach, forward * sector.arcCosine + side * sine));
    separation = Math.hypot(forward - along * sector.arcCosine, side - along * sine);
  }
  if (separation > target.radius) return undefined;

  return Math.max(0, distance - target.radius);
}
