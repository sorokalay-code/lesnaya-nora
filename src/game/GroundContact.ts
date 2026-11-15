import type { Excavation } from './Excavation';
import type { DigNode } from './types';
import type { WaterNavigation } from './WaterNavigation';

const PROBE_SPACING_METERS = 0.16;
const MAX_ASCENT_GRADE = 1.15;
const MAX_DESCENT_GRADE = 1.5;
const MAX_TUNNEL_STEP_METERS = 0.4;
const CONTACT_EPSILON = 0.0001;
const UPHILL_EFFORT = 0.28;

interface GroundStep {
  heightAt: (x: number, z: number, from: DigNode) => number | undefined;
  slopeLimit?: (from: DigNode, x: number, z: number, y: number) => boolean;
  canOccupy?: (x: number, z: number, y: number) => boolean;
  surfaceSpeed?: boolean;
  travelBudget?: number;
}

/** Возвращает последнюю проходимую точку. Высота опоры меняется на каждом подшаге. */
export function traceGround(from: DigNode, x: number, z: number, step: GroundStep): DigNode {
  const dx = x - from.x;
  const dz = z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= CONTACT_EPSILON) return from;

  const count = Math.ceil(distance / PROBE_SPACING_METERS);
  const stride = distance / count;
  let current = from;
  let remaining = step.travelBudget ?? distance;
  for (let i = 1; i <= count; i++) {
    const nx = from.x + (dx * i) / count;
    const nz = from.z + (dz * i) / count;
    const y = step.heightAt(nx, nz, current);
    if (y === undefined) break;

    const rise = y - current.y;
    const grade = rise >= 0 ? MAX_ASCENT_GRADE : MAX_DESCENT_GRADE;
    const onSurface = step.slopeLimit?.(current, nx, nz, y) !== false;
    const limit = onSurface ? stride * grade : MAX_TUNNEL_STEP_METERS;
    if (Math.abs(rise) > limit + CONTACT_EPSILON || step.canOccupy?.(nx, nz, y) === false) break;

    if (step.surfaceSpeed) {
      // Скорость задана вдоль поверхности. Подъём требует чуть больше усилия, чем спуск.
      const cost = onSurface
        ? Math.hypot(rise, stride) + Math.max(0, rise) * UPHILL_EFFORT
        : stride;
      if (cost > remaining + CONTACT_EPSILON) {
        const fraction = remaining / cost;
        const endX = current.x + (nx - current.x) * fraction;
        const endZ = current.z + (nz - current.z) * fraction;
        const height = step.heightAt(endX, endZ, current);
        if (
          height !== undefined &&
          Math.abs(height - current.y) <= limit * fraction + CONTACT_EPSILON &&
          step.canOccupy?.(endX, endZ, height) !== false
        )
          current = { x: endX, y: height, z: endZ };
        break;
      }
      remaining -= cost;
    }
    current = { x: nx, y, z: nz };
    if (step.surfaceSpeed && remaining <= CONTACT_EPSILON) break;
  }
  return current;
}

export function walkOnExcavation(
  earth: Excavation,
  from: DigNode,
  x: number,
  z: number,
  water?: WaterNavigation,
  immersion = 0,
  canOccupy?: GroundStep['canOccupy'],
  travelBudget?: number,
): DigNode {
  return traceGround(from, x, z, {
    heightAt: (nx, nz, previous) => {
      const inside = earth.isSheltered(previous.x, previous.y, previous.z);
      if (!earth.canMoveTo(nx, nz, previous.y, inside)) return;

      const floor = earth.floorAt(nx, nz, previous.y, inside);
      return inside || !water ? floor : water.height(nx, nz, immersion, floor);
    },
    slopeLimit: (previous, nx, nz, y) =>
      !earth.isSheltered(previous.x, previous.y, previous.z) &&
      !earth.isSheltered(nx, y, nz) &&
      !water?.terrain.waterAt(previous.x, previous.z) &&
      !water?.terrain.waterAt(nx, nz),
    canOccupy,
    surfaceSpeed: travelBudget !== undefined,
    travelBudget,
  });
}
