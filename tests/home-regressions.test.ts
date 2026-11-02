import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Excavation } from '../src/game/Excavation';
import { GroundNavigator } from '../src/game/GroundNavigator';
import { Random } from '../src/game/Random';
import { RabbitActor, RabbitFactory, createForestAnimal } from '../src/game/animals';
import { MODEL_NAMES } from '../src/game/ModelAssets';
import { PartnerSupport } from '../src/game/PartnerSupport';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { KitFeeding } from '../src/game/session/KitFeeding';
import { KitMovement } from '../src/game/session/KitMovement';
import { AnimalCollisionSystem } from '../src/game/session/AnimalCollisionSystem';
import { KitWander } from '../src/game/KitWander';
import { WasteSystem } from '../src/game/systems/WasteSystem';
import { AerialDroppings } from '../src/game/systems/AerialDroppings';
import { AnimalWasteSystem } from '../src/game/session/AnimalWasteSystem';
import { SceneDecorations } from '../src/game/session/SceneDecorations';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { SessionQueries } from '../src/game/session/SessionQueries';
import { ForestConversation } from '../src/game/session/ForestConversation';
import { FriendSignals } from '../src/game/session/FriendSignals';
import { DialogView } from '../src/ui/components/Dialogs';
import { createRabbit } from '../src/game/Models';
import type { GroundItems } from '../src/game/GroundItems';
import { World, type Resource } from '../src/game/World';
import type { KitData } from '../src/game/types';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);
const game = () => NewGameFactory.create(31415, 0, new RabbitFactory(new Random(31468)));
const flatWorld = () =>
  ({
    heightAt: () => 0,
    rootAt: () => undefined,
    addGroundHole() {},
    waterSources: [],
    resources: [],
    biomeAt: () => 'forest',
  }) as unknown as World;

function tunnel() {
  const save = game(),
    scene = new THREE.Scene(),
    world = flatWorld();
  save.excavation = Array.from({ length: 5 }, (_, i) => ({ x: i * 2, y: 0.45 - i * 0.75, z: 0 }));
  const earth = new Excavation(scene, world, save);
  return { save, scene, world, earth };
}

function kit(id = 1): KitData {
  return {
    id,
    name: 'Листик',
    genes: game().player.genes,
    age: 1.2,
    hunger: 25,
    health: 100,
    father: 'Пушок',
    alive: true,
    homeX: 8,
    homeY: -3.5,
    homeZ: 0,
    x: 8,
    y: -3.5,
    z: 0,
  };
}

test('waste expires at three game days, including reload and large sleep time jumps', () => {
  const save = game(),
    scene = new THREE.Scene();
  let nutrients = 0;
  const waste = new WasteSystem(
    scene,
    save,
    () => 0,
    () => nutrients++,
  );
  waste.spawn('urine', 0, 0, 0);
  waste.spawn('pellets', 1, 0, 0);
  const born = save.clock;
  save.clock = born + 4320 - 1;
  waste.update(0, 10, 0, 10);
  assert.equal(save.waste.length, 2);
  save.clock++;
  waste.update(0, 10, 0, 10);
  assert.equal(save.waste.length, 0);
  assert.equal(nutrients, 2);
  save.waste.push({ id: 12, kind: 'pellets', x: 0, y: 0, z: 0, age: born });
  new WasteSystem(new THREE.Scene(), save);
  assert.equal(save.waste.length, 0);
});

test('cleaning removes nearby urine and faeces without deleting contamination on another floor', () => {
  const save = game(),
    waste = new WasteSystem(new THREE.Scene(), save);
  waste.spawn('pellets', 0, -4, 0);
  waste.spawn('urine', 1, -4, 0);
  waste.spawn('pellets', 0, 0, 0);
  assert.equal(waste.cleanNear(0, -4, 0), 2);
  assert.equal(save.waste.length, 1);
  assert.equal(save.waste[0].y, 0);
  assert.equal(waste.cleanNear(0, -4, 0), 0);
});

