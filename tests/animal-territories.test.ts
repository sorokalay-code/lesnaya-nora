import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Scene } from 'three';
import { AnimalHabitats } from '../src/game/AnimalHabitats';
import { RabbitFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { WildlifeForage } from '../src/game/WildlifeForage';
import type { Biome, FoodKind, SaveData } from '../src/game/types';
import type { Resource, World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig } from '../src/game/WorldConfig';
import { loadModels } from './model-fixture';

await loadModels('wolf', 'deer', 'fox', 'marmot', 'beaver');

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

function terrain(scene = new Scene()): World {
  return {
    scene,
    resources: [],
    waterSources: [],
    treeLocations: [],
    seed: 31415,
    heightAt: () => 0,
    biomeAt: (x: number): Biome => (x < 0 ? 'forest' : 'meadow'),
    nearWater: () => false,
  } as unknown as World;
}

function start(): SaveData {
  const config = defaultWorldConfig();
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  config.creatures.wolf = 5;
  config.creatures.deer = 3;
  config.creatures.marmot = 1;
  return NewGameFactory.create(31415, 0, new RabbitFactory(new Random(2)), config);
}

function population(save: SaveData, notes: string[] = []) {
  const scene = new Scene();
  return new WorldPopulation({
    save,
    scene,
    world: terrain(scene),
    rng: new Random(save.seed),
    markPartner() {},
    onDenDiscovery: () => notes.push('den'),
    onWolfArrival: () => notes.push('arrival'),
    onDeath: (animal) => {
      const id: unknown = animal.root.userData.remainsIdentity;
      if (typeof id === 'string') (save.deadPopulation ??= []).push(id);
    },
  });
}

test('wolves of a pack leave the same den during the evening and return to it after hunting', () => {
  const save = start();
  const f = population(save);
  const wolves = f.predators.filter((animal) => animal.kind === 'wolf');
  assert.equal(wolves.length, 5);
  const pack = wolves.slice(0, 4);
  const den = pack[0].homeTerritory!;
  assert.ok(pack.every((wolf) => wolf.homeTerritory === den && distance(wolf, den) < 6));
  assert.ok(den.x < 0 && distance(wolves[4].homeTerritory!, den) > 12);
  let time = 0;
  const simulate = (startAt: number, duration: number) => {
    for (let frame = 0; frame < duration * 20; frame++) {
      save.clock = startAt + frame * 0.3;
      time += 0.05;
      f.ecology.prepareHabitats(time, save.clock, wolves);
      for (const wolf of wolves) wolf.update(0.05, time, 0, 0, true, false, () => 0);
    }
  };

  simulate(1090, 23);
  assert.ok(pack.every((wolf) => wolf.huntingOpen));
  assert.ok(pack.filter((wolf) => distance(wolf, den) > 13).length >= 3);
  assert.ok(pack.every((wolf) => !wolf.canPursue(den.x + den.radius * 2, den.z)));
  simulate(1330, 37);
  assert.ok(pack.every((wolf) => !wolf.huntingOpen && distance(wolf, den) < 12));
});

test('a lost wolf saves its vacant slot and returns near the den only after a day and away from the player', () => {
  const save = start();
  const f = population(save);
  const wolf = f.predators.find((animal) => animal.kind === 'wolf')!;
  const den = wolf.homeTerritory!;
  const id = String(wolf.root.userData.remainsIdentity);
  const survivor = f.predators[1];
  survivor.moveTo(den.x + 12, den.z - 4, 0);
  survivor.health = 41;
  wolf.moveTo(den.x + 24, den.z, 0);
  wolf.health = 0;
  const due = save.clock + 1440;
  f.ecology.update(0, 0, save.clock, -90, -90, () => 0, f.predators, false);
  assert.ok(!f.predators.includes(wolf));
  f.ecology.capture();
  assert.deepEqual(save.wolves?.[id], { state: 'vacant', replaceAt: due });

  const entry = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entry.get(key) ?? null,
      setItem: (key: string, value: string) => entry.set(key, value),
    },
  });
  let loaded: SaveData;
  try {
    const repository = new SaveRepository('territory-test');
    repository.store(save);
    loaded = repository.load();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
  const notes: string[] = [];
  const restored = population(loaded, notes);
  const advancing = (time: number, clock: number, x: number, z: number) => {
    loaded.clock = clock;
    restored.ecology.update(0, time, clock, x, z, () => 0, restored.predators, false);
  };
  assert.ok(
    restored.predators.some(
      (actor) => actor.x === survivor.x && actor.z === survivor.z && actor.health === 41,
    ),
  );
  advancing(3, due - 1, 97, 97);
  assert.equal(restored.predators.length, 4);
  advancing(6, due, den.x, den.z);
  assert.equal(restored.predators.length, 4);
  assert.ok(loaded.discoveries?.some((place) => place.label === 'Волчье логово'));
  advancing(9, due + 16, 97, 97);
  const replacement = restored.predators.find(
    (animal) => animal.root.userData.remainsIdentity === id,
  );
  assert.ok(replacement && distance(replacement, den) < 6);
  assert.equal(replacement.health, replacement.maxHealth);
  assert.equal(loaded.deadPopulation?.includes(id), false);
  advancing(12, due + 32, 97, 97);
  assert.equal(restored.predators.length, 5);
  assert.deepEqual(notes, ['den', 'arrival']);
});

