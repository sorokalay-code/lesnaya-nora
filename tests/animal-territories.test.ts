import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Scene } from 'three';
import { AnimalHabitats } from '../src/game/AnimalHabitats';
import { AnimalFactory, RabbitFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { WildlifeForage } from '../src/game/WildlifeForage';
import { WildlifeRoutine } from '../src/game/WildlifeRoutine';
import type { Biome, DigNode, FoodKind, SaveData } from '../src/game/types';
import type { Resource, World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig } from '../src/game/WorldConfig';
import { WolfDen } from '../src/game/WolfDen';
import { WolfDens } from '../src/game/WolfDens';
import { WorldRest } from '../src/game/session/WorldRest';
import { GAME_MINUTES_PER_SECOND, isNightAt } from '../src/game/session/WorldCalendar';
import { loadModels } from './model-fixture';
import { AnimalRemains } from '../src/game/AnimalRemains';
import { MAMMAL_NURSERY } from '../src/game/MammalNursery';

await loadModels('wolf', 'deer', 'fox', 'marmot', 'beaver', 'mouse');

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
  const remains = new AnimalRemains(scene, save);
  return new WorldPopulation({
    save,
    scene,
    world: worldFor(scene),
    rng: new Random(save.seed),
    markPartner() {},
    onDenDiscovery: () => notes.push('den'),
    onDenWarning: () => notes.push('warning'),
    onWolfArrival: () => notes.push('arrival'),
    onWolfBirth: () => notes.push('birth'),
    onDeath: (animal) => remains.record(animal),
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

test('a lost wolf keeps its death record when a new wolf fills its slot after a day', () => {
  const save = start();
  const f = population(save);
  const wolf = f.predators.find((animal) => animal.kind === 'wolf')!;
  const den = wolf.homeTerritory!;
  const id = String(wolf.root.userData.remainsIdentity);
  const survivor = f.predators[1];
  survivor.moveTo(den.x + 12, den.z - 4, 0);
  survivor.health = 41;
  for (const adult of f.predators.slice(2, 4)) adult.health *= 0.4;
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
    (animal) =>
      animal.kind === 'wolf' && String(animal.root.userData.remainsIdentity).startsWith('mammal:'),
  );
  assert.ok(replacement && distance(replacement, den) < 6);
  assert.equal(replacement.health, replacement.maxHealth);
  assert.ok(loaded.deadPopulation?.includes(id));
  assert.ok(!restored.predators.some((animal) => animal.root.userData.remainsIdentity === id));
  advancing(12, due + 32, 97, 97);
  assert.equal(restored.predators.length, 5);
  assert.deepEqual(notes, ['den', 'arrival']);
});

function runEcology(
  forest: WorldPopulation,
  save: SaveData,
  dt: number,
  time: number,
  night = isNightAt(save.clock),
): void {
  const ground = () => 0;
  forest.ecology.prepareHabitats(time, save.clock, forest.predators);
  for (const wolf of forest.predators)
    wolf.update(dt, time, save.player.x, save.player.z, true, !night, ground);
  forest.ecology.update(
    dt,
    time,
    save.clock,
    save.player.x,
    save.player.z,
    ground,
    forest.predators,
    false,
  );
}

function advanceInSleep(
  forest: WorldPopulation,
  save: SaveData,
  minutes: number,
  supplied = false,
): void {
  const asleep = new WorldRest({
    save,
    state: { elapsed: 0 },
    calendar: {
      advance(dt) {
        save.clock += dt * GAME_MINUTES_PER_SECOND;
        save.day = Math.floor(save.clock / 1440) + 1;
      },
      isNight: () => isNightAt(save.clock),
    },
    family: { update() {}, advancePregnancy() {} },
    animals: {
      update(dt, time, night) {
        if (supplied)
          for (const nursery of Object.values(save.mammalNurseries ?? {}))
            if (nursery.food) nursery.food.portions = 8;
        runEcology(forest, save, dt, time, night);
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
  asleep.advance(minutes);
}

test('a wolf litter survives a save, exits during sleep and keeps its identity when taking an adult place', () => {
  const save = start();
  save.worldConfig!.creatures.wolf = 3;
  const forest = population(save);
  const site = save.wolfDens![0];
  const den = new WolfDen(0, site, () => 0);
  const clock = save.clock;
  runEcology(forest, save, 0, 0);
  const due = clock + MAMMAL_NURSERY.wolf.gestation;
  assert.equal(save.mammalNurseries?.['wolf:0'].dueAt, due);
  save.clock = due - 6;
  runEcology(forest, save, 0, 1);
  assert.equal(forest.predators.length, 3);
  forest.ecology.capture();

  const restored = roundTrip(save);
  const notes: string[] = [];
  const restoredForest = population(restored, notes);
  advanceInSleep(restoredForest, restored, 9);
  const pups = restoredForest.predators.filter((wolf) => wolf.juvenile);
  assert.equal(pups.length, 2);
  assert.ok(pups.every((pup) => pup.inDen && !pup.canMelee && pup.growthScale < 0.5));
  assert.deepEqual(notes, ['birth', 'birth']);
  restoredForest.ecology.capture();

  const loaded = roundTrip(restored);
  const next = population(loaded);
  const identity = (wolf: (typeof pups)[number]) => String(wolf.root.userData.remainsIdentity);
  const pup = next.predators.find((wolf) => identity(wolf) === identity(pups[0]))!;
  const other = next.predators.find((wolf) => identity(wolf) === identity(pups[1]))!;
  assert.ok(next.predators.includes(pup) && pup.inDen && pup.juvenile);
  const initialWeight = pup.health;
  // Этот сценарий проверяет рост и расселение уже обеспеченного кормом выводка.
  loaded.mammalNurseries!['wolf:0'].food!.portions = 8;
  advanceInSleep(next, loaded, MAMMAL_NURSERY.wolf.meeting + 180);
  assert.ok(!pup.inDen && distance(pup, den.entrance) > 6);
  assert.ok(pup.health > initialWeight && !pup.canPursue(pup.x, pup.z));
  assert.equal(next.ecology.targetFor(pup, next.predators, 1000), undefined);

  const resident = next.predators[2];
  resident.health = 0;
  other.health = 0;
  runEcology(next, loaded, 0, 1000);
  next.ecology.capture();
  const remains = loaded.remains!;
  assert.ok(loaded.deadPopulation?.includes(identity(other)));
  assert.equal(remains.length, 2);
  assert.ok(remains.some((remain) => remain.scale.x < 0.6));

  const maturedSave = roundTrip(loaded);
  const matured = population(maturedSave);
  const samePup = matured.predators.find((wolf) => identity(wolf) === identity(pup))!;
  advanceInSleep(matured, maturedSave, due + MAMMAL_NURSERY.wolf.mature - loaded.clock + 3, true);
  matured.ecology.capture();
  assert.equal(matured.predators.length, 3);
  assert.ok(matured.predators.includes(samePup) && !samePup.juvenile && samePup.canMelee);
  assert.equal(JSON.stringify(maturedSave.remains), JSON.stringify(remains));
  assert.equal(maturedSave.mammalNurseries?.['wolf:0'].young.length, 0);
  const replay = population(roundTrip(maturedSave));
  assert.equal(replay.predators.filter((wolf) => identity(wolf) === identity(pup)).length, 1);
  assert.deepEqual(
    replay.predators.find((wolf) => identity(wolf) === identity(pup))?.mammalOrigin,
    {
      bornAt: due,
      parents: save.mammalNurseries?.['wolf:0'].parents,
    },
  );
});

for (const kind of ['wolf', 'fox'] as const)
  test(`a real ${kind} kill sends a portion home, survives saving in transit and delivers only once`, () => {
    const save = start();
    save.worldConfig!.creatures.wolf = kind === 'wolf' ? 3 : 0;
    save.worldConfig!.creatures.fox = kind === 'fox' ? 2 : 0;
    save.worldConfig!.creatures.mouse = kind === 'fox' ? 1 : 0;
    if (kind === 'fox') save.worldConfig!.size = 65;
    const forest = population(save);
    runEcology(forest, save, 0, 0);
    save.clock += MAMMAL_NURSERY[kind].gestation;
    runEcology(forest, save, 0, 2);
    save.clock = Math.floor(save.clock / 1440) * 1440 + 1090;
    forest.ecology.prepareHabitats(4, save.clock, forest.predators);
    const hunter = forest.predators.find((actor) => actor.huntingOpen && !actor.inDen)!;
    assert.ok(hunter);
    for (const deer of forest.wildlife.filter(
      (actor) => actor.kind === (kind === 'wolf' ? 'deer' : 'mouse'),
    )) {
      deer.useRoutine(new WildlifeRoutine(undefined, () => 0));
      deer.moveTo(hunter.x + 0.2, hunter.z, 0);
      deer.health = 1;
    }
    forest.ecology.prepareHabitats(6, save.clock, forest.predators);
    assert.ok(forest.ecology.targetFor(hunter, forest.predators, 6));
    forest.ecology.update(0, 6, save.clock, 100, 100, () => 0, forest.predators, true);
    const key = Object.keys(save.mammalNurseries!).find(
      (key) => key.startsWith(`${kind}:`) && save.mammalNurseries![key].young.length,
    )!;
    const food = save.mammalNurseries![key].food!;
    assert.equal(food.trip?.carrier, hunter.root.userData.remainsIdentity);
    assert.equal(food.portions, 0);
    forest.ecology.capture();
    const loaded = roundTrip(save);
    const restored = population(loaded);
    const carrier = restored.predators.find(
      (actor) => actor.root.userData.remainsIdentity === food.trip?.carrier,
    )!;
    const stock = loaded.mammalNurseries![key].food!;
    for (let frame = 1; frame < 500 && stock.trip; frame++) {
      const time = frame * 0.1;
      loaded.clock += 0.6;
      restored.ecology.prepareHabitats(time, loaded.clock, restored.predators);
      carrier.update(0.1, time, 100, 100, true, true, () => 0);
    }
    assert.equal(stock.trip, undefined);
    assert.equal(stock.portions, 8);
    assert.ok(restored.predators[0].root.parent?.getObjectByName('brood-prey-portion'));
    if (kind === 'fox') {
      const home = loaded.wildlifeShelters!.find(
        (site) => site.kind === kind && site.slot === Number(key.split(':')[1]),
      )!;
      assert.ok(
        distance(carrier, home) < 5,
        'the father delivers to the brood home, not his own den',
      );
    }
    restored.ecology.prepareHabitats(70, loaded.clock, restored.predators);
    assert.equal(stock.portions, 8);
  });

test('an empty den stays vacant for three days and disabled species ignore saved families', () => {
  const save = start();
  save.worldConfig!.creatures.wolf = 2;
  save.worldConfig!.creatures.marmot = 2;
  const forest = population(save);
  runEcology(forest, save, 0, 0);
  const original = save.clock;
  for (const wolf of forest.predators) wolf.health = 0;
  runEcology(forest, save, 0, 2);
  forest.ecology.capture();
  assert.deepEqual(Object.values(save.wolves ?? {}), [
    { state: 'vacant', replaceAt: original + 4320 },
    { state: 'vacant', replaceAt: original + 4320 },
  ]);
  save.clock = original + 4319;
  runEcology(forest, save, 0, 4);
  assert.equal(forest.predators.length, 0);
  save.clock++;
  runEcology(forest, save, 0, 6);
  assert.equal(forest.predators.length, 1);
  assert.ok(String(forest.predators[0].root.userData.remainsIdentity).startsWith('mammal:'));
  forest.ecology.capture();

  const disabled = roundTrip(save);
  disabled.worldConfig!.creatures.wolf = 0;
  disabled.worldConfig!.creatures.marmot = 0;
  const empty = population(disabled);
  runEcology(empty, disabled, 0, 0);
  assert.equal(empty.predators.length, 0);
  assert.equal(empty.wildlife.filter((animal) => animal.kind === 'marmot').length, 0);
});

test('marmots grow in their own visible burrow and preserve social and individual IDs after dispersing', () => {
  const save = start();
  save.worldConfig!.creatures.wolf = 0;
  save.worldConfig!.creatures.marmot = 3;
  const forest = population(save);
  runEcology(forest, save, 0, 0);
  const nursery = Object.entries(save.mammalNurseries ?? {}).find(([key]) =>
    key.startsWith('marmot:'),
  )?.[1];
  assert.ok(nursery?.dueAt, JSON.stringify(save.wildlifeShelters));
  const due = nursery.dueAt;
  save.clock = due;
  runEcology(forest, save, 0, 2);
  const kits = forest.wildlife.filter((animal) => animal.kind === 'marmot' && animal.juvenile);
  assert.ok(kits.length >= 2 && kits.every((animal) => animal.inShelter && !animal.root.visible));
  const kit = kits[0];
  assert.ok(kit.shelter && save.wildlifeShelters?.includes(kit.shelter.site));
  assert.ok(forest.wildlife.some((adult) => !adult.juvenile && adult.shelter === kit.shelter));
  forest.ecology.capture();
  const loaded = roundTrip(save);
  const next = population(loaded);
  const restored = next.wildlife.find((animal) => animal.socialId === kit.socialId)!;
  assert.ok(restored.inShelter && restored.juvenile && restored.mammalId === kit.mammalId);

  advanceInSleep(next, loaded, MAMMAL_NURSERY.marmot.emerge + 180);
  assert.ok(!restored.inShelter && restored.root.visible);
  const vacancy = next.wildlife.find(
    (animal) => animal.kind === 'marmot' && !animal.juvenile && animal.shelter !== restored.shelter,
  )!;
  vacancy.health = 0;
  loaded.clock = due + MAMMAL_NURSERY.marmot.mature - 12;
  runEcology(next, loaded, 0, 1000);
  next.ecology.capture();
  const atMaturity = roundTrip(loaded);
  const settled = population(atMaturity);
  advanceInSleep(settled, atMaturity, 27);
  settled.ecology.capture();
  const adult = atMaturity.wildlife?.find(
    (animal) =>
      animal.kind === 'marmot' && animal.id === kit.socialId && animal.mammalId === kit.mammalId,
  );
  assert.deepEqual(adult?.mammalOrigin, { bornAt: due, parents: nursery.parents });
  assert.equal(atMaturity.wildlife?.filter((animal) => animal.kind === 'marmot').length, 3);
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

function guardedDen() {
  const save = start();
  save.worldConfig!.creatures.wolf = 3;
  save.clock = 720;
  const notes: string[] = [];
  const forest = population(save, notes);
  const wolves = forest.predators.slice();
  const ground = () => 0;
  const site = save.wolfDens?.[0];
  assert.ok(site);
  const den = new WolfDen(0, site, ground);
  let time = 0;
  const run = (seconds: number, player?: DigNode, combat = true) => {
    let strikes = 0;
    const point = player ?? den.point(0, -30);
    for (let frame = 0; frame < seconds * 20; frame++) {
      time += 0.05;
      forest.ecology.prepareHabitats(time, save.clock, forest.predators);
      forest.ecology.prepareDenDefense(time, player, combat);
      for (const wolf of wolves) {
        const prey = combat ? forest.ecology.targetFor(wolf, forest.predators, time) : undefined;
        if (wolf.update(0.05, time, point.x, point.z, !player || !combat, true, ground, 0, 1, prey))
          strikes++;
      }
      forest.ecology.update(
        0.05,
        time,
        save.clock,
        point.x,
        point.z,
        ground,
        forest.predators,
        combat,
      );
    }
    return strikes;
  };
  return { forest, wolves, notes, den, run };
}

test('the pack patrols, warns an intruder, leaves the chamber to defend and ends the chase', () => {
  const { den, wolves, notes, run } = guardedDen();
  run(12);
  const sentry = wolves.find((wolf) => !wolf.inDen)!;
  assert.equal(wolves.filter((wolf) => wolf.inDen).length, 2);
  const at = { x: sentry.x, z: sentry.z };
  run(6);
  assert.ok(distance(sentry, at) > 1.5);

  assert.equal(run(0.6, den.point(0, -8)), 0);
  assert.equal(notes.filter((note) => note === 'warning').length, 1);
  assert.equal(wolves.filter((wolf) => wolf.inDen).length, 2);

  assert.ok(run(6, den.point(0, -4)) > 0);
  assert.ok(wolves.every((wolf) => !wolf.inDen && !wolf.huntingOpen));
  assert.equal(notes.filter((note) => note === 'warning').length, 1);

  const escaped = den.point(0, -18);
  assert.equal(run(12, escaped), 0);
  assert.ok(wolves.every((wolf) => !wolf.huntingPlayer && distance(wolf, escaped) > 10));
  assert.equal(wolves.filter((wolf) => wolf.inDen).length, 2);
});

test('wolves drive off a rival at the den during the day and respect a combat truce', () => {
  const { den, wolves, forest, run } = guardedDen();
  run(12);
  const point = den.point(0, -4);
  const rival = AnimalFactory.predator('fox', point.x, point.z, new Random(17));
  forest.predators.push(rival);
  run(4, undefined, false);
  assert.equal(rival.health, rival.maxHealth);
  assert.equal(wolves.filter((wolf) => wolf.inDen).length, 2);

  run(5);
  assert.ok(rival.health < rival.maxHealth);
  assert.ok(wolves.every((wolf) => !wolf.huntingOpen));
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
