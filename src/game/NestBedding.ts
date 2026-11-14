import type { Excavation } from './Excavation';
import type { DigNode, NestData } from './types';

export const NEST_FUR_COST = 6;
export const NEST_BEDDING_RADIUS = 2.3;
export const INSULATED_WARMING_MULTIPLIER = 2;

export function atUndergroundNest(earth: Excavation, player: DigNode, nest: NestData): boolean {
  if (
    Math.hypot(nest.x - player.x, nest.y - player.y, nest.z - player.z) >= NEST_BEDDING_RADIUS ||
    !earth.isSheltered(player.x, player.y, player.z) ||
    !earth.isSheltered(nest.x, nest.y, nest.z)
  )
    return false;
  const room = earth.burrowAt(player);
  return !!room && earth.burrowAt(nest)?.network === room.network;
}
