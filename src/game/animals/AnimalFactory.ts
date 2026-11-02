import { Random } from '../Random';
import type { PredatorKind } from '../types';
import { Bear } from './Bear';
import { Beaver } from './Beaver';
import { Deer } from './Deer';
import { Dog } from './Dog';
import type { ForestAnimal } from './ForestAnimal';
import { Fox } from './Fox';
import { Hedgehog } from './Hedgehog';
import { Lynx } from './Lynx';
import { Moose } from './Moose';
import type { Predator } from './Predator';
import { Snake } from './Snake';
import { Squirrel } from './Squirrel';
import type { WildlifeKind } from './types';
import { Weasel } from './Weasel';
import { Wolf } from './Wolf';
import { Spider } from './Spider';

type Constructor<T> = new (x: number, z: number, rng: Random) => T;

/** Реестр фабрик создаёт конкретные виды, не раскрывая их конструкторы игровым системам. */
export class AnimalFactory {
  private static readonly predators: Record<PredatorKind, Constructor<Predator>> = {
    spider: Spider,
    fox: Fox,
    wolf: Wolf,
    dog: Dog,
    lynx: Lynx,
    weasel: Weasel,
    bear: Bear,
    snake: Snake,
  };
  private static readonly wildlife: Record<WildlifeKind, Constructor<ForestAnimal>> = {
    deer: Deer,
    squirrel: Squirrel,
    hedgehog: Hedgehog,
    beaver: Beaver,
    moose: Moose,
  };

  static predator(kind: PredatorKind, x: number, z: number, rng: Random): Predator {
    return new this.predators[kind](x, z, rng);
  }

  static forest(kind: WildlifeKind, x: number, z: number, rng: Random): ForestAnimal {
    return new this.wildlife[kind](x, z, rng);
  }
}

export const createPredatorActor = (kind: PredatorKind, x: number, z: number, rng: Random) =>
  AnimalFactory.predator(kind, x, z, rng);
export const createForestAnimal = (kind: WildlifeKind, x: number, z: number, rng: Random) =>
  AnimalFactory.forest(kind, x, z, rng);
