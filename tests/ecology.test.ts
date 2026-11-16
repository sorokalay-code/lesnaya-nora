import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createForestAnimal, createPredatorActor } from '../src/game/animals';
import type { ModelInstance } from '../src/game/ModelAssets';
import { Random } from '../src/game/Random';
import { defaultWorldConfig } from '../src/game/WorldConfig';
import { WildlifeEcology } from '../src/game/WildlifeEcology';
import type { Resource, World } from '../src/game/World';
import type { SaveData } from '../src/game/types';
import { loadModels } from './model-fixture';

await loadModels('deer', 'moose', 'squirrel', 'bear', 'wolf', 'fox', 'frog');

class SocialRandom extends Random {
  override chance(): boolean {
    return true;
  }
}
const world = (resources: Resource[] = [], biome = 'garden') =>
  ({
    resources,
    waterSources: [],
    heightAt: () => 0,
    biomeAt: () => biome,
    harvest: (r: Resource) => {
      r.available = false;
      r.mesh.visible = false;
    },
  }) as unknown as World;

test('peaceful animals walk to plants and graze them', () => {
  const food = {
    x: 0.3,
    z: 0.2,
    kind: 'clover',
    available: true,
    mesh: new THREE.Group(),
  } as Resource;
  const scene = new THREE.Scene(),
    ecology = new WildlifeEcology(scene, world([food]), new Random(2));
  const deer = createForestAnimal('deer', 0, 0, new Random(3));
  ecology.animals.push(deer);
  scene.add(deer.root);
  ecology.update(0.1, 1, 300, 80, 80, () => 0, []);
  assert.equal(food.available, false);
});

test('frogs spawn near swamp water and do not graze plants', () => {
  const config = defaultWorldConfig();
  for (const kind of Object.keys(config.creatures) as (keyof typeof config.creatures)[])
    config.creatures[kind] = 0;
  config.creatures.frog = 1;
  const food = {
    x: 40.3,
    z: 30.2,
    kind: 'clover',
    available: true,
    mesh: new THREE.Group(),
  } as Resource;
  const wetland = {
    seed: 42,
    resources: [food],
    waterSources: [
      { x: 40, z: 30 },
      { x: -40, z: -30 },
    ],
    nearWater: () => true,
    waterAt: () => ({ level: 2, depth: 0.7 }),
    heightAt: () => 0,
    biomeAt: (x: number) => (x > 0 ? 'swamp' : 'forest'),
    harvest: (resource: Resource) => {
      resource.available = false;
    },
  } as unknown as World;
  const save = { seed: 42, worldConfig: config } as SaveData;
  const scene = new THREE.Scene();
  const ecology = new WildlifeEcology(scene, wetland, new Random(11), save);
  ecology.populate();

  assert.equal(ecology.animals.length, 1);
  const frog = ecology.animals[0];
  assert.equal(frog.kind, 'frog');
  assert.ok(Math.hypot(frog.x - 40, frog.z - 30) <= 4.5);
  assert.ok(Math.abs(frog.root.position.y - 1.86) < 0.001);
  ecology.update(0.1, 1, 1, frog.x, frog.z, () => 0, []);
  assert.equal(food.available, true);
});

test('predators hunt peaceful animals and a moose strikes back when attacked', () => {
  const scene = new THREE.Scene(),
    rng = new Random(7),
    ecology = new WildlifeEcology(scene, world(), rng);
  const moose = createForestAnimal('moose', 0.5, 0, rng),
    wolf = createPredatorActor('wolf', 0, 0, rng);
  ecology.animals.push(moose);
  scene.add(moose.root, wolf.root);
  const prey = ecology.targetFor(wolf, [wolf], 1);
  assert.equal(prey, moose);
  wolf.update(0.05, 1, 80, 80, false, true, () => 0, 0, 1, prey);
  const events = ecology.update(0.05, 1, 300, 80, 80, () => 0, [wolf]);
  assert.ok(moose.health < moose.maxHealth);
  assert.ok(wolf.health < wolf.maxHealth);
  assert.ok(events.some((e) => e.kind === 'defend'));
  wolf.update(0.05, 1.1, 80, 80, false, true, () => 0);
  assert.equal((wolf.root.userData.model as ModelInstance).activeName, 'attack');
});

test('a predator can kill a small animal and remove it from the world', () => {
  const scene = new THREE.Scene(),
    rng = new Random(9),
    ecology = new WildlifeEcology(scene, world(), rng);
  const squirrel = createForestAnimal('squirrel', 0.6, 0, rng),
    wolf = createPredatorActor('wolf', 0, 0, rng);
  ecology.animals.push(squirrel);
  scene.add(squirrel.root, wolf.root);
  const prey = ecology.targetFor(wolf, [wolf], 1);
  wolf.update(0.05, 1, 80, 80, false, true, () => 0, 0, 1, prey);
  const events = ecology.update(0.05, 1, 300, 80, 80, () => 0, [wolf]);
  assert.ok(events.some((e) => e.kind === 'hunt'));
  assert.equal(squirrel.alive, false);
  assert.equal(ecology.animals.includes(squirrel), false);
  assert.equal(squirrel.root.parent, null);
});

test('predators of different species can fight over territory', () => {
  const scene = new THREE.Scene(),
    rng = new SocialRandom(12),
    ecology = new WildlifeEcology(scene, world(), rng);
  const wolf = createPredatorActor('wolf', 0, 0, rng),
    fox = createPredatorActor('fox', 0.7, 0, rng);
  const target = ecology.targetFor(wolf, [wolf, fox], 1);
  assert.equal(target, fox);
  wolf.update(0.05, 1, 80, 80, false, true, () => 0, 0, 1, target);
  const events = ecology.update(0.05, 1, 300, 80, 80, () => 0, [wolf, fox]);
  assert.ok(events.some((e) => e.kind === 'fight'));
  assert.ok(fox.health < fox.maxHealth);
});

test('peaceful animal population is replenished away from the player', () => {
  const ecology = new WildlifeEcology(new THREE.Scene(), world([], 'forest'), new Random(42));
  ecology.update(0.05, 1, 300, 0, 0, () => 0, []);
  assert.equal(ecology.animals.length, 1);
  assert.ok(Math.hypot(ecology.animals[0].x, ecology.animals[0].z) > 26);
});
