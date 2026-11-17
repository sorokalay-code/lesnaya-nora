import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { PlayerRabbit, RabbitFactory } from '../src/game/animals';
import { Excavation } from '../src/game/Excavation';
import { ModelAssets, MODEL_NAMES } from '../src/game/ModelAssets';
import { defaultMapGeneration } from '../src/game/MapGeneration';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { SMALL_FAUNA_KINDS, SMALL_FAUNA } from '../src/game/SmallFaunaCohorts';
import { HawkHunting } from '../src/game/session/HawkHunting';
import { GardenHunters } from '../src/game/session/GardenHunters';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { SpiderEncounter } from '../src/game/session/SpiderEncounter';
import { WaterSimulation } from '../src/game/session/WaterSimulation';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { isNightAt } from '../src/game/session/WorldCalendar';
import type { SaveData } from '../src/game/types';
import { World } from '../src/game/World';
import { CREATURE_OPTIONS, defaultWorldConfig } from '../src/game/WorldConfig';
import { GRAPHICS_PRESETS } from '../src/game/GraphicsSettings';

for (const name of MODEL_NAMES) {
  for (const low of [false, true]) {
    const path = `public/models/${name}${low ? '-low' : ''}.glb`;
    if (!existsSync(path)) continue;
    const data = readFileSync(path);
    await ModelAssets.shared.register(
      name,
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      low,
    );
  }
}

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  },
});

const DAY = 1440;
const route = [
  { x: 0, z: 0 },
  { x: 24, z: 0 },
  { x: 24, z: 24 },
  { x: 0, z: 24 },
  { x: -24, z: 24 },
  { x: -24, z: 0 },
  { x: 0, z: 0 },
];
const onlySmall = process.argv.includes('--small-fauna');
const seeds = [31415, 813];
const results: unknown[] = [];

