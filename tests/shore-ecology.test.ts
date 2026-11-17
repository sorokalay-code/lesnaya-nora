import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, MeshStandardMaterial, Scene } from 'three';
import { AnimalFactory, PlayerRabbit, RabbitFactory } from '../src/game/animals';
import { AquaticHabitats } from '../src/game/AquaticHabitats';
import { waterCohortStage } from '../src/game/AquaticCohorts';
import type { Excavation } from '../src/game/Excavation';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WaterSimulation } from '../src/game/session/WaterSimulation';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { WorldRest } from '../src/game/session/WorldRest';
import { GAME_MINUTES_PER_SECOND, isNightAt } from '../src/game/session/WorldCalendar';
import type { SaveData } from '../src/game/types';
import type { WaterBody } from '../src/game/WaterMap';
import type { World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig } from '../src/game/WorldConfig';
import { loadModels } from './model-fixture';

await loadModels('beaver', 'duck', 'fish', 'frog', 'pike', 'rabbit');

const METERS = 12;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

function start(): SaveData {
  const config = defaultWorldConfig();
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  config.creatures.beaver = config.creatures.duck = config.creatures.frog = 2;
  config.creatures.fish = 4;
  config.creatures.pike = 3;
  return NewGameFactory.create(31415, 0, new RabbitFactory(new Random(3)), config);
}

function fixture(depth: number, save = start(), extraWater = false) {
  const scene = new Scene();
  const bodies: WaterBody[] =
    depth <= 0
      ? []
      : [{ id: 'east', kind: 'lake', points: [{ x: 26, z: 0 }], radius: METERS, depth, level: 0 }];
  if (extraWater && depth > 0)
    bodies.push({ ...bodies[0], id: 'west', points: [{ x: -26, z: 0 }] });
  const sample = (x: number, z: number) => {
    for (const body of bodies) {
      const immersion = (body.radius - distance({ x, z }, body.points[0])) / 3;
      if (immersion > 0) return { body, level: 0, depth: depth * Math.min(immersion, 1) };
    }
  };
  const groundAt = (x: number, z: number) => -(sample(x, z)?.depth ?? 0);
  const world = {
    scene,
    size: 110,
    seed: save.seed,
    terrain: { water: { bodies } },
    waterSources: bodies.flatMap((body) => body.points),
    resources: [],
    treeLocations: [],
    waterAt: sample,
    heightAt: groundAt,
    biomeAt: () => 'meadow',
    hasCover: (x: number, z: number) => (sample(x, z)?.depth ?? Infinity) < 1.5,
  } as unknown as World;
  const population = new WorldPopulation({
    world,
    scene,
    save,
    rng: new Random(save.seed),
    markPartner() {},
  });
  const player = new PlayerRabbit(save.player);
  const earth = { isSheltered: () => false, floorAt: groundAt } as unknown as Excavation;
  const water = new WaterSimulation({
    ...population,
    player: player.rig,
    save,
    earth,
    world,
    habitats: population.ecology.aquaticHabitats,
    toast() {},
    consequences: { predatorAttack() {} },
    onPikeDeath: (actor) => {
      (save.deadPopulation ??= []).push(String(actor.root.userData.remainsIdentity));
    },
  });
  let time = 0;
  const step = (clock: number, seconds = 1.15, combat = false) => {
    save.clock = clock;
    save.day = Math.floor(clock / 1440) + 1;
    for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) {
      time += 0.05;
      population.ecology.update(0.05, time, clock, 0, 0, groundAt, population.predators, false);
      water.update(0.05, time, combat);
    }
  };
  return { population, save, world, scene, water, step, player, earth };
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
    const repository = new SaveRepository('shore-ecology-test');
    repository.store(save);
    return repository.load();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('the beaver lodge faces a water approach, raises kits, and restores its residents', () => {
  const f = fixture(2.7);
  const beavers = f.population.wildlife.filter((actor) => actor.kind === 'beaver');
  assert.equal(beavers.length, 2);
  assert.ok(
    beavers.every(
      (actor) =>
        actor.shelter && f.world.waterAt(actor.shelter.approach.x, actor.shelter.approach.z),
    ),
  );
  assert.equal(
    f.world.waterAt(beavers[0].shelter!.entrance.x, beavers[0].shelter!.entrance.z),
    undefined,
  );
  f.step(720, 24);
  assert.ok(beavers.some((actor) => actor.inShelter));
  const nursery = f.save.mammalNurseries?.['beaver:0'];
  assert.ok(nursery?.dueAt);
  f.step(nursery.dueAt);
  const young = f.population.wildlife.filter((actor) => actor.kind === 'beaver' && actor.juvenile);
  assert.equal(young.length, 2);
  assert.ok(young.every((actor) => actor.inShelter && actor.waterBody === 'east'));
  f.population.ecology.capture();
  const restored = fixture(2.7, roundTrip(f.save));
  const kit = restored.population.wildlife.find((actor) => actor.mammalId === young[0].mammalId)!;
  assert.ok(kit.inShelter && kit.growthScale < 0.5);
  const open = 2 * 1440 + 330;
  restored.step(open, 25);
  assert.ok(
    !kit.inShelter && distance(kit, kit.shelter!.entrance) > 0.7,
    JSON.stringify({
      inside: kit.inShelter,
      x: kit.x,
      z: kit.z,
      entrance: kit.shelter?.entrance,
      approach: kit.shelter?.approach,
      destination: kit.destination,
      restAt: kit.restAt,
    }),
  );
});

