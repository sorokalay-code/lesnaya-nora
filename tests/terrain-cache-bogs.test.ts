import assert from 'node:assert/strict';
import test from 'node:test';
import { GroundHeightCache } from '../src/game/GroundHeightCache';
import { WaterMap } from '../src/game/WaterMap';
import { WorldLayout } from '../src/game/WorldLayout';
import { Terrain } from '../src/game/Terrain';
import { defaultMapGeneration } from '../src/game/MapGeneration';

test('ground cache keeps exact sample heights, caches zero and supports probes beyond its allocation', () => {
  let calls = 0;
  const terrain = (x: number, z: number) => {
    calls++;
    return x * 0.7 - z * 0.3;
  };
  const cache = new GroundHeightCache(4, terrain);
  assert.equal(cache.get(0, 0), 0);
  assert.equal(cache.get(0, 0), 0);
  assert.equal(calls, 1);
  for (let z = -4; z <= 4; z++)
    for (let x = -4; x <= 4; x++) assert.equal(cache.get(x, z), x * 0.7 - z * 0.3);
  assert.equal(cache.get(30, -18), 26.4);
});

test('a small bog on a steep slope does not dig a deep shaft or create a cliff at its outline', () => {
  const natural = (x: number, z: number) => x * 1.6 + z * 0.8;
  const map = new WaterMap(natural, 1, 1, [
    {
      id: 'slope-bog',
      kind: 'bog',
      points: [{ x: 0, z: 0 }],
      radius: 2.5,
      depth: 0.3,
    },
  ]);
  for (let z = -4; z <= 4; z += 0.2)
    for (let x = -4; x <= 4; x += 0.2) {
      const floor = map.carve(x, z, natural(x, z));
      assert.ok(natural(x, z) - floor <= 0.451);
      const water = map.sample(x, z, floor);
      if (water) assert.ok(water.depth <= 0.38, 'a bog must not float above the downhill ground');
    }
  const wet = map.sample(0, 0, map.carve(0, 0, natural(0, 0)));
  assert.ok(wet && wet.depth >= 0.2 && wet.depth < 0.38);
  assert.ok(
    Math.abs(map.carve(2.4999, 0, natural(2.4999, 0)) - map.carve(2.5001, 0, natural(2.5001, 0))) <
      0.01,
  );
});

test('water queries keep their body and depth while dry queries avoid evaluating the ground', () => {
  const map = new WaterMap(() => 0, 1, 1, [
    {
      id: 'pond',
      kind: 'pond',
      points: [{ x: 0, z: 0 }],
      radius: 3,
      depth: 1,
    },
  ]);
  let samples = 0;
  const at = (x: number, z: number) => {
    samples++;
    return map.carve(x, z, 0);
  };
  assert.equal(map.sample(40, 40, at), undefined);
  assert.equal(samples, 0);
  const point = map.sample(0, 0, at);
  assert.equal(samples, 1);
  assert.deepEqual(point, map.sample(0, 0, map.carve(0, 0, 0)));
});

test('generated swamp pools keep a shallow centre and bounded excavation across seeds and map scales', () => {
  for (const seed of [1, 45, 31415, 81294])
    for (const scale of [50 / 110, 1, 2]) {
      const layout = new WorldLayout(seed, { ...defaultMapGeneration(), lakes: 0, swamps: 2 });
      const terrain = new Terrain(seed, scale, 1, layout);
      const dry = new Terrain(seed, scale, 0, layout);
      const withoutPools = new WaterMap(
        (x, z) => dry.heightAt(x, z),
        scale,
        1,
        layout.water.filter((body) => body.kind !== 'bog'),
      );
      const pools = terrain.water.bodies.filter((body) => body.kind === 'bog');
      assert.ok(pools.length);
      for (const pool of pools) {
        const centre = pool.points[0];
        const sample = terrain.water.sample(
          centre.x,
          centre.z,
          terrain.heightAt(centre.x, centre.z),
        );
        assert.ok(sample && sample.depth > 0.1 && sample.depth < 0.38);
        for (let dz = -pool.radius; dz <= pool.radius; dz += 0.5)
          for (let dx = -pool.radius; dx <= pool.radius; dx += 0.5) {
            const x = centre.x + dx;
            const z = centre.z + dz;
            if (
              terrain.water.bodies.some(
                (body) => body.kind !== 'bog' && terrain.water.distance(body, x, z) < 5,
              )
            )
              continue;
            const baseline = withoutPools.carve(x, z, dry.heightAt(x, z));
            assert.ok(baseline - terrain.heightAt(x, z) <= 0.451, `bog shaft at ${seed}`);
          }
      }
    }
});
