import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  Animal,
  AnimalFactory,
  PlayerRabbit,
  Predator,
  RabbitActor,
  RabbitFactory,
  RabbitKit,
} from '../src/game/animals';
import { Wolf } from '../src/game/animals/Wolf';
import type { Soundscape } from '../src/game/Audio';
import type { Excavation } from '../src/game/Excavation';
import { FamilyCare } from '../src/game/FamilyCare';
import { GroundItems } from '../src/game/GroundItems';
import { MODEL_NAMES } from '../src/game/ModelAssets';
import { Random } from '../src/game/Random';
import { EnvironmentController } from '../src/game/session/EnvironmentController';
import { FamilyLifecycle } from '../src/game/session/FamilyLifecycle';
import { InventoryController } from '../src/game/session/InventoryController';
import { SessionQueries } from '../src/game/session/SessionQueries';
import { FoodStore, SurvivalSystem } from '../src/game/systems';
import type { SaveData } from '../src/game/types';
import type { ViewCamera } from '../src/game/ViewCamera';
import type { World } from '../src/game/World';
import type { GameUI } from '../src/ui/GameUI';
import { createUIStore } from '../src/ui/store';
import { loadModels } from './model-fixture';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';

await loadModels(...MODEL_NAMES);

function fixture() {
  const genes = {
    ...DEFAULT_GENES,
    coat: 'cream' as const,
    ear: 1,
    speed: 3,
    vitality: 4,
    size: 1,
  };
  const save: SaveData = {
    version: 4,
    seed: 14,
    clock: 420,
    day: 1,
    weather: 'clear',
    messages: [],
    waste: [],
    drops: [],
    player: {
      x: 0,
      y: -1,
      z: 0,
      genes,
      hunger: 10,
      thirst: 10,
      bodyTemp: 38.5,
      energy: 90,
      bladder: 0,
      bowel: 0,
      health: 30,
      age: 0,
      hidden: true,
      dirtiness: 0,
      poison: 0,
      milk: 35,
    },
    inventory: {
      clover: 0,
      carrot: 0,
      cabbage: 0,
      mushroom: 0,
      berries: 0,
      toadstool: 0,
      bitterleaf: 0,
      acorn: 0,
    },
    materials: { grass: 3, twigs: 2, fur: 2 },
    excavation: [],
    harvested: [],
    kits: [],
    nests: [{ id: 1, x: 0, y: -1, z: 0, quality: 1 }],
    stashes: [{ id: 1, x: 0, y: -1, z: 0, food: { clover: 3 } }],
    partners: [
      {
        id: 1,
        name: 'Пушок',
        x: 2,
        z: 0,
        genes,
        preference: 'bond',
        temperament: 'заботливый',
        trust: 90,
        familySize: 0,
      },
    ],
    pregnancy: { fatherId: 1, progress: 1.2, warned: true },
    stats: { births: 0, grown: 0, survived: 0, generations: 1 },
  };
  const scene = new THREE.Scene(),
    rng = new Random(3);
  const world = {
    resources: [],
    treeLocations: [],
    heightAt: () => 0,
    chunks: { add: (object: THREE.Object3D) => scene.add(object) },
  } as unknown as World;
  const earth = {
    isSheltered: (_x: number, y: number) => y < -0.5,
    floorAt: (_x: number, _z: number, y: number) => (y < 0 ? -1 : 0),
    nextStep: () => undefined,
    route: (_from: unknown, to: unknown) => [to],
    revision: 0,
    canMoveTo: () => true,
  } as unknown as Excavation;
  const sound = { play: () => {} } as unknown as Soundscape;
  const care = new FamilyCare(save, earth);
  const family = new FamilyLifecycle({
    save,
    scene,
    world,
    earth,
    care,
    rng,
    genetics: new RabbitFactory(rng),
    sound,
    temperature: () => 15,
    toast: () => {},
    persist: () => {},
    playAction: () => {},
  });
  const queries = new SessionQueries({ save, world, earth, family, rabbits: [], wildlife: [] });
  const store = new FoodStore(save),
    survival = new SurvivalSystem(save, rng),
    items = new GroundItems(world, save);
  const view = {
    isFirstPerson: true,
    forwardAt: () => ({ x: 1, z: 0 }),
    unlock: () => {},
  } as unknown as ViewCamera;
  return { save, scene, world, earth, sound, care, family, queries, store, survival, items, view };
}

