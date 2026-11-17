import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene } from 'three';
import { AnimalFactory, RabbitFactory } from '../src/game/animals';
import { WILDLIFE_HABITATS } from '../src/game/HabitatProfiles';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import type { Biome, SaveData } from '../src/game/types';
import { wildlifeShelterProfile } from '../src/game/WildlifeShelterProfiles';
import { WildlifeShelters } from '../src/game/WildlifeShelters';
import type { World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig } from '../src/game/WorldConfig';
import { loadModels } from './model-fixture';

const residents = [
  'badger',
  'marmot',
  'mouse',
  'chipmunk',
  'mole',
  'hedgehog',
  'squirrel',
] as const;
await loadModels(...residents, 'roe-deer', 'fox');

const ground = () => 0;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

function start() {
  const config = defaultWorldConfig();
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  for (const kind of residents) config.creatures[kind] = 1;
  config.creatures['roe-deer'] = 1;
  return NewGameFactory.create(31415, 0, new RabbitFactory(new Random(2)), config);
}

function population(save = start()) {
  const scene = new Scene();
  const world = {
    scene,
    resources: [],
    waterSources: [],
    heightAt: ground,
    biomeAt: (x: number): Biome => (x < 0 ? 'forest' : 'meadow'),
    treeLocations: Array.from({ length: 128 }, (_, i) => ({
      x: -6 - (i % 8) * 12,
      z: -90 + Math.floor(i / 8) * 12,
      nestHeight: 2.8,
    })),
  } as unknown as World;
  const animals = new WorldPopulation({
    scene,
    world,
    save,
    rng: new Random(save.seed),
    markPartner() {},
  });
  let time = 0;
  const step = (clock: number, seconds: number) => {
    save.clock = clock;
    for (let i = 0; i < seconds * 20; i++) {
      time += 0.05;
      animals.ecology.update(0.05, time, clock, 0, 0, ground, animals.predators, false);
    }
  };
  const resident = (kind: (typeof residents)[number] | 'roe-deer') =>
    animals.wildlife.find((animal) => animal.kind === kind)!;
  return { animals, resident, scene, save, step };
}

test('visible shelters match every resident and opposing schedules continue after a save', () => {
  const world = population();
  for (const kind of residents)
    assert.ok(world.scene.getObjectByName(`wildlife-shelter-${kind}-0`), kind);
  assert.equal(world.save.wildlifeShelters?.length, residents.length);
  assert.ok(world.scene.getObjectByName('wildlife-shelter-squirrel-0')!.position.y > 2);
  assert.equal(world.scene.getObjectByName('wildlife-shelter-roe-deer-0'), undefined);

  world.step(760, 13);
  for (const kind of ['badger', 'mouse', 'hedgehog'] as const) {
    assert.ok(world.resident(kind).inShelter && !world.resident(kind).root.visible);
  }
  for (const kind of ['marmot', 'chipmunk', 'squirrel'] as const)
    assert.ok(!world.resident(kind).inShelter);

  world.animals.ecology.capture();
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  try {
    const repository = new SaveRepository('wildlife-shelters-test');
    repository.store(world.save);
    const restored = population(repository.load());
    const badger = restored.resident('badger');
    const entry = { x: badger.x, z: badger.z };
    assert.ok(badger.inShelter && !badger.root.visible);
    assert.deepEqual(restored.save.wildlifeShelters, world.save.wildlifeShelters);

    restored.step(1270, 0.05);
    assert.ok(!badger.inShelter && badger.root.visible && distance(badger, entry) < 0.001);
    restored.step(1270, 22);
    for (const kind of ['marmot', 'chipmunk', 'squirrel'] as const)
      assert.ok(restored.resident(kind).inShelter, kind);
    assert.ok(distance(badger, entry) > 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('a threatened marmot uses a nearby entrance and remains hidden until it is safe', () => {
  const world = population();
  const marmot = world.resident('marmot');
  const site = world.save.wildlifeShelters!.find((home) => home.kind === 'marmot')!;
  const front = (d: number) => ({
    x: site.x - Math.sin(site.angle) * d,
    z: site.z - Math.cos(site.angle) * d,
  });
  const begin = front(2.6);
  const intruder = front(6);
  marmot.moveTo(begin.x, begin.z, 0);
  const fox = AnimalFactory.predator('fox', intruder.x, intruder.z, new Random(3));
  world.animals.predators.push(fox);

  world.step(750, 2);
  const entry = front(wildlifeShelterProfile('marmot').radius * 0.9);
  assert.ok(marmot.inShelter && distance(marmot, entry) < 0.001);
  assert.notEqual(world.animals.ecology.targetFor(fox, [fox], 2), marmot);

  world.animals.predators.pop();
  world.step(750, 2);
  assert.ok(marmot.inShelter);
  world.step(750, 3);
  assert.ok(!marmot.inShelter && marmot.root.visible);
});

test('roe deer settle in different beds without a fixed home and move again at dusk', () => {
  const world = population();
  const roe = world.resident('roe-deer');
  world.step(740, 30);
  const midday = roe.restAt!;
  assert.ok(distance(roe, midday) < 0.6 && !roe.inShelter);
  assert.equal(roe.model.activeName, 'rest');
  assert.ok(roe.model.variants?.every((variant) => variant.clips.has('rest')));

  world.step(1060, 14);
  assert.ok(roe.foragingAllowed && distance(roe, midday) > 3);
  world.step(1390, 30);
  const night = roe.restAt!;
  assert.ok(distance(roe, night) < 0.6 && distance(midday, night) > 3);
});

test('a mole surfaces for a short outing and returns to its mound', () => {
  const world = population();
  const mole = world.resident('mole');
  const outing = 960 - (mole.habitat!.key % 240);
  world.step(outing - 30, 10);
  assert.ok(mole.inShelter);
  world.step(outing + 6, 4);
  assert.ok(!mole.inShelter && mole.root.visible);
  world.step(outing + 45, 12);
  assert.ok(mole.inShelter);
});

test('a flooded or steep habitat keeps its animals without placing a decorative entrance', () => {
  const scene = new Scene();
  const save = start();
  const home = { x: 22, z: 0, key: 8, radius: 5, profile: WILDLIFE_HABITATS.marmot };
  const water = { id: 'lake', kind: 'lake' as const, level: 1, radius: 20, depth: 1, points: [] };
  const flooded = new WildlifeShelters(
    {
      heightAt: ground,
      biomeAt: () => 'meadow',
      waterAt: () => ({ body: water, level: 1, depth: 1 }),
    },
    scene,
    save,
  );
  const steep = new WildlifeShelters(
    { heightAt: (x) => x * 2, biomeAt: () => 'meadow' },
    scene,
    save,
  );
  assert.equal(flooded.place('marmot', 0, home), undefined);
  assert.equal(steep.place('marmot', 0, home), undefined);
  assert.equal(scene.children.length, 0);
  assert.equal(save.wildlifeShelters, undefined);
});
