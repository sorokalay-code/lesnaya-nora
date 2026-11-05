import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AnimalRemains } from '../src/game/AnimalRemains';
import { RemainsVisuals } from '../src/game/RemainsVisuals';
import { remainsStage, validRemains } from '../src/game/RemainsData';
import { MODEL_NAMES, ModelAssets } from '../src/game/ModelAssets';
import { createRabbit } from '../src/game/Models';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { RabbitFactory, createForestAnimal, createPredatorActor } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { WildlifeEcology } from '../src/game/WildlifeEcology';
import type { World } from '../src/game/World';
import { WorldPopulation } from '../src/game/session/WorldPopulation';
import { defaultWorldConfig, validWorldConfig } from '../src/game/WorldConfig';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);
const game = () => NewGameFactory.create(7, 0, new RabbitFactory(new Random(60)));

test('new worlds enable remains and older configurations keep the same default', () => {
  const config = defaultWorldConfig();
  assert.equal(config.leaveRemains, true);
  delete config.leaveRemains;
  assert.ok(validWorldConfig(config));
  assert.ok(validWorldConfig({ ...config, leaveRemains: false }));
  assert.equal(validWorldConfig({ ...config, leaveRemains: 'yes' }), false);
});

test('saved deaths exclude the same initial predator and hawk when rebuilding a population', () => {
  const save = game();
  save.partners = [];
  save.wildlife = [];
  save.deadPopulation = ['predator:0', 'hawk:0'];
  const scene = new THREE.Scene();
  const world = {
    treeLocations: [],
    heightAt: () => 0,
    biomeAt: () => 'meadow',
  } as unknown as World;
  const population = new WorldPopulation({
    save,
    scene,
    world,
    rng: new Random(60),
    markPartner() {},
  });
  assert.equal(population.hawks.length, 0);
  assert.ok(population.predators.length > 0);
  assert.ok(
    !population.predators.some((animal) => animal.root.userData.remainsIdentity === 'predator:0'),
  );
});

test('death creates one recognizable body, then bones at half a day, then removes both after one day', () => {
  const save = game();
  const scene = new THREE.Scene();
  const system = new AnimalRemains(scene, save, () => -4);
  const rabbit = createRabbit({ ...DEFAULT_GENES, coat: 'black' });
  rabbit.root.position.set(3, 9, 5);
  const subject = {
    kind: 'rabbit' as const,
    root: rabbit.root,
    genes: { ...DEFAULT_GENES, coat: 'black' as const },
  };
  const start = save.clock;
  system.record(subject);
  system.record(subject);
  assert.equal(save.remains!.length, 1);
  assert.equal(save.remains![0].y, -4);
  const body = scene.getObjectByName('animal-body')!;
  assert.ok(body.getObjectByName('EarL'));
  assert.ok(body.getObjectByName('PawBR'));
  assert.equal(body.position.y, -4);
  save.clock = start + 719.99;
  system.update();
  assert.equal(scene.getObjectByName('animal-body'), body);
  save.clock = start + 720;
  system.update();
  assert.equal(scene.getObjectByName('animal-body'), undefined);
  assert.ok(scene.getObjectByName('animal-skeleton'));
  save.clock = start + 1440;
  system.update();
  assert.equal(save.remains!.length, 0);
  assert.equal(scene.children.length, 0);
  system.dispose();
  ModelAssets.shared.release(rabbit.root);
});

test('disabled remains do not create geometry or records; dead population identity is still saved', () => {
  const save = game();
  save.worldConfig!.leaveRemains = false;
  const scene = new THREE.Scene();
  const system = new AnimalRemains(scene, save);
  const fox = createPredatorActor('fox', 1, 1, new Random(1));
  fox.root.userData.remainsIdentity = 'predator:3';
  system.record(fox);
  system.record(fox);
  assert.equal(scene.children.length, 0);
  assert.equal(save.remains?.length ?? 0, 0);
  assert.deepEqual(save.deadPopulation, ['predator:3']);
  system.dispose();
});