test('an egg clutch hatches into ducklings that follow their mother into water after loading', () => {
  const f = fixture(2.5);
  f.step(420, 18);
  const brood = f.save.duckBroods?.[0];
  assert.ok(brood?.eggs === 3 && f.scene.getObjectByName('duck-clutch-0'));
  const mother = f.population.wildlife.find((actor) => actor.socialId === brood.mother)!;
  const nest = mother.shelter!;
  assert.equal(f.world.waterAt(nest.site.x, nest.site.z), undefined);
  f.population.ecology.capture();
  const loaded = fixture(2.5, roundTrip(f.save));
  loaded.step(brood.hatchAt + 150, 45);
  const hatchlings = loaded.population.wildlife.filter(
    (actor) => actor.kind === 'duck' && actor.juvenile,
  );
  assert.equal(hatchlings.length, 3);
  const parent = loaded.population.wildlife.find((actor) => actor.socialId === brood.mother)!;
  assert.ok(hatchlings.some((actor) => loaded.world.waterAt(actor.x, actor.z)?.body.id === 'east'));
  assert.ok(hatchlings.every((actor) => distance(parent, actor) < 4));
  let colored = 0;
  hatchlings[0].root.traverse((part) => {
    if (
      part instanceof Mesh &&
      part.material instanceof MeshStandardMaterial &&
      part.material.color.getHex() === 0xe8d998
    )
      colored++;
  });
  assert.ok(colored >= 2, 'juvenile colors on both LODs');
  assert.equal(loaded.scene.getObjectByName('duck-clutch-0'), undefined);
  loaded.population.ecology.capture();
  const again = fixture(2.5, roundTrip(loaded.save));
  assert.deepEqual(
    again.population.wildlife
      .filter((actor) => actor.kind === 'duck' && actor.juvenile)
      .map((actor) => actor.socialId),
    hatchlings.map((actor) => actor.socialId),
  );
});

test('fish stay together, and saved fry and tadpoles settle in their natal waterbody', () => {
  const f = fixture(2.5);
  const fish = f.population.wildlife.filter((actor) => actor.kind === 'fish');
  assert.equal(fish.length, 4);
  assert.ok(fish.every((actor) => distance(actor, fish[0]) < 1));
  f.step(420, 12);
  assert.ok(fish.every((actor) => distance(actor, fish[0]) < 2.5 && actor.waterBody === 'east'));
  const frogSpawn = f.save.waterCohorts?.find((record) => record.kind === 'frog');
  const fishSpawn = f.save.waterCohorts?.find((record) => record.kind === 'fish');
  assert.ok(frogSpawn && fishSpawn);
  assert.equal(waterCohortStage(frogSpawn, f.save.clock), 'eggs');
  f.step(870);
  assert.ok(f.scene.getObjectByName('water-cohort-fish-fry'));
  assert.ok(f.scene.getObjectByName('water-cohort-frog-tadpoles'));
  f.step(1920);
  assert.ok(f.scene.getObjectByName('water-cohort-frog-metamorphosis'));
  const frog = f.population.wildlife.find((actor) => actor.kind === 'frog')!;
  fish[0].health = frog.health = 0;
  f.step(1930);
  f.population.ecology.capture();
  const loaded = fixture(2.5, roundTrip(f.save));
  loaded.step(3310);
  const frogs = loaded.population.wildlife.filter((actor) => actor.kind === 'frog');
  const shoal = loaded.population.wildlife.filter((actor) => actor.kind === 'fish');
  assert.equal(frogs.length, 2);
  assert.equal(shoal.length, 4);
  assert.equal(new Set(shoal.map((actor) => actor.socialId)).size, 4);
  assert.ok(frogs.some((actor) => actor.socialId > frog.socialId && actor.waterBody === 'east'));
  assert.ok(shoal.every((actor) => loaded.world.waterAt(actor.x, actor.z)?.body.id === 'east'));
});

