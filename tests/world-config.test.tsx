import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CREATURE_OPTIONS,
  defaultWorldConfig,
  SEASONS,
  validWorldConfig,
  WORLD_LIMITS,
  type WorldConfig,
} from '../src/game/WorldConfig';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { WaterSimulation } from '../src/game/session/WaterSimulation';
import { WorldCalendar } from '../src/game/session/WorldCalendar';
import { Random } from '../src/game/Random';
import { RabbitFactory, PlayerRabbit } from '../src/game/animals';
import { SeasonSystem } from '../src/game/systems/SeasonSystem';
import { World } from '../src/game/World';
import { SaveRepository } from '../src/game/SaveRepository';
import { Excavation } from '../src/game/Excavation';
import { MapPresenter } from '../src/ui/presenters/MapPresenter';
import { createUIStore } from '../src/ui/store';
import { NewGameForm } from '../src/ui/components/NewGameForm';
import { MODEL_NAMES } from '../src/game/ModelAssets';
import { loadModels } from './model-fixture';
import { PlayerMovement } from '../src/game/session/PlayerMovement';
import type { ViewCamera } from '../src/game/ViewCamera';
import type { Soundscape } from '../src/game/Audio';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';

await loadModels(...MODEL_NAMES);

function emptyConfig(): WorldConfig {
  const config = defaultWorldConfig();
  config.size = 70;
  config.vegetation = 0;
  config.food = 0;
  config.neighborFamilySize = 0;
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  return config;
}

function fixture(config: WorldConfig, season = 0) {
  const rng = new Random(31468);
  const save = NewGameFactory.create(31415, season, new RabbitFactory(rng), config);
  const scene = new THREE.Scene();
  const world = new World(scene, save.seed, save);
  const earth = new Excavation(scene, world, save);
  const population = new WorldPopulation({ rng, save, scene, world, markPartner() {} });
  const water = new WaterSimulation({
    ...population,
    save,
    world,
    earth,
    player: new PlayerRabbit(save.player).rig,
    toast() {},
    consequences: { predatorAttack() {} },
  });
  return { rng, save, scene, world, earth, population, water };
}

test('world configuration is isolated and rejects damaged, unbounded and fractional inputs', () => {
  const config = defaultWorldConfig();
  assert.ok(validWorldConfig(config));
  for (const value of [
    null,
    [],
    {},
    { ...config, size: Infinity },
    { ...config, food: -1 },
    { ...config, biome: 'ocean' },
    { ...config, creatures: { ...config.creatures, fox: 0.5 } },
    { ...config, seasonLengths: { ...config.seasonLengths, Зима: 0 } },
  ]) {
    assert.equal(validWorldConfig(value), false);
  }
  const store = createUIStore(() => {});
  store.getState().worldConfig.creatures.rabbit = 0;
  assert.equal(createUIStore(() => {}).getState().worldConfig.creatures.rabbit, 16);
  const save = NewGameFactory.create(7, 0, new RabbitFactory(new Random(60)), config);
  config.seasonLengths.Весна = 1;
  assert.equal(save.worldConfig!.seasonLengths.Весна, 30);
});

test('individual seasons drive start date, year wrap, weather and temperature', () => {
  const config = emptyConfig();
  config.seasonLengths = { Весна: 2, Лето: 3, Осень: 1, Зима: 4 };
  const seasons = new SeasonSystem(31415, config.seasonLengths);
  const expected = [
    'Весна',
    'Весна',
    'Лето',
    'Лето',
    'Лето',
    'Осень',
    'Зима',
    'Зима',
    'Зима',
    'Зима',
    'Весна',
  ];
  assert.deepEqual(
    expected.map((_, index) => seasons.name(index + 1)),
    expected,
  );
  assert.deepEqual(
    SEASONS.map((_, index) => seasons.startDay(index)),
    [1, 3, 6, 7],
  );
  const f = fixture(config, 3);
  assert.equal(f.save.day, 7);
  assert.equal(f.save.clock, 6 * 1440 + 420);
  f.save.clock = 10 * 1440 - 1;
  f.save.day = 10;
  const calendar = new WorldCalendar({ ...f, seasons, toast() {} });
  calendar.advance(0.5);
  assert.equal(calendar.season(), 'Весна');
  assert.equal(
    calendar.airTemperature(),
    seasons.temperature(11, f.save.clock, f.save.weather) + f.world.temperatureOffset(0, 0),
  );
});

