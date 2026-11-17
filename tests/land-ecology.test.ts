import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene } from 'three';
import { AnimalFactory, RabbitFactory } from '../src/game/animals';
import { AnimalHabitats } from '../src/game/AnimalHabitats';
import { Excavation } from '../src/game/Excavation';
import { HuntingGrounds } from '../src/game/HuntingGrounds';
import { PREDATOR_FAMILIES, WILDLIFE_FAMILIES } from '../src/game/MammalNursery';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WildRabbitBreeding } from '../src/game/session/WildRabbitBreeding';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import type { Biome, SaveData } from '../src/game/types';
import { WildlifeForage } from '../src/game/WildlifeForage';
import type { Resource, World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig, type WorldConfig } from '../src/game/WorldConfig';
import { loadModels } from './model-fixture';

await loadModels(...WILDLIFE_FAMILIES, ...PREDATOR_FAMILIES, 'dog', 'snake', 'rabbit');

const ground = () => 0;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
const garden = { x: 19, z: -18, radius: 7, biome: 'garden' as const, label: 'Огород' };

function start(configure: (counts: WorldConfig['creatures']) => void): SaveData {
  const config = defaultWorldConfig();
  config.size = 65;
  config.neighborFamilySize = 0;
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  configure(config.creatures);
  return NewGameFactory.create(31415, 0, new RabbitFactory(new Random(2)), config);
}

function fixture(save: SaveData) {
  const scene = new Scene();
  const world = {
    scene,
    seed: save.seed,
    size: save.worldConfig!.size,
    resources: [],
    waterSources: [],
    layout: { gardens: [garden] },
    heightAt: ground,
    biomeAt: (x: number, z: number): Biome =>
      distance(garden, { x, z }) < garden.radius ? 'garden' : x < 0 ? 'forest' : 'meadow',
    treeLocations: Array.from({ length: 21 }, (_, index) => ({
      x: -8 - (index % 3) * 13,
      z: -47 + Math.floor(index / 3) * 14,
      nestHeight: 3,
    })),
  } as unknown as World;
  const population = new WorldPopulation({
    scene,
    world,
    save,
    rng: new Random(save.seed),
    markPartner() {},
    onDeath: (animal) => {
      const id: unknown = animal.root.userData.remainsIdentity;
      if (typeof id === 'string') (save.deadPopulation ??= []).push(id);
    },
  });
  let time = 0;
  const step = (clock: number, seconds = 1.2) => {
    save.clock = clock;
    for (let dt = 0; dt < seconds; dt += 0.1) {
      time += 0.1;
      population.ecology.prepareHabitats(time, clock, population.predators);
      for (const actor of population.predators) actor.update(0.1, time, 0, 0, true, false, ground);
      population.ecology.update(0.1, time, clock, 0, 0, ground, population.predators, false);
    }
  };
  return { ...population, scene, world, save, step };
}

