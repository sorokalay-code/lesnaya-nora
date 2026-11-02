import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { InteractionController } from '../src/game/session/InteractionController';
import { JumpMotion } from '../src/game/session/JumpMotion';
import { PlayerMovement } from '../src/game/session/PlayerMovement';
import { EnvironmentController } from '../src/game/session/EnvironmentController';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { RabbitFactory, PlayerRabbit } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { Soundscape } from '../src/game/Audio';
import { Terrain } from '../src/game/Terrain';
import { WorldBoundary } from '../src/game/WorldBoundary';
import { FullscreenController } from '../src/game/input/FullscreenController';
import { createUIStore } from '../src/ui/store';
import { loadModels } from './model-fixture';
import type { Excavation } from '../src/game/Excavation';
import type { ViewCamera } from '../src/game/ViewCamera';

await loadModels('rabbit');
const saveGame = () => NewGameFactory.create(41, 0, new RabbitFactory(new Random(94)));

test('jump follows a complete forward arc with invariant distance across frame rates', () => {
  for (const frames of [30, 60, 144]) {
    const jump = new JumpMotion();
    jump.start(0, -1);
    let distance = 0,
      peak = 0,
      height = 0;
    for (let frame = 0; frame < frames; frame++) {
      const step = jump.advance(JumpMotion.duration / frames);
      distance -= step.z;
      peak = Math.max(peak, step.height);
      height = step.height;
    }
    jump.advance(0.0001);
    assert.ok(Math.abs(distance - JumpMotion.distance) < 0.00001);
    assert.ok(peak > 0.8);
    assert.ok(height < 0.00001);
    assert.equal(jump.active, false);
  }
});

test('player jump spends energy, moves the persisted position and cannot cross a wall', () => {
  const save = saveGame(),
    player = new PlayerRabbit(save.player);
  const earth = {
    isSheltered: () => false,
    canMoveTo: (_x: number, z: number) => z >= -2,
    floorAt: () => 0,
  } as unknown as Excavation;
  const movement = new PlayerMovement(player, new Set(), {} as ViewCamera, earth, new Soundscape());
  assert.equal(movement.requestJump(0), true);
  assert.equal(movement.requestJump(0.1), false);
  assert.equal(save.player.energy, 81);
  for (let frame = 0; frame < 60; frame++) movement.move(1 / 60, frame / 60, false);
  assert.ok(save.player.z < -1.5 && save.player.z >= -2);
  assert.equal(player.root.userData.jumpHeight, 0);
  assert.equal(movement.requestJump(0.9), false);
  save.player.energy = 0;
  assert.equal(movement.requestJump(2), false);
});

test('nest construction is refused on surface without spending materials, and succeeds underground', () => {
  const save = saveGame();
  save.materials = { grass: 3, twigs: 2, fur: 2 };
  let underground = false,
    created = 0;
  const context = {
    save,
    earth: { isSheltered: () => underground },
    queries: { nest: () => undefined },
    sound: { play() {} },
    toast() {},
    addNest() {
      created++;
    },
  } as unknown as ConstructorParameters<typeof EnvironmentController>[0];
  const environment = new EnvironmentController(context);
  environment.execute('nest');
  assert.equal(save.nests.length, 0);
  assert.equal(save.materials.fur, 2);
  underground = true;
  save.player.y = -2;
  environment.execute('nest');
  assert.equal(created, 1);
  assert.equal(save.nests.length, 1);
  assert.equal(save.nests[0].y, -2);
  assert.deepEqual(save.materials, { grass: 0, twigs: 0, fur: 0 });
});

test('distant terrain leaves the playable square empty and batches trees into one draw', () => {
  const boundary = new WorldBoundary(new Terrain(41), 41);
  assert.equal(boundary.root.children.length, 2);
  const mesh = boundary.root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
  const position = mesh.geometry.attributes.position;
  const indices = mesh.geometry.index!;
  for (let triangle = 0; triangle < indices.count; triangle += 3) {
    const i = indices.getX(triangle),
      j = indices.getX(triangle + 1),
      k = indices.getX(triangle + 2);
    const x = (position.getX(i) + position.getX(j) + position.getX(k)) / 3;
    const z = (position.getZ(i) + position.getZ(j) + position.getZ(k)) / 3;
    assert.ok(Math.max(Math.abs(x), Math.abs(z)) >= 110);
    assert.ok(mesh.geometry.attributes.normal.getY(i) > 0);
  }
  assert.ok(boundary.root.children[1] instanceof THREE.InstancedMesh);
  assert.ok(indices.count / 3 < 10000);
});

test('fullscreen state follows entering, browser exit and unsupported browsers', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const store = createUIStore(() => {});
  const documentMock = Object.assign(new EventTarget(), {
    fullscreenEnabled: true,
    fullscreenElement: null as object | null,
    async exitFullscreen() {
      this.fullscreenElement = null;
      this.dispatchEvent(new Event('fullscreenchange'));
    },
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentMock });
  const host = {
    async requestFullscreen() {
      documentMock.fullscreenElement = host;
      documentMock.dispatchEvent(new Event('fullscreenchange'));
    },
  } as unknown as HTMLElement;
  const messages: string[] = [];
  const ui = {
    store,
    get state() {
      return store.getState();
    },
    toast(text: string) {
      messages.push(text);
    },
  };
  let controller: FullscreenController | undefined;
  try {
    controller = new FullscreenController(host, ui);
    await controller.toggle();
    assert.equal(store.getState().fullscreen, true);
    await documentMock.exitFullscreen();
    assert.equal(store.getState().fullscreen, false);
    controller.dispose();
    controller = new FullscreenController({} as HTMLElement, ui);
    await controller.toggle();
    assert.equal(store.getState().fullscreenAvailable, false);
    assert.equal(messages.length, 1);
  } finally {
    controller?.dispose();
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('forming a pair does not generate a nest or consume nest materials', () => {
  const save = saveGame(),
    partner = save.partners[0];
  partner.trust = 100;
  partner.preference = 'bond';
  const before = structuredClone(save.materials);
  const context = {
    save,
    rabbits: [],
    view: { unlock() {} },
    ui: { showDialog() {}, closeDialog() {} },
    sound: { play() {} },
    playAction() {},
    startMating() {},
    elapsed: () => 0,
    toast() {},
    persist() {},
  } as unknown as ConstructorParameters<typeof InteractionController>[0];
  const interactions = new InteractionController(context);
  interactions.openPartner(partner);
  interactions.partnerAction('court');
  assert.equal(save.mateId, partner.id);
  assert.equal(save.nests.length, 0);
  assert.deepEqual(save.materials, before);
});