for (const seed of seeds) {
  for (const generated of [false, true]) {
    for (const density of [1, 3]) {
      const config = defaultWorldConfig();
      if (generated) config.map = defaultMapGeneration();
      config.seasonLengths = { Весна: 4, Лето: 6, Осень: 4, Зима: 4 };
      for (const option of CREATURE_OPTIONS) {
        if (onlySmall)
          config.creatures[option.kind] = SMALL_FAUNA_KINDS.some((kind) => kind === option.kind)
            ? 2 * density
            : 0;
        else
          config.creatures[option.kind] = Math.min(
            option.max,
            config.creatures[option.kind] * density,
          );
      }
      const save = NewGameFactory.create(seed, 0, new RabbitFactory(new Random(seed)), config);
      const scene = new THREE.Scene();
      const world = new World(scene, seed, save);
      const population = new WorldPopulation({
        save,
        scene,
        world,
        rng: new Random(seed + 74),
        markPartner() {},
      });
      const player = new PlayerRabbit(save.player).rig;
      const groundAt = (x: number, z: number) => world.heightAt(x, z);
      const earth = new Excavation(scene, world, save);
      const hunting = new HawkHunting({ ...population, save, player, world, earth, toast() {} });
      const hunters = new GardenHunters({ ...population, save, player, world, earth, toast() {} });
      const web = new SpiderEncounter({
        save,
        scene,
        world,
        player,
        spiders: population.predators,
        toast() {},
      });
      const water = new WaterSimulation({
        ...population,
        save,
        world,
        player,
        earth,
        habitats: population.ecology.aquaticHabitats,
        consequences: { predatorAttack() {} },
        toast() {},
      });
      let elapsed = 0;
      const update = (dt: number, clock: number) => {
        elapsed += dt;
        save.clock = clock;
        save.day = 1 + Math.floor(clock / DAY);
        population.ecology.prepareHabitats(elapsed, clock, population.predators);
        for (const actor of population.predators)
          if (actor.alive)
            actor.update(
              dt,
              elapsed,
              save.player.x,
              save.player.z,
              true,
              !isNightAt(clock),
              groundAt,
            );
        population.ecology.update(
          dt,
          elapsed,
          clock,
          save.player.x,
          save.player.z,
          groundAt,
          population.predators,
          false,
        );
        population.raptors.update(elapsed);
        hunting.update(dt, elapsed, false, isNightAt(clock));
        water.update(dt, elapsed, false);
        web.update(dt, elapsed, false);
        hunters.update(dt, elapsed, false);
      };
      const checkpoints: unknown[] = [];
      const repository = new SaveRepository(`ecology-audit-${seed}-${density}-${generated}`);
      const identity = (state: SaveData) => ({
        spiders: state.spiders?.map((actor) => actor.id).sort(),
        snakes: state.landPredators
          ?.filter((actor) => actor.kind === 'snake')
          .map((actor) => actor.id)
          .sort(),
        cohorts: state.smallFaunaCohorts,
      });
      const maxAdults = new Map<string, number>();
      // Календарные срезы ускоряют проверку нескольких сезонов. Физику между срезами
      // обновляем коротким шагом, чтобы измерение не превращалось в один многосекундный кадр.
      for (let minute = 420; minute <= 20 * DAY + 720; minute += 120) {
        const point = route[Math.floor(minute / 120) % route.length];
        Object.assign(save.player, point, { y: groundAt(point.x, point.z) });
        update(0.5, minute);
        update(0.5, minute);
        for (const kind of SMALL_FAUNA_KINDS) {
          const count = population.predators.filter(
            (actor) => actor.kind === kind && actor.alive,
          ).length;
          maxAdults.set(kind, Math.max(maxAdults.get(kind) ?? 0, count));
          assert.ok(count <= config.creatures[kind], `${seed} ${kind} population exceeds capacity`);
        }
        for (const cohort of save.smallFaunaCohorts ?? []) {
          assert.ok(cohort.remaining <= SMALL_FAUNA[cohort.kind].offspring);
        }
        if (minute % DAY !== 420) continue;
        population.ecology.capture();
        population.raptors.capture();
        water.capture();
        repository.store(save);
        const loaded = repository.load();
        assert.deepEqual(identity(loaded), identity(save));
        checkpoints.push({
          day: save.day,
          adults:
            population.predators.length + population.wildlife.length + population.hawks.length,
          cohorts: save.smallFaunaCohorts?.length ?? 0,
          young: save.smallFaunaCohorts?.reduce((sum, cohort) => sum + cohort.remaining, 0) ?? 0,
        });
      }
      const timings: number[] = [];
      let maxMeshes = 0;
      let maxTriangles = 0;
      let maxInstances = 0;
      const presetBudgets = Object.fromEntries(
        Object.keys(GRAPHICS_PRESETS).map((preset) => [
          preset,
          { meshes: 0, triangles: 0, instances: 0 },
        ]),
      );
      world.applyGraphics(GRAPHICS_PRESETS.balanced, 0, 0, 'clear');
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 110);
      for (const [pointIndex, point] of route.entries()) {
        Object.assign(save.player, point, { y: groundAt(point.x, point.z) });
        for (let sample = 0; sample < 24; sample++) {
          const before = performance.now();
          update(0.1, 20 * DAY + 720 + (pointIndex * 24 + sample) * 0.6);
          timings.push(performance.now() - before);
        }
        world.update(save.clock, elapsed, 'clear', save.day, point.x, point.z);
        for (const actor of [...population.predators, ...population.wildlife]) {
          actor.root.visible =
            actor.alive &&
            !actor.inShelter &&
            Math.hypot(actor.x - point.x, actor.z - point.z) < 76;
        }
        for (const bird of population.hawks) {
          const visible = bird.present && Math.hypot(bird.x - point.x, bird.z - point.z) < 92;
          bird.root.visible = visible;
          bird.shadow.visible = visible && !bird.perched;
        }
        camera.position.set(point.x + 5, groundAt(point.x, point.z) + 5, point.z + 8);
        camera.lookAt(point.x, groundAt(point.x, point.z) + 1, point.z);
        ModelAssets.shared.updateView(camera);
        for (const [preset, settings] of Object.entries(GRAPHICS_PRESETS)) {
          world.applyGraphics(settings, point.x, point.z, 'clear');
          let meshes = 0;
          let triangles = 0;
          let instances = 0;
          scene.traverseVisible((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            meshes++;
            const count = object instanceof THREE.InstancedMesh ? object.count : 1;
            triangles +=
              ((object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3) *
              count;
            if (object instanceof THREE.InstancedMesh) instances += object.count;
          });
          const budget = presetBudgets[preset];
          budget.meshes = Math.max(budget.meshes, meshes);
          budget.triangles = Math.max(budget.triangles, triangles);
          budget.instances = Math.max(budget.instances, instances);
          if (preset === 'balanced') {
            maxMeshes = Math.max(maxMeshes, meshes);
            maxTriangles = Math.max(maxTriangles, triangles);
            maxInstances = Math.max(maxInstances, instances);
          }
        }
        world.applyGraphics(GRAPHICS_PRESETS.balanced, point.x, point.z, 'clear');
      }
      timings.sort((a, b) => a - b);
      results.push({
        seed,
        map: generated ? 'generated' : 'classic',
        density,
        days: 21,
        calendarSampleMinutes: 120,
        roundTrips: checkpoints.length,
        maxAdults: Object.fromEntries(maxAdults),
        finalCohorts: save.smallFaunaCohorts?.length ?? 0,
        route: {
          points: route.length,
          aiMedianMs: Number(timings[Math.floor(timings.length / 2)].toFixed(3)),
          aiP95Ms: Number(timings[Math.floor(timings.length * 0.95)].toFixed(3)),
          maxMeshes,
          maxTriangles,
          maxInstances,
          presetBudgets,
        },
      });
      console.error(
        `Завершён прогон seed=${seed}, map=${generated ? 'generated' : 'classic'}, density=${density}, дней=21.`,
      );
      web.dispose();
      hunters.dispose();
      water.dispose();
      population.raptors.dispose();
      population.ecology.dispose();
      ModelAssets.shared.release(scene);
      ModelAssets.shared.release(player.root);
      scene.clear();
    }
  }
}
console.log(JSON.stringify({ scope: onlySmall ? 'small-fauna' : 'all ecology', results }, null, 2));
