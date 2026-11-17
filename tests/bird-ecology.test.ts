import assert from 'node:assert/strict';
import test from 'node:test';
import { InstancedMesh, Scene } from 'three';
import { PlayerRabbit, RabbitFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { HawkHunting } from '../src/game/session/HawkHunting';
import { HawkTargeting } from '../src/game/session/HawkTargeting';
import { HawkVictims } from '../src/game/session/HawkVictims';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { isNightAt } from '../src/game/session/WorldCalendar';
import { WorldRest } from '../src/game/session/WorldRest';
import type { SaveData } from '../src/game/types';
import type { World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig } from '../src/game/WorldConfig';
import { loadModels } from './model-fixture';

await loadModels('hawk', 'owl', 'pheasant', 'rabbit', 'mouse');

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
const DAY = 1440;

function start() {
  const config = defaultWorldConfig();
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  config.creatures.hawk = config.creatures.owl = config.creatures.pheasant = 2;
  config.creatures.mouse = 1;
  return NewGameFactory.create(31415, 0, new RabbitFactory(new Random(3)), config);
}

function fixture(save: SaveData = start()) {
  const scene = new Scene();
  const groundAt = () => 0;
  const world = {
    scene,
    size: 110,
    seed: save.seed,
    treeLocations: [{ x: 2, z: 26, nestHeight: 3.1 }],
    waterSources: [],
    resources: [],
    heightAt: groundAt,
    biomeAt: () => 'meadow',
    hasCover: () => false,
  } as unknown as World;
  const population = new WorldPopulation({
    scene,
    world,
    save,
    rng: new Random(save.seed),
    markPartner() {},
  });
  const player = new PlayerRabbit(save.player).rig;
  const sources = { ...population, save, player };
  const hunting = new HawkHunting({
    ...sources,
    world,
    earth: { isSheltered: () => false, floorAt: groundAt },
    toast() {},
  });
  let time = 0;
  const tick = (dt: number, clock: number) => {
    time += dt;
    save.clock = clock;
    save.day = 1 + Math.floor(clock / DAY);
    population.ecology.update(
      dt,
      time,
      clock,
      save.player.x,
      save.player.z,
      groundAt,
      population.predators,
      false,
    );
    population.raptors.update(time);
    hunting.update(dt, time, false, isNightAt(clock));
  };
  const step = (clock: number, seconds = 2) => {
    for (let i = 0; i < seconds; i += 0.1) tick(0.1, clock);
  };
  const capture = () => {
    population.ecology.capture();
    population.raptors.capture();
  };
  const eggsInScene = () =>
    scene.children
      .filter(
        (object): object is InstancedMesh =>
          object instanceof InstancedMesh && object.name.startsWith('bird-clutch-'),
      )
      .reduce((sum, clutch) => sum + clutch.count, 0);
  return { scene, population, save, tick, step, capture, sources, eggsInScene };
}

function reload(save: SaveData): SaveData {
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
    const repository = new SaveRepository('bird-ecology-test');
    repository.store(save);
    return repository.load();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('on the same map hawks and owls take turns leaving physical nests and perching', () => {
  const f = fixture();
  const hawks = f.population.hawks.filter((bird) => bird.kind === 'hawk');
  const owls = f.population.hawks.filter((bird) => bird.kind === 'owl');
  const ledge = f.scene.getObjectByName('bird-nest-hawk-0')!;
  const branch = f.scene.getObjectByName('bird-nest-owl-0')!;
  assert.ok(ledge.position.y > 1);
  assert.ok(branch.position.y > ledge.position.y);
  f.step(720, 15);
  assert.ok(owls.every((owl) => owl.present && owl.perched && distance(owl, branch.position) < 2));
  assert.ok(hawks.some((hawk) => hawk.huntingAllowed && distance(hawk, ledge.position) > 8));
  f.step(1320, 25);
  assert.ok(hawks.every((hawk) => hawk.perched && !hawk.huntingAllowed));
  assert.ok(owls.some((owl) => owl.huntingAllowed && distance(owl, branch.position) > 8));
});

test('raptor diet prefers mouse or bird with the player still selectable on an open route', () => {
  const f = fixture();
  const mouse = f.population.wildlife.find((actor) => actor.kind === 'mouse')!;
  const pheasant = f.population.wildlife.find((actor) => actor.kind === 'pheasant')!;
  mouse.moveTo(4, 0, 0);
  pheasant.moveTo(4, 0, 0);
  f.sources.player.root.position.set(4, 0, 0);
  const sources = new HawkVictims(f.sources);
  const targeting = new HawkTargeting();
  assert.equal(
    targeting.choose(sources.rodents(), { kind: 'owl', x: 0, z: 0 }, () => true)?.root.uuid,
    mouse.root.uuid,
  );
  assert.equal(
    targeting.choose(sources.all(), { kind: 'hawk', x: 0, z: 0 }, () => true)?.root.uuid,
    pheasant.root.uuid,
  );
  mouse.health = pheasant.health = 0;
  assert.equal(
    targeting.choose(sources.all(), { kind: 'hawk', x: 0, z: 0 }, () => true)?.root.uuid,
    f.sources.player.root.uuid,
  );
});

test('clutches reload, hatch during sleep and pheasant chicks follow their hen on the ground', () => {
  const f = fixture();
  const pheasants = f.population.wildlife.filter((bird) => bird.kind === 'pheasant');
  pheasants[1].moveTo(pheasants[0].x + 2, pheasants[0].z, 0);
  f.step(720);
  f.step(1320);
  const pheasantBrood = f.save.birdBroods?.pheasant?.[0];
  assert.ok(pheasantBrood?.eggs);
  assert.ok(f.scene.getObjectByName('wildlife-shelter-pheasant-0'));
  assert.equal(f.eggsInScene(), 9);
  f.capture();
  const restored = fixture(reload(f.save));
  assert.equal(restored.eggsInScene(), 9);

  const clock = pheasantBrood.laidAt + DAY - 5;
  restored.save.clock = clock;
  const rest = new WorldRest({
    save: restored.save,
    state: { elapsed: 0 },
    calendar: {
      advance: (dt) => {
        restored.save.clock += dt * 6;
      },
      isNight: () => isNightAt(restored.save.clock),
    },
    family: { update() {}, advancePregnancy() {} },
    animals: {
      update: (dt) => {
        restored.tick(dt, restored.save.clock);
      },
    },
    world: { update() {} },
    earth: { isSheltered: () => true },
    waste: { update() {} },
    items: { update() {} },
    lighting: { update() {} },
    sound: { setWeather() {} },
  });
  rest.advance(25);
  assert.equal(restored.eggsInScene(), 5);
  const hen = restored.population.wildlife.find(
    (actor) => actor.socialId === pheasantBrood.parent,
  )!;
  const chicks = restored.population.wildlife.filter(
    (actor) => actor.kind === 'pheasant' && actor.juvenile,
  );
  assert.equal(chicks.length, 4);
  hen.moveTo(chicks[0].x + 4, chicks[0].z, 0);
  hen.foragingAllowed = false;
  hen.destination = { x: hen.x, z: hen.z };
  restored.step(restored.save.clock, 4);
  assert.ok(
    chicks.every((chick) => Math.abs(chick.root.position.y) < 0.05 && distance(chick, hen) < 3),
  );
  restored.capture();
  const reloaded = fixture(reload(restored.save));
  const loaded = reloaded.population.wildlife.filter(
    (actor) => actor.kind === 'pheasant' && actor.juvenile,
  );
  assert.deepEqual(
    loaded.map(({ socialId, x, z }) => ({ socialId, x, z })),
    chicks.map(({ socialId, x, z }) => ({ socialId, x, z })),
  );
});

test('nestlings remain at height then practice short flights and a vacant adult territory can be inherited', () => {
  const f = fixture();
  f.step(720);
  const laid = f.save.birdBroods?.hawk?.[0];
  assert.ok(laid?.eggs);
  f.step(laid.laidAt + 2 * DAY, 6);
  const nestlings = f.population.hawks.filter((bird) => bird.kind === 'hawk' && bird.juvenile);
  const nest = f.scene.getObjectByName('bird-nest-hawk-0')!;
  assert.equal(nestlings.length, 2);
  assert.ok(
    nestlings.every((bird) => bird.perched && bird.root.position.y > 2 && !bird.huntingAllowed),
  );

  const practiceDay = laid.laidAt + 5 * DAY;
  const activeFlight = practiceDay + ((17 - (practiceDay % 26) + 26) % 26);
  f.step(activeFlight, 5);
  assert.ok(
    nestlings.every(
      (bird) => !bird.perched && distance(bird, nest.position) > 2 && !bird.huntingAllowed,
    ),
  );
  f.capture();
  const restored = fixture(reload(f.save));
  const restoredYoung = restored.population.hawks.filter(
    (bird) => bird.kind === 'hawk' && bird.juvenile,
  );
  assert.deepEqual(
    restoredYoung.map((bird) => bird.x),
    nestlings.map((bird) => bird.x),
  );

  const adult = restored.population.hawks.find((bird) => bird.kind === 'hawk' && !bird.juvenile)!;
  adult.health = 0;
  restored.population.raptors.removeDead(() => false);
  restored.step(laid.laidAt + 6 * DAY + 1);
  restored.capture();
  assert.ok(restored.save.raptors?.some((actor) => actor.kind === 'hawk' && actor.id >= 1000));
  assert.equal(
    fixture(reload(restored.save)).population.hawks.filter(
      (bird) => bird.kind === 'hawk' && !bird.juvenile,
    ).length,
    2,
  );
});
