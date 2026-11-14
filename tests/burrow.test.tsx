import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { renderToStaticMarkup } from 'react-dom/server';
import { BurrowNetwork } from '../src/game/BurrowNetwork';
import { BurrowPlanner } from '../src/game/BurrowPlanner';
import { BurrowSafety } from '../src/game/BurrowSafety';
import { Excavation } from '../src/game/Excavation';
import { ExcavationTraffic } from '../src/game/ExcavationTraffic';
import { TUNNEL_FLOOR_DEPTH } from '../src/game/CaveMesher';
import { Fox } from '../src/game/animals/Fox';
import { RabbitFactory } from '../src/game/animals';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { Random } from '../src/game/Random';
import type { DigNode, KitData } from '../src/game/types';
import type { World } from '../src/game/World';
import { BurrowPresenter } from '../src/ui/presenters/BurrowPresenter';
import { BurrowPanel } from '../src/ui/components/BurrowPanel';
import { GameMenu } from '../src/ui/components/GameMenu';
import { createUIStore, simulationPaused } from '../src/ui/store';
import { loadModels } from './model-fixture';
import { MapPresenter } from '../src/ui/presenters/MapPresenter';
import { FamilyCare } from '../src/game/FamilyCare';
import { FamilyLifecycle } from '../src/game/session/FamilyLifecycle';
import { Soundscape } from '../src/game/Audio';

await loadModels('fox');

const floor = (node: DigNode): DigNode => ({ ...node, y: node.y - TUNNEL_FLOOR_DEPTH });

function fixture(nodes?: DigNode[]) {
  const save = NewGameFactory.create(45, 0, new RabbitFactory(new Random(98)));
  const world = {
    size: 110,
    heightAt: () => 0,
    rootAt: () => undefined,
    addGroundHole() {},
    biomeAt: () => 'meadow',
    landmarks: [],
  } as unknown as World;
  save.excavation =
    nodes ??
    [0.45, -0.3, -1.05, -1.8, -2.55, -1.8, -1.05, -0.3, 0.45].map((y, index) => ({
      x: index * 2,
      y,
      z: 0,
    }));
  const earth = new Excavation(new THREE.Scene(), world, save);
  const origin = save.excavation[4] ?? save.excavation[0];
  if (origin) Object.assign(save.player, floor(origin));
  return { save, earth, world };
}

test('the map arrow points east for a camera looking along positive X', () => {
  const { save, world } = fixture([]);
  const map = new MapPresenter().build(world, save, { x: 1, z: 0 });
  assert.equal(map.player.heading, Math.PI / 2);
  assert.deepEqual([map.player.x, map.player.z], [save.player.x, save.player.z]);
});

test('one nursing action reaches distant young in the same burrow only', () => {
  const { save, earth, world } = fixture([
    ...Array.from({ length: 7 }, (_, i) => ({ x: i * 2, y: -2, z: 0 })),
    { x: 12, y: -2, z: 5 },
  ]);
  Object.assign(save.player, { x: 0, y: -2.95, z: 0, milk: 24 });
  save.nests.push({ id: 1, x: 0, y: -2.95, z: 0, quality: 1 });
  const child = (id: number, x: number, y: number, z: number): KitData => ({
    id,
    name: 'Крольчонок',
    genes: save.player.genes,
    father: 'Крол',
    age: 1,
    health: 50,
    hunger: 20,
    alive: true,
    homeX: 0,
    homeY: -2.95,
    homeZ: 0,
    x,
    y,
    z,
  });
  const walking = child(1, 12, -2.95, 0);
  const isolated = child(2, 12, -2.95, 5);
  const outside = child(3, 0, 0, 0);
  save.kits.push(walking, isolated, outside);
  const rng = new Random(9);
  const family = new FamilyLifecycle({
    save,
    earth,
    world,
    rng,
    scene: new THREE.Scene(),
    care: new FamilyCare(save, earth),
    genetics: new RabbitFactory(rng),
    sound: new Soundscape(),
    temperature: () => 12,
    toast() {},
    persist() {},
    playAction() {},
  });
  family.feed();
  assert.equal(walking.hunger, 55);
  assert.equal(walking.health, 56);
  assert.equal(isolated.hunger, 20);
  assert.equal(outside.hunger, 20);
  assert.equal(save.player.milk, 12);
  assert.equal(walking.x, 12);
});

