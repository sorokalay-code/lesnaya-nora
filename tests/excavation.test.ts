import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { CaveMesher } from '../src/game/CaveMesher';
import { Excavation } from '../src/game/Excavation';
import { MODEL_NAMES } from '../src/game/ModelAssets';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { FoodStore, SurvivalSystem, WasteSystem } from '../src/game/systems';
import { Terrain } from '../src/game/Terrain';
import type { SaveData } from '../src/game/types';
import { World } from '../src/game/World';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);

function fixture(): SaveData {
  return {
    version: 3,
    seed: 9,
    clock: 420,
    day: 1,
    weather: 'clear',
    messages: [],
    waste: [],
    drops: [],
    player: {
      x: 0,
      y: 0,
      z: 0,
      genes: { coat: 'cream', ear: 1, speed: 3, vitality: 3, size: 1 },
      hunger: 90,
      thirst: 90,
      bodyTemp: 38,
      energy: 90,
      bladder: 0,
      bowel: 0,
      health: 100,
      age: 0,
      hidden: false,
      dirtiness: 0,
      poison: 0,
      milk: 10,
    },
    inventory: {
      clover: 2,
      carrot: 0,
      cabbage: 0,
      mushroom: 0,
      berries: 0,
      toadstool: 0,
      bitterleaf: 0,
      acorn: 0,
    },
    nests: [],
    stashes: [],
    materials: { grass: 0, twigs: 0, fur: 0 },
    excavation: [],
    kits: [],
    partners: [],
    harvested: [],
    pregnancy: null,
    stats: { births: 0, grown: 0, survived: 0, generations: 1 },
  };
}
function fakeWorld(): World {
  return {
    heightAt: () => 0,
    rootAt: () => undefined,
    addGroundHole: () => {},
    surfaceHit: () => new THREE.Vector3(0, 0, -2),
  } as unknown as World;
}
function camera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 4);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

test('digging alters one world and creates a walkable slope without entry mode', () => {
  const save = fixture(),
    earth = new Excavation(new THREE.Scene(), fakeWorld(), save),
    view = camera();
  assert.equal(earth.dig(view, 0, 0, 0).success, true);
  assert.equal(save.excavation.length, 1);
  const duplicate = earth.preview(view, 0, 0, 0);
  assert.equal(duplicate?.valid, false);
  assert.match(duplicate?.reason ?? '', /уже выкопана/);
  const first = save.excavation[0];
  assert.ok(earth.nearOpening(first.x, first.z));
  assert.ok(earth.floorAt(first.x, first.z, 0) < 0);
  assert.ok(earth.floorAt(first.x, first.z + 1.25, -0.5) > earth.floorAt(first.x, first.z, 0));
  assert.ok(earth.canMoveTo(first.x, first.z + 1.25, -0.4, true));
  assert.equal(earth.isSheltered(first.x, -0.4, first.z), true);
  assert.equal(earth.dig(view, first.x, -0.5, first.z).success, true);
  const second = save.excavation[1];
  assert.equal(Math.hypot(second.x - first.x, second.z - first.z), 2);
  assert.ok(Math.abs(second.y - first.y) <= 0.85);
  const mid = earth.floorAt(0, -3, -0.7);
  assert.ok(mid < 0 && mid > -1.4);
  assert.equal('burrows' in save, false);
  const restored = new Excavation(new THREE.Scene(), fakeWorld(), structuredClone(save));
  assert.equal(restored.nearOpening(first.x, first.z), true);
});

test('digging respects the 50 m depth limit', () => {
  const save = fixture();
  save.excavation = [{ x: 0, y: -49, z: 0 }];
  const earth = new Excavation(new THREE.Scene(), fakeWorld(), save);
  const result = earth.dig(camera(), 0, -49.95, 0);
  assert.equal(result.success, false);
  assert.match(result.reason, /50 м/);
});

test('digging downward creates a connected sloped section', () => {
  const save = fixture();
  save.excavation = [{ x: 0, y: -0.5, z: 0 }];
  const earth = new Excavation(new THREE.Scene(), fakeWorld(), save);
  const result = earth.dig(camera(), 0, -1.45, 0, true);
  assert.equal(result.success, true);
  assert.equal(save.excavation.length, 2);
  assert.equal(save.excavation[1].y, -1.25);
  assert.equal(Math.hypot(save.excavation[1].x, save.excavation[1].z), 2);
});

test('a kit follows connected tunnel sections around a bend', () => {
  const save = fixture();
  save.excavation = [
    { x: 0, y: -0.5, z: 0 },
    { x: 2, y: -0.5, z: 0 },
    { x: 4, y: -0.5, z: 0 },
    { x: 4, y: -0.5, z: 2 },
  ];
  const earth = new Excavation(new THREE.Scene(), fakeWorld(), save);
  const step = earth.nextStep({ x: 0, y: -1.45, z: 0 }, { x: 4, y: -1.45, z: 2 });
  assert.equal(step?.x, 2);
  assert.equal(step?.z, 0);
});

test('downward aim can start digging on a slope even if the terrain ray misses', () => {
  const save = fixture();
  const world = {
    ...fakeWorld(),
    heightAt: () => -0.4,
    surfaceHit: () => undefined,
  } as unknown as World;
  const earth = new Excavation(new THREE.Scene(), world, save);
  assert.equal(earth.dig(camera(), 0, 0, 0).success, true);
  assert.equal(save.excavation.length, 1);
});

