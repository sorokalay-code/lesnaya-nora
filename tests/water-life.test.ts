import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Terrain } from '../src/game/Terrain';
import { WaterNavigation } from '../src/game/WaterNavigation';
import { ModelAssets, MODEL_NAMES } from '../src/game/ModelAssets';
import { World } from '../src/game/World';
import { Random } from '../src/game/Random';
import { AnimalFactory, RabbitFactory, PlayerRabbit } from '../src/game/animals';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { PlayerMovement } from '../src/game/session/PlayerMovement';
import { WaterSimulation } from '../src/game/session/WaterSimulation';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { AnimalRestraint } from '../src/game/animals/AnimalRestraint';
import type { Excavation } from '../src/game/Excavation';
import type { ViewCamera } from '../src/game/ViewCamera';
import type { Soundscape } from '../src/game/Audio';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);
const world = new World(new THREE.Scene(), 31415);
const navigation = new WaterNavigation(world);
const earth = {
  isSheltered: () => false,
  floorAt: (x: number, z: number) => world.heightAt(x, z),
  canMoveTo: () => true,
  route: (_from: unknown, to: unknown) => [to],
  revision: 0,
} as unknown as Excavation;

test('all seeds have submerged pond/river beds and continuous banks', () => {
  for (const seed of [1, 34, 31415, 111111, 900719]) {
    const terrain = new Terrain(seed);
    for (const body of terrain.water.bodies)
      for (const point of body.points) {
        assert.ok(body.level - terrain.heightAt(point.x, point.z) > 1.5);
        for (let i = 0; i < 16; i++) {
          const x = point.x + Math.cos((i * Math.PI) / 8) * (body.radius + 0.1);
          const z = point.z + Math.sin((i * Math.PI) / 8) * (body.radius + 0.1);
          if (terrain.water.bodies.some((other) => terrain.water.distance(other, x, z) < 0))
            continue;
          assert.ok(
            terrain.heightAt(x, z) >= body.level - 0.04,
            JSON.stringify({
              seed,
              body: body.id,
              x,
              z,
              height: terrain.heightAt(x, z),
              level: body.level,
            }),
          );
        }
      }
  }
});

test('land navigation checks the whole step and cannot cross a pond at high dt', () => {
  const from = { x: 3, y: world.heightAt(3, -7), z: -7 };
  assert.equal(navigation.clear(from, 15, -7), false);
  const point = navigation.dryStep(from, 15, -7);
  assert.equal(navigation.clear(from, point.x, point.z), true);
  assert.equal(navigation.swimming(point.x, point.z), undefined);
});

test('non-swimming wildlife skirts deep water while swimmers cross it below the surface', () => {
  const deer = AnimalFactory.forest('deer', 3.8, -7, new Random(44));
  deer.useWater(navigation);
  const beaver = AnimalFactory.forest('beaver', 5.5, -7, new Random(45));
  beaver.useWater(navigation);
  assert.equal(deer.swimSpeed, 0);
  assert.ok(beaver.swimSpeed > 0);
  let swam = false;
  for (let frame = 0; frame < 700; frame++) {
    deer.update(0.03, frame * 0.03, (x, z) => world.heightAt(x, z), [], { x: 14, z: -7 });
    beaver.update(0.03, frame * 0.03, (x, z) => world.heightAt(x, z), [], { x: 14, z: -7 });
    assert.equal(navigation.swimming(deer.x, deer.z), undefined);
    if (beaver.root.userData.swimming) {
      swam = true;
      assert.ok(beaver.root.position.y > world.heightAt(beaver.x, beaver.z));
      assert.equal(beaver.model.activeName, 'swim');
    }
  }
  assert.ok(swam);
  assert.ok(beaver.x > 12);
});