test('a wide mouth is one exit; separate connected mouths provide a real spare exit', () => {
  const { save, earth } = fixture();
  assert.equal(earth.openings.length, 4);
  const plan = BurrowPlanner.inspect(save, earth)!;
  assert.equal(plan.network.exits.length, 2);
  assert.equal(plan.network.exits[0].length, 2);
  assert.ok(plan.length > 16);
  assert.equal(plan.depth, 3.5);
});

test('the first inspection explains how to start without showing an invented burrow', () => {
  const { save, earth } = fixture([]);
  const view = BurrowPresenter.build(save, earth);
  assert.deepEqual(view, { state: 'empty' });
  const html = renderToStaticMarkup(<BurrowPanel data={view} />);
  assert.match(html, /Переключись на вид от первого лица/);
  assert.doesNotMatch(html, /<svg/);
});

test('entrance distances follow bends and slopes, taking the shortest connected path', () => {
  const nodes = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: -0.5, z: 2 },
    { x: 2, y: -1, z: 2 },
    { x: 2, y: -1, z: 0 },
  ];
  const network = new BurrowNetwork(
    nodes,
    [
      [nodes[0], nodes[1]],
      [nodes[1], nodes[2]],
      [nodes[2], nodes[3]],
    ],
    [nodes[0]],
  );
  const location = network.locate(nodes[3], floor(nodes[3]))!;
  assert.ok(network.distanceToSurface(location) > 6);
  const shortcut = new BurrowNetwork(
    nodes,
    [
      [nodes[0], nodes[1]],
      [nodes[1], nodes[2]],
      [nodes[2], nodes[3]],
      [nodes[0], nodes[3]],
    ],
    [nodes[0]],
  );
  assert.equal(
    shortcut.distanceToSurface(shortcut.locate(nodes[3], floor(nodes[3]))!),
    Math.sqrt(5),
  );
});

test('burrow plan includes only connected nests and stores and evaluates each entrance', () => {
  const { save, earth } = fixture();
  const deep = floor(save.excavation[4]);
  const mouth = floor(save.excavation[0]);
  save.nests.push({ id: 1, ...deep, quality: 1 }, { id: 2, ...mouth, quality: 1 });
  save.stashes.push({
    id: 1,
    ...deep,
    food: { clover: 4 },
    materials: { grass: 1, twigs: 0, fur: 0 },
  });
  save.stashes.push({ id: 2, x: 0, y: 0, z: 20, food: { carrot: 50 } });
  const before = JSON.stringify(save);
  const plan = BurrowPlanner.inspect(save, earth)!;
  assert.equal(plan.nests[0].placement, 'interior');
  assert.ok(plan.nests[0].entranceDistance > 6);
  assert.equal(plan.nests[1].placement, 'exposed');
  assert.equal(plan.stashes.length, 1);
  assert.equal(plan.stashes[0].food, 4);
  assert.equal(plan.stashes[0].items, 5);
  assert.equal(JSON.stringify(save), before);
  const view = BurrowPresenter.build(save, earth);
  const html = renderToStaticMarkup(<BurrowPanel data={view} />);
  assert.match(html, /У входа — малыши уязвимы/);
  assert.match(html, /Гнездо 1/);
  assert.match(html, /Запасной выход/);
  assert.doesNotMatch(html, /50 шт/);
});

