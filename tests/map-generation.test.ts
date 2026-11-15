import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultMapGeneration,
  MAP_LIMITS,
  validMapGeneration,
  type MapGeneration,
} from '../src/game/MapGeneration';
import { WorldLayout } from '../src/game/WorldLayout';
import { Terrain } from '../src/game/Terrain';
import { GardenCrops } from '../src/game/GardenCrops';
import { defaultWorldConfig, validWorldConfig } from '../src/game/WorldConfig';
import { WorldPreviewPresenter } from '../src/ui/presenters/WorldPreviewPresenter';
import { WaterMap } from '../src/game/WaterMap';
import { WaterScenery } from '../src/game/WaterScenery';

test('new mountains leave more walkable slopes on a small map without flattening the peaks', () => {
  const seed = 31415;
  const settings = {
    ...defaultMapGeneration(),
    gardens: 0,
    swamps: 0,
    ponds: 0,
    lakes: 0,
    river: false,
  };
  const steepSteps = (terrain: Terrain) => {
    let steep = 0;
    let peak = 0;
    for (let x = -44; x < 44; x++)
      for (let z = -44; z < 44; z++) {
        const height = terrain.heightAt(x, z);
        const grade = Math.hypot(
          terrain.heightAt(x + 1, z) - height,
          terrain.heightAt(x, z + 1) - height,
        );
        if (grade > 1.15) steep++;
        peak = Math.max(peak, height);
      }
    return { steep, peak };
  };
  const previous = steepSteps(
    new Terrain(seed, 50 / 110, 0, new WorldLayout(seed, { ...settings, revision: 4 })),
  );
  const current = steepSteps(new Terrain(seed, 50 / 110, 0, new WorldLayout(seed, settings)));
  assert.ok(current.peak > 11);
  assert.ok(current.steep < previous.steep / 2);
});

test('individual lakes cover their requested area at different scales without overlap or flooding the start', () => {
  for (const [seed, scale, amount, areas] of [
    [1, 50 / 110, 0.2, [50, 40]],
    [31415, 1, 1, [50, 39, 1]],
    [45, 300 / 110, 5, [30, 30, 30]],
    [8, 1, 1, [1, 5, 15]],
  ] as const) {
    const settings = {
      ...defaultMapGeneration(),
      lakes: areas.length,
      lakeAreas: [...areas],
      gardens: 0,
      swamps: 0,
      ponds: 0,
      river: false,
    };
    const layout = new WorldLayout(seed, settings);
    const terrain = new Terrain(seed, scale, amount, layout);
    const lakes = terrain.water.bodies;
    const side = 220 * scale;
    const resolution = 132;
    const counts = lakes.map(() => 0);
    assert.equal(lakes.length, areas.length);
    for (let row = 0; row < resolution; row++)
      for (let column = 0; column < resolution; column++) {
        const x = ((column + 0.5) / resolution - 0.5) * side;
        const z = ((row + 0.5) / resolution - 0.5) * side;
        const matches = lakes.filter((body) => terrain.water.distance(body, x, z) < 0);
        assert.ok(matches.length <= 1);
        if (!matches.length) continue;

        assert.ok(Math.hypot(x, z) > 13 * scale);
        const wet = terrain.water.sample(x, z, terrain.heightAt(x, z));
        if (wet) counts[lakes.indexOf(wet.body)]++;
      }
    counts.forEach((count, index) => {
      const coverage = (100 * count) / resolution ** 2;
      assert.ok(
        Math.abs(areas[index] - coverage) < 0.8,
        `${coverage}% instead of ${areas[index]}%`,
      );
    });
    assert.equal(new Terrain(seed, scale, 0, layout).water.bodies.length, 0);
  }
});

test('a large lake renders its area with a small mesh instead of filling the 600 m map with meter triangles', () => {
  const seed = 31415;
  const layout = new WorldLayout(seed, {
    ...defaultMapGeneration(),
    lakes: 1,
    lakeAreas: [50],
    river: false,
    ponds: 0,
    swamps: 0,
  });
  const terrain = new Terrain(seed, 300 / 110, 1, layout);
  const geometry = WaterScenery.geometry(
    terrain.water,
    terrain.water.bodies[0],
    (x, z) => terrain.heightAt(x, z),
    300,
  );
  const p = geometry.getAttribute('position');
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i + 1) - p.getX(i);
    const az = p.getZ(i + 1) - p.getZ(i);
    const bx = p.getX(i + 2) - p.getX(i);
    const bz = p.getZ(i + 2) - p.getZ(i);
    area += Math.abs(ax * bz - az * bx) * 0.5;
  }
  geometry.dispose();
  assert.ok(area > 178_000 && area <= 180_000, `rendered area: ${area}`);
  assert.ok(p.count / 3 < 45_000);
});

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
    { ...map, lakeSize: 59 },
    { ...map, lakeSize: 111 },
    { ...map, lakeSize: 75.5 },
    { ...map, revision: 6 },
    { ...map, lakeAreas: [0] },
    { ...map, lakeAreas: [51] },
    { ...map, lakeAreas: [2, 2] },
    { ...map, lakes: 2, lakeAreas: [50, 41] },
    { ...map, layout: 'ocean' },
    { ...map, layout: ['classic'] },
  ]) {
    assert.equal(validMapGeneration(invalid), false);
    assert.equal(validWorldConfig({ ...defaultWorldConfig(), map: invalid }), false);
  }
  assert.ok(validMapGeneration({ ...map, seed: 0 }));
  assert.ok(validMapGeneration({ ...map, revision: 2 }));
  assert.ok(validMapGeneration({ ...map, lakes: 2, lakeAreas: [50, 40] }));
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
    revision: 4,
    gardens: 4,
    swamps: 4,
    ponds: 8,
    lakes: 3,
    rivers: 3,
    lakeSize: MAP_LIMITS.lakeSize.max,
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
        for (const dx of [-garden.radius, 0, garden.radius]) {
          for (const dz of [-garden.radius, 0, garden.radius]) {
            const x = (garden.x + dx) * scale;
            const z = (garden.z + dz) * scale;
            const overlappingWater = terrain.water.bodies.find(
              (body) => terrain.water.distance(body, x, z) < 0,
            );
            assert.equal(
              overlappingWater !== undefined,
              false,
              `water ${overlappingWater?.id} overlaps garden for seed ${seed} at scale ${scale}`,
            );
          }
        }
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
          if (body.kind === 'bog')
            assert.ok(wet.depth < 0.38, `bog pool ${body.id} is too deep at seed ${seed}`);
        }
    }
});

