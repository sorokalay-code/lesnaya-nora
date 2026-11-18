import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CREATURE_NAMES, ModelAssets, type ModelInstance } from '../src/game/ModelAssets';
import { createRabbit, animateRabbit, setRabbitAction } from '../src/game/Models';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { RABBIT_ATTACKS } from '../src/game/combat/AttackProfiles';
import { AnimalFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { loadModels } from './model-fixture';
import { ViewCamera } from '../src/game/ViewCamera';

await loadModels(...CREATURE_NAMES);

test('боевые клипы есть у обоих LOD животных и сохраняют исходные походки', () => {
  for (const kind of CREATURE_NAMES) {
    if (kind === 'hunter' || kind === 'leech') continue;
    const model = ModelAssets.shared.create(kind);
    for (const variant of model.variants ?? [model]) {
      assert.ok(variant.root.getObjectByName('CombatMotion'), kind);
      const attacks = kind === 'rabbit' ? ['swipe', 'bite'] : ['attack-ready', 'attack'];
      for (const name of attacks)
        assert.ok(variant.clips.get(name)!.tracks.length >= 2, `${kind}:${name}`);
      assert.ok(
        variant.clips.has(
          kind === 'hawk' || kind === 'owl'
            ? 'glide'
            : kind === 'fish' || kind === 'pike'
              ? 'swim'
              : 'idle',
        ),
        kind,
      );
    }
    ModelAssets.shared.release(model.root);
  }
});

test('крольчиха выносит лапы в момент удара, опирается на задние и возвращается в стойку', () => {
  const rabbit = createRabbit(structuredClone(DEFAULT_GENES));
  const variant = rabbit.variants![0];
  const paw = variant.root.getObjectByName('PawFL')!;
  const rear = variant.root.getObjectByName('PawBL')!;
  const neutral = paw.quaternion.clone();
  setRabbitAction(rabbit, 'swipe', 0, RABBIT_ATTACKS.swipe.recovery);
  animateRabbit(rabbit, 0.08, false, false, 0.08);
  const windup = paw.quaternion.clone();
  animateRabbit(rabbit, RABBIT_ATTACKS.swipe.windup, false, false, 0.08);
  assert.ok(paw.quaternion.angleTo(windup) > 0.6);
  assert.ok(Math.abs(rear.rotation.x) > 0.1);
  animateRabbit(rabbit, 0.64, false, false, 0.1);
  assert.ok(paw.quaternion.angleTo(neutral) < 0.1);
  assert.equal(variant.active!.loop, THREE.LoopOnce);
});

test('фаза укуса не зависит от частоты кадров и заново начинается при повторной атаке', () => {
  const poses = [30, 60, 144].map((fps) => {
    const rabbit = createRabbit(structuredClone(DEFAULT_GENES));
    setRabbitAction(rabbit, 'bite', 0, 1.1);
    for (let frame = 1; frame <= Math.floor(fps * 0.3); frame++)
      animateRabbit(rabbit, frame / fps, false, false, 1 / fps);
    animateRabbit(rabbit, 0.3, false, false, 0.01);
    return rabbit.variants![0].root.getObjectByName('Head')!.quaternion.clone();
  });
  assert.ok(poses[0].angleTo(poses[1]) < 0.001);
  assert.ok(poses[0].angleTo(poses[2]) < 0.001);
  const rabbit = createRabbit(structuredClone(DEFAULT_GENES));
  setRabbitAction(rabbit, 'bite', 0, 1.1);
  animateRabbit(rabbit, 1.09, false, false, 0.1);
  setRabbitAction(rabbit, 'bite', 1.1, 1.1);
  animateRabbit(rabbit, 1.2, false, false, 0.1);
  assert.ok(Math.abs(rabbit.variants![0].root.getObjectByName('Head')!.rotation.x) > 0.05);
});

test('хищник сначала показывает подготовку, затем выпад без переноса физического корня', () => {
  const fox = AnimalFactory.predator('fox', 0, -1, new Random(2));
  fox.update(0.02, 1, 0, 0, false, false, () => 0);
  const model = fox.root.userData.model as ModelInstance;
  assert.equal(model.activeName, 'attack-ready');
  fox.update(0.1, 1.15, 0, 0, false, false, () => 0);
  assert.equal(model.activeName, 'attack-ready');
  assert.equal(
    fox.update(0.1, 1.31, 0, 0, false, false, () => 0),
    true,
  );
  assert.equal(model.activeName, 'attack');
  assert.equal(fox.root.position.x, fox.x);
  assert.equal(fox.root.position.z, fox.z);
});

test('мирное животное отвечает боевым клипом и заканчивает выпад', () => {
  const deer = AnimalFactory.forest('deer', 0, -1, new Random(3));
  deer.root.position.y = 0;
  const player = { x: 0, y: 0, z: 0, hidden: false };
  deer.receivePlayerAttack(1, 0, player);
  deer.receivePlayerAttack(1, 1, player);
  assert.ok(deer.fightPlayer(player, 1) > 0);
  deer.update(0.02, 1.02, () => 0, []);
  assert.equal(deer.model.activeName, 'attack');
  deer.update(0.1, 2, () => 0, []);
  assert.notEqual(deer.model.activeName, 'attack');
});

test('лапа первого лица выносится в кадр при контакте и возвращается после атаки', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { pointerLockElement: null },
  });
  try {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    const canvas = { addEventListener() {} } as unknown as HTMLCanvasElement;
    const view = new ViewCamera(camera, canvas);
    view.setMode('first');
    view.update(0, 0, 0);
    const paw = camera.children[0].children[0];
    const rest = paw.position.clone();
    view.update(0, 0, 0, undefined, 0.16, false, false, undefined, {
      kind: 'swipe',
      elapsed: RABBIT_ATTACKS.swipe.windup,
      duration: RABBIT_ATTACKS.swipe.recovery,
    });
    assert.ok(paw.position.y > rest.y + 0.2);
    assert.ok(paw.position.z < rest.z - 0.3);
    camera.updateMatrixWorld(true);
    const projected = paw.getWorldPosition(new THREE.Vector3()).project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1);
    view.update(0, 0, 0, undefined, 1);
    assert.ok(paw.position.distanceTo(rest) < 0.001);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
