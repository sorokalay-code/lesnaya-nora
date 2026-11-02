import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createForestAnimal,
  createPredatorActor,
  RabbitActor,
  RabbitFactory,
} from '../src/game/animals';
import { Random } from '../src/game/Random';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { EnergyRecovery } from '../src/game/systems/EnergyRecovery';
import { EnvironmentController } from '../src/game/session/EnvironmentController';
import { ForestConversation } from '../src/game/session/ForestConversation';
import { RabbitConversation } from '../src/game/session/RabbitConversation';
import { ConversationFocus } from '../src/game/session/ConversationFocus';
import { FriendSignals } from '../src/game/session/FriendSignals';
import { AnimalSimulation } from '../src/game/session/AnimalSimulation';
import { AnimalCollisionSystem } from '../src/game/session/AnimalCollisionSystem';
import { WildlifeEcology } from '../src/game/WildlifeEcology';
import {
  blockingPanelOpen,
  createUIStore,
  simulationPaused,
  socialDialogOpen,
} from '../src/ui/store';
import type { Excavation } from '../src/game/Excavation';
import type { Resource, World } from '../src/game/World';
import { loadModels } from './model-fixture';

await loadModels('rabbit', 'deer', 'moose', 'squirrel', 'hedgehog', 'beaver', 'fox');
const game = () => NewGameFactory.create(31, 0, new RabbitFactory(new Random(84)));
const world = () =>
  ({
    resources: [],
    waterSources: [],
    heightAt: () => 0,
    biomeAt: () => 'garden',
    hasCover: () => false,
  }) as unknown as World;

test('zero energy recovers after a break, while repeated expenditure and movement delay regeneration', () => {
  const player = game().player;
  player.energy = 0;
  const energy = new EnergyRecovery();
  energy.update(player, 0.1, 0, false);
  energy.update(player, 1, 3, false);
  assert.equal(player.energy, 0);
  for (let time = 4; time < 12; time++) energy.update(player, 1, time, false);
  assert.equal(player.energy, 8);
  player.energy -= 8;
  energy.update(player, 0.1, 12, false);
  energy.update(player, 1, 15, false);
  assert.equal(player.energy, 0);
  energy.update(player, 1, 16, true);
  energy.update(player, 1, 19, false);
  assert.equal(player.energy, 0);
  energy.update(player, 1, 20, false);
  assert.equal(player.energy, 1);
  player.energy = 99.8;
  energy.update(player, 1, 30, false);
  assert.equal(player.energy, 100);
});

test('nest rest completely restores energy, while a bare tunnel gives partial recovery', () => {
  for (const inNest of [false, true]) {
    const save = game();
    save.player.energy = 0;
    const context = {
      save,
      earth: { isSheltered: () => true },
      queries: { nest: () => (inNest ? { id: 1 } : undefined) },
      care: { advance() {} },
      family: {},
      sound: {},
      playAction() {},
      toast() {},
    } as unknown as ConstructorParameters<typeof EnvironmentController>[0];
    new EnvironmentController(context).execute('sleep');
    assert.equal(save.player.energy, inNest ? 100 : 65);
  }
});

test('expanded status stays live on desktop and touch while social dialogs disable combat, not simulation', () => {
  const store = createUIStore(() => {});
  for (const touch of [false, true]) {
    store.setState({ touch, statusOpen: true });
    assert.equal(simulationPaused(store.getState()), false);
    assert.equal(blockingPanelOpen(store.getState()), false);
    store.setState({
      dialog: { type: 'mate', partner: game().partners[0], command: 'follow', messages: [] },
    });
    assert.equal(socialDialogOpen(store.getState()), true);
    assert.equal(blockingPanelOpen(store.getState()), true);
    assert.equal(simulationPaused(store.getState()), false);
    store.setState({ dialog: undefined, actionMenuOpen: true });
    assert.equal(simulationPaused(store.getState()), true);
    store.setState({ actionMenuOpen: false });
  }
});

test('a conversation stops and turns its listener; releasing focus resumes autonomous movement', () => {
  const animal = createForestAnimal('deer', 2, 0, new Random(2));
  const focus = new ConversationFocus();
  focus.select(animal.root);
  focus.update(0.25, { x: 0, z: 0 });
  const turn = animal.root.rotation.y;
  assert.ok(turn > 0);
  animal.update(1, 5, () => 0, [{ x: 2.1, z: 0 }], { x: 20, z: 0 });
  assert.equal(animal.x, 2);
  assert.equal(animal.z, 0);
  focus.select();
  animal.update(1, 6, () => 0, [{ x: 2.1, z: 0 }]);
  assert.notEqual(animal.x, 2);
});

