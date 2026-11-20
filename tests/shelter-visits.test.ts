import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  canVisitShelter,
  insideInterior,
  interiorProfile,
  shelterWelcome,
} from '../src/game/shelters/ShelterInterior';
import { ShelterInteriorScene } from '../src/game/shelters/ShelterInteriorScene';
import { ShelterVisits } from '../src/game/shelters/ShelterVisits';
import { PlayerRabbit, RabbitActor, RabbitFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { FRIENDSHIP_TRUST } from '../src/game/Friendship';
import { loadModels } from './model-fixture';

await loadModels('rabbit');

test('Друзья допускаются в убежище, обида и хищники остаются опасными', () => {
  assert.equal(shelterWelcome('rabbit', FRIENDSHIP_TRUST), 'friendly');
  assert.equal(shelterWelcome('rabbit', FRIENDSHIP_TRUST - 1), 'warning');
  assert.equal(shelterWelcome('bear', FRIENDSHIP_TRUST), 'friendly');
  assert.equal(shelterWelcome('bear', FRIENDSHIP_TRUST, 1), 'hostile');
  assert.equal(shelterWelcome('wolf', 100), 'hostile');
  assert.equal(interiorProfile('fox').decor, 'bones');
  assert.equal(interiorProfile('beaver').decor, 'branches');
  assert.equal(canVisitShelter('squirrel'), false);
  assert.equal(canVisitShelter('mouse'), false);
});

test('Зал соединён с тамбуром, кладовой и спальней, стены закрыты', () => {
  for (const scale of [0.85, 0.9, 1.5]) {
    for (const [x, z] of [
      [0, 4],
      [0, 0],
      [4, 0],
      [0, -4],
    ])
      assert.ok(insideInterior(x * scale, z * scale, scale));
    assert.equal(insideInterior(4 * scale, 4 * scale, scale), false);
    assert.equal(insideInterior(0, 5.5 * scale, scale), false);
    assert.equal(insideInterior(3 * scale, 2.8 * scale, scale), false);
  }
});

test('Освобождение интерьера не уничтожает общие модели акторов', () => {
  const interior = new ShelterInteriorScene(interiorProfile('fox'));
  const model = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  let disposed = false;
  model.geometry.addEventListener('dispose', () => {
    disposed = true;
  });
  interior.scene.add(model);
  interior.dispose();
  assert.equal(disposed, false);
  assert.equal(interior.scene.children.length, 0);
  model.geometry.dispose();
});

async function visitFixture(trust: number, occupied = true) {
  const rng = new Random(94);
  const save = NewGameFactory.create(41, 0, new RabbitFactory(rng));
  const data = new RabbitFactory(rng).partners(1)[0];
  data.trust = trust;
  const rabbit = new RabbitActor(data, rng);
  rabbit.wildShelter = {
    site: { kind: 'rabbit', slot: 1, x: 0, z: 0, angle: 0 },
    entrance: { x: save.player.x, y: save.player.y, z: save.player.z },
    approach: { x: 0, y: 0, z: 1 },
  };
  data.inWildBurrow = occupied ? true : undefined;
  rabbit.root.visible = !occupied;
  const scene = new THREE.Scene();
  const player = new PlayerRabbit(save.player);
  scene.add(player.root, rabbit.root);
  const surface = structuredClone(save.player);
  const position = rabbit.root.position.clone();
  const keys = new Set<string>();
  let hurt = 0;
  let entered: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let mode: 'first' | 'third' = 'third';
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);
  const visits = new ShelterVisits({
    save,
    scene,
    player: player.rig,
    keys,
    view: {
      get mode() {
        return mode;
      },
      get isFirstPerson() {
        return mode === 'first';
      },
      camera,
      forwardAt: () => ({ x: 0, z: -1 }),
      setLookEnabled() {},
      update() {},
      setMode(value) {
        mode = value;
      },
      snap() {},
    },
    ui: { panelsOpen: false, state: {}, setHud() {} },
    rabbits: [rabbit],
    predators: [],
    wildlife: [],
    safe: () => true,
    resetInput: () => keys.clear(),
    refreshHud() {},
    tick() {},
    prepareLighting() {},
    hurt: (damage) => {
      hurt += damage;
    },
    toast: () => entered(),
  });
  assert.equal(visits.execute('interact'), true);
  await ready;
  assert.equal(visits.active, true);
  return {
    visits,
    save,
    surface,
    rabbit,
    position,
    scene,
    player,
    camera,
    keys,
    damage: () => hurt,
  };
}

test('Посещение и выход сохраняют координаты леса, родителей моделей и видимость хозяина', async () => {
  const f = await visitFixture(FRIENDSHIP_TRUST);
  f.keys.add('KeyW');
  for (let i = 0; i < 200; i++) f.visits.update(0.05);
  assert.equal(f.damage(), 0);
  assert.deepEqual(f.save.player, f.surface);
  assert.notEqual(f.player.root.parent, f.scene);
  f.visits.leave();
  assert.equal(f.visits.active, false);
  assert.equal(f.player.root.parent, f.scene);
  assert.equal(f.camera.parent, f.scene);
  assert.equal(f.rabbit.root.parent, f.scene);
  assert.deepEqual(f.rabbit.root.position, f.position);
  assert.equal(f.rabbit.root.visible, false);
  assert.equal(f.keys.size, 0);
});

test('Нападение в гостях снижает здоровье и доверие настоящего хозяина', async () => {
  const f = await visitFixture(FRIENDSHIP_TRUST);
  const health = f.rabbit.health;
  f.keys.add('KeyW');
  for (let i = 0; i < 30; i++) f.visits.update(0.05);
  f.keys.clear();
  assert.equal(f.visits.execute('attack-swipe'), true);
  for (let i = 0; i < 8; i++) f.visits.update(0.05);
  assert.ok(f.rabbit.health < health);
  assert.equal(f.rabbit.data.health, f.rabbit.health);
  assert.ok(f.rabbit.data.trust < FRIENDSHIP_TRUST);
  assert.ok(f.damage() > 0);
  f.visits.leave();
  assert.equal(f.save.player.x, f.surface.x);
  assert.equal(f.save.player.y, f.surface.y);
  assert.equal(f.save.player.z, f.surface.z);
});

test('Незнакомый хозяин даёт время уйти и затем атакует, пустая нора безопасна', async () => {
  const f = await visitFixture(0);
  for (let i = 0; i < 90; i++) f.visits.update(0.05);
  assert.equal(f.damage(), 0);
  for (let i = 0; i < 200; i++) f.visits.update(0.05);
  assert.ok(f.damage() > 0);
  f.visits.dispose();
  const empty = await visitFixture(0, false);
  for (let i = 0; i < 300; i++) empty.visits.update(0.05);
  assert.equal(empty.damage(), 0);
  empty.visits.dispose();
});