test('disabled species stay absent during ecology replenishment and water can be removed', () => {
  const config = emptyConfig();
  config.water = 0;
  config.creatures.pike = 3;
  const f = fixture(config);
  assert.equal(f.save.partners.length, 0);
  assert.equal(
    f.population.predators.length + f.population.hawks.length + f.population.wildlife.length,
    0,
  );
  assert.equal(f.water.pikes.length, 0);
  assert.equal(f.world.terrain.water.bodies.length, 0);
  assert.equal(f.world.waterSources.length, 0);
  assert.equal(f.world.waterAt(9 * f.world.scale, -7 * f.world.scale), undefined);
  assert.equal(f.world.resources.length, 0);
  assert.equal(f.world.treeLocations.length, 0);
  for (let time = 0; time < 500; time += 50)
    f.population.ecology.update(0, time, f.save.clock, 0, 0, () => 0, [], false);
  assert.equal(f.population.wildlife.length, 0);
});

test('every selected species spawns with its own count even without forest or trees', () => {
  const config = emptyConfig();
  config.biome = 'meadow';
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 2;
  const f = fixture(config);
  assert.equal(f.save.partners.length, 2);
  assert.equal(f.population.families.length, 0);
  assert.equal(f.population.hawks.length, 2);
  assert.equal(f.water.pikes.length, 2);
  for (const { kind } of CREATURE_OPTIONS) {
    if (kind === 'rabbit' || kind === 'hawk' || kind === 'pike' || kind === 'butterfly') continue;
    assert.equal(
      [...f.population.predators, ...f.population.wildlife].filter((animal) => animal.kind === kind)
        .length,
      2,
      kind,
    );
  }
  for (const animal of [
    ...f.population.rabbits,
    ...f.population.predators,
    ...f.population.wildlife,
  ]) {
    assert.ok(Math.abs(animal.x) < f.world.size && Math.abs(animal.z) < f.world.size);
  }
  // Пополнение возвращает только недостающий выбранный вид, не превышая его лимита.
  f.population.wildlife.find((animal) => animal.kind === 'deer')!.health = 0;
  for (let time = 0; time < 1000; time += 50)
    f.population.ecology.update(0, time, f.save.clock, 0, 0, () => 0, [], false);
  assert.equal(f.population.wildlife.filter((animal) => animal.kind === 'deer').length, 2);
  assert.equal(f.population.wildlife.length, 12);
});