test('bird droppings fall from flight height and soil the ground after impact', () => {
  const save = game(),
    scene = new THREE.Scene(),
    waste = new WasteSystem(scene, save);
  const aerial = new AerialDroppings(scene, () => 0, waste);
  aerial.release(0, 8, 0);
  aerial.update(0.05);
  assert.equal(save.waste.length, 0);
  for (let i = 0; i < 60; i++) aerial.update(0.05);
  assert.equal(save.waste.length, 1);
  assert.equal(save.waste[0].kind, 'bird');
  assert.equal(save.waste[0].y, 0);
  waste.update(1, 0, 0, 0);
  assert.ok(save.player.dirtiness > 0);
});

test('kits generate waste in their actual tunnel position', () => {
  const context = tunnel();
  const baby = kit();
  context.save.kits = [baby];
  const waste = new WasteSystem(context.scene, context.save);
  const rig = createRabbit(baby.genes, true);
  rig.root.position.set(8, -3.5, 0);
  const hygiene = new AnimalWasteSystem({
    ...context,
    waste,
    family: { rigs: new Map([[baby.id, rig]]) },
    rabbits: [],
    families: [],
    predators: [],
    wildlife: [],
    hawks: [],
  } as unknown as ConstructorParameters<typeof AnimalWasteSystem>[0]);
  hygiene.update(0.1, 0);
  context.save.clock += 241;
  hygiene.update(0.1, 41);
  assert.equal(context.save.waste.length, 1);
  assert.equal(context.save.waste[0].x, 8);
  assert.equal(context.save.waste[0].y, -3.5);
});

test('cached navigation exits a deep slope and returns through the entrance without oscillation', () => {
  const { earth } = tunnel();
  const navigation = new GroundNavigator();
  let position = { x: 8, y: -3.5, z: 0 };
  const outside = { x: 10, y: 0, z: -6 };
  for (let frame = 0; frame < 600; frame++)
    position = navigation.step(position, outside, earth, 0.05, frame * 0.05, 3).point;
  assert.ok(
    Math.hypot(position.x - outside.x, position.z - outside.z) < 0.4,
    JSON.stringify(position),
  );
  assert.equal(position.y, 0);
  for (let frame = 600; frame < 1200; frame++)
    position = navigation.step(
      position,
      { x: 8, y: -3.5, z: 0 },
      earth,
      0.05,
      frame * 0.05,
      3,
    ).point;
  assert.ok(Math.abs(position.x - 8) < 0.4, JSON.stringify(position));
  assert.ok(position.y < -3.2);
});

test('foraging partner leaves the underground warehouse, gathers food and delivers it back', () => {
  const { save, earth, world } = tunnel();
  const partner = save.partners[0];
  save.mateId = partner.id;
  save.mateCommand = 'forage';
  save.stashes = [{ id: 1, x: 8, y: -3.5, z: 0, food: {} }];
  const resource = {
    id: 1,
    kind: 'clover',
    x: 10,
    z: -6,
    available: true,
    mesh: new THREE.Group(),
    regrowAt: 0,
  } as Resource;
  world.resources.push(resource);
  world.harvest = (food) => {
    food.available = false;
  };
  const actor = new RabbitActor(partner, new Random(2));
  actor.moveTo(8, 0, -3.5);
  const support = new PartnerSupport(
    save,
    world,
    earth,
    { availableBranches: () => [] } as unknown as GroundItems,
    new Random(3),
  );
  let visitedSurface = false;
  for (let frame = 0; frame < 1400; frame++) {
    support.update(actor, 0.05, frame * 0.05, () => 0);
    save.clock += 0.3;
    if (!earth.isSheltered(actor.data.x, actor.data.y ?? 0, actor.data.z)) visitedSurface = true;
    if (save.stashes[0].food.clover) break;
  }
  assert.equal(visitedSurface, true);
  assert.equal(resource.available, false);
  assert.equal(
    save.stashes[0].food.clover,
    1,
    JSON.stringify({ x: actor.x, y: actor.data.y, z: actor.z, cargo: save.partnerCargo }),
  );
});