test('factories create concrete species with shared animal behavior and distinct profiles', () => {
  const rng = new Random(4),
    wolf = AnimalFactory.predator('wolf', 0, 0, rng);
  assert.ok(wolf instanceof Wolf && wolf instanceof Predator && wolf instanceof Animal);
  assert.equal(wolf.profile.runSpeed, 3.7);
  const moose = AnimalFactory.forest('moose', 2, 0, rng);
  assert.equal(moose.defense, 25);
  assert.equal(moose.maxHealth, 130);
  const data = fixture().save.partners[0],
    rabbit = new RabbitActor(data, rng);
  rabbit.moveTo(4, 5, -1);
  assert.equal(data.x, 4);
  assert.equal(data.z, 5);
  assert.equal(rabbit.root.position.y, -1);
});

test('inventory commands consume stash food and preserve physical dropped materials', () => {
  const context = fixture();
  let closed = 0;
  const inventory = new InventoryController({
    ...context,
    ui: { showDialog: () => {} } as unknown as GameUI,
    toast: () => {},
    playAction: () => {},
    addStash: () => {},
    clearSelection: () => {},
    closePanels: () => {
      closed++;
    },
  });
  assert.equal(inventory.execute('consume-stash:clover'), true);
  assert.equal(context.save.stashes[0].food.clover, 2);
  assert.equal(context.save.inventory.clover, 0);
  assert.ok(context.save.player.hunger > 10 && context.save.player.thirst > 10);
  assert.equal(closed, 1);
  inventory.execute('drop-material:fur');
  assert.equal(context.save.materials.fur, 1);
  assert.equal(context.save.drops?.[0].kind, 'fur');
  inventory.collect();
  assert.equal(context.save.materials.fur, 2);
  assert.equal(context.save.drops?.length, 0);
  assert.equal(inventory.execute('unknown'), false);
});

test('environment command cooldowns belong to the controller', () => {
  const context = fixture(),
    player = new PlayerRabbit(context.save.player);
  const commands = new EnvironmentController({
    ...context,
    camera: new THREE.PerspectiveCamera(),
    player: player.rig,
    elapsed: () => 1,
    toast: () => {},
    playAction: () => {},
    addNest: () => {},
    makeWaste: () => {},
  });
  commands.execute('fur');
  commands.execute('fur');
  assert.equal(context.save.materials.fur, 3);
  commands.update(25);
  commands.execute('fur');
  assert.equal(context.save.materials.fur, 4);
  assert.equal(commands.execute('unknown'), false);
});

test('family lifecycle creates kit actors and feeding updates their persisted state', () => {
  const { save, family } = fixture();
  family.birth();
  assert.ok(save.kits.length >= 2);
  assert.equal(save.kits[0].lineage?.generation, 2);
  assert.equal(save.kits[0].lineage?.ancestors.length, 2);
  assert.equal(save.stats.generations, 2);
  assert.notEqual(save.kits[0].genes.anatomy, save.player.genes.anatomy);
  assert.equal(family.actors.size, save.kits.length);
  const kit = save.kits[0],
    actor = family.actors.get(kit.id)!;
  assert.ok(actor instanceof RabbitKit && actor instanceof Animal);
  kit.hunger = 20;
  kit.health = 40;
  family.feed();
  assert.equal(save.player.milk, 23);
  assert.equal(kit.hunger, 55);
  assert.equal(actor.health, 46);
  assert.equal(save.pregnancy, null);
});

test('Zustand stores isolate sessions and keep message drafts while HUD state changes', () => {
  const first = createUIStore(() => {}),
    second = createUIStore(() => {});
  first.setState({ message: 'Жди меня у гнезда', settings: true });
  first.setState({ firstPerson: true });
  assert.equal(first.getState().message, 'Жди меня у гнезда');
  assert.equal(second.getState().message, '');
  assert.equal(second.getState().settings, false);
});
