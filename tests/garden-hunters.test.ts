import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Scene } from 'three';
import { AnimalFactory, PlayerRabbit, RabbitFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { Hunter, HUNTER } from '../src/game/Hunter';
import type { GardenPlot } from '../src/game/GardenPlot';
import { GardenHunters } from '../src/game/session/GardenHunters';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { SaveRepository } from '../src/game/SaveRepository';
import type { Resource, World } from '../src/game/World';
import { loadModels } from './model-fixture';

await loadModels('hunter', 'rabbit', 'deer');

type Observe = Parameters<World['observeHarvest']>[0];

function fixture() {
  const save = NewGameFactory.create(31415, 0, new RabbitFactory(new Random(8)));
  const scene = new Scene();
  const player = new PlayerRabbit(save.player).rig;
  const deer = AnimalFactory.forest('deer', 5, 0, new Random(6));
  deer.socialId = 1;
  deer.root.userData.remainsIdentity = 'wildlife:1';
  const gardens: GardenPlot[] = [
    { id: 0, x: 0, z: 0, radius: 10, door: { x: 0, y: 0, z: 7 } },
    { id: 1, x: 60, z: 0, radius: 10, door: { x: 60, y: 0, z: 7 } },
  ];
  let observer: Observe | undefined;
  let sound = 0;
  let sheltered = false;
  const obstacles: World['shelterObstacles'] = [];
  const world = {
    gardens,
    scene,
    shelterObstacles: obstacles,
    heightAt: () => 0,
    waterAt: () => undefined,
    observeHarvest: (listener: Observe) => {
      observer = listener;
      return () => {
        observer = undefined;
      };
    },
  } as unknown as World;
  const context = {
    save,
    world,
    player,
    wildlife: [deer],
    rabbits: [],
    families: [],
    predators: [],
    hawks: [],
    earth: { isSheltered: () => sheltered },
    shotSound: () => {
      sound++;
    },
    toast() {},
  };
  const controller = new GardenHunters(context);
  const crop = (x = 5, kind: Resource['kind'] = 'carrot'): Resource => ({
    id: 1,
    x,
    z: 0,
    kind,
    mesh: new Group(),
    available: true,
    regrowAt: 0,
  });
  let time = 0;
  const step = (seconds: number, combat = true) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) {
      time += 0.05;
      save.clock += 0.3;
      controller.update(0.05, time, combat);
    }
  };
  return {
    save,
    scene,
    player,
    deer,
    controller,
    context,
    world,
    gardens,
    step,
    crop,
    obstacles,
    harvest: (resource: Resource, root: Group | 'player' = deer.root) => observer?.(resource, root),
    sound: () => sound,
    hide: () => {
      sheltered = true;
    },
  };
}

test('each garden has an owner, only garden vegetables raise the alarm and shots damage the eater', () => {
  const f = fixture();
  assert.equal(f.controller.hunters.length, 2);
  f.harvest(f.crop(5, 'clover'));
  f.harvest(f.crop(30));
  assert.equal(f.controller.hunters[0].state.phase, 'home');
  f.harvest(f.crop());
  assert.equal(f.controller.hunters[0].state.target, 'wildlife:1');
  assert.equal(f.controller.hunters[1].state.phase, 'home');
  const health = f.deer.health;
  f.step(2);
  assert.ok(f.deer.health < health);
  assert.equal(f.sound(), 1);
  f.step(1);
  assert.equal(f.sound(), 1, 'the rifle must reload');
  f.deer.moveTo(35, 0, 0);
  f.step(10);
  assert.equal(f.controller.hunters[0].state.phase, 'home');
  assert.ok(!f.controller.hunters[0].root.visible);
});

test('burrows, obstacles and a conversation prevent shooting, and shutdown unsubscribes from harvest', () => {
  const f = fixture();
  f.harvest(f.crop());
  f.step(3, false);
  assert.equal(f.sound(), 0);
  f.obstacles.push({ x: 2.5, z: 3.5, radius: 1.5 });
  f.step(0.8);
  assert.equal(f.sound(), 0);
  f.hide();
  f.step(8);
  assert.equal(f.deer.health, f.deer.maxHealth);
  f.controller.dispose();
  assert.ok(f.scene.children.every((object) => !object.name.startsWith('garden-hunter-')));
  f.harvest(f.crop());
  assert.equal(f.sound(), 0);
});

test('player crop theft triggers the hunter, while returning and reload state survive a real save', () => {
  const f = fixture();
  f.save.player.x = f.player.root.position.x = 5;
  f.save.player.z = f.player.root.position.z = 0;
  f.harvest(f.crop(), 'player');
  f.step(2);
  assert.ok(f.save.player.health < 100);
  const state = structuredClone(f.save.hunters![0]);
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  try {
    const repository = new SaveRepository('hunter-test');
    repository.store(f.save);
    assert.deepEqual(repository.load().hunters![0], state);
    const broken = structuredClone(f.save);
    broken.hunters![0].readyAt = NaN;
    assert.throws(() => {
      repository.store(broken);
      repository.load();
    }, /охотник|сохран/i);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('hunter visibly walks out of the house before a distant shot and returns after alarm expiry', () => {
  const garden = { id: 0, x: 0, z: 0, radius: 12, door: { x: 0, y: 0, z: 0 } };
  const state = { garden: 0, x: 0, z: 0, phase: 'home' as const, alarmUntil: 0, readyAt: 0 };
  const hunter = new Hunter(garden, state, () => 0);
  let shots = 0;
  let clock = 0;
  hunter.alarm('wildlife:1', clock);
  for (let i = 0; i < 100; i++) {
    clock += 0.3;
    hunter.update(
      0.05,
      i * 0.05,
      clock,
      { x: 23, y: 0.4, z: 0 },
      true,
      () => true,
      () => shots++,
    );
  }
  assert.ok(hunter.state.x > 2 && shots > 0);
  for (let i = 0; i < 240; i++)
    hunter.update(
      0.05,
      5 + i * 0.05,
      HUNTER.alarmMinutes + 1,
      undefined,
      true,
      () => true,
      () => shots++,
    );
  assert.equal(hunter.state.phase, 'home');
  hunter.dispose();
});