test('partner navigation holds a comfortable distance and respects conversation focus', () => {
  const save = game();
  const actor = new RabbitActor(save.partners[0], new Random(3));
  actor.moveTo(0, 5, 0);
  const earth = {
    nextStep: (_from: unknown, target: unknown) => target,
    floorAt: () => 0,
    isSheltered: () => false,
  } as unknown as Excavation;
  for (let i = 0; i < 200; i++)
    actor.navigateMate(0.05, i * 0.05, { x: 0, y: 0, z: 0 }, earth, () => 0, 5.8, 1.9);
  assert.ok(Math.abs(actor.z - 1.9) < 0.001);
  const focus = new ConversationFocus();
  focus.select(actor.root);
  actor.navigateMate(1, 12, { x: 0, y: 0, z: -10 }, earth, () => 0);
  assert.ok(Math.abs(actor.z - 1.9) < 0.001);
});

test('friendship has branching answers and talk/gift cooldowns; help is available once per day', () => {
  const save = game(),
    animal = createForestAnimal('deer', 0, 0, new Random(3));
  const dialogue = new ForestConversation(save, world());
  dialogue.respond(animal, 'animal-question');
  assert.equal(dialogue.view(animal).choices.length, 3);
  dialogue.respond(animal, 'animal-answer-quiet');
  assert.equal(animal.trust, 12);
  dialogue.respond(animal, 'animal-question');
  dialogue.respond(animal, 'animal-answer-quiet');
  assert.equal(animal.trust, 12);
  save.inventory.carrot = 4;
  save.inventory.clover = 0;
  dialogue.respond(animal, 'animal-food');
  const trust = animal.trust;
  dialogue.respond(animal, 'animal-food');
  assert.equal(animal.trust, trust);
  assert.equal(save.inventory.carrot, 3);
  save.clock += 180;
  dialogue.respond(animal, 'animal-food');
  assert.equal(dialogue.view(animal).relationship, 'Друг');
  const count = save.inventory.clover;
  dialogue.respond(animal, 'animal-help');
  assert.equal(save.inventory.clover, count + 1);
  dialogue.respond(animal, 'animal-help');
  assert.equal(save.inventory.clover, count + 1);
  save.day++;
  dialogue.respond(animal, 'animal-help');
  assert.equal(save.inventory.clover, count + 2);
});

test('friend hints reveal real food locations and a beaver exchanges branches', () => {
  const save = game(),
    forest = world(),
    animal = createForestAnimal('beaver', 0, 0, new Random(3));
  forest.resources.push({ id: 10, x: 8, z: 3, available: true, kind: 'clover' } as Resource);
  const dialogue = new ForestConversation(save, forest);
  animal.trust = 30;
  dialogue.respond(animal, 'animal-path');
  assert.deepEqual(save.discoveries?.[0], { x: 8, z: 3, label: 'Друг: Клевер' });
  const twigs = (save.materials.twigs = 2);
  dialogue.respond(animal, 'animal-food');
  assert.equal(save.materials.twigs, twigs - 1);
  dialogue.respond(animal, 'animal-help');
  assert.equal(save.materials.twigs, twigs);
});

test('rabbit questions react differently to caring and risky answers without repeat rewards', () => {
  const save = game(),
    partner = save.partners[0];
  partner.temperament = 'заботливый';
  partner.trust = 0;
  const dialogue = new RabbitConversation(save);
  dialogue.ask(partner);
  assert.ok(dialogue.question(partner)?.prompt.includes('малыши'));
  dialogue.answer(partner, 'rabbit-answer-care');
  assert.equal(partner.trust, 10);
  dialogue.ask(partner);
  dialogue.answer(partner, 'rabbit-answer-care');
  assert.equal(partner.trust, 10);
  dialogue.ask(partner);
  dialogue.answer(partner, 'rabbit-answer-risk');
  assert.equal(partner.trust, 7);
});

test('combat truce keeps wildlife alive while the rest of the ecology keeps moving', () => {
  const rng = new Random(4),
    forest = world();
  const ecology = new WildlifeEcology(new THREE.Scene(), forest, rng);
  const deer = createForestAnimal('deer', 0.5, 0, rng),
    fox = createPredatorActor('fox', 0, 0, rng);
  ecology.animals.push(deer);
  ecology.targetFor(fox, [fox], 1);
  const health = deer.health;
  ecology.update(0.05, 2, 430, 80, 80, () => 0, [fox], false);
  assert.equal(deer.health, health);
  assert.equal(fox.attackCooldown, 0);
  assert.notEqual(deer.x, 0.5);
  ecology.update(0.05, 3, 436, 80, 80, () => 0, [fox], true);
  assert.ok(deer.health < health);
});