test('save round trip preserves configured terrain, plants, populations and calendar; v4 defaults survive', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = '';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      setItem(_key: string, value: string) {
        stored = value;
      },
      getItem() {
        return stored;
      },
    },
  });
  try {
    const config = emptyConfig();
    config.size = 83;
    config.food = 0.4;
    config.water = 5;
    config.vegetation = 0.4;
    config.biome = 'forest';
    config.seasonLengths.Зима = 365;
    config.creatures.deer = 3;
    const f = fixture(config);
    f.population.ecology.capture();
    const repository = new SaveRepository('test-world');
    repository.store(f.save);
    const loaded = repository.load();
    const restored = new World(new THREE.Scene(), loaded.seed, loaded);
    assert.deepEqual(loaded.worldConfig, config);
    assert.equal(restored.size, 83);
    assert.deepEqual(restored.treeLocations, f.world.treeLocations);
    assert.deepEqual(
      restored.resources.map(({ id, x, z, kind }) => ({ id, x, z, kind })),
      f.world.resources.map(({ id, x, z, kind }) => ({ id, x, z, kind })),
    );
    assert.deepEqual(restored.terrain.water.bodies, f.world.terrain.water.bodies);
    assert.equal(new MapPresenter().build(restored, loaded).size, 83);
    assert.ok(restored.resources.length > 0);
    stored = JSON.stringify({ ...f.save, worldConfig: { ...config, size: 'huge' } });
    assert.throws(() => repository.load(), /настройки мира/);
    delete f.save.worldConfig;
    repository.store(f.save);
    assert.deepEqual(repository.load().worldConfig, defaultWorldConfig());
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('form exposes every species, native bounds, independent seasons and replacement notice', () => {
  const store = createUIStore(() => {});
  store.getInitialState = store.getState;
  store.setState({ worldSettingsExpanded: true });
  const html = renderToStaticMarkup(<NewGameForm store={store} replacesStory />);
  for (const { label } of CREATURE_OPTIONS) assert.ok(html.includes(label));
  for (const season of SEASONS) assert.ok(html.includes(`${season}, игровых дней`));
  assert.match(html, /type="submit"/);
  assert.match(html, /min="1" max="365"/);
  assert.match(html, /единственное сохранение/);
  assert.ok(
    !renderToStaticMarkup(<NewGameForm store={store} replacesStory={false} />).includes(
      'единственное сохранение',
    ),
  );
});

test('new history can start above the collapsed settings without hidden fields in the focus order', () => {
  const store = createUIStore(() => {});
  const html = renderToStaticMarkup(<NewGameForm store={store} replacesStory />);
  assert.match(html, /<details class="world-settings">/);
  assert.ok(html.indexOf('Начать новую игру') < html.indexOf('<details'));
  assert.ok(html.indexOf('единственное сохранение') < html.indexOf('Начать новую игру'));
  assert.doesNotMatch(html, /<input|<select|<fieldset/);
  assert.equal(store.getState().worldSettingsExpanded, false);
});

test('expanded ranges create a custom world, longer seasons and larger neighbor families', () => {
  const config = defaultWorldConfig();
  config.size = 217;
  config.water = 5;
  config.vegetation = 5;
  config.food = 5;
  config.neighborFamilySize = 10;
  for (const season of SEASONS) config.seasonLengths[season] = 365;
  for (const { kind, max } of CREATURE_OPTIONS) config.creatures[kind] = max;
  const save = NewGameFactory.create(31415, 3, new RabbitFactory(new Random(31468)), config);
  assert.deepEqual(save.worldConfig, config);
  assert.equal(save.day, 1096);
  assert.equal(save.partners.length, 120);
  assert.ok(save.partners.some((partner) => partner.familySize > 5));
  assert.ok(save.partners.every((partner) => partner.familySize <= 10));
  for (const invalid of [
    { ...config, size: WORLD_LIMITS.size.max + 1 },
    { ...config, size: WORLD_LIMITS.size.min - 1 },
    { ...config, size: 100.5 },
    { ...config, water: 5.1 },
    { ...config, vegetation: 5.1 },
    { ...config, food: 5.1 },
    { ...config, neighborFamilySize: 11 },
    { ...config, creatures: { ...config.creatures, rabbit: 121 } },
    { ...config, seasonLengths: { ...config.seasonLengths, Весна: 366 } },
  ]) {
    assert.equal(validWorldConfig(invalid), false);
    assert.throws(
      () => NewGameFactory.create(1, 0, new RabbitFactory(new Random(1)), invalid),
      /настройки/,
    );
  }
});

test('small and large maps preserve metre terrain sampling and player movement at their actual edge', () => {
  for (const size of [WORLD_LIMITS.size.min, WORLD_LIMITS.size.max]) {
    const config = emptyConfig();
    config.size = size;
    config.water = 0;
    const f = fixture(config);
    const limit = size - 7;
    f.save.player.genes = structuredClone(DEFAULT_GENES);
    f.save.player.x = limit - 0.2;
    f.save.player.y = f.world.heightAt(f.save.player.x, 0);
    const player = new PlayerRabbit(f.save.player);
    const movement = new PlayerMovement(
      player,
      new Set(['KeyW']),
      { forwardAt: () => ({ x: 1, z: 0 }) } as unknown as ViewCamera,
      f.earth,
      { play() {} } as unknown as Soundscape,
      () => true,
      f.world,
    );
    player.root.rotation.y = -Math.PI / 2;
    movement.move(1, 1, false);
    assert.equal(f.save.player.x, limit);
    const geometry = f.scene.children.find(
      (object): object is THREE.Mesh =>
        object instanceof THREE.Mesh &&
        object.geometry.getAttribute('position').count === size * size * 16,
    )!.geometry;
    const positions = geometry.getAttribute('position');
    const x = size - 0.4;
    const z = 0.3;
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const cell = ((iz + size) * size * 2 + ix + size) * 4;
    const h00 = positions.getY(cell);
    const h10 = positions.getY(cell + 1);
    const h11 = positions.getY(cell + 2);
    assert.ok(
      Math.abs(f.world.heightAt(x, z) - (h00 + (h10 - h00) * (x - ix) + (h11 - h10) * (z - iz))) <
        0.00001,
    );
    // Все треугольники дальнего ландшафта обращены вверх: внешнее кольцо большой карты
    // не должно заворачиваться внутрь и накладываться на предыдущие кольца.
    const boundary = f.scene.getObjectByName('distant-forest')!;
    const distantGround = boundary.children.find(
      (object): object is THREE.Mesh =>
        object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh),
    )!.geometry;
    const distantPositions = distantGround.getAttribute('position');
    const indices = distantGround.getIndex()!;
    for (let index = 0; index < indices.count; index += 3) {
      const a = indices.getX(index);
      const b = indices.getX(index + 1);
      const c = indices.getX(index + 2);
      const cross =
        (distantPositions.getX(b) - distantPositions.getX(a)) *
          (distantPositions.getZ(c) - distantPositions.getZ(a)) -
        (distantPositions.getZ(b) - distantPositions.getZ(a)) *
          (distantPositions.getX(c) - distantPositions.getX(a));
      assert.ok(cross < 0);
    }
  }
});
