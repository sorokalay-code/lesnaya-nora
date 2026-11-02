import type { PhysicalBody } from './AnimalPhysics';

/** Находит контакт капсул в горизонтальной плоскости, учитывая длину и поворот тела. */
export function bodyContact(a: PhysicalBody, b: PhysicalBody) {
  const ax = Math.sin(a.heading ?? 0) * (a.halfLength ?? 0);
  const az = Math.cos(a.heading ?? 0) * (a.halfLength ?? 0);
  const bx = Math.sin(b.heading ?? 0) * (b.halfLength ?? 0);
  const bz = Math.cos(b.heading ?? 0) * (b.halfLength ?? 0);
  const ux = ax * 2,
    uz = az * 2,
    vx = bx * 2,
    vz = bz * 2;
  const wx = a.x - ax - (b.x - bx),
    wz = a.z - az - (b.z - bz);
  const aa = ux * ux + uz * uz,
    bb = ux * vx + uz * vz,
    cc = vx * vx + vz * vz;
  const dd = ux * wx + uz * wz,
    ee = vx * wx + vz * wz;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  // Параметры ближайших точек двух отрезков; нулевая длина превращает капсулу в круг.
  let s = aa > 0.000001 ? clamp(-dd / aa) : 0;
  let t = 0;
  if (cc > 0.000001) {
    const denominator = aa * cc - bb * bb;
    if (denominator > 0.000001) s = clamp((bb * ee - cc * dd) / denominator);
    t = clamp((bb * s + ee) / cc);
    if (aa > 0.000001) s = clamp((bb * t - dd) / aa);
  }
  const dx = b.x - bx + vx * t - (a.x - ax + ux * s);
  const dz = b.z - bz + vz * t - (a.z - az + uz * s);
  return { dx, dz, distance: Math.hypot(dx, dz) };
}
