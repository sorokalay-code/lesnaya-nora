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
  const map: MapGeneration = { ...defaultMapGeneration(), gardens: 4, swamps: 4, ponds: 8 };
  for (const seed of [0, 1, 14, 31415, 2_147_483_646])
    for (const scale of [50 / 110, 1, 300 / 110]) {
      const layout = new WorldLayout(seed, map);
      const terrain = new Terrain(seed, scale, 5, layout);
      assert.equal(layout.gardens.length, 4);
      assert.equal(layout.swamps.length, 4);
      assert.equal(terrain.water.bodies.filter((body) => body.kind === 'pond').length, 8);
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
        }
      for (const body of terrain.water.bodies)
        for (const point of body.points) {
          const wet = terrain.water.sample(point.x, point.z, terrain.heightAt(point.x, point.z));
          assert.ok(wet && wet.depth > 0.1);
        }
    }
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
});