function scene(playerAt = { x: -40, z: -70 }) {
  const save = NewGameFactory.create(31415, 0, new RabbitFactory(new Random(5)));
  save.player.genes = { ...DEFAULT_GENES, anatomy: { ...DEFAULT_GENES.anatomy } };
  Object.assign(save.player, playerAt, { y: navigation.height(playerAt.x, playerAt.z, 0.43) });
  const player = new PlayerRabbit(save.player);
  player.moveTo(save.player.x, save.player.z, save.player.y);
  let bites = 0;
  const messages: string[] = [];
  const context = {
    save,
    player: player.rig,
    world,
    earth,
    rabbits: [],
    families: [],
    predators: [],
    wildlife: [],
    hawks: [],
    toast: (line: string) => messages.push(line),
    consequences: {
      predatorAttack: () => {
        bites++;
        save.player.health -= 11.2;
      },
    },
  };
  return { save, player, context, messages, bites: () => bites };
}

test('player paddles with camera-relative WASD and cannot jump out of deep water', () => {
  const f = scene({ x: 8, z: -8 });
  const view = { forwardAt: () => ({ x: 1, z: 0 }) } as unknown as ViewCamera;
  const movement = new PlayerMovement(
    f.player,
    new Set(['KeyW', 'ShiftLeft']),
    view,
    earth,
    { play() {} } as unknown as Soundscape,
    () => true,
    world,
  );
  f.player.root.rotation.y = -Math.PI / 2;
  const start = f.save.player.x;
  for (let frame = 0; frame < 60; frame++) {
    movement.move(1 / 60, frame / 60, false);
    movement.settle(1 / 60);
  }
  assert.ok(f.save.player.x - start > 1.7 && f.save.player.x - start < 1.9);
  const water = world.waterAt(f.save.player.x, f.save.player.z)!;
  assert.ok(Math.abs(f.save.player.y - (water.level - 0.43)) < 0.001);
  assert.equal(movement.requestJump(3), false);
  assert.equal(f.player.root.userData.swimming, true);
});

test('partner navigation crosses the water and climbs out without snapping to the bed', () => {
  const data = new RabbitFactory(new Random(17)).partners(1)[0];
  Object.assign(data, { x: 3.5, z: -7, y: world.heightAt(3.5, -7) });
  data.genes = { ...DEFAULT_GENES, anatomy: { ...DEFAULT_GENES.anatomy } };
  const rabbit = AnimalFactory.rabbit(data, new Random(17));
  rabbit.moveTo(data.x, data.z, data.y!);
  rabbit.useWater(navigation);
  let swam = false;
  for (let frame = 0; frame < 400; frame++) {
    rabbit.navigateMate(
      0.03,
      frame * 0.03,
      { x: 15, y: world.heightAt(15, -7), z: -7 },
      earth,
      (x, z) => world.heightAt(x, z),
    );
    if ((navigation.swimming(rabbit.x, rabbit.z)?.depth ?? 0) > 0.6) {
      swam = true;
      assert.ok(rabbit.root.position.y > world.heightAt(rabbit.x, rabbit.z));
    }
  }
  assert.ok(swam);
  assert.ok(rabbit.x > 14);
});

test('water post-collision correction preserves player motion and dry terrain height', () => {
  const f = scene({ x: 20, z: 20 });
  const simulation = new WaterSimulation(f.context);
  simulation.update(0.05, 0, false);
  f.save.player.x += 0.2;
  f.save.player.y = world.heightAt(f.save.player.x, f.save.player.z);
  simulation.update(0.05, 0.05, false);
  assert.equal(f.save.player.x, 20.2);
  assert.equal(f.player.root.position.x, 20.2);
  assert.ok(Math.abs(f.save.player.y - world.heightAt(20.2, 20)) < 0.0001);
});