test('the first opening is ahead of the rabbit, not under its feet', () => {
  const save = fixture();
  const world = {
    ...fakeWorld(),
    surfaceHit: () => new THREE.Vector3(0, 0, 0),
  } as unknown as World;
  const earth = new Excavation(new THREE.Scene(), world, save);
  assert.equal(earth.dig(camera(), 0, 0, 0).success, true);
  assert.ok(Math.hypot(save.excavation[0].x, save.excavation[0].z) >= 1.8);
});

test('adjacent dug sections share a finite smooth tunnel mesh', () => {
  const mesher = new CaveMesher(new THREE.Scene());
  const first = { x: 0, y: -2, z: 0 },
    second = { x: 2, y: -2.5, z: 0 };
  mesher.addNode(first, []);
  mesher.addNode(second, [first]);
  assert.ok(mesher.chunkCount > 0);
  const meshes = mesher.group.children as THREE.Mesh[];
  const positions = meshes.flatMap((mesh) =>
    Array.from((mesh.geometry.getAttribute('position') as THREE.BufferAttribute).array),
  );
  assert.ok(positions.length > 100);
  assert.ok(positions.every(Number.isFinite));
});

test('the passage between adjacent openings stays below the surface', () => {
  const save = fixture();
  save.excavation = [
    { x: 0, y: 0.45, z: 0 },
    { x: 2, y: 0.45, z: 0 },
  ];
  const earth = new Excavation(new THREE.Scene(), fakeWorld(), save);
  assert.ok(earth.floorAt(0, 0, 0) < -0.4);
  assert.ok(earth.floorAt(1, 0, -0.18) < -0.4);
  assert.ok(earth.floorAt(1.6, 0, -0.38) < -0.4);
  assert.equal(earth.isSheltered(1, -0.45, 0), true);
  assert.equal(earth.canMoveTo(1, 0, -0.45, true), true);
});

test('four neighboring surface openings remove the ground between them', () => {
  const scene = new THREE.Scene(),
    world = new World(scene, 197, fixture());
  for (const [x, z] of [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ])
    world.addGroundHole(x, z, 1.7);
  assert.equal(world.isSurfaceCarved(1, 1), true);
  const hit = world.surfaceHit(new THREE.Vector3(1, 20, 1), new THREE.Vector3(0, -1, 0), 30);
  assert.equal(hit, undefined);
  const patchHit = new THREE.Raycaster(
    new THREE.Vector3(1, 20, 1),
    new THREE.Vector3(0, -1, 0),
    0,
    30,
  )
    .intersectObjects(scene.children, true)
    .find((i) => i.object.material === world['exposedSoil']);
  assert.equal(patchHit, undefined);
});

test('nests and food stashes are placed objects with independent coordinates', () => {
  const save = fixture();
  save.nests.push({ id: 1, x: 2, y: -1, z: 4, quality: 1 });
  save.stashes.push({ id: 1, x: 2, y: -1, z: 4, food: {} });
  const store = new FoodStore(save);
  assert.equal(store.deposit(save.stashes[0]), 2);
  assert.equal(save.stashes[0].food.clover, 2);
  assert.equal(store.withdraw(save.stashes[0]), 2);
  assert.equal(save.inventory.clover, 2);
});

test('new saves never load the previous save key', () => {
  const values = new Map([['lesnaya-nora-save-v2', JSON.stringify({ version: 2 })]]);
  const previous = (globalThis as unknown as { localStorage?: unknown }).localStorage;
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  try {
    const repository = new SaveRepository();
    assert.equal(repository.exists(), false);
    repository.store(fixture());
    assert.equal(repository.exists(), true);
    assert.equal(repository.load().version, 3);
  } finally {
    (globalThis as unknown as { localStorage?: unknown }).localStorage = previous;
  }
});

test('version-two saves are rejected without migration', () => {
  const old = { ...fixture(), version: 2 };
  const values = new Map([['lesnaya-nora-save-v3', JSON.stringify(old)]]);
  const previous = (globalThis as unknown as { localStorage?: unknown }).localStorage;
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: () => {},
  };
  try {
    assert.throws(() => new SaveRepository().load(), /старой версии/);
  } finally {
    (globalThis as unknown as { localStorage?: unknown }).localStorage = previous;
  }
});

test('urine and pellet waste are separate objects and holding either need harms health', () => {
  const save = fixture(),
    scene = new THREE.Scene(),
    waste = new WasteSystem(scene, save);
  waste.spawn('pellets', 1, 0, 2);
  waste.spawn('urine', 2, 0, 3);
  assert.deepEqual(
    save.waste.map((w) => w.kind),
    ['pellets', 'urine'],
  );
  assert.equal(scene.children.length, 2);
  const survival = new SurvivalSystem(save, new Random(17));
  save.player.bladder = 99;
  save.player.bowel = 0;
  survival.tick(4, 4, false, 18, false, () => {});
  const afterBladder = save.player.health;
  assert.ok(afterBladder < 100);
  save.player.bladder = 0;
  save.player.bowel = 99;
  survival.tick(4, 8, false, 18, false, () => {});
  assert.ok(save.player.health < afterBladder);
});

test('relief and plant roots stay aligned with the surface', () => {
  const terrain = new Terrain(1701),
    heights = [];
  for (let x = -80; x <= 80; x += 16)
    for (let z = -80; z <= 80; z += 16) heights.push(terrain.heightAt(x, z));
  assert.ok(Math.max(...heights) - Math.min(...heights) > 3);
  const world = new World(new THREE.Scene(), 901, fixture());
  const plant = world.resources.find((r) => r.kind === 'carrot' && world.rootAt(r.x, r.z, 2) === r);
  assert.ok(plant);
  assert.equal(plant.mesh.position.y, world.heightAt(plant.x, plant.z));
});
