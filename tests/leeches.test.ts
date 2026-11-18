import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LeechPopulation } from '../src/game/session/LeechPopulation';
import { LEECH, type LeechState } from '../src/game/animals/Leech';
import { PlayerRabbit, RabbitFactory } from '../src/game/animals';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import type { WaterBody } from '../src/game/WaterMap';
import { ModelAssets } from '../src/game/ModelAssets';
import { loadModels } from './model-fixture';

await loadModels('rabbit', 'leech');

function fixture(count = 1) {
  const save = NewGameFactory.create(52, 0, new RabbitFactory(new Random(52)));
  save.player.x = save.player.z = 0;
  save.player.y = 0.4;
  save.player.health = save.player.energy = 100;
  const player = new PlayerRabbit(save.player);
  player.root.position.set(0, 0.4, 0);
  const body: WaterBody = {
    id: 'test-water',
    kind: 'pond',
    points: [{ x: 0, z: 0 }],
    radius: 6,
    depth: 1,
    level: 1,
  };
  const scene = new THREE.Scene();
  scene.add(player.root);
  let wet = true;
  let wall = false;
  const messages: string[] = [];
  save.leechPopulation = Array.from({ length: count }, (_, id): LeechState => ({
    id,
    waterBody: body.id,
    x: 0,
    y: 0.82,
    z: 0.3,
    phase: { kind: 'hungry' },
  }));
  const context = {
    save,
    player,
    world: {
      scene,
      terrain: { water: { bodies: [body] } },
      heightAt: () => 0,
      waterAt: (x: number, z: number) =>
        wet && Math.hypot(x, z) < 6 && !(wall && z > 0.05 && z < 0.25)
          ? { body, level: 1, depth: 1 }
          : undefined,
    },
    earth: { isSheltered: () => false },
    toast: (message: string) => messages.push(message),
  };
  return {
    context,
    save,
    player,
    scene,
    messages,
    dry: () => {
      wet = false;
    },
    block: () => {
      wall = true;
    },
  };
}

test('водная пиявка крепится к телу и постепенно пьёт кровь даже после выхода на берег', () => {
  const f = fixture();
  const population = new LeechPopulation(f.context);
  population.update(0.05, 0, true);
  const leech = population.animals[0];
  assert.equal(leech.state.phase.kind, 'attached');
  assert.ok(f.player.root.getObjectById(leech.root.id));
  assert.ok(f.messages[0].includes('Присосалась'));
  f.dry();
  population.update(10, 10, false);
  assert.ok(Math.abs(f.save.player.health - (100 - 10 * LEECH.bloodPerSecond)) < 0.001);
  assert.ok(leech.root.scale.x > 1);
  assert.equal(leech.state.phase.kind, 'attached');
  population.dispose();
});

test('насытившаяся пиявка отпадает в мировое положение и некоторое время не присасывается снова', () => {
  const f = fixture();
  const population = new LeechPopulation(f.context);
  population.update(0.05, 0, true);
  f.player.root.position.set(3, 0.4, 1);
  f.save.player.x = 3;
  f.save.player.z = 1;
  population.update(100, 100, true);
  const leech = population.animals[0];
  assert.equal(leech.state.phase.kind, 'sated');
  assert.equal(leech.root.parent, f.scene);
  assert.ok(leech.x > 2 && leech.z > 0.5);
  assert.ok(
    Math.abs(f.save.player.health - (100 - LEECH.feedingSeconds * LEECH.bloodPerSecond)) < 0.001,
  );
  population.update(1, 101, true);
  assert.equal(leech.state.phase.kind, 'sated');
  population.dispose();
});

test('одновременно кормятся не более трёх пиявок в разных местах тела', () => {
  const f = fixture(6);
  const population = new LeechPopulation(f.context);
  for (const time of [0, 3, 6, 9, 12]) population.update(0.01, time, true);
  const attached = population.animals.filter((animal) => animal.state.phase.kind === 'attached');
  assert.equal(attached.length, LEECH.maxAttached);
  assert.equal(new Set(attached.map((animal) => JSON.stringify(animal.root.position))).size, 3);
  population.dispose();
});

