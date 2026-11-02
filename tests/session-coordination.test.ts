import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Soundscape } from '../src/game/Audio';
import { Excavation } from '../src/game/Excavation';
import { MODEL_NAMES } from '../src/game/ModelAssets';
import { Random } from '../src/game/Random';
import { World } from '../src/game/World';
import { RabbitActor, RabbitFactory } from '../src/game/animals';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { PlayerConsequences } from '../src/game/session/PlayerConsequences';
import { SceneDecorations } from '../src/game/session/SceneDecorations';
import { SceneLighting } from '../src/game/session/SceneLighting';
import { WorldCalendar } from '../src/game/session/WorldCalendar';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { SeasonSystem, WasteSystem } from '../src/game/systems';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);

function fixture(season = 0) {
  const rng = new Random(31415 + 53);
  const save = NewGameFactory.create(31415, season, new RabbitFactory(rng));
  const scene = new THREE.Scene();
  const world = new World(scene, save.seed, save);
  const earth = new Excavation(scene, world, save);
  return { rng, save, scene, world, earth };
}

test('new game factory preserves deterministic partners and independent save state', () => {
  const first = fixture(3),
    second = fixture(3);
  assert.deepEqual(first.save, second.save);
  assert.equal(first.save.day, 91);
  assert.equal(first.save.clock, 90 * 1440 + 420);
  assert.equal(first.save.partners.length, 16);
  first.save.inventory.carrot = 5;
  assert.equal(second.save.inventory.carrot, 0);
});

test('calendar crosses a season boundary once and includes local terrain temperature', () => {
  const context = fixture();
  const messages: string[] = [];
  const seasons = new SeasonSystem(context.save.seed);
  const calendar = new WorldCalendar({ ...context, seasons, toast: (text) => messages.push(text) });
  context.save.day = 30;
  context.save.clock = 30 * 1440 - 1;
  const age = context.save.player.age;
  calendar.advance(0.5);
  assert.equal(context.save.day, 31);
  assert.equal(calendar.season(), 'Лето');
  assert.equal(context.save.player.age, age + 3 / 1440);
  assert.equal(messages.filter((text) => text.startsWith('Наступил день')).length, 1);
  assert.equal(
    calendar.airTemperature(),
    seasons.temperature(31, context.save.clock, context.save.weather) +
      context.world.temperatureOffset(0, 0),
  );
  calendar.advance(0.01);
  assert.equal(messages.filter((text) => text.startsWith('Наступил день')).length, 1);
  assert.equal(calendar.isNight(), true);
});

test('consequences preserve snake damage, poison and bounded vitality', () => {
  const context = fixture();
  const consequences = new PlayerConsequences({
    ...context,
    waste: new WasteSystem(context.scene, context.save, () => 0),
    sound: new Soundscape(),
    toast() {},
  });
  consequences.predatorAttack('snake');
  assert.equal(context.save.player.health, 100 - 8 * 0.8);
  assert.equal(context.save.player.poison, 18);
  assert.equal(context.save.player.energy, 77);
  context.save.player.health = 1;
  consequences.predatorAttack('bear');
  assert.equal(context.save.player.health, 0);
});

test('waste spawns on the terrain and dirtiness is bounded', () => {
  const context = fixture();
  const waste = new WasteSystem(context.scene, context.save, () => 0);
  const consequences = new PlayerConsequences({
    ...context,
    waste,
    sound: new Soundscape(),
    toast() {},
  });
  context.save.player.dirtiness = 95;
  consequences.makeWaste('diarrhea');
  assert.equal(context.save.player.dirtiness, 100);
  assert.equal(context.save.waste[0].kind, 'diarrhea');
  assert.equal(context.save.waste[0].y, context.world.heightAt(0, 0));
});

test('scene decorations follow relief and partner markers are replaced without duplicates', () => {
  const context = fixture();
  const decorations = new SceneDecorations(context);
  const before = context.scene.children.length;
  decorations.addNest({ id: 1, x: 4, y: 20, z: 7, quality: 1 });
  assert.equal(context.scene.children[before].position.y, context.world.heightAt(4, 7) + 0.04);
  decorations.addStash({ id: 4, x: 4, y: 20, z: 7, food: {} });
  assert.equal(context.scene.children.length, before + 2);
  decorations.removeNest(1);
  decorations.removeStash(4);
  assert.equal(context.scene.children.length, before);
  const rabbit = new RabbitActor(context.save.partners[0], context.rng);
  decorations.markPartner(rabbit, true);
  decorations.markPartner(rabbit, true);
  assert.equal(rabbit.root.children.filter((child) => child.name === 'mate-mark').length, 1);
  decorations.markPartner(rabbit, false);
  assert.equal(rabbit.root.getObjectByName('mate-mark'), undefined);
});

test('population is reproducible, retains predator distribution and shares ecology collection', () => {
  const first = fixture(),
    second = fixture();
  const build = (context: ReturnType<typeof fixture>) =>
    new WorldPopulation({ ...context, markPartner() {} });
  const a = build(first),
    b = build(second);
  assert.deepEqual(
    a.predators.map((animal) => [animal.kind, animal.x, animal.z]),
    b.predators.map((animal) => [animal.kind, animal.x, animal.z]),
  );
  assert.equal(a.predators.length, 22);
  assert.equal(a.predators.filter((animal) => animal.kind === 'bear').length, 2);
  assert.equal(a.hawks.length, 1);
  assert.equal(a.wildlife, a.ecology.animals);
  assert.equal(first.rng.next(), second.rng.next());
});

test('lighting reset reattaches camera and updates underground background', () => {
  const { scene, save, world } = fixture();
  const camera = new THREE.PerspectiveCamera();
  const lighting = new SceneLighting(scene, camera);
  lighting.reset();
  assert.ok(scene.children.includes(camera));
  lighting.update(save, world, false, true);
  assert.equal((scene.background as THREE.Color).getHex(), 0x5c4e3e);
  scene.clear();
  lighting.reset();
  assert.ok(scene.children.includes(camera));
});