test('digging a second mouth invalidates the cached network and updates the plan', () => {
  const nodes = [0.45, -0.3, -1.05, -1.8, -2.55, -1.8, -1.05].map((y, index) => ({
    x: index * 2,
    y,
    z: 0,
  }));
  const { save, earth } = fixture(nodes);
  Object.assign(save.player, floor(nodes[6]));
  save.nests.push({ id: 1, ...floor(nodes[6]), quality: 1 });
  const before = earth.burrowAt(save.player)!;
  assert.equal(before.network.exits.length, 1);
  assert.equal(earth.burrowAt(save.player)!.network, before.network);
  assert.equal(BurrowPlanner.inspect(save, earth)!.nests[0].placement, 'interior');
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(12, -1.2, 0);
  camera.lookAt(15, 0, 0);
  camera.updateMatrixWorld();
  assert.equal(earth.dig(camera, save.player.x, save.player.y, save.player.z).success, true);
  const after = earth.burrowAt(save.player)!;
  assert.notEqual(after.network, before.network);
  assert.equal(after.network.exits.length, 2);
  assert.ok(after.network.distanceToSurface(after) < before.network.distanceToSurface(before));
  assert.notEqual(BurrowPlanner.inspect(save, earth)!.nests[0].placement, 'interior');
});

test('a nearby chamber behind an unconnected wall cannot be attacked through the soil', () => {
  const nodes = [
    { x: 0, y: 0.45, z: 0 },
    { x: 2, y: -1.8, z: 0 },
  ];
  const { save, earth } = fixture(nodes);
  const position = floor(nodes[1]);
  Object.assign(save.player, position);
  assert.equal(earth.burrowAt(position)!.network.exits.length, 0);
  assert.equal(BurrowSafety.kitExposed(earth, nodes[0], position), false);
  assert.equal(BurrowSafety.playerExposed(earth, nodes[0], position, 'weasel'), false);
  save.nests.push({ id: 1, ...position, quality: 1 });
  assert.equal(BurrowPlanner.inspect(save, earth)!.nests[0].placement, 'sealed');
});

test('intruders attack a kit at its current position rather than its former nest', () => {
  const { save, earth } = fixture();
  const mouth = floor(save.excavation[0]);
  const deep = floor(save.excavation[4]);
  Object.assign(save.player, { x: 40, y: 0, z: 40 });
  const kit: KitData = {
    id: 1,
    name: 'Пушинка',
    genes: save.player.genes,
    father: 'Крол',
    age: 1,
    health: 100,
    hunger: 90,
    alive: true,
    homeX: mouth.x,
    homeY: mouth.y,
    homeZ: mouth.z,
    x: deep.x,
    y: deep.y,
    z: deep.z,
  };
  save.kits.push(kit);
  const fox = new Fox(0, 0, new Random(3));
  const traffic = new ExcavationTraffic(new Random(4));
  assert.equal(traffic.update(100, 0, true, [fox], [], save, earth)[0]?.type, 'predator-entered');
  traffic.update(0, 6, true, [fox], [], save, earth);
  assert.equal(kit.health, 100);
  Object.assign(kit, { x: mouth.x, y: mouth.y, z: mouth.z, command: 'follow' });
  const events = traffic.update(0, 7, true, [fox], [], save, earth);
  assert.equal(events[0]?.type, 'kit-attack');
  assert.ok(kit.health < 100);
});

test('inspection is local, restores after loading, and the menu pauses desktop and mobile play', () => {
  const { save, earth } = fixture();
  const original = BurrowPresenter.build(save, earth);
  const loaded = JSON.parse(JSON.stringify(save)) as typeof save;
  const restored = fixture(loaded.excavation);
  Object.assign(restored.save.player, loaded.player);
  assert.deepEqual(BurrowPresenter.build(restored.save, restored.earth), original);
  const store = createUIStore(() => {});
  store.getInitialState = store.getState;
  store.setState({ gameMenu: 'burrow', burrow: original });
  assert.equal(simulationPaused(store.getState()), true);
  assert.match(renderToStaticMarkup(<GameMenu store={store} />), /План связанных ходов/);
  store.setState({ touch: true });
  assert.equal(simulationPaused(store.getState()), true);
  Object.assign(save.player, { x: 40, y: 0, z: 40 });
  assert.deepEqual(BurrowPresenter.build(save, earth), { state: 'away' });
});
