import type { DigNode } from './types';

export interface GardenPlot {
  id: number;
  x: number;
  z: number;
  radius: number;
  door: DigNode;
  house?: { x: number; z: number; halfWidth: number; halfDepth: number };
}