test('wildlife identities, friendship and reward cooldowns survive save and reload', () => {
  const save = game(),
    forest = world();
  save.wildlife = [
    {
      id: 42,
      kind: 'deer',
      x: 2,
      z: 3,
      health: 80,
      social: { trust: 61, lastHelpDay: 1, lastGiftAt: 420 },
    },
  ];
  save.nextWildlifeId = 43;
  const ecology = new WildlifeEcology(new THREE.Scene(), forest, new Random(4), save);
  ecology.populate();
  ecology.animals[0].x = 7;
  ecology.capture();
  const saved = JSON.parse(JSON.stringify(save)) as typeof save;
  const restored = new WildlifeEcology(new THREE.Scene(), forest, new Random(4), saved);
  restored.populate();
  assert.equal(restored.animals[0].socialId, 42);
  assert.equal(restored.animals[0].x, 7);
  assert.equal(restored.animals[0].trust, 61);
  assert.equal(restored.animals[0].social.lastHelpDay, 1);
});

test('nearby friends warn of a real predator with a cooldown', () => {
  const friend = createForestAnimal('deer', 1, 0, new Random(1));
  friend.trust = 50;
  const fox = createPredatorActor('fox', 8, 0, new Random(2));
  const lines: string[] = [],
    signals = new FriendSignals();
  const player = { x: 0, y: 0, z: 0, hidden: false };
  signals.update(1, player, [friend], [fox], (line) => lines.push(line));
  signals.update(2, player, [friend], [fox], (line) => lines.push(line));
  assert.equal(lines.length, 1);
  player.hidden = true;
  signals.update(30, player, [friend], [fox], (line) => lines.push(line));
  assert.equal(lines.length, 1);
});

test('animal simulation prevents surface attacks during conversation and resumes them afterwards', () => {
  const save = game(),
    rng = new Random(2),
    forest = world();
  save.player.x = save.player.z = save.player.y = 0;
  save.player.hidden = false;
  const fox = createPredatorActor('fox', 0.4, 0, rng);
  const ecology = new WildlifeEcology(new THREE.Scene(), forest, rng);
  let combat = false,
    hits = 0;
  const context = {
    save,
    rng,
    world: forest,
    ecology,
    predators: [fox],
    rabbits: [],
    families: [],
    wildlife: [],
    hawks: [],
    player: { root: new THREE.Group() },
    state: {},
    earth: { isSheltered: () => false },
    traffic: { update: () => [] },
    collisions: { resolve() {} },
    consequences: {
      predatorAttack() {
        hits++;
      },
      threatenKits() {},
    },
    seasons: { predatorActivity: () => 1 },
    groundAt: () => 0,
    combatAllowed: () => combat,
    toast() {},
  } as unknown as ConstructorParameters<typeof AnimalSimulation>[0];
  const simulation = new AnimalSimulation(context);
  simulation.update(0.05, 1, true);
  assert.equal(hits, 0);
  combat = true;
  simulation.update(0.05, 1.05, true);
  assert.equal(hits, 1);
});

test('a fox can bite at the front capsule boundary of a large rabbit', () => {
  const fox = createPredatorActor('fox', 0, 1.7, new Random(2));
  assert.equal(
    fox.update(1 / 144, 1, 0, 0, false, false, () => 0, 0, 1, undefined, 1.15),
    true,
  );
});

test('player collision checks block walking through a rabbit pinned by terrain and allow backing away', () => {
  const save = game();
  save.player.x = save.player.y = save.player.z = 0;
  save.player.genes.size = 1;
  const actor = new RabbitActor(save.partners[0], new Random(1));
  actor.rig.root.scale.setScalar(1);
  actor.moveTo(2, 0, 0);
  const context = {
    save,
    world: world(),
    earth: { isSheltered: () => false, canMoveTo: () => false },
    rabbits: [actor],
    families: [],
    predators: [],
    wildlife: [],
    family: { rigs: new Map() },
  } as unknown as ConstructorParameters<typeof AnimalCollisionSystem>[0];
  const collisions = new AnimalCollisionSystem(context);
  collisions.resolve();
  assert.equal(collisions.canPlayerMove(1.2, 0, 0, 0), false);
  assert.equal(collisions.canPlayerMove(-0.1, 0, 0, 0), true);
  save.player.x = 1;
  assert.equal(collisions.canPlayerMove(0.8, 0, 0, 0), true);
  assert.equal(collisions.canPlayerMove(1.1, 0, 0, 0), false);
});
