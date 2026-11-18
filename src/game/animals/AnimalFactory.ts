import { Duck } from './Duck';
import { Mouse } from './Mouse';
import { Fish } from './Fish';
import { Frog } from './Frog';
import { Random } from '../Random';
import type { PartnerTraits, PredatorKind } from '../types';
import { RabbitActor } from './RabbitActor';
import { FangedRabbit } from './FangedRabbit';
import { Bear } from './Bear';
import { Beaver } from './Beaver';
import { Deer } from './Deer';
import { Boar } from './Boar';
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
import { JumpingSpider } from './JumpingSpider';
import { AnimalAppearance, type AppearanceOptions } from '../AnimalAppearance';
import { Pike } from './Pike';
import type { WaterBody } from '../WaterMap';
import { Badger } from './Badger';
import { Mole } from './Mole';
import { Marmot } from './Marmot';
import { Pheasant } from './Pheasant';
import { Chipmunk } from './Chipmunk';
import { Hawk } from './Hawk';
import { Owl } from './Owl';
import type { FlyingRaptor, RaptorKind } from './FlyingRaptor';
import { RoeDeer } from './RoeDeer';
import { Leech, type LeechState } from './Leech';

type Constructor<T> = new (x: number, z: number, rng: Random, appearance?: AppearanceOptions) => T;

/** Реестр фабрик создаёт конкретные виды, не раскрывая их конструкторы игровым системам. */
export class AnimalFactory {
  static leech(state: LeechState): Leech {
    return new Leech(state);
  }

  static pike(x: number, z: number, habitat: WaterBody, rng: Random): Pike {
    return new Pike(x, z, habitat, rng);
  }

  private static readonly predators: Record<PredatorKind, Constructor<Predator>> = {
    'jumping-spider': JumpingSpider,
    spider: Spider,
    fox: Fox,
    wolf: Wolf,
    dog: Dog,
    lynx: Lynx,
    weasel: Weasel,
    snake: Snake,
  };
  private static readonly wildlife: Record<WildlifeKind, Constructor<ForestAnimal>> = {
    badger: Badger,
    mole: Mole,
    marmot: Marmot,
    pheasant: Pheasant,
    chipmunk: Chipmunk,
    boar: Boar,
    bear: Bear,
    duck: Duck,
    mouse: Mouse,
    fish: Fish,
    frog: Frog,
    deer: Deer,
    'roe-deer': RoeDeer,
    squirrel: Squirrel,
    hedgehog: Hedgehog,
    beaver: Beaver,
    moose: Moose,
  };

  private static readonly raptors: Record<RaptorKind, Constructor<FlyingRaptor>> = {
    hawk: Hawk,
    owl: Owl,
  };

  static raptor(kind: RaptorKind, x: number, z: number, rng: Random): FlyingRaptor {
    return new this.raptors[kind](x, z, rng, AnimalAppearance.seeded(kind, x, z));
  }

  static predator(
    kind: PredatorKind,
    x: number,
    z: number,
    rng: Random,
    appearance?: AppearanceOptions,
  ): Predator {
    return new this.predators[kind](x, z, rng, appearance ?? AnimalAppearance.seeded(kind, x, z));
  }

  static wolf(x: number, z: number, rng: Random, appearance?: AppearanceOptions): Wolf {
    return new Wolf(x, z, rng, appearance ?? AnimalAppearance.seeded('wolf', x, z));
  }

  static rabbit(data: PartnerTraits, rng: Random): RabbitActor {
    return data.genes.anatomy.fangs ? new FangedRabbit(data, rng) : new RabbitActor(data, rng);
  }

  static forest(
    kind: WildlifeKind,
    x: number,
    z: number,
    rng: Random,
    appearance?: AppearanceOptions,
  ): ForestAnimal {
    return new this.wildlife[kind](x, z, rng, appearance ?? AnimalAppearance.seeded(kind, x, z));
  }
}

export const createPredatorActor = (
  kind: PredatorKind,
  x: number,
  z: number,
  rng: Random,
  appearance?: AppearanceOptions,
) => AnimalFactory.predator(kind, x, z, rng, appearance);
export const createForestAnimal = (
  kind: WildlifeKind,
  x: number,
  z: number,
  rng: Random,
  appearance?: AppearanceOptions,
) => AnimalFactory.forest(kind, x, z, rng, appearance);
