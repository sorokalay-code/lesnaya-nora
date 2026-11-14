import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultMapGeneration,
  validMapGeneration,
  type MapGeneration,
} from '../src/game/MapGeneration';
import { WorldLayout } from '../src/game/WorldLayout';
import { Terrain } from '../src/game/Terrain';
import { GardenCrops } from '../src/game/GardenCrops';
import { defaultWorldConfig, validWorldConfig } from '../src/game/WorldConfig';
import { WorldPreviewPresenter } from '../src/ui/presenters/WorldPreviewPresenter';
import { WaterMap } from '../src/game/WaterMap';

test('map settings reject corrupt values and retain classic layouts without map options', () => {
  const map = defaultMapGeneration();
  assert.ok(validMapGeneration(map));
  assert.ok(validWorldConfig(defaultWorldConfig()));
  for (const invalid of [
    null,
    [],
    {},
    { ...map, seed: -1 },
    { ...map, seed: 0.5 },
    { ...map, relief: Infinity },
    { ...map, relief: 2.1 },
    { ...map, biomeScale: 0 },
    { ...map, forestCover: 1.1 },
    { ...map, ponds: 9 },
    { ...map, ponds: 1.5 },
    { ...map, gardens: 5 },
    { ...map, swamps: -1 },
    { ...map, river: 'yes' },
    { ...map, rivers: 4 },
    { ...map, lakes: 1.5 },
    { ...map, revision: 3 },
    { ...map, layout: 'ocean' },
    { ...map, layout: ['classic'] },
  ]) {
    assert.equal(validMapGeneration(invalid), false);
    assert.equal(validWorldConfig({ ...defaultWorldConfig(), map: invalid }), false);
  }
  assert.ok(validMapGeneration({ ...map, seed: 0 }));
});

test('same seed reproduces geography while other seeds move gardens, swamps and water', () => {
  const map = defaultMapGeneration();
  const a = new WorldLayout(31415, map);
  const b = new WorldLayout(31415, map);
  const other = new WorldLayout(31416, map);
  assert.deepEqual(a.regions, b.regions);
  assert.deepEqual(a.water, b.water);
  assert.notDeepEqual(a.gardens, other.gardens);
  assert.notDeepEqual(a.swamps, other.swamps);
  assert.notDeepEqual(a.water, other.water);
  const first = new Terrain(31415, 1, 1, a);
  const restored = new Terrain(31415, 1, 1, b);
  assert.deepEqual(first.water.bodies, restored.water.bodies);
  for (let x = -100; x <= 100; x += 5)
    for (let z = -100; z <= 100; z += 5) {
      assert.equal(first.heightAt(x, z), restored.heightAt(x, z));
      assert.equal(a.biomeAt(x, z, 'mixed'), b.biomeAt(x, z, 'mixed'));
    }
});

test('custom counts and toggles remove water, gardens, crops and marshes independently', () => {
  const settings = {
    ...defaultMapGeneration(),
    gardens: 0,
    swamps: 0,
    ponds: 0,
    lakes: 0,
    river: false,
    forestCover: 0,
    relief: 0,
  };
  const layout = new WorldLayout(7, settings);
  const terrain = new Terrain(7, 1, 5, layout);
  assert.deepEqual(layout.gardens, []);
  assert.deepEqual(layout.swamps, []);
  assert.deepEqual(terrain.water.bodies, []);
  let crops = 0;
  GardenCrops.plant(() => crops++, 1, 1, [...layout.gardens]);
  assert.equal(crops, 0);
  for (let x = -100; x <= 100; x += 10)
    for (let z = -100; z <= 100; z += 10) {
      assert.equal(layout.biomeAt(x, z, 'mixed'), 'meadow');
      assert.ok(terrain.heightAt(x, z) === 0);
    }
  const forest = new WorldLayout(7, { ...settings, forestCover: 1 });
  assert.equal(forest.biomeAt(50, 50, 'mixed'), 'forest');
  assert.equal(forest.biomeAt(0, 0, 'mixed'), 'meadow');
});

test('maximum procedural water and landmarks fit the map and leave the whole starting clearing dry', () => {
  const map: MapGeneration = {
    ...defaultMapGeneration(),
    gardens: 4,
    swamps: 4,
    ponds: 8,
    lakes: 3,
    rivers: 3,
  };
  for (const seed of [0, 1, 2, 5, 14, 20, 45, 90, 31415, 2_147_483_646])
    for (const scale of [50 / 110, 1, 300 / 110]) {
      const layout = new WorldLayout(seed, map);
      const terrain = new Terrain(seed, scale, 5, layout);
      assert.equal(layout.gardens.length, 4);
      assert.equal(layout.swamps.length, 4);
      assert.equal(terrain.water.bodies.filter((body) => body.kind === 'pond').length, 8);
      assert.equal(terrain.water.bodies.filter((body) => body.kind === 'lake').length, 3);
      assert.equal(terrain.water.bodies.filter((body) => body.kind === 'river').length, 3);
      assert.equal(new Set(layout.swamps.map(({ x, z }) => `${x},${z}`)).size, 4);
      for (const garden of layout.gardens) {
        assert.ok(Math.abs(garden.x) + garden.radius < 103);
        assert.ok(Math.abs(garden.z) + garden.radius < 103);
        for (const dx of [-garden.radius, 0, garden.radius])
          for (const dz of [-garden.radius, 0, garden.radius])
            assert.equal(
              terrain.water.near((garden.x + dx) * scale, (garden.z + dz) * scale, 0),
              false,
            );
      }
      for (let x = -10; x <= 10; x += 2)
        for (let z = -10; z <= 10; z += 2) {
          if (Math.hypot(x, z) >= 10) continue;
          assert.equal(terrain.water.near(x * scale, z * scale, 0), false, `seed ${seed}`);
          assert.equal(layout.biomeAt(x, z, 'mixed'), 'meadow');
          assert.ok(Math.abs(terrain.heightAt(x * scale, z * scale)) < 1, `seed ${seed}`);
        }
      for (const body of terrain.water.bodies)
        for (const point of body.points) {
          const wet = terrain.water.sample(point.x, point.z, terrain.heightAt(point.x, point.z));
          assert.ok(wet && wet.depth > 0.1);
        }
    }
});

