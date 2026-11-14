import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Excavation } from '../src/game/Excavation';
import { MODEL_NAMES } from '../src/game/ModelAssets';
import { Random } from '../src/game/Random';
import { World } from '../src/game/World';
import { WaterNavigation } from '../src/game/WaterNavigation';
import { PlayerRabbit, RabbitFactory, AnimalFactory } from '../src/game/animals';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { PlayerMovement } from '../src/game/session/PlayerMovement';
import { WaterSimulation } from '../src/game/session/WaterSimulation';
import type { ViewCamera } from '../src/game/ViewCamera';
import type { Soundscape } from '../src/game/Audio';
import { KitMovement } from '../src/game/session/KitMovement';
import { KitWander } from '../src/game/KitWander';
import { createRabbit } from '../src/game/Models';
import type { DigNode, KitData } from '../src/game/types';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);
const genes = () => ({ ...DEFAULT_GENES, anatomy: { ...DEFAULT_GENES.anatomy } });

test('water height keeps the excavation support on dry land', () => {
  const navigation = new WaterNavigation({ heightAt: () => 2, waterAt: () => undefined });
  assert.equal(navigation.height(0, 0, 0.43, -0.25), -0.25);
});

function fixture() {
  const save = NewGameFactory.create(31415, 0, new RabbitFactory(new Random(4)));
  save.player.genes = genes();
  const scene = new THREE.Scene(),
    world = new World(scene, save.seed, save);
  const earth = new Excavation(scene, world, save);
  const player = new PlayerRabbit(save.player),
    keys = new Set<string>();
  let direction = { x: 0, z: -1 };
  const movement = new PlayerMovement(
    player,
    keys,
    { forwardAt: () => direction } as unknown as ViewCamera,
    earth,
    { play() {} } as unknown as Soundscape,
    () => true,
    world,
  );
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
    toast() {},
    consequences: { predatorAttack() {} },
  };
  const water = new WaterSimulation(context);
  let time = 0;

  function tick() {
    movement.move(1 / 60, time, false);
    movement.settle(1 / 60);
    player.root.position.set(save.player.x, save.player.y, save.player.z);
    player.root.userData.baseY = save.player.y;
    water.update(1 / 60, time, false);
    time += 1 / 60;
  }
  function walkTo(x: number, z: number) {
    keys.add('KeyW');
    for (let i = 0; i < 600; i++) {
      const dx = x - save.player.x,
        dz = z - save.player.z,
        distance = Math.hypot(dx, dz);
      if (distance < 0.15) break;
      direction = { x: dx / distance, z: dz / distance };
      tick();
    }
    keys.clear();
    for (let i = 0; i < 45; i++) tick();
    assert.ok(
      Math.hypot(x - save.player.x, z - save.player.z) < 0.2,
      'Игрок должен физически дойти до цели',
    );
  }
  function dig(down = false) {
    const p = save.player,
      camera = new THREE.PerspectiveCamera();
    camera.position.set(p.x, p.y + 0.75, p.z);
    camera.lookAt(p.x, p.y - 0.15, p.z - 2.2);
    camera.updateMatrixWorld();
    const result = earth.dig(camera, p.x, p.y, p.z, down ? 'down' : 'aim');
    assert.ok(result.success, result.reason);
    return result.node!;
  }
  return { save, world, earth, player, movement, context, water, walkTo, dig };
}

test('player enters a newly dug slope, digs deeper and walks back out with water enabled', () => {
  const f = fixture(),
    entrance = f.dig();
  assert.equal(f.world.waterAt(entrance.x, entrance.z), undefined);
  f.walkTo(entrance.x, entrance.z);
  assert.ok(
    f.save.player.y < f.world.heightAt(entrance.x, entrance.z) - 0.3,
    'На входе не должно быть невидимого пола',
  );
  const rooms: DigNode[] = [entrance];
  for (let i = 0; i < 3; i++) {
    const node = f.dig(true);
    rooms.push(node);
    f.walkTo(node.x, node.z);
  }
  assert.ok(f.earth.depthAt(f.save.player.x, f.save.player.y, f.save.player.z) > 2);
  assert.equal(f.player.root.userData.swimming, false);
  for (const node of rooms.slice().reverse()) f.walkTo(node.x, node.z);
  f.walkTo(0, 2);
  assert.ok(Math.abs(f.save.player.y - f.world.heightAt(f.save.player.x, f.save.player.z)) < 0.01);
  assert.equal(f.earth.isSheltered(f.save.player.x, f.save.player.y, f.save.player.z), false);
});