test('save reload uses original death time, skips expired stages and rejects corrupt remains', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let raw = '';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    },
  });
  try {
    const save = game();
    const scene = new THREE.Scene();
    const system = new AnimalRemains(scene, save);
    const deer = createForestAnimal('deer', 0, 0, new Random(1));
    system.record(deer);
    const repository = new SaveRepository('test-remains');
    save.clock += 800;
    repository.store(save);
    const loaded = repository.load();
    const restoredScene = new THREE.Scene();
    const restored = new AnimalRemains(restoredScene, loaded);
    assert.ok(restoredScene.getObjectByName('animal-skeleton'));
    assert.equal(restoredScene.getObjectByName('animal-body'), undefined);
    loaded.clock += 1000;
    restored.update();
    assert.equal(restoredScene.children.length, 0);
    const catalog = JSON.parse(raw) as { slots: { save: typeof save }[] };
    catalog.slots[0].save.remains = [{ ...save.remains![0], scale: { x: 0, y: 1, z: 1 } }];
    raw = JSON.stringify(catalog);
    assert.throws(() => repository.load(), /останки/);
    assert.equal(validRemains([{ ...save.remains![0], kind: 'unknown' }]), false);
    assert.equal(validRemains([save.remains![0], save.remains![0]]), false);
    system.dispose();
    restored.dispose();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('spiders leave a dark exoskeleton, and skeleton geometry is shared until its owner ends', () => {
  const visuals = new RemainsVisuals();
  const base = { id: 1, diedAt: 0, x: 0, y: 0, z: 0, heading: 0, scale: { x: 1, y: 1, z: 1 } };
  const shell = visuals.skeleton({ ...base, kind: 'spider' });
  assert.equal(shell.name, 'animal-exoskeleton');
  const other = visuals.skeleton({ ...base, kind: 'spider' });
  assert.equal(
    (shell.children[0] as THREE.Mesh).geometry,
    (other.children[0] as THREE.Mesh).geometry,
  );
  const skeleton = visuals.skeleton({ ...base, kind: 'deer' });
  assert.notEqual(
    (shell.children[0] as THREE.Mesh).material,
    (skeleton.children[0] as THREE.Mesh).material,
  );
  assert.equal(remainsStage(720, 0), 'skeleton');
  assert.equal(remainsStage(1440, 0), 'gone');
  visuals.dispose();
});

test('a dead bird rests on the ground without a vertical wing lifting its body', () => {
  const visuals = new RemainsVisuals();
  const body = visuals.body({
    id: 1,
    kind: 'hawk',
    diedAt: 0,
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    scale: { x: 1, y: 1, z: 1 },
  });
  body.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(body);
  assert.ok(Math.abs(bounds.min.y - 0.025) < 0.001);
  assert.ok(bounds.max.y - bounds.min.y < 1.5);
  ModelAssets.shared.release(body);
  visuals.dispose();
});

test('ecology records dead animals before removing the original model', () => {
  const save = game();
  const scene = new THREE.Scene();
  const system = new AnimalRemains(scene, save);
  const world = {
    resources: [],
    waterSources: [],
    heightAt: () => 0,
    biomeAt: () => 'forest',
  } as unknown as World;
  const ecology = new WildlifeEcology(scene, world, new Random(1), save, (animal) =>
    system.record(animal),
  );
  const deer = createForestAnimal('deer', 1, 1, new Random(2));
  ecology.animals.push(deer);
  scene.add(deer.root);
  deer.health = 0;
  ecology.update(0, -1, save.clock, 0, 0, () => 0, [], false);
  assert.equal(deer.root.parent, null);
  assert.equal(ecology.animals.length, 0);
  assert.equal(save.remains![0].kind, 'deer');
  assert.ok(scene.getObjectByName('animal-body'));
  system.dispose();
});