test('generated landscapes have connected channels, irregular lakes and usable high and low ground', () => {
  const map = defaultMapGeneration();
  for (const seed of [1, 45, 31415, 81294]) {
    const layout = new WorldLayout(seed, map);
    const terrain = new Terrain(seed, 1, 1, layout);
    const relief = new Terrain(seed, 1, 0, layout);
    const heights = [];
    for (let x = -95; x <= 95; x += 4)
      for (let z = -95; z <= 95; z += 4) heights.push(relief.heightAt(x, z));
    assert.ok(Math.max(...heights) > 14);
    assert.ok(Math.min(...heights) < -4);
    assert.ok(layout.swamps.every(({ x, z }) => relief.heightAt(x, z) < -3));

    const [main, tributary] = terrain.water.bodies.filter((body) => body.kind === 'river');
    const mouth = tributary.points.at(-1)!;
    assert.ok(terrain.water.distance(main, mouth.x, mouth.z) < 0);
    assert.equal(main.level, tributary.level);
    assert.ok(
      tributary.points.every((point, i) => {
        if (!i) return true;
        const before = tributary.points[i - 1];
        return Math.hypot(point.x - before.x, point.z - before.z) < 13;
      }),
    );
    const lake = terrain.water.bodies.find((body) => body.kind === 'lake')!;
    assert.ok(lake.radius > 2 * main.radius && lake.depth > main.depth);
    assert.ok(lake.points.length > 2);
    assert.ok(lake.points.every(({ x, z }) => terrain.water.sample(x, z, terrain.heightAt(x, z))));
  }
});

test('crossing channels agree on water level even when no axis point lies near the crossing', () => {
  const map = new WaterMap((x) => x / 10, 1, 1, [
    {
      id: 'river-a',
      kind: 'river',
      points: [
        { x: -20, z: 0 },
        { x: 20, z: 0 },
      ],
      radius: 2,
      depth: 2,
      bankWidth: 8,
    },
    {
      id: 'river-b',
      kind: 'river',
      points: [
        { x: 0, z: -25 },
        { x: 0, z: 25 },
      ],
      radius: 2,
      depth: 2,
      bankWidth: 8,
    },
  ]);
  assert.equal(map.bodies[0].level, map.bodies[1].level);
  assert.ok(map.sample(0, 0, map.carve(0, 0, 0)));
});

test('unversioned procedural saves preserve their legacy terrain and an original single river', () => {
  const { revision: _revision, rivers: _rivers, lakes: _lakes, ...legacy } = defaultMapGeneration();
  const layout = new WorldLayout(31415, legacy);
  const terrain = new Terrain(31415, 1, 1, layout);
  assert.ok(validMapGeneration(legacy));
  assert.equal(terrain.hasHighlands, false);
  assert.equal(layout.water.length, 4);
  const river = layout.water.find((body) => body.kind === 'river')!;
  assert.deepEqual(
    river.points.map(({ z }) => z),
    [-90, -60, -30, 0, 30, 60, 90],
  );
});

test('classic landmarks and water retain their established positions and extra regions stay distinct', () => {
  const layout = new WorldLayout(31415);
  assert.deepEqual(
    layout.gardens.map(({ x, z }) => ({ x, z })),
    [
      { x: 34, z: 31 },
      { x: -35, z: 29 },
    ],
  );
  assert.deepEqual(layout.water[0].points, [{ x: 9, z: -7 }]);
  assert.deepEqual(layout.water[3].points.at(-1), { x: -28, z: -25 });
  const extra = new WorldLayout(31415, { ...layout.settings, gardens: 4, swamps: 4, ponds: 8 });
  assert.equal(new Set(extra.gardens.map(({ x, z }) => `${x},${z}`)).size, 4);
  assert.equal(new Set(extra.water.map((body) => JSON.stringify(body.points))).size, 9);
});

test('preview uses actual seed and landscape settings and rejects an invalid draft', () => {
  const config = { ...defaultWorldConfig(), map: { ...defaultMapGeneration(), seed: 41 } };
  const preview = WorldPreviewPresenter.build(config)!;
  assert.deepEqual(preview, WorldPreviewPresenter.build(structuredClone(config)));
  assert.notDeepEqual(
    preview,
    WorldPreviewPresenter.build({ ...config, map: { ...config.map, seed: 42 } }),
  );
  assert.equal(WorldPreviewPresenter.build({ ...config, size: 0 }), undefined);
  assert.ok(preview.cells.includes('water'));
  assert.ok(preview.cells.includes('highland'));
  assert.ok(preview.cells.includes('lowland'));
  assert.ok(preview.water.some(({ id }) => id === 'tributary'));
  assert.ok(preview.water.some(({ id }) => id === 'lake-0'));
});