test('unconnected tunnel chambers cannot be crossed by a direct fallback route', () => {
  const save = game(),
    world = flatWorld(),
    scene = new THREE.Scene();
  save.excavation = [
    { x: 0, y: 0.45, z: 0 },
    { x: 0, y: -5, z: 0 },
  ];
  const earth = new Excavation(scene, world, save);
  const from = { x: 0, y: -5.95, z: 0 };
  assert.deepEqual(earth.route(from, { x: 0, y: -0.5, z: 0 }), []);
  const navigation = new GroundNavigator();
  assert.deepEqual(navigation.step(from, { x: 0, y: -0.5, z: 0 }, earth, 1, 1, 3).point, from);
});

test('older kits eat from a reachable stash, newborns and unconnected kits cannot', () => {
  const { save, earth } = tunnel();
  const baby = kit();
  save.stashes = [{ id: 1, x: 8, y: -3.5, z: 0, food: { carrot: 3, toadstool: 2 } }];
  const feeding = new KitFeeding(save, earth);
  feeding.update(baby);
  assert.equal(save.stashes[0].food.carrot, 2);
  assert.equal(baby.hunger, 53);
  feeding.update(baby);
  assert.equal(save.stashes[0].food.carrot, 2);
  const newborn = { ...kit(2), age: 0.2 };
  feeding.update(newborn);
  assert.equal(save.stashes[0].food.carrot, 2);
  const blocked = { ...kit(3), y: -10, homeY: -10 };
  feeding.update(blocked);
  assert.equal(save.stashes[0].food.carrot, 2);
});

test('grown children physically leave the tunnel instead of teleporting to the surface', () => {
  const { save, earth, world } = tunnel();
  const child = { ...kit(), age: 3.1, independent: true, homeX: 20, homeY: 0, homeZ: 6 };
  const rig = createRabbit(child.genes);
  rig.root.position.set(8, -3.5, 0);
  const movement = new KitMovement({ save, earth, world }, new KitWander(new Random(2)));
  movement.update(child, rig, 1, 0.05);
  assert.ok((child.y ?? 0) < -2.8);
  for (let frame = 1; frame < 1300; frame++) movement.update(child, rig, 1 + frame * 0.05, 0.05);
  assert.equal(child.y, 0);
  assert.ok((child.x ?? 0) > 10, JSON.stringify(child));
});

test('several following kits spread into reachable slots and settle with collisions enabled', () => {
  const { save, earth, world } = tunnel();
  save.player.x = 8;
  save.player.y = -3.5;
  save.player.z = 0;
  save.kits = [1, 2, 3].map((id) => ({
    ...kit(id),
    x: 2,
    y: -1.25,
    z: 0,
    hunger: 85,
    command: 'follow' as const,
  }));
  const rigs = new Map(save.kits.map((child) => [child.id, createRabbit(child.genes, true)]));
  const movement = new KitMovement({ save, earth, world }, new KitWander(new Random(2)));
  const collisions = new AnimalCollisionSystem({
    save,
    earth,
    world,
    rabbits: [],
    families: [],
    predators: [],
    wildlife: [],
    family: { rigs },
  } as unknown as ConstructorParameters<typeof AnimalCollisionSystem>[0]);
  for (let frame = 0; frame < 600; frame++) {
    for (const child of save.kits) movement.update(child, rigs.get(child.id)!, frame * 0.05, 0.05);
    collisions.resolve();
  }
  for (const child of save.kits) {
    assert.ok((child.x ?? 0) > 4, JSON.stringify(child));
    assert.ok(earth.isSheltered(child.x!, child.y!, child.z!));
  }
  assert.ok(new Set(save.kits.map((child) => Math.round(child.z! * 10))).size > 1);
});

test('underground stash is snapped to the real floor and follows its gradient', () => {
  const { earth, scene, world } = tunnel();
  const stash = { id: 1, x: 5, y: -1, z: 0, food: {} };
  const decorations = new SceneDecorations({ earth, scene, world });
  const expected = earth.floorAt(stash.x, stash.z, stash.y);
  const before = scene.children.length;
  decorations.addStash(stash);
  const mesh = scene.children[before];
  assert.equal(stash.y, expected);
  assert.ok(Math.abs(mesh.position.y - expected - 0.025) < 1e-8);
  assert.ok(Math.abs(mesh.quaternion.z) > 0.01);
});