test('pike waits, strikes fish in its own water, and preserves the next generation and ambush on load', () => {
  const save = start();
  save.worldConfig!.creatures.fish = 0;
  const f = fixture(2.6, save);
  const pike = f.water.pikes[0];
  f.step(420, 10);
  assert.ok(distance(pike, pike.ambushPoint) < 0.11);
  const at = { x: pike.x + 1.1, z: pike.z };
  if ((f.world.waterAt(at.x, at.z)?.depth ?? 0) < 0.75) at.x = pike.x - 1.1;
  const prey = AnimalFactory.forest('fish', at.x, at.z, new Random(5));
  prey.moveTo(at.x, at.z, -0.4);
  f.population.wildlife.push(prey);
  f.step(440, 2, true);
  assert.equal(prey.alive, false);
  f.step(460, 12);
  assert.ok(distance(pike, pike.ambushPoint) < 0.11);
  const cohort = f.save.waterCohorts?.find((record) => record.kind === 'pike');
  assert.ok(cohort && cohort.remaining === 3);

  const dead = f.water.pikes[1];
  dead.health = 0;
  f.step(cohort.laidAt + 3 * 1440 + 10);
  f.water.capture();
  assert.ok(f.save.deadPopulation?.includes(String(dead.root.userData.remainsIdentity)));
  assert.equal(f.water.pikes.length, 3);
  assert.ok(f.save.pikePopulation?.some((actor) => actor.id >= 1000));
  const restored = fixture(2.6, roundTrip(f.save));
  assert.equal(restored.water.pikes.length, 3);
  assert.deepEqual(restored.water.pikes[0].ambushPoint, pike.ambushPoint);
  const separated = fixture(2.6, start(), true);
  const [first] = separated.water.pikes;
  const other = separated.water.pikes.find((actor) => actor.waterBody !== first.waterBody)!;
  assert.ok(other);
  assert.equal(first.accepts(other, separated.world), false);
});

test('shallow water supports frog spawn and duck nests while a dry map creates no aquatic residents', () => {
  const shallow = fixture(0.26);
  shallow.step(420);
  assert.equal(shallow.water.pikes.length, 0);
  assert.deepEqual(
    new Set(shallow.population.wildlife.map((actor) => actor.kind)),
    new Set(['duck', 'frog']),
  );
  assert.ok(shallow.save.duckBroods?.some((brood) => brood.eggs > 0));
  assert.ok(shallow.save.waterCohorts?.some((cohort) => cohort.kind === 'frog'));
  const dry = fixture(0);
  dry.step(420);
  assert.equal(dry.population.wildlife.length, 0);
  assert.equal(dry.water.pikes.length, 0);
  assert.ok(
    !dry.save.waterCohorts?.length &&
      !dry.save.duckBroods?.length &&
      !dry.save.wildlifeShelters?.length,
  );
  assert.equal(new AquaticHabitats(dry.world, [], 1).forKind('frog').length, 0);
});

test('sleep advances a saved clutch across hatching exactly once', () => {
  const f = fixture(2.5);
  f.step(420);
  const due = f.save.duckBroods?.[0].hatchAt;
  assert.ok(due);
  f.save.clock = due - 9;
  f.population.ecology.capture();
  const resumed = fixture(2.5, roundTrip(f.save));
  const { save, population, world, water, earth } = resumed;
  const asleep = new WorldRest({
    save,
    state: { elapsed: 0 },
    calendar: {
      advance: (dt) => {
        save.clock += dt * GAME_MINUTES_PER_SECOND;
        save.day = 1 + Math.floor(save.clock / 1440);
      },
      isNight: () => isNightAt(save.clock),
    },
    family: { update() {}, advancePregnancy() {} },
    animals: {
      update(dt, time) {
        population.ecology.update(
          dt,
          time,
          save.clock,
          0,
          0,
          (x, z) => world.heightAt(x, z),
          [],
          false,
        );
        water.update(dt, time, false);
        return Infinity;
      },
    },
    world: { update() {} },
    items: { update() {} },
    waste: { update() {} },
    earth,
    lighting: { update() {} },
    sound: { setWeather() {} },
  });
  asleep.advance(18);
  population.ecology.capture();
  const hatched = save.duckBroods?.[0].young.map((actor) => actor.id);
  assert.equal(hatched?.length, 3);
  asleep.advance(36);
  assert.deepEqual(
    save.duckBroods?.[0].young.map((actor) => actor.id),
    hatched,
  );
  assert.equal(save.duckBroods?.[0].eggs, 0);
});
