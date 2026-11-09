import type { Excavation } from './Excavation';
import type { DigNode } from './types';
import { TUNNEL_FLOOR_DEPTH } from './CaveMesher';

export const NEST_ENTRANCE_MARGIN = 6;
const KIT_ATTACK_RADIUS = 2.5;
const KIT_ATTACK_HEIGHT = 2.5;
const KIT_ATTACK_PATH = 3.5;
const PLAYER_ATTACK_RADIUS = 2.3;
const PLAYER_ATTACK_PATH = 3.5;

/** Общие правила досягаемости у входа для нападений и оценки места гнезда. */
export class BurrowSafety {
  static kitExposed(earth: Excavation, opening: DigNode, position: DigNode): boolean {
    if (
      Math.hypot(position.x - opening.x, position.z - opening.z) >= KIT_ATTACK_RADIUS ||
      Math.abs(position.y - (opening.y - TUNNEL_FLOOR_DEPTH)) >= KIT_ATTACK_HEIGHT
    )
      return false;
    return this.pathReaches(earth, opening, position, KIT_ATTACK_PATH);
  }

  static playerExposed(
    earth: Excavation,
    opening: DigNode,
    position: DigNode,
    kind: 'fox' | 'weasel',
  ): boolean {
    if (
      !earth.isSheltered(position.x, position.y, position.z) ||
      earth.depthAt(position.x, position.y, position.z) >= (kind === 'weasel' ? 8 : 5) ||
      Math.hypot(position.x - opening.x, position.z - opening.z) >= PLAYER_ATTACK_RADIUS
    )
      return false;
    return this.pathReaches(earth, opening, position, PLAYER_ATTACK_PATH);
  }

  private static pathReaches(
    earth: Excavation,
    opening: DigNode,
    position: DigNode,
    reach: number,
  ): boolean {
    const location = earth.burrowAt(position);
    return (
      !!location &&
      location.network.hasOpening(opening) &&
      location.network.distanceFromOpening(opening, location) <= reach
    );
  }
}
