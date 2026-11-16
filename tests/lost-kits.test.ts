import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AnimalFactory, FamilyMember, RabbitFactory } from '../src/game/animals';
import { AnimalVoiceSources } from '../src/game/audio/AnimalVoiceSources';
import { AnimalCalls } from '../src/game/audio/AnimalCalls';
import { Excavation } from '../src/game/Excavation';
import { Random } from '../src/game/Random';
import { LostKits } from '../src/game/session/LostKits';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { RabbitFamily } from '../src/game/session/RabbitFamily';
import { WildlifeEcology } from '../src/game/WildlifeEcology';
import type { KitData } from '../src/game/types';
import type { World } from '../src/game/World';
import { CREATURE_OPTIONS } from '../src/game/WorldConfig';
import { loadModels } from './model-fixture';

await loadModels('rabbit', 'fox');

function fixture() {
  const rng = new Random(35);
  const factory = new RabbitFactory(rng);
  const save = NewGameFactory.create(31, 0, factory);
  for (const { kind } of CREATURE_OPTIONS) save.worldConfig!.creatures[kind] = 0;
  const world = {
    size: 110,
    heightAt: () => 0,
    scene: new THREE.Scene(),
    rootAt: () => undefined,
    waterAt: () => undefined,
    resources: [],
    waterSources: [],
  } as unknown as World;
  const earth = new Excavation(world.scene, world, save);
  const parentData = save.partners[0];
  assert.ok(parentData);
  const parent = AnimalFactory.rabbit(parentData, rng);
  parent.moveTo(4, 0, 0);
  const child = new FamilyMember(parentData, parentData.genes, 0, true, rng);
  child.moveTo(5, 0, 0);
  world.scene.add(child.root);
  const fox = AnimalFactory.predator('fox', 4, 0, rng);
  const placedKits: KitData[] = [];
  const context = {
    save,
    world,
    earth,
    rabbits: [parent],
    families: [child],
    predators: [fox],
    addKit: (kit: KitData) => placedKits.push(kit),
  };
  return { ...context, child, parent, fox, rng, placedKits, lost: new LostKits(context) };
}

test('a separated youngster runs and squeaks until the player takes it into their family', () => {
  const { lost, child, parent, save, rabbits, families, placedKits } = fixture();
  lost.update(0);
  assert.equal(lost.prey.length, 0);
  parent.moveTo(25, 0, 0);
  lost.update(1);
  assert.equal(families.length, 0);
  assert.equal(child.root.parent, null);
  const kitActor = lost.prey[0];
  assert.ok(kitActor);
  const voices = new AnimalVoiceSources({
    save,
    rabbits,
    families,
    predators: [],
    wildlife: [],
    hawks: [],
  });
  const cue = [...voices.all()].find((voice) => voice.root === kitActor.root);
  assert.equal(cue?.activity, 'lost');
  const calls: string[] = [];
  new AnimalCalls({ noise: () => calls.push('noise'), vocal: () => calls.push('squeak') }).play({
    kind: 'rabbit',
    activity: 'lost',
    volume: 1,
    pan: 0,
  });
  assert.deepEqual(calls, ['squeak', 'squeak']);

  const start = kitActor.root.position.clone();
  lost.move(kitActor, 0.25, 1);
  assert.ok(start.distanceTo(kitActor.root.position) > 0);
  Object.assign(save.player, { x: 50, y: 0, z: 50 });
  assert.equal(lost.adopt(), undefined);
  Object.assign(save.player, { x: kitActor.x, y: 0, z: kitActor.z });
  const rescued = lost.adopt();
  assert.ok(rescued);
  assert.equal(rescued.command, 'follow');
  assert.equal(rescued.genes, child.data.genes);
  assert.equal(rescued.lineage, child.data.lineage);
  assert.match(RabbitFamily.relationship(save, rescued), /приёмная/);
  assert.deepEqual(save.kits, [rescued]);
  assert.deepEqual(placedKits, [rescued]);
  assert.equal(save.familyHealth?.[child.data.id], 0);
  assert.ok(!rabbits.includes(kitActor));
  assert.ok(!save.partners.includes(kitActor.data));
  assert.equal(lost.adopt(), undefined);
});

test('lost youngsters starve by the game clock even after restoring from a save', () => {
  const context = fixture();
  const { parent, save, lost, rng } = context;
  parent.health = 0;
  lost.update(0);
  assert.ok(lost.prey[0]);
  const restored = structuredClone(save);
  const rabbits = restored.partners
    .filter((data) => data.lost)
    .map((data) => AnimalFactory.rabbit(data, rng));
  const resumed = new LostKits({ ...context, save: restored, rabbits });
  restored.clock += 290;
  resumed.update(0);
  assert.equal(rabbits[0].health, 100);
  assert.ok((rabbits[0].data.lost?.hunger ?? 0) < 4);
  restored.clock += 450;
  resumed.update(1);
  assert.equal(rabbits[0].health, 0);
  assert.equal(resumed.adopt(), undefined);
});

test('ground predators can find and strike an exposed lost kit', () => {
  const { fox, predators, lost, world, parent, save, rng } = fixture();
  parent.health = 0;
  lost.update(0);
  const victim = lost.prey[0];
  assert.ok(victim);
  fox.moveTo(victim.x - 0.3, victim.z, 0);
  const ecology = new WildlifeEcology(world.scene, world, rng, save);
  assert.equal(ecology.targetFor(fox, predators, 1, lost.prey), victim);
  ecology.update(0.1, 1, save.clock, 50, 50, () => 0, predators, true);
  assert.ok(victim.health < victim.maxHealth);
});
