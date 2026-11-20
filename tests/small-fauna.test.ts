import assert from 'node:assert/strict';
import test from 'node:test';
import { InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { PlayerRabbit, RabbitFactory } from '../src/game/animals';
import { Spider } from '../src/game/animals/Spider';
import { AmbientFlight } from '../src/game/AmbientFlight';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { smallFaunaStage } from '../src/game/SmallFaunaCohorts';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { SpiderEncounter } from '../src/game/session/SpiderEncounter';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { WorldRest } from '../src/game/session/WorldRest';
import { SeasonSystem } from '../src/game/systems';
import type { SaveData } from '../src/game/types';
import type { World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig } from '../src/game/WorldConfig';
import { loadModels } from './model-fixture';

await loadModels('snake', 'spider', 'jumping-spider', 'rabbit', 'hedgehog', 'marmot', 'chipmunk');

const DAY = 1440;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

function start(count = 2) {
  const config = defaultWorldConfig();
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  config.creatures.spider = config.creatures['jumping-spider'] = config.creatures.snake = count;
  config.seasonLengths = { Весна: 6, Лето: 8, Осень: 5, Зима: 6 };
  return NewGameFactory.create(31415, 0, new RabbitFactory(new Random(8)), config);
}

function fixture(save = start()) {
  const scene = new Scene();
  const groundAt = () => 0;
  const world = {
    scene,
    seed: save.seed,
    size: save.worldConfig?.size ?? 110,
    resources: [],
    waterSources: [],
    treeLocations: [
      { x: 30, z: 12 },
      { x: 35, z: 12 },
      { x: -30, z: -12 },
      { x: -35, z: -12 },
    ],
    biomeAt: () => 'forest',
    heightAt: groundAt,
    temperatureOffset: () => 0,
  } as unknown as World;
  const population = new WorldPopulation({
    save,
    scene,
    world,
    rng: new Random(save.seed),
    markPartner() {},
  });
  const player = new PlayerRabbit(save.player).rig;
  const traps = new SpiderEncounter({
    save,
    scene,
    world,
    player,
    spiders: population.predators,
    toast() {},
  });
  let time = 0;
  const tick = (dt: number, clock: number) => {
    time += dt;
    save.clock = clock;
    save.day = Math.floor(clock / DAY) + 1;
    population.ecology.prepareHabitats(time, clock, population.predators);
    for (const actor of population.predators) actor.update(dt, time, 0, 0, true, true, groundAt);
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
    traps.update(dt, time, false);
  };
  const step = (clock: number, seconds = 2) => {
    for (let i = 0; i < seconds; i += 0.1) tick(0.1, clock);
  };
  const setSeason = (season: number, minute = 720) =>
    (new SeasonSystem(save.seed, save.worldConfig!.seasonLengths).startDay(season) - 1) * DAY +
    minute;
  return { save, scene, world, population, traps, player, step, tick, setSeason };
}

function roundTrip(save: SaveData): SaveData {
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
    const repository = new SaveRepository('small-fauna-test');
    repository.store(save);
    return repository.load();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('spider cocoons reload, hatch during sleep and disperse as bounded instance groups', () => {
  const f = fixture();
  f.step(720);
  const cohort = f.save.smallFaunaCohorts!.find((record) => record.kind === 'spider')!;
  assert.ok(cohort);
  Object.assign(f.save.player, cohort.home);
  f.step(725);
  assert.ok(f.scene.getObjectByName('small-fauna-cocoon-spider-0')?.visible);
  f.population.ecology.capture();
  const original = f.population.predators
    .filter((actor) => actor instanceof Spider)
    .map((actor) => ({
      id: actor.root.userData.remainsIdentity,
      x: actor.x,
      y: actor.root.position.y,
      z: actor.z,
    }));
  const restored = fixture(roundTrip(f.save));
  assert.deepEqual(
    restored.population.predators
      .filter((actor) => actor instanceof Spider)
      .map((actor) => ({
        id: actor.root.userData.remainsIdentity,
        x: actor.x,
        y: actor.root.position.y,
        z: actor.z,
      })),
    original,
  );
  const mother = restored.population.predators.find(
    (actor) => actor.root.userData.remainsIdentity === cohort.parent,
  )!;
  mother.health = 0;
  restored.step(cohort.dueAt - 12);
  assert.ok(restored.scene.getObjectByName('small-fauna-cocoon-spider-0')?.visible);
  restored.save.clock = cohort.dueAt - 6;
  const rest = new WorldRest({
    save: restored.save,
    state: { elapsed: 0 },
    calendar: {
      advance: (dt) => {
        restored.save.clock += dt * 6;
      },
      isNight: () => false,
    },
    family: { update() {}, advancePregnancy() {} },
    animals: { update: (dt) => restored.tick(dt, restored.save.clock) },
    world: { update() {} },
    earth: { isSheltered: () => true },
    waste: { update() {} },
    items: { update() {} },
    lighting: { update() {} },
    sound: { setWeather() {} },
  });
  rest.advance(30);
  const young = restored.scene.getObjectByName('small-fauna-young-spider-0');
  assert.ok(young instanceof InstancedMesh && young.count > 0 && young.count <= 8);
  assert.equal(restored.scene.getObjectByName('small-fauna-cocoon-spider-0'), undefined);
  assert.equal(restored.population.predators.filter((actor) => actor instanceof Spider).length, 1);
  restored.population.ecology.capture();
  assert.equal(
    roundTrip(restored.save).smallFaunaCohorts!.find((record) => record.kind === 'spider')!
      .remaining,
    12,
  );
});

test('a snake that dies before birth loses its litter even after reloading past the due time', () => {
  const f = fixture();
  f.step(f.setSeason(1));
  const brood = f.save.smallFaunaCohorts!.find((record) => record.kind === 'snake')!;
  const mother = f.population.predators.find(
    (actor) => actor.root.userData.remainsIdentity === brood.parent,
  )!;
  mother.health = 0;
  f.step(brood.dueAt - 1);
  f.population.ecology.capture();
  const save = roundTrip(f.save);
  save.clock = brood.dueAt + 1;
  const restored = fixture(save);
  restored.step(save.clock);
  assert.equal(save.smallFaunaCohorts!.find((record) => record.kind === 'snake')!.remaining, 0);
  assert.equal(restored.scene.getObjectByName('small-fauna-young-snake-0'), undefined);
});

test('a jumping spider cocoon outlives its mother and hatches after reload', () => {
  const f = fixture();
  f.step(720);
  const brood = f.save.smallFaunaCohorts!.find((record) => record.kind === 'jumping-spider')!;
  const mother = f.population.predators.find(
    (actor) => actor.root.userData.remainsIdentity === brood.parent,
  )!;
  mother.health = 0;
  f.step(brood.dueAt - 6);
  f.population.ecology.capture();
  const loaded = fixture(roundTrip(f.save));
  Object.assign(loaded.save.player, brood.home);
  loaded.step(brood.dueAt + 6);
  const young = loaded.scene.getObjectByName('small-fauna-young-jumping-spider-0');
  assert.ok(young instanceof InstancedMesh && young.count > 0);
});

test('snakes produce independent live young that later fill a vacancy while immigration waits', () => {
  const f = fixture();
  const summer = f.setSeason(1);
  f.step(summer);
  const brood = f.save.smallFaunaCohorts!.find((record) => record.kind === 'snake')!;
  assert.equal(smallFaunaStage(brood, summer), 'gestation');
  const mother = f.population.predators.find(
    (actor) => actor.root.userData.remainsIdentity === brood.parent,
  )!;
  f.step(brood.dueAt + 5);
  Object.assign(f.save.player, { ...brood.home, x: brood.home.x + 10 });
  f.step(brood.dueAt + 720);
  const young = f.scene.getObjectByName('small-fauna-young-snake-0');
  assert.ok(young instanceof InstancedMesh);
  assert.equal(young.count, 3);
  const matrix = new Matrix4();
  const position = new Vector3();
  young.getMatrixAt(0, matrix);
  position.setFromMatrixPosition(matrix);
  assert.ok(distance(position, brood.home) > 0.4);
  assert.equal(f.scene.getObjectByName('small-fauna-cocoon-snake-0'), undefined);
  mother.health = 0;
  f.step(brood.dueAt + 725);
  f.step(brood.matureAt - 5);
  assert.equal(f.population.predators.filter((actor) => actor.kind === 'snake').length, 1);
  Object.assign(f.save.player, { x: 0, y: 0, z: 0 });
  f.step(brood.matureAt + 5);
  const snakes = f.population.predators.filter((actor) => actor.kind === 'snake');
  assert.equal(snakes.length, 2);
  assert.ok(
    snakes.some(
      (actor) => Number(String(actor.root.userData.remainsIdentity).split(':')[1]) >= 1000000,
    ),
  );
  f.population.ecology.capture();
  const loaded = fixture(roundTrip(f.save));
  assert.deepEqual(
    loaded.population.predators
      .filter((actor) => actor.kind === 'snake')
      .map((actor) => actor.root.userData.remainsIdentity)
      .sort(),
    snakes.map((actor) => actor.root.userData.remainsIdentity).sort(),
  );
});

test('cold and winter disable hunts and traps, then spring reactivates the same adult population', () => {
  const f = fixture();
  const winter = f.setSeason(3);
  f.step(winter, 70);
  const small = f.population.predators;
  assert.ok(small.every((actor) => !actor.huntingOpen));
  assert.ok(small.filter((actor) => actor instanceof Spider).every((actor) => actor.inDen));
  const webs: { visible: boolean }[] = [];
  f.scene.traverse((model) => {
    if (model.name === 'spider-web') webs.push(model);
  });
  assert.ok(webs.length && webs.every((web) => !web.visible));
  const identities = small.map((actor) => actor.root.userData.remainsIdentity);
  f.population.ecology.capture();
  const loaded = fixture(roundTrip(f.save));
  loaded.step(25 * DAY + 720, 12);
  assert.deepEqual(
    loaded.population.predators.map((actor) => actor.root.userData.remainsIdentity).sort(),
    identities.sort(),
  );
  assert.ok(
    loaded.population.predators.some((actor) => actor.kind === 'snake' && actor.huntingOpen),
  );
  assert.ok(
    loaded.population.predators.some((actor) => actor instanceof Spider && actor.webActive),
  );
});

test('hedgehogs, marmots and chipmunks use winter shelters and keep their populations through spring', () => {
  const save = start(0);
  for (const kind of ['hedgehog', 'marmot', 'chipmunk'] as const)
    save.worldConfig!.creatures[kind] = 1;
  const f = fixture(save);
  for (const actor of f.population.wildlife) {
    assert.ok(actor.shelter, actor.kind);
    const { x, y, z } = actor.shelter.approach;
    actor.moveTo(x, z, y);
  }
  f.step(f.setSeason(3), 25);
  assert.ok(f.population.wildlife.every((actor) => actor.inShelter && !actor.foragingAllowed));
  f.population.ecology.capture();
  const resumed = fixture(roundTrip(f.save));
  resumed.step(25 * DAY + 720, 8);
  assert.ok(
    resumed.population.wildlife
      .filter((actor) => actor.kind !== 'hedgehog')
      .every((actor) => !actor.inShelter),
  );
  resumed.step(25 * DAY + 1320, 8);
  assert.ok(
    resumed.population.wildlife.find((actor) => actor.kind === 'hedgehog')?.foragingAllowed,
  );
  assert.equal(resumed.population.wildlife.length, 3);
});

test('an empty slot admits a rare adult outside player view, registers its web and keeps its new identity on load', () => {
  const f = fixture(start(1));
  const actor = f.population.predators.find((predator) => predator instanceof Spider)!;
  actor.health = 0;
  f.step(720);
  assert.equal(f.population.predators.filter((predator) => predator.kind === 'spider').length, 0);
  f.step(720 + 2 * DAY);
  assert.equal(f.population.predators.filter((predator) => predator.kind === 'spider').length, 0);
  f.step(720 + 3 * DAY + 61, 3);
  const replacement = f.population.predators.find((predator) => predator instanceof Spider)!;
  assert.ok(replacement?.alive);
  assert.ok(distance(replacement, f.save.player) >= 26);
  assert.notEqual(replacement.root.userData.remainsIdentity, actor.root.userData.remainsIdentity);
  let webs = 0;
  f.scene.traverse((model) => {
    if (model.name === 'spider-web') webs++;
  });
  assert.equal(webs, 1);
  f.population.ecology.capture();
  assert.equal(
    fixture(roundTrip(f.save)).population.predators.find((predator) => predator instanceof Spider)
      ?.root.userData.remainsIdentity,
    replacement.root.userData.remainsIdentity,
  );
});

test('ambient insects gather by flowers, rest at night and reduce flight in cold or rain', () => {
  const scene = new Scene();
  const flight = new AmbientFlight(scene, {
    seed: 41,
    scale: 0.2,
    vegetation: 5,
    butterflies: [{ x: 4, z: 0 }],
    heightAt: () => 0,
    biomeAt: () => 'meadow',
    nearWater: () => true,
  });
  flight.useFlowers([{ x: 0, z: 0 }]);
  const insects = scene.getObjectByName('ambient-insects')!;
  const birds = scene.getObjectByName('ambient-birds')!;
  assert.ok(insects instanceof InstancedMesh && birds instanceof InstancedMesh);
  flight.update(0, 0, 0, 'Лето', { clock: 720, temperature: 24, weather: 'clear' });
  const summer = insects.count;
  const position = new Vector3();
  const pose = new Matrix4();
  insects.getMatrixAt(0, pose);
  position.setFromMatrixPosition(pose);
  assert.ok(distance(position, { x: 0, z: 0 }) < 2);
  flight.update(0, 0, 0, 'Лето', { clock: 720, temperature: 24, weather: 'rain' });
  assert.ok(insects.count < summer);
  flight.update(0, 0, 0, 'Лето', { clock: 720, temperature: 4, weather: 'clear' });
  assert.equal(insects.count, 0);
  flight.update(0, 0, 0, 'Лето', { clock: 1320, temperature: 24, weather: 'clear' });
  assert.equal(insects.count + birds.count, 0);
});

test('damaged cohorts, duplicate adult IDs and reversed development times are rejected on load', () => {
  const f = fixture();
  f.step(720);
  f.population.ecology.capture();
  for (const damage of [
    (save: SaveData) => {
      save.smallFaunaCohorts![0].remaining = 999;
    },
    (save: SaveData) => {
      save.smallFaunaCohorts![0].matureAt = save.smallFaunaCohorts![0].dueAt - 1;
    },
    (save: SaveData) => {
      save.spiders![1].id = save.spiders![0].id;
    },
  ]) {
    const corrupted = structuredClone(f.save);
    damage(corrupted);
    assert.throws(() => roundTrip(corrupted), /паук|кокон|сохран/i);
  }
});
