import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Scene } from 'three';
import {
  BroodProvisioning,
  beginProvision,
  feedBrood,
  newBroodFood,
  validBroodFood,
} from '../src/game/BroodFood';
import { MammalNursery, type YoungMammal } from '../src/game/MammalNursery';
import { AnimalFactory, RabbitFactory } from '../src/game/animals';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { Random } from '../src/game/Random';
import { loadModels } from './model-fixture';

await loadModels('wolf', 'rabbit', 'bear');

test('food is a finite shared stock; absence cannot feed chicks and long elapsed time consumes all meals', () => {
  const food = newBroodFood(0);
  food.portions = 8;
  assert.ok(feedBrood(food, 60, 2, true));
  assert.equal(food.portions, 7.5);
  feedBrood(food, 60, 2, true);
  assert.equal(food.portions, 7.5, 'one meal for the whole brood');
  assert.ok(!feedBrood(food, 180, 2, false));
  assert.equal(food.portions, 7.5);
  assert.ok(!feedBrood(food, 2400, 2, true));
  assert.equal(food.portions, 0);
});

test('a successful hunt produces no food until arrival; cargo reloads once and a dead carrier loses it', () => {
  const delivery = new BroodProvisioning();
  const wolf = AnimalFactory.predator('wolf', 10, 0, new Random(1));
  const scene = new Scene();
  scene.add(wolf.root);
  const home = { x: 0, y: 0, z: 0 };
  const food = newBroodFood(0);
  assert.ok(beginProvision(food, 'wolf:1', 0));
  assert.ok(!beginProvision(food, 'wolf:2', 0));
  assert.ok(delivery.update(food, wolf, home, 1));
  assert.equal(food.portions, 0);
  assert.ok(wolf.root.getObjectByName('brood-prey-portion')?.visible);
  const loaded = structuredClone(food);
  delivery.prune([loaded]);
  wolf.moveTo(0, 0, 5);
  assert.ok(delivery.update(loaded, wolf, home, 2), 'passing above a nest cannot deliver');
  wolf.moveTo(0, 0, 0);
  assert.ok(!delivery.update(loaded, wolf, home, 3));
  assert.equal(loaded.portions, 8);
  assert.equal(loaded.trip, undefined);
  delivery.update(loaded, wolf, home, 4);
  assert.equal(loaded.portions, 8);
  const meal = scene.getObjectByName('brood-prey-portion')!;
  const mealPosition = meal.position.clone();
  wolf.moveTo(5, 0, 0);
  delivery.update(loaded, wolf, home, 5);
  assert.deepEqual(meal.position, mealPosition, 'delivered food stays at the home');
  const lost = newBroodFood(0);
  beginProvision(lost, 'wolf:1', 0);
  wolf.health = 0;
  delivery.update(lost, wolf, home, 5);
  assert.equal(lost.portions, 0);
  assert.equal(lost.trip, undefined);
  delivery.dispose();
  assert.ok(!scene.getObjectByName('brood-prey-portion'));
});

test('wolf pup health requires food as well as care; orphans starve even beside a full cache', () => {
  for (const fed of [false, true]) {
    const save = NewGameFactory.create(1, 0, new RabbitFactory(new Random(1)));
    const nursery = new MammalNursery('wolf', save, 'wolf:0');
    const young: YoungMammal = {
      id: 1,
      x: 0,
      z: 0,
      bornAt: 0,
      lastCare: 0,
      checkedAt: 0,
      health: 20,
    };
    nursery.state.young.push(young);
    nursery.state.food = newBroodFood(0);
    const pup = AnimalFactory.predator('wolf', 0, 0, new Random(1));
    pup.health = 20;
    for (let clock = 15; clock <= 3 * 1440; clock += 15) {
      if (fed && clock % 720 === 0) nursery.state.food.portions = 8;
      nursery.grow(young, pup, clock, true);
    }
    assert.equal(pup.alive, fed);
  }
  const orphanFood = newBroodFood(0);
  orphanFood.portions = 16;
  assert.ok(!feedBrood(orphanFood, 2 * 1440, 2, false));
  assert.equal(orphanFood.lastFedAt, 0);
});

test('provision validation rejects corrupt stocks, clocks and carrier data', () => {
  assert.ok(validBroodFood(undefined));
  assert.ok(validBroodFood(newBroodFood(12)));
  for (const invalid of [
    null,
    [],
    { ...newBroodFood(0), portions: Infinity },
    { ...newBroodFood(0), portions: -1 },
    { ...newBroodFood(0), lastFedAt: 1 },
    { ...newBroodFood(0), trip: { carrier: new Group(), startedAt: 0 } },
  ])
    assert.ok(!validBroodFood(invalid));
});
