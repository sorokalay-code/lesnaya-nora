import assert from 'node:assert/strict';
import test from 'node:test';
import { ShelterController, stashItemCount } from '../src/game/session/ShelterController';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { RabbitFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import type { DialogViewModel } from '../src/ui/types';

function fixture() {
  const save = NewGameFactory.create(41, 0, new RabbitFactory(new Random(94)));
  save.stashes.push({
    id: 1,
    x: 0,
    y: 0,
    z: 0,
    food: { clover: 3 },
    materials: { grass: 1, twigs: 2, fur: 1 },
  });
  save.nests.push({ id: 1, x: 0, y: 0, z: 0, quality: 1 });
  const removed: string[] = [];
  const state = {
    dialog: undefined as DialogViewModel | undefined,
    persisted: 0,
    menus: 0,
    near: true,
  };
  const controller = new ShelterController({
    save,
    queries: {
      stash: () => (state.near ? save.stashes[0] : undefined),
      nest: () => (state.near ? save.nests[0] : undefined),
    },
    decorations: {
      removeStash: (id) => removed.push(`stash:${id}`),
      removeNest: (id) => removed.push(`nest:${id}`),
    },
    ui: {
      showDialog(dialog) {
        state.dialog = dialog;
      },
    },
    persist: () => {
      state.persisted++;
    },
    menu: () => {
      state.menus++;
    },
    toast() {},
  });
  return { save, controller, state, removed };
}

test('stash removal requires explicit confirmation and shows all stored contents', () => {
  const { save, controller, state, removed } = fixture();
  assert.equal(stashItemCount(save.stashes[0]), 7);
  controller.execute('remove-stash');
  assert.deepEqual(state.dialog, { type: 'remove', kind: 'stash', items: 7 });
  assert.equal(save.stashes.length, 1);
  assert.equal(removed.length, 0);
  controller.execute('cancel-remove');
  controller.execute('confirm-remove');
  assert.equal(save.stashes.length, 1);
  assert.equal(state.persisted, 0);
  controller.execute('remove-stash');
  controller.execute('confirm-remove');
  controller.execute('confirm-remove');
  assert.equal(save.stashes.length, 0);
  assert.deepEqual(removed, ['stash:1']);
  assert.equal(state.persisted, 1);
});

test('a stale confirmation cannot delete an object after the player walks away', () => {
  const { save, controller, state, removed } = fixture();
  controller.execute('remove-stash');
  state.near = false;
  controller.execute('confirm-remove');
  assert.equal(save.stashes.length, 1);
  assert.equal(removed.length, 0);
  assert.equal(state.persisted, 0);
});

test('occupied nest is protected and following children can leave before removal', () => {
  const { save, controller, state, removed } = fixture();
  const kit = {
    id: 1,
    name: 'Малыш',
    genes: save.player.genes,
    age: 1,
    hunger: 80,
    health: 100,
    father: 'Пушок',
    homeX: 0,
    homeY: 0,
    homeZ: 0,
    x: 0,
    y: 0,
    z: 0,
    alive: true,
    nestId: 1,
    command: 'follow' as const,
  };
  save.kits.push(kit);
  controller.execute('remove-nest');
  assert.equal(state.dialog, undefined);
  assert.equal(save.nests.length, 1);
  kit.x = 5;
  controller.execute('remove-nest');
  assert.equal(state.dialog?.type, 'remove');
  controller.execute('confirm-remove');
  assert.equal(save.nests.length, 0);
  assert.equal(kit.nestId, undefined);
  assert.equal(kit.homeX, 5);
  assert.equal(kit.command, 'follow');
  assert.deepEqual(removed, ['nest:1']);
});

test('nest occupancy is checked again at confirmation', () => {
  const { save, controller, removed } = fixture();
  controller.execute('remove-nest');
  save.kits.push({
    id: 1,
    name: 'Малыш',
    genes: save.player.genes,
    age: 0,
    hunger: 80,
    health: 100,
    father: 'Пушок',
    homeX: 0,
    homeY: 0,
    homeZ: 0,
    alive: true,
    nestId: 1,
  });
  controller.execute('confirm-remove');
  assert.equal(save.nests.length, 1);
  assert.equal(removed.length, 0);
});