test('friendship starts at 100 and a friend greets the mother when approaching', () => {
  const save = game(),
    animal = createForestAnimal('deer', 1, 0, new Random(3)),
    dialogue = new ForestConversation(save, flatWorld());
  animal.trust = 99;
  assert.equal(dialogue.view(animal).relationship, 'Знакомый');
  const lines: string[] = [],
    signals = new FriendSignals(),
    player = { x: 0, y: 0, z: 0, hidden: false };
  signals.update(1, player, [animal], [], (line) => lines.push(line));
  assert.equal(lines.length, 0);
  animal.befriend(1);
  assert.equal(dialogue.view(animal).relationship, 'Друг');
  signals.update(2, player, [animal], [], (line) => lines.push(line));
  assert.ok(lines[0].includes('приветствует'));
  animal.update(0.2, 2.2, () => 0, []);
  assert.equal(animal.x, 1);
});

test('adult background rabbits of black coat are registered for dialogue and do not duplicate on reload', () => {
  const save = game(),
    world = flatWorld(),
    scene = new THREE.Scene();
  const population = new WorldPopulation({
    save,
    scene,
    world,
    rng: new Random(3),
    markPartner() {},
  });
  const grown = population.rabbits.find((actor) => actor.data.id >= 100000)!;
  assert.ok(grown);
  grown.data.genes.coat = 'black';
  save.player.x = grown.x;
  save.player.y = grown.root.position.y;
  save.player.z = grown.z;
  const queries = new SessionQueries({
    save,
    world,
    earth: { isSheltered: () => false },
    rabbits: population.rabbits,
    wildlife: [],
    family: { rigs: new Map() },
  } as unknown as ConstructorParameters<typeof SessionQueries>[0]);
  assert.equal(queries.partner(0.1)?.id, grown.data.id);
  const count = save.partners.length;
  new WorldPopulation({
    save,
    scene: new THREE.Scene(),
    world,
    rng: new Random(3),
    markPartner() {},
  });
  assert.equal(save.partners.length, count);
});

test('adult offspring remains recognizable and receives family dialogue instead of baby commands', () => {
  const save = game(),
    child = { ...kit(), age: 3.2, independent: true };
  save.kits = [child];
  save.player.x = 8;
  save.player.y = -3.5;
  save.player.z = 0;
  const rig = createRabbit(child.genes);
  rig.root.position.set(8, -3.5, 0);
  const queries = new SessionQueries({
    save,
    world: flatWorld(),
    earth: { isSheltered: () => true },
    rabbits: [],
    wildlife: [],
    family: { rigs: new Map([[child.id, rig]]) },
  } as unknown as ConstructorParameters<typeof SessionQueries>[0]);
  assert.equal(queries.kit()?.id, child.id);
  const html = renderToStaticMarkup(
    createElement(DialogView, {
      data: { type: 'kit', kit: child },
      onAction() {},
      message: '',
      onMessage() {},
    }),
  );
  assert.ok(html.includes('Твой взрослый ребёнок'));
  assert.ok(!html.includes('Иди за мной'));
});

test('both vegetable gardens contain guaranteed cabbage rows and manure accelerates regrowth', () => {
  const save = game(),
    world = new World(new THREE.Scene(), save.seed, save);
  for (const [x, z] of [
    [34, 31],
    [-35, 29],
  ])
    assert.ok(
      world.resources.filter(
        (food) => food.kind === 'cabbage' && Math.hypot(food.x - x, food.z - z) < 7,
      ).length >= 12,
    );
  const plant = world.resources.find((food) => food.kind === 'cabbage')!;
  world.harvest(plant, save.clock);
  const due = plant.regrowAt;
  world.fertilize(plant.x, plant.z, save.clock);
  assert.ok(plant.regrowAt < due);
  assert.ok(plant.regrowAt >= save.clock);
});