test('roaming herds share feeding grounds while burrowing wildlife has a smaller local range', () => {
  const save = start();
  const f = population(save);
  const deer = f.wildlife.filter(({ kind }) => kind === 'deer');
  const marmot = f.wildlife.find(({ kind }) => kind === 'marmot')!;
  assert.ok(deer.every((animal) => animal.habitat === deer[0].habitat));
  assert.equal(deer[0].habitat?.profile.mode, 'roaming');
  assert.equal(marmot.habitat?.profile.mode, 'burrow');
  assert.ok(marmot.habitat!.radius < deer[0].habitat!.radius);
  assert.ok(marmot.habitat!.x > 0);
  f.ecology.prepareHabitats(1, 420, f.predators);
  const pasture = deer[0].destination!;
  f.ecology.prepareHabitats(30, 860, f.predators);
  assert.ok(distance(pasture, deer[0].destination!) > 4);
  assert.ok(distance(marmot, marmot.destination!) < marmot.habitat!.radius);
  f.ecology.prepareHabitats(31, 1430, f.predators);
  assert.equal(marmot.foragingAllowed, false);
  assert.ok(distance(marmot.habitat!, marmot.destination!) < 3);
});

test('wildlife chooses food by species and avoids a wolf patrol with a safer option nearby', () => {
  const plant = (x: number, kind: FoodKind): Resource => ({
    id: x,
    kind,
    x,
    z: 0,
    mesh: new Group(),
    available: true,
    regrowAt: 0,
  });
  const carrot = plant(1.5, 'carrot');
  const clover = plant(-4, 'clover');
  const acorn = plant(5, 'acorn');
  const search = new WildlifeForage([carrot, clover, acorn]);
  const habitats = new AnimalHabitats(terrain(), 31415, 110);
  const den = habitats.predator('wolf', 0)!;
  assert.equal(
    search.find({ kind: 'deer', x: 0, z: 0 }, () => 0),
    carrot,
  );
  habitats.setWolfRoutes([{ home: den, destination: carrot, hunting: true, resting: false }]);
  assert.ok(habitats.riskAt(carrot.x, carrot.z) > habitats.riskAt(clover.x, clover.z));
  assert.equal(
    search.find({ kind: 'deer', x: -2, z: 0 }, (x, z) => (x > 0 ? 3 : 0)),
    clover,
  );
  assert.equal(
    search.find({ kind: 'squirrel', x: 3, z: 0 }, () => 0),
    acorn,
  );
});