function roundTrip(save: SaveData): SaveData {
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  try {
    const repository = new SaveRepository('land-ecology-test');
    repository.store(save);
    return repository.load();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('new shelters stand at suitable sites, dogs walk the edge, and separate herd sizes produce different routes', () => {
  const f = fixture(
    start((counts) => {
      counts.fox = counts.lynx = counts.weasel = counts.snake = counts.bear = counts.dog = 1;
      counts.deer = 5;
      counts.moose = counts.boar = 3;
    }),
  );
  for (const kind of ['fox', 'lynx', 'weasel', 'snake', 'bear'] as const) {
    const shelter = f.scene.getObjectByName(`wildlife-shelter-${kind}-0`);
    assert.ok(shelter, kind);
    assert.notEqual(f.world.biomeAt(shelter.position.x, shelter.position.z), 'garden');
  }
  const dog = f.predators.find((actor) => actor.kind === 'dog')!;
  f.step(720);
  const first = dog.destination!;
  f.step(780);
  assert.ok(distance(first, dog.destination!) > 3);
  assert.ok(distance(dog.destination!, garden) > garden.radius);

  const homes = (kind: string) =>
    f.wildlife.filter((actor) => actor.kind === kind).map((actor) => actor.habitat);
  const herd = homes('deer');
  assert.ok(herd[0] === herd[3] && herd[0] !== herd[4]);
  assert.equal(new Set(homes('moose')).size, 3);
  const boars = homes('boar');
  assert.ok(boars[0] === boars[2] && boars[0] !== boars[1]);
});

test('both predator and non-predator families have visible age variants and round-trip their nests', () => {
  const save = start((counts) => {
    for (const kind of [...WILDLIFE_FAMILIES, ...PREDATOR_FAMILIES]) counts[kind] = 4;
  });
  const f = fixture(save);
  f.step(save.clock);
  const found = new Set(Object.keys(save.mammalNurseries ?? {}).map((key) => key.split(':')[0]));
  for (const kind of [...WILDLIFE_FAMILIES, ...PREDATOR_FAMILIES]) {
    if (kind !== 'bear' && kind !== 'beaver')
      assert.ok(found.has(kind), `mother and father for ${kind}`);
  }
  f.step(3300);
  const young = [...f.predators, ...f.wildlife].filter((actor) => actor.juvenile);
  for (const kind of found)
    assert.ok(
      young.some((actor) => actor.kind === kind),
      `newborn ${kind}`,
    );
  assert.ok(young.some((actor) => actor.kind === 'fox' && actor.growthScale < 0.8));
  assert.ok(young.some((actor) => actor.kind === 'deer' && !actor.inShelter));
  const piglet = young.find((actor) => actor.kind === 'boar');
  assert.ok(piglet?.root.getObjectByName('PigletStripes'));
  f.ecology.capture();
  const loaded = fixture(roundTrip(save));
  const restored = [...loaded.predators, ...loaded.wildlife].filter((actor) => actor.juvenile);
  assert.deepEqual(
    new Set(restored.map((actor) => actor.mammalId)),
    new Set(young.map((actor) => actor.mammalId)),
  );
  assert.ok(restored.every((actor) => actor.mammalOrigin?.parents.length === 2));
});

test('bears rest in rock dens over winter and leave with cubs in spring', () => {
  const save = start((counts) => {
    counts.bear = 3;
  });
  const f = fixture(save);
  f.step(117 * 1440 + 420, 25);
  assert.ok(f.wildlife.every((animal) => animal.kind === 'bear' && animal.inShelter));
  const nursery = Object.values(save.mammalNurseries ?? {})[0];
  assert.ok(nursery?.dueAt);
  f.step(nursery.dueAt, 5);
  assert.ok(f.wildlife.some((animal) => animal.juvenile && animal.inShelter));
  f.ecology.capture();
  const loaded = fixture(roundTrip(save));
  loaded.step(120 * 1440 + 600, 12);
  assert.ok(loaded.wildlife.some((animal) => animal.juvenile && !animal.inShelter));
});

test('a weasel borrows a vacant mouse burrow and restores that entrance on load', () => {
  const f = fixture(
    start((counts) => {
      counts.weasel = counts.mouse = 1;
    }),
  );
  const mouse = f.wildlife.find((actor) => actor.kind === 'mouse')!;
  const weasel = f.predators.find((actor) => actor.kind === 'weasel')!;
  const den = mouse.shelter!;
  const habitats = new AnimalHabitats(f.world, f.save.seed, f.save.worldConfig!.size);
  const clock = [570, 630, 690, 750].find(
    (at) => habitats.intent(weasel.homeTerritory!, at).resting,
  )!;
  mouse.health = 0;
  weasel.moveTo(den.approach.x, den.approach.z, den.approach.y);
  f.step(clock, 20);
  assert.ok(weasel.inDen && weasel.shelter?.site.kind === 'mouse');
  f.ecology.capture();

  const loaded = fixture(roundTrip(f.save));
  const restored = loaded.predators.find((actor) => actor.kind === 'weasel')!;
  assert.ok(restored.inDen && restored.shelter?.site.kind === 'mouse');
  assert.ok(distance(restored, den.entrance) < 0.01);
});

test('preferred prey changes a hunting route and the food route returns after the trail fades', () => {
  const { world, save } = fixture(start(() => {}));
  const habitats = new AnimalHabitats(world, save.seed, save.worldConfig!.size);
  const home = habitats.predator('fox', 0)!;
  const empty = habitats.predatorIntent('fox', home, 500, () => 0).destination;
  const prey = new HuntingGrounds();
  const mice = Array.from({ length: 8 }, (_, index) =>
    AnimalFactory.forest('mouse', home.x + 8, home.z + index * 0.5, new Random(index)),
  );
  prey.refresh(mice, [], () => true);
  const revised = new AnimalHabitats(world, save.seed, save.worldConfig!.size);
  const weighted = revised.predatorIntent('fox', revised.predator('fox', 0)!, 500, (point) =>
    prey.score('fox', point),
  ).destination;
  assert.ok(distance(weighted, mice[0]) < distance(empty, mice[0]));
  assert.ok(prey.score('fox', mice[0]) > 0 && prey.score('wolf', mice[0]) === 0);

  const carrot = { x: 1.4, z: 0, kind: 'carrot', available: true } as Resource;
  const berries = { x: -5, z: 0, kind: 'berries', available: true } as Resource;
  const forage = new WildlifeForage([carrot, berries]);
  const animal = { x: 0, z: 0, kind: 'marmot' as const };
  const risk = (x: number, z: number) => habitats.riskAt(x, z);
  const hunter = {};
  habitats.updateHuntingTrails(
    200,
    new Map([
      [
        hunter,
        {
          start: carrot,
          end: { x: 6, z: 0 },
          radius: 2,
          strength: 3.8,
        },
      ],
    ]),
  );
  assert.equal(forage.find(animal, risk)?.kind, 'berries');
  habitats.updateHuntingTrails(285, new Map());
  assert.equal(forage.find(animal, risk)?.kind, 'carrot');
});

test('neighbor newborns keep the maternal burrow and lineage while the player family stays separate', () => {
  const save = start((counts) => {
    counts.rabbit = 2;
  });
  const f = fixture(save);
  const earth = new Excavation(f.scene, f.world, save);
  const mother = f.rabbits.find((actor) => actor.data.sex === 'female')!;
  const father = f.rabbits.find((actor) => actor !== mother)!;
  const breeding = new WildRabbitBreeding({ save, world: f.world, rabbits: f.rabbits, earth });
  f.ecology.updateRabbitTerritory(mother, 0, 0, earth);
  const nest = mother.wildShelter;
  assert.ok(nest);
  mother.data.pregnancy = { fatherId: father.data.id, dueAt: save.clock };
  breeding.update(0, 1);
  const child = f.rabbits[2];
  assert.ok(child.inShelter && child.data.lineage?.ancestors.length);
  assert.equal(child.data.wildBurrowId, mother.data.id);
  assert.ok(distance(child, nest.entrance) < 0.001);
  const loaded = roundTrip(save);
  const restored = fixture(loaded);
  assert.equal(restored.rabbits[2].data.wildBurrowId, mother.data.id);
  assert.ok(restored.rabbits[2].inShelter);
  assert.equal(loaded.kits.length, 0);
});