test('пиявки не присасываются на суше, через сухую перемычку, в прыжке и при запрете новых атак', () => {
  for (const mode of ['dry', 'wall', 'jump', 'truce', 'shelter'] as const) {
    const f = fixture();
    if (mode === 'dry') f.dry();
    if (mode === 'wall') f.block();
    if (mode === 'jump') f.player.root.userData.jumping = true;
    if (mode === 'shelter') f.save.player.hidden = true;
    const population = new LeechPopulation(f.context);
    population.update(0.05, 0, mode !== 'truce');
    assert.equal(population.animals[0].state.phase.kind, 'hungry', mode);
    assert.equal(f.save.player.health, 100);
    population.dispose();
  }
});

test('сохранение и загрузка продолжают насыщение вместо сброса паразита', () => {
  const f = fixture();
  const population = new LeechPopulation(f.context);
  population.update(0.05, 0, true);
  population.update(12, 12, false);
  const serialized = JSON.stringify(f.save);
  population.dispose();
  const loaded = JSON.parse(serialized) as typeof f.save;
  const restored = new LeechPopulation({ ...f.context, save: loaded });
  assert.ok(f.player.root.getObjectById(restored.animals[0].root.id));
  restored.update(18, 30, false);
  assert.equal(restored.animals[0].state.phase.kind, 'sated');
  assert.ok(Math.abs(loaded.player.health - (100 - 30 * LEECH.bloodPerSecond)) < 0.001);
  restored.dispose();
});

test('смена персонажа и завершение сессии освобождают привязки и не уничтожают общие модели', () => {
  const f = fixture();
  const population = new LeechPopulation(f.context);
  population.update(0.05, 0, true);
  const root = population.animals[0].root;
  population.releasePlayer();
  assert.equal(root.parent, f.scene);
  assert.equal(population.animals[0].state.phase.kind, 'sated');
  f.player.refreshAppearance();
  population.update(0.2, 1, false);
  assert.equal(root.parent, f.scene);
  population.dispose();
  assert.equal(root.parent, null);
  const another = new LeechPopulation(f.context);
  assert.ok(another.animals[0].model.clips.has('swim'));
  another.dispose();
});

test('пиявки появляются только в воде и не превышают лимит популяции', () => {
  const f = fixture();
  delete f.save.leechPopulation;
  const population = new LeechPopulation(f.context);
  assert.equal(population.animals.length, LEECH.perWaterBody);
  for (const animal of population.animals) assert.ok(f.context.world.waterAt(animal.x, animal.z));
  population.dispose();
  delete f.save.leechPopulation;
  f.dry();
  const dry = new LeechPopulation(f.context);
  assert.equal(dry.animals.length, 0);
  dry.dispose();
});

test('оба LOD пиявки содержат клипы плавания и питания', () => {
  const model = ModelAssets.shared.create('leech');
  assert.equal(model.variants?.length, 2);
  for (const variant of model.variants ?? [model]) {
    assert.ok(variant.clips.has('swim'));
    assert.ok(variant.clips.has('feed'));
  }
  ModelAssets.shared.release(model.root);
});

test('репозиторий принимает состояние питания и отклоняет повреждённые таймеры и места крепления', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let raw = '';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => raw || null,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    },
  });
  try {
    const f = fixture();
    f.save.leechPopulation![0].phase = { kind: 'attached', slot: 0, fedSeconds: 10 };
    const repository = new SaveRepository('leech-test');
    repository.store(f.save);
    assert.equal(repository.load().leechPopulation?.[0].phase.kind, 'attached');
    const good = raw;
    for (const phase of [
      { kind: 'attached', slot: 9, fedSeconds: 10 },
      { kind: 'attached', slot: 0, fedSeconds: -1 },
      { kind: 'attached', slot: 0, fedSeconds: 999 },
      { kind: 'sated', remainingSeconds: -1 },
      { kind: 'broken' },
    ]) {
      const catalog = JSON.parse(good);
      catalog.slots[0].save.leechPopulation[0].phase = phase;
      raw = JSON.stringify(catalog);
      assert.throws(() => repository.load(), /обитателей воды/);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
