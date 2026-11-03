export type GroundHeight = (x: number, z: number) => number;
export type WildlifeKind = 'deer' | 'squirrel' | 'hedgehog' | 'beaver' | 'moose' | 'boar';
export interface PredatorProfile {
  swimSpeed?: number;
  health: number;
  range: number;
  runSpeed: number;
  walkSpeed: number;
  playerReach: number;
  playerCooldown: number;
  preyReach: number;
  preyCooldown: number;
  damage: number;
  counterDamage: number;
  dayRange: number;
  alwaysHunts: boolean;
  radius: number;
  mass: number;
}
export interface WildlifeProfile {
  swimSpeed?: number;
  health: number;
  defense: number;
  speed: number;
  range: number;
  radius: number;
  mass: number;
}
