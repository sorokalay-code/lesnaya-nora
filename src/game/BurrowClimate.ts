import { INSULATED_WARMING_MULTIPLIER } from './NestBedding';
import type { DigNode, Weather } from './types';
import type { World } from './World';

export type BurrowMoisture = 'dry' | 'damp';

const SHORE_MARGIN_METERS = 4;
const SHORE_DEPTH_METERS = 2;
const DEEP_SOIL_METERS = 5;
const RAIN_REACH_METERS = 2;
const DAMP_WARMING_MULTIPLIER = 0.5;

export function burrowMoisture(
  world: Pick<World, 'heightAt' | 'biomeAt' | 'nearWater'>,
  point: DigNode,
  weather: Weather,
): BurrowMoisture {
  const { x, y, z } = point;
  const depth = world.heightAt(x, z) - y;
  const damp =
    world.biomeAt(x, z) === 'swamp' ||
    depth >= DEEP_SOIL_METERS ||
    (depth >= SHORE_DEPTH_METERS && world.nearWater(x, z, SHORE_MARGIN_METERS)) ||
    (weather === 'rain' && depth <= RAIN_REACH_METERS);
  return damp ? 'damp' : 'dry';
}

export function burrowWarming(moisture: BurrowMoisture, insulated: boolean): number {
  const soil = moisture === 'damp' ? DAMP_WARMING_MULTIPLIER : 1;
  return soil * (insulated ? INSULATED_WARMING_MULTIPLIER : 1);
}
