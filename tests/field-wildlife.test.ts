import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AnimalFactory, PlayerRabbit, RabbitFactory } from '../src/game/animals';
import { Owl } from '../src/game/animals/Owl';
import { AnimalVoiceSources } from '../src/game/audio/AnimalVoiceSources';
import { AnimalCalls } from '../src/game/audio/AnimalCalls';
import { Random } from '../src/game/Random';
import { HawkHunting } from '../src/game/session/HawkHunting';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { isNightAt } from '../src/game/session/WorldCalendar';
import { ADDED_ANIMALS, CREATURE_OPTIONS } from '../src/game/WorldConfig';
import { SaveRepository } from '../src/game/SaveRepository';
import { loadModels } from './model-fixture';

await loadModels('rabbit', 'mouse', 'chipmunk', 'owl', 'roe-deer');

function forest() {
  const rng = new Random(54);
  const save = NewGameFactory.create(31, 0, new RabbitFactory(rng));
  const scene = new THREE.Scene();
  save.player.x = 60;
  const player = new PlayerRabbit(save.player).rig;
  player.root.position.set(60, 0, 0);
  const mouse = AnimalFactory.forest('mouse', 3, 0, rng);
  const chipmunk = AnimalFactory.forest('chipmunk', 0.5, 0, rng);
  mouse.moveTo(3, 0, 0);
  chipmunk.moveTo(0.5, 0, 0);
  const owl = new Owl(0, 0, rng);
  const world = {
    scene,
    heightAt: () => 0,
    hasCover: () => false,
    waterAt: () => undefined,
  };
  const context = {
    world,
    save,
    player,
    earth: { isSheltered: (_x: number, y: number) => y < -0.2, floorAt: () => 0 },
    hawks: [owl],
    predators: [],
    wildlife: [mouse, chipmunk],
    rabbits: [],
    families: [],
    toast() {},
  };
  return { context, owl, scene, mouse, chipmunk, rng };
}

test('owl is absent during the day, hunts mice at night, and leaves at sunrise', () => {
  const { context, owl, scene, mouse, chipmunk } = forest();
  const hunt = new HawkHunting(context);
  const voices = new AnimalVoiceSources(context);
  hunt.update(0.25, 1, true, isNightAt(1260 - 1));
  assert.equal(owl.root.parent, null);
  assert.equal(owl.shadow.parent, null);
  assert.ok(![...voices.all()].some(({ kind }) => kind === 'owl'));
  assert.equal(mouse.health, mouse.maxHealth);

  for (let frame = 0; frame < 100; frame++)
    hunt.update(0.05, frame * 0.05 + 2, true, isNightAt(1260));
  assert.equal(owl.root.parent, scene);
  assert.equal(owl.shadow.parent, scene);
  assert.ok([...voices.all()].some(({ kind }) => kind === 'owl'));
  assert.ok(mouse.health < mouse.maxHealth);
  assert.equal(chipmunk.health, chipmunk.maxHealth);
  assert.equal(hunt.busy, false);

  const position = owl.root.position.clone();
  hunt.update(0.1, 10, true, isNightAt(1440 + 300));
  assert.equal(owl.root.parent, null);
  assert.equal(owl.shadow.parent, null);
  assert.ok(![...voices.all()].some(({ kind }) => kind === 'owl'));
  assert.deepEqual(owl.root.position.toArray(), position.toArray());
});

test('owl strikes an exposed rabbit but leaves it alone in a burrow', () => {
  const { context, owl } = forest();
  context.wildlife.length = 0;
  const player = context.save.player;
  Object.assign(player, { x: 2, y: -2 });
  context.player.root.position.set(2, -2, 0);
  const hunt = new HawkHunting(context);
  for (let frame = 0; frame < 90; frame++) hunt.update(0.05, frame * 0.05, true, true);
  assert.equal(player.health, 100);
  Object.assign(player, { x: owl.x + 2, y: 0, z: owl.z });
  context.player.root.position.set(player.x, player.y, player.z);
  for (let frame = 90; frame < 240; frame++) hunt.update(0.05, frame * 0.05, true, true);
  assert.ok(player.health < 100);
  assert.equal(hunt.playerView, undefined);
});

test('roe deer is a peaceful species with dedicated model clips and wildlife voices', () => {
  const { context, rng } = forest();
  const roeDeer = AnimalFactory.forest('roe-deer', 12, 4, rng);
  const voices = new AnimalVoiceSources({
    save: context.save,
    rabbits: [],
    families: [],
    wildlife: [roeDeer],
    predators: [],
    hawks: [],
  });

  assert.equal(roeDeer.kind, 'roe-deer');
  assert.equal(roeDeer.defense, 0);
  assert.equal(roeDeer.receiveAttack(1, 0, { x: 11, z: 4 }), 0);
  assert.equal(roeDeer.model.root.name, 'roe-deer');
  assert.ok(roeDeer.model.clips.has('walk'));
  assert.ok(roeDeer.model.clips.has('graze'));
  assert.ok([...voices.all()].some(({ kind }) => kind === 'roe-deer'));
});

test('roe deer voices synthesize a bark and a breath', () => {
  const sounds: string[] = [];
  const calls = new AnimalCalls({
    noise: () => sounds.push('breath'),
    vocal: () => sounds.push('bark'),
  });

  calls.play({ kind: 'roe-deer', activity: 'alert', volume: 1, pan: 0 });

  assert.deepEqual(sounds, ['bark', 'breath']);
});

test('older world configurations gain new wildlife, while explicit zero stays zero', () => {
  const { context } = forest();
  const values = new Map<string, string>();
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const repository = new SaveRepository('field-wildlife');
    const counts: Partial<NonNullable<typeof context.save.worldConfig>['creatures']> =
      context.save.worldConfig!.creatures;
    for (const kind of ADDED_ANIMALS) delete counts[kind];
    counts['owl'] = 0;
    Reflect.set(counts, 'scolopendra', 3);
    Reflect.set(context.save, 'remains', [{ kind: 'scolopendra', id: 4 }]);
    context.save.deadPopulation = ['scolopendra:0', 'owl:0'];
    repository.store(context.save);
    const loaded = repository.load();
    const creatures = loaded.worldConfig!.creatures;
    for (const kind of ADDED_ANIMALS) if (kind !== 'owl') assert.ok(creatures[kind] > 0, kind);
    assert.equal(creatures.owl, 0);
    assert.equal(Object.hasOwn(creatures, 'scolopendra'), false);
    assert.deepEqual(loaded.remains, []);
    assert.deepEqual(loaded.deadPopulation, ['owl:0']);
    assert.equal(CREATURE_OPTIONS.find(({ kind }) => kind === 'roe-deer')?.label, 'Косули');
  } finally {
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