test('generated landscapes have connected channels, irregular lakes and usable high and low ground', () => {
  const map = { ...defaultMapGeneration(), revision: 4 as const };
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
    const largestPond = Math.max(
      ...terrain.water.bodies.filter((body) => body.kind === 'pond').map((body) => body.radius),
    );
    assert.ok(lake.radius > largestPond * 1.5);
    assert.ok(lake.points.length > 2);
    assert.ok(lake.points.every(({ x, z }) => terrain.water.sample(x, z, terrain.heightAt(x, z))));
  }
});

test('new map revisions scale lakes while revisions 2 and 3 preserve their previous sizes', () => {
  const classicRadius = { ...defaultMapGeneration(), revision: 4 as const };
  const current = new WorldLayout(31415, classicRadius);
  const smaller = new WorldLayout(31415, { ...classicRadius, lakeSize: 60 });
  const previous = new WorldLayout(31415, { ...defaultMapGeneration(), revision: 3 });
  const oldest = new WorldLayout(31415, { ...defaultMapGeneration(), revision: 2 });
  const currentLake = current.water.find((body) => body.kind === 'lake')!;
  const smallerLake = smaller.water.find((body) => body.kind === 'lake')!;
  const previousLake = previous.water.find((body) => body.kind === 'lake')!;
  const oldestLake = oldest.water.find((body) => body.kind === 'lake')!;

  assert.ok(currentLake.radius > smallerLake.radius);
  assert.equal(currentLake.radius, previousLake.radius);
  assert.ok(previousLake.radius > oldestLake.radius);
  assert.ok(previousLake.radius <= 11);
  assert.equal(
    previous.water.some((body) => body.kind === 'bog'),
    false,
  );
});

test('revision 4 swamps have deep boggy ground and separate shallow pools', () => {
  const map = { ...defaultMapGeneration(), revision: 4 as const };
  const layout = new WorldLayout(31415, map);
  const terrain = new Terrain(31415, 1, 1, layout);
  const pools = terrain.water.bodies.filter((body) => body.kind === 'bog');

  assert.ok(pools.length >= 1);
  assert.ok(layout.landscape!.heightAt(layout.swamps[0].x, layout.swamps[0].z) <= -4.8);
  assert.equal(layout.biomeAt(layout.swamps[0].x, layout.swamps[0].z, 'mixed'), 'swamp');
  for (const pool of pools) {
    const point = pool.points[0];
    const sample = terrain.water.sample(point.x, point.z, terrain.heightAt(point.x, point.z));
    assert.ok(sample && sample.depth > 0.1 && sample.depth < 0.38);
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
  const config = { ...defaultWorldConfig(), map: { ...defaultMapGeneration(), seed: 31415 } };
  const preview = WorldPreviewPresenter.build(config)!;
  assert.deepEqual(preview, WorldPreviewPresenter.build(structuredClone(config)));
  assert.notDeepEqual(
    preview,
    WorldPreviewPresenter.build({ ...config, map: { ...config.map, seed: 31416 } }),
  );
  assert.equal(WorldPreviewPresenter.build({ ...config, size: 0 }), undefined);
  assert.ok(preview.cells.includes('water'));
  assert.ok(preview.cells.includes('highland'));
  assert.ok(preview.cells.includes('lowland'));
  assert.ok(preview.water.some(({ id }) => id === 'tributary'));
  const lake = preview.water.find(({ id }) => id === 'lake-0');
  const pond = preview.water.find(({ id }) => id === 'pond-0');
  assert.equal(lake?.kind, 'lake');
  assert.equal(pond?.kind, 'pond');
  assert.ok(lake?.closed && lake.points.split(' ').length >= 8);
  assert.ok(pond && !pond.closed && pond.width > 0);
  assert.ok(preview.water.some(({ kind }) => kind === 'bog'));
});