test('pike bites a swimming player with cooldown and respects dialogue truce and capture', () => {
  const f = scene();
  const simulation = new WaterSimulation(f.context);
  for (let frame = 0; frame < 60; frame++) simulation.update(0.05, frame * 0.05, true);
  assert.equal(f.bites(), 1);
  f.player.root.userData.conversing = true;
  for (let frame = 60; frame < 180; frame++) simulation.update(0.05, frame * 0.05, true);
  assert.equal(f.bites(), 1);
  f.player.root.userData.conversing = false;
  AnimalRestraint.hold(f.player.root);
  for (let frame = 180; frame < 220; frame++) simulation.update(0.05, frame * 0.05, true);
  assert.equal(f.bites(), 1);
  AnimalRestraint.release(f.player.root);
  for (let frame = 220; frame < 260; frame++) simulation.update(0.05, frame * 0.05, false);
  assert.equal(f.bites(), 1);
});

test('pike does not hunt the player on land and stays in sufficiently deep water', () => {
  const f = scene({ x: -33.5, z: -70 });
  const simulation = new WaterSimulation(f.context);
  for (let frame = 0; frame < 500; frame++) {
    simulation.update(0.05, frame * 0.05, true);
    for (const fish of simulation.pikes)
      assert.ok((world.waterAt(fish.x, fish.z)?.depth ?? 0) >= 0.65);
  }
  assert.equal(f.bites(), 0);
});

test('swimming clips and efficient fish LOD are included in the real GLBs', () => {
  for (const kind of [
    'rabbit',
    'beaver',
    'moose',
    'boar',
    'bear',
    'wolf',
    'dog',
    'snake',
    'pike',
  ] as const) {
    const model = ModelAssets.shared.create(kind);
    const variants = model.variants ?? [model];
    for (const variant of variants) {
      const clip = variant.clips.get('swim');
      assert.ok(clip && clip.tracks.length > 0, kind);
    }
  }
  const fish = ModelAssets.shared.create('pike');
  const counts = (fish.variants ?? [fish]).map((variant) => {
    let meshes = 0,
      triangles = 0;
    variant.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes++;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      }
    });
    assert.ok(meshes <= 4);
    return triangles;
  });
  assert.ok(Math.max(...counts) < 3500);
  assert.ok(Math.min(...counts) < 1200);
});

test('pike hunts other swimmers without unrelated notifications, and land animals are placed on shore', () => {
  const f = scene({ x: 40, z: 40 });
  const beaver = AnimalFactory.forest('beaver', -40, -70, new Random(71));
  beaver.moveTo(-40, -70, navigation.height(-40, -70, 0.47));
  const deer = AnimalFactory.forest('deer', 9, -7, new Random(72));
  deer.moveTo(9, -7, world.heightAt(9, -7));
  const simulation = new WaterSimulation({ ...f.context, wildlife: [beaver, deer] });
  for (let frame = 0; frame < 60; frame++) simulation.update(0.05, frame * 0.05, true);
  assert.ok(beaver.health < beaver.maxHealth);
  assert.equal(f.messages.length, 0);
  assert.equal(f.bites(), 0);
  assert.equal(navigation.swimming(deer.x, deer.z), undefined);
  assert.ok(Math.abs(deer.root.position.y - world.heightAt(deer.x, deer.z)) < 0.001);
});

test('water correction leaves sheltered tunnels and captured family members alone', () => {
  const f = scene({ x: 9, z: -7 });
  f.save.player.y = world.heightAt(9, -7) - 3;
  const simulation = new WaterSimulation({
    ...f.context,
    earth: { ...earth, isSheltered: () => true } as unknown as Excavation,
  });
  simulation.update(0.05, 0, true);
  assert.equal(f.player.root.userData.swimming, false);
  assert.equal(f.save.player.y, world.heightAt(9, -7) - 3);
  assert.equal(f.bites(), 0);
});

test('switching the playable daughter discards the former swimming path and pike target', () => {
  const f = scene({ x: 8, z: -7 });
  const simulation = new WaterSimulation(f.context);
  simulation.update(0.05, 0, false);
  f.save.player.x = 10;
  simulation.resetTargets();
  simulation.update(0.05, 0.05, false);
  assert.equal(f.save.player.x, 10);
  assert.equal(f.player.root.position.x, 10);
});