test('partner enters and leaves an actual excavated entrance with aquatic navigation enabled', () => {
  const f = fixture(),
    entrance = f.dig();
  const data = f.save.partners[0];
  data.genes = genes();
  Object.assign(data, { x: 0, z: 1, y: f.world.heightAt(0, 1) });
  const actor = AnimalFactory.rabbit(data, new Random(7));
  actor.moveTo(data.x, data.z, data.y!);
  const water = new WaterSimulation({ ...f.context, rabbits: [actor] });
  const home = { x: entrance.x, y: entrance.y - 0.95, z: entrance.z };
  for (let i = 0; i < 250; i++) {
    actor.navigateMate(0.02, i * 0.02, home, f.earth, (x, z) => f.world.heightAt(x, z));
    water.update(0.02, i * 0.02, false);
  }
  assert.ok(actor.root.position.y < f.world.heightAt(actor.x, actor.z) - 0.3);
  assert.ok(Math.hypot(actor.x - home.x, actor.z - home.z) < 0.8);
  const outside = { x: 0, y: f.world.heightAt(0, 3), z: 3 };
  for (let i = 250; i < 650; i++) {
    actor.navigateMate(0.02, i * 0.02, outside, f.earth, (x, z) => f.world.heightAt(x, z));
    water.update(0.02, i * 0.02, false);
  }
  assert.ok(Math.hypot(actor.x - outside.x, actor.z - outside.z) < 0.8);
  assert.ok(Math.abs(actor.root.position.y - f.world.heightAt(actor.x, actor.z)) < 0.01);
});

test('following kits walk through the dug entrance into the expanded tunnel', () => {
  const f = fixture();
  const entrance = f.dig();
  f.walkTo(entrance.x, entrance.z);
  for (let i = 0; i < 3; i++) {
    const section = f.dig(true);
    f.walkTo(section.x, section.z);
  }

  const child: KitData = {
    id: 1,
    name: 'Kit',
    genes: genes(),
    age: 1.2,
    hunger: 90,
    health: 100,
    father: 'Rabbit',
    alive: true,
    command: 'follow',
    homeX: 0,
    homeY: f.world.heightAt(0, 1),
    homeZ: 1,
  };
  const rig = createRabbit(child.genes, true);
  const movement = new KitMovement(f.context, new KitWander(new Random(2)));
  for (let frame = 0; frame < 600; frame++) movement.update(child, rig, frame / 60, 1 / 60);
  const { x, y, z } = rig.root.position;
  assert.ok(f.earth.isSheltered(x, y, z));
  assert.ok(f.earth.depthAt(x, y, z) > 1.7);
  assert.ok(Math.hypot(x - f.save.player.x, z - f.save.player.z) < 1.8);
});

test('standing at the lip of a dry entrance starts descent before sheltered becomes true', () => {
  const f = fixture(),
    entrance = f.dig();
  const p = f.save.player;
  p.x = entrance.x;
  p.z = entrance.z + 1.3;
  p.y = f.world.heightAt(p.x, p.z);
  assert.equal(f.earth.isSheltered(p.x, p.y, p.z), false);
  f.movement.settle(1 / 60);
  assert.ok(p.y < f.world.heightAt(p.x, p.z));
});

test('a rabbit can walk in a dry tunnel underneath a pond without surface swimming speed', () => {
  const f = fixture(),
    p = f.save.player;
  const bed = f.world.heightAt(9, -7);
  f.save.excavation.push({ x: 8, y: bed - 2, z: -7 }, { x: 10, y: bed - 2, z: -7 });
  const earth = new Excavation(new THREE.Scene(), f.world, f.save);
  p.x = 8;
  p.z = -7;
  p.y = bed - 2.95;
  assert.ok(earth.isSheltered(p.x, p.y, p.z));
  const movement = new PlayerMovement(
    f.player,
    new Set(['KeyW']),
    { forwardAt: () => ({ x: 1, z: 0 }) } as unknown as ViewCamera,
    earth,
    { play() {} } as unknown as Soundscape,
    () => true,
    f.world,
  );
  f.player.root.rotation.y = -Math.PI / 2;
  movement.move(0.05, 1, false);
  movement.settle(0.05);
  const drySpeed = 4.5 * (0.82 + p.genes.speed * 0.06) * 0.68;
  assert.ok(Math.abs(p.x - 8 - drySpeed * 0.05) < 0.0001);
  assert.equal(f.player.root.userData.swimming, false);
  assert.ok(p.y < bed - 2);
});
