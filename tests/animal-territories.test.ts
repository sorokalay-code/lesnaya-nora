import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Scene } from 'three';
import { AnimalHabitats } from '../src/game/AnimalHabitats';
import { RabbitFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { WildlifeForage } from '../src/game/WildlifeForage';
import type { Biome, FoodKind, SaveData } from '../src/game/types';
import type { Resource, World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig } from '../src/game/WorldConfig';
import { WolfDen } from '../src/game/WolfDen';
import { WolfDens } from '../src/game/WolfDens';
import { WorldRest } from '../src/game/session/WorldRest';
import { GAME_MINUTES_PER_SECOND, isNightAt } from '../src/game/session/WorldCalendar';
import { loadModels } from './model-fixture';

await loadModels('wolf', 'deer', 'fox', 'marmot', 'beaver');

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

function terrain(scene = new Scene()): World {
  return {
    scene,
    resources: [],
    waterSources: [],
    treeLocations: [],
    seed: 31415,
    heightAt: () => 0,
    biomeAt: (x: number): Biome => (x < 0 ? 'forest' : 'meadow'),
    nearWater: () => false,
  } as unknown as World;
}

function start(): SaveData {
  const config = defaultWorldConfig();
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  config.creatures.wolf = 5;
  config.creatures.deer = 3;
  config.creatures.marmot = 1;
  return NewGameFactory.create(31415, 0, new RabbitFactory(new Random(2)), config);
}

function population(save: SaveData, notes: string[] = [], worldFor = terrain) {
  const scene = new Scene();
  return new WorldPopulation({
    save,
    scene,
    world: worldFor(scene),
    rng: new Random(save.seed),
    markPartner() {},
    onDenDiscovery: () => notes.push('den'),
    onWolfArrival: () => notes.push('arrival'),
    onDeath: (animal) => {
      const id: unknown = animal.root.userData.remainsIdentity;
      if (typeof id === 'string') (save.deadPopulation ??= []).push(id);
    },
  });
}

function roundTrip(save: SaveData): SaveData {
  const entry = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entry.get(key) ?? null,
      setItem: (key: string, value: string) => entry.set(key, value),
    },
  });
  try {
    const repository = new SaveRepository('territory-test');
    repository.store(save);
    return repository.load();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('wolves of a pack leave the same den during the evening and return to it after hunting', () => {
  const save = start();
  const f = population(save);
  const wolves = f.predators.filter((animal) => animal.kind === 'wolf');
  assert.equal(wolves.length, 5);
  const pack = wolves.slice(0, 4);
  const den = pack[0].homeTerritory!;
  assert.ok(pack.every((wolf) => wolf.homeTerritory === den && distance(wolf, den) < 6));
  assert.ok(den.x < 0 && distance(wolves[4].homeTerritory!, den) > 12);
  let time = 0;
  const simulate = (startAt: number, duration: number) => {
    for (let frame = 0; frame < duration * 20; frame++) {
      save.clock = startAt + frame * 0.3;
      time += 0.05;
      f.ecology.prepareHabitats(time, save.clock, wolves);
      for (const wolf of wolves) wolf.update(0.05, time, 0, 0, true, false, () => 0);
    }
  };

  simulate(1090, 23);
  assert.ok(pack.every((wolf) => wolf.huntingOpen));
  assert.ok(pack.every((wolf) => !wolf.inDen));
  assert.ok(pack.filter((wolf) => distance(wolf, den) > 13).length >= 3);
  assert.ok(pack.every((wolf) => !wolf.canPursue(den.x + den.radius * 2, den.z)));
  simulate(1330, 37);
  assert.ok(pack.every((wolf) => !wolf.huntingOpen && distance(wolf, den) < 12));
  assert.equal(pack.filter((wolf) => wolf.inDen).length, 2);
});

test('a lost wolf saves its vacant slot and returns near the den only after a day and away from the player', () => {
  const save = start();
  const f = population(save);
  const wolf = f.predators.find((animal) => animal.kind === 'wolf')!;
  const den = wolf.homeTerritory!;
  const id = String(wolf.root.userData.remainsIdentity);
  const survivor = f.predators[1];
  survivor.moveTo(den.x + 12, den.z - 4, 0);
  survivor.health = 41;
  wolf.moveTo(den.x + 24, den.z, 0);
  wolf.health = 0;
  const due = save.clock + 1440;
  f.ecology.update(0, 0, save.clock, -90, -90, () => 0, f.predators, false);
  assert.ok(!f.predators.includes(wolf));
  f.ecology.capture();
  assert.deepEqual(save.wolves?.[id], { state: 'vacant', replaceAt: due });

  const loaded = roundTrip(save);
  const notes: string[] = [];
  const restored = population(loaded, notes);
  const advancing = (time: number, clock: number, x: number, z: number) => {
    loaded.clock = clock;
    restored.ecology.update(0, time, clock, x, z, () => 0, restored.predators, false);
  };
  assert.ok(
    restored.predators.some(
      (actor) => actor.x === survivor.x && actor.z === survivor.z && actor.health === 41,
    ),
  );
  advancing(3, due - 1, 97, 97);
  assert.equal(restored.predators.length, 4);
  advancing(6, due, den.x, den.z);
  assert.equal(restored.predators.length, 4);
  assert.ok(loaded.discoveries?.some((place) => place.label === 'Волчье логово'));
  advancing(9, due + 16, 97, 97);
  const replacement = restored.predators.find(
    (animal) => animal.root.userData.remainsIdentity === id,
  );
  assert.ok(replacement && distance(replacement, den) < 6);
  assert.equal(replacement.health, replacement.maxHealth);
  assert.equal(loaded.deadPopulation?.includes(id), false);
  advancing(12, due + 32, 97, 97);
  assert.equal(restored.predators.length, 5);
  assert.deepEqual(notes, ['den', 'arrival']);
});

test('a covered wolf stays in the same den across a save and walks out through the entrance', () => {
  const save = start();
  save.clock = 720;
  const forest = population(save);
  const ground = () => 0;
  const site = save.wolfDens?.[0];
  assert.ok(site);
  const den = new WolfDen(0, site, ground);
  assert.ok(forest.wolfDens.heightForCamera(site.x, site.z) > den.entrance.y + 1);
  const entry = den.point(0, 0.2);
  assert.equal(forest.wolfDens.canMove(den.approach, entry.x, entry.z, entry.y, 0.2), false);
  assert.equal(forest.wolfDens.canMove(den.approach, entry.x, entry.z, entry.y - 2, 0.2), true);

  const wolf = forest.predators[0];
  for (let frame = 1; frame <= 120; frame++) {
    const time = frame * 0.1;
    forest.ecology.prepareHabitats(time, save.clock, forest.predators);
    wolf.update(0.1, time, 0, 0, true, false, ground);
  }
  assert.ok(wolf.inDen && den.penetration(wolf.x, wolf.z) > 1);
  assert.equal(forest.ecology.targetFor(wolf, forest.predators, 12), undefined);
  wolf.health = 42;
  forest.ecology.capture();

  const loaded = roundTrip(save);
  const restored = population(loaded);
  const resident = restored.predators[0];
  assert.equal(resident.health, 42);
  assert.ok(resident.inDen && distance(resident, wolf) < 0.01);
  assert.deepEqual(loaded.wolfDens, save.wolfDens);
  restored.ecology.prepareHabitats(1, 1090, restored.predators);
  resident.update(0.3, 1, 0, 0, true, false, ground);
  assert.ok(resident.inDen && distance(resident, den.entrance) < distance(wolf, den.entrance));
  for (let frame = 2; frame < 20 && resident.inDen; frame++)
    resident.update(0.3, frame * 0.3, 0, 0, true, false, ground);
  assert.equal(resident.inDen, false);
  assert.ok(distance(resident, den.entrance) < 0.8);
  assert.ok(Math.abs(den.penetration(resident.x, resident.z)) < 0.01);

  const sleepingSave = roundTrip(save);
  sleepingSave.clock = 810;
  const duringSleep = population(sleepingSave);
  const sleeper = duringSleep.predators[0];
  const asleep = new WorldRest({
    save: sleepingSave,
    state: { elapsed: 0 },
    calendar: {
      advance: (dt) => {
        sleepingSave.clock += dt * GAME_MINUTES_PER_SECOND;
      },
      isNight: () => isNightAt(sleepingSave.clock),
    },
    family: { update() {}, advancePregnancy() {} },
    animals: {
      update(dt, time, night, mode) {
        duringSleep.ecology.prepareHabitats(time, sleepingSave.clock, duringSleep.predators);
        sleeper.update(dt, time, 0, 0, mode === 'rest', !night, ground);
        return Infinity;
      },
    },
    world: { update() {} },
    items: { update() {} },
    waste: { update() {} },
    earth: { isSheltered: () => false },
    lighting: { update() {} },
    sound: { setWeather() {} },
  });
  asleep.advance(330);
  assert.ok(sleeper.huntingOpen && !sleeper.inDen && distance(sleeper, den.entrance) > 5);
});

test('a legacy map label moves to the new entrance when the original spot is occupied', () => {
  const save = start();
  const home = new AnimalHabitats(terrain(), save.seed, 110).predator('wolf', 0)!;
  save.discoveries = [{ x: home.x, z: home.z, label: 'Волчье логово' }];
  const notes: string[] = [];
  const forest = population(save, notes, (scene) => ({
    ...terrain(scene),
    treeLocations: [{ x: home.x, z: home.z }],
  }));
  const site = save.wolfDens?.[0];
  assert.ok(site && distance(home, site) > 1);
  forest.ecology.update(0, 1, save.clock, site.x, site.z, () => 0, forest.predators, false);
  assert.deepEqual(save.discoveries, [{ x: site.x, z: site.z, label: 'Волчье логово' }]);
  assert.deepEqual(notes, []);
});

test('invalid and waterlogged sites do not create a den or an obstacle', () => {
  const save = start();
  const world = { ...terrain(), heightAt: (x: number, z: number) => x * 2 + z * 2 };
  const models: string[] = [];
  const steep = new WolfDens(world, save, (model) => models.push(model.name));
  assert.equal(steep.place(0, { x: 30, z: 30 }, 5), undefined);
  const lake = new WolfDens(
    {
      ...world,
      heightAt: () => 0,
      waterAt: () => ({
        body: { id: 'lake', kind: 'lake', level: 1, points: [], radius: 20, depth: 1 },
        level: 1,
        depth: 1,
      }),
    },
    save,
    (model) => models.push(model.name),
  );
  assert.equal(lake.place(0, { x: 30, z: 30 }, 11), undefined);
  assert.deepEqual(models, []);
  assert.equal(save.wolfDens, undefined);
});

test('roaming herds share feeding grounds while burrowing wildlife has a smaller local range', () => {
  const save = start();
  const f = population(save);
  const deer = f.wildlife.filter(({ kind }) => kind === 'deer');
  const marmot = f.wildlife.find(({ kind }) => kind === 'marmot')!;
  assert.ok(deer.every((animal) => animal.habitat === deer[0].habitat));
  assert.equal(deer[0].habitat?.profile.mode, 'roaming');
  assert.equal(marmot.habitat?.profile.mode, 'burrow');
  assert.ok(marmot.habitat!.radius < deer[0].habitat!.radius);
  assert.ok(marmot.habitat!.x > 0);
  f.ecology.prepareHabitats(1, 420, f.predators);
  const pasture = deer[0].destination!;
  f.ecology.prepareHabitats(30, 860, f.predators);
  assert.ok(distance(pasture, deer[0].destination!) > 4);
  assert.ok(distance(marmot, marmot.destination!) < marmot.habitat!.radius);
  f.ecology.prepareHabitats(31, 1430, f.predators);
  assert.equal(marmot.foragingAllowed, false);
  assert.ok(distance(marmot.habitat!, marmot.destination!) < 3);
});

test('wildlife chooses food by species and avoids a wolf patrol with a safer option nearby', () => {
  const plant = (x: number, kind: FoodKind): Resource => ({
    id: x,
    kind,
    x,
    z: 0,
    mesh: new Group(),
    available: true,
    regrowAt: 0,
  });
  const carrot = plant(1.5, 'carrot');
  const clover = plant(-4, 'clover');
  const acorn = plant(5, 'acorn');
  const search = new WildlifeForage([carrot, clover, acorn]);
  const habitats = new AnimalHabitats(terrain(), 31415, 110);
  const den = habitats.predator('wolf', 0)!;
  assert.equal(
    search.find({ kind: 'deer', x: 0, z: 0 }, () => 0),
    carrot,
  );
  habitats.setWolfRoutes([{ home: den, destination: carrot, hunting: true, resting: false }]);
  assert.ok(habitats.riskAt(carrot.x, carrot.z) > habitats.riskAt(clover.x, clover.z));
  assert.equal(
    search.find({ kind: 'deer', x: -2, z: 0 }, (x, z) => (x > 0 ? 3 : 0)),
    clover,
  );
  assert.equal(
    search.find({ kind: 'squirrel', x: 3, z: 0 }, () => 0),
    acorn,
  );
});
