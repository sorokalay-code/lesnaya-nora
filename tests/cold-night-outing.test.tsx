import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { RabbitActor, RabbitFactory } from '../src/game/animals';
import { TUNNEL_FLOOR_DEPTH } from '../src/game/CaveMesher';
import { ColdNightPlan } from '../src/game/ColdNightPlan';
import { Excavation } from '../src/game/Excavation';
import { GroundItems } from '../src/game/GroundItems';
import { PartnerSupport } from '../src/game/PartnerSupport';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { ColdNightActions } from '../src/game/session/ColdNightActions';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import type { DigNode, FoodKind, StashData } from '../src/game/types';
import type { Resource, World } from '../src/game/World';
import { BurrowPresenter } from '../src/ui/presenters/BurrowPresenter';
import { MapPresenter } from '../src/ui/presenters/MapPresenter';
import { createUIStore, simulationPaused } from '../src/ui/store';
import { ColdNightCard } from '../src/ui/widgets/game-menu/ColdNightCard';
import { loadModels } from './model-fixture';

await loadModels('rabbit');

function fixture() {
  const scene = new THREE.Scene();
  const resources: Resource[] = [];
  const world = {
    size: 110,
    heightAt: () => 0,
    rootAt: () => undefined,
    addGroundHole() {},
    biomeAt: () => 'meadow',
    nearWater: () => false,
    treeLocations: [],
    landmarks: [],
    resources,
    harvest(resource: Resource) {
      resource.available = false;
    },
  } as unknown as World;
  const save = NewGameFactory.create(45, 0, new RabbitFactory(new Random(98)), undefined, 'male');
  save.excavation = [
    ...[0.45, -0.3, -1.05, -1.8, -2.55].map((y, index) => ({ x: index * 2, y, z: 0 })),
    { x: 24, y: -2, z: 0 },
  ];
  const floor = (index: number): DigNode => {
    const { x, y, z } = save.excavation[index];
    return { x, y: y - TUNNEL_FLOOR_DEPTH, z };
  };
  const near: StashData = { id: 1, ...floor(2), food: { carrot: 10 } };
  const chosen: StashData = { id: 2, ...floor(4), food: { clover: 7, toadstool: 3 } };
  const sealed: StashData = { id: 3, ...floor(5), food: { clover: 10 } };
  save.stashes.push(near, chosen, sealed);
  const nest = { id: 1, ...floor(3), quality: 1, insulated: undefined as true | undefined };
  save.nests.push(nest, { id: 2, ...floor(5), quality: 1, insulated: true });
  Object.assign(save.player, floor(2));
  const earth = new Excavation(scene, world, save);
  const plan = new ColdNightPlan(save, earth, world.size);
  return { save, plan, earth, world, near, chosen, sealed, nest, resources };
}

test('cold night uses the selected pantry and a warm nest in its own tunnels', () => {
  const { save, plan, earth, chosen, sealed, nest } = fixture();
  assert.equal(plan.start(sealed.id, 'fur'), false);
  assert.equal(plan.start(chosen.id, 'food'), true);
  assert.equal(plan.assignHelper(), false);
  assert.equal(plan.finish(), false, 'food and an insulated nest from other rooms do not count');

  const view = BurrowPresenter.build(save, earth, undefined, plan);
  assert.ok(view.coldNight?.active);
  const html = renderToStaticMarkup(
    <ColdNightCard data={view.coldNight} store={createUIStore(() => {})} />,
  );
  assert.match(html, /Еда 7\/8/);
  assert.match(html, /Отметить место на карте/);
  assert.doesNotMatch(html, /Завершить подготовку/);

  chosen.food.berries = 1;
  save.materials.fur = 6;
  assert.equal(plan.finish(), false, 'available fur is not the installed bedding');
  nest.insulated = true;
  assert.equal(plan.finish(), true);
  assert.equal(save.coldNightOuting, undefined);
});

test('the female partner forages safe food and delivers it to the chosen pantry', () => {
  const { save, plan, earth, world, near, chosen, resources } = fixture();
  const mate = save.partners[0];
  save.mateId = mate.id;
  assert.equal(mate.sex, 'female');
  Object.assign(mate, { x: 5, y: 0, z: 4 });
  const resource = (id: number, kind: FoodKind, x: number) => {
    const plant: Resource = {
      id,
      kind,
      x,
      z: 4,
      available: true,
      mesh: new THREE.Group(),
    };
    resources.push(plant);
    return plant;
  };
  const acorn = resource(1, 'acorn', 5);
  const clover = resource(2, 'clover', 6.5);
  const actor = new RabbitActor(mate, new Random(2));
  const support = new PartnerSupport(
    save,
    world,
    earth,
    new GroundItems(world, save),
    new Random(9),
    undefined,
    plan,
  );
  assert.equal(support.familyStash(), near);
  assert.equal(plan.start(chosen.id, 'fur'), true);
  assert.equal(plan.assignHelper(), true);

  for (let frame = 0; frame < 1200 && save.mateCommand === 'forage'; frame++)
    support.update(actor, 1 / 60, frame / 60, () => 0);

  assert.equal(acorn.available, true);
  assert.equal(clover.available, false);
  assert.equal(chosen.food.clover, 8);
  assert.equal(near.food.clover, undefined);
  assert.equal(save.mateCommand, 'home');
  assert.equal(plan.active?.helperId, undefined);
});

test('a fur order stops when the household has enough fur for bedding', () => {
  const { save, plan, earth, world, chosen, near } = fixture();
  const mate = save.partners[0];
  Object.assign(mate, { x: chosen.x, y: chosen.y, z: chosen.z });
  save.mateId = mate.id;
  save.materials.fur = 5;
  const actor = new RabbitActor(mate, new Random(2));
  actor.root.userData.baseY = chosen.y;
  const support = new PartnerSupport(
    save,
    world,
    earth,
    new GroundItems(world, save),
    new Random(9),
    undefined,
    plan,
  );
  assert.equal(plan.start(chosen.id, 'food'), true);
  assert.equal(plan.assignHelper(), true);
  for (const time of [1, 2, 3, 100]) support.update(actor, 1 / 60, time, () => 0);
  assert.equal(chosen.materials?.fur, 1);
  assert.equal(near.materials, undefined);
  assert.equal(save.mateCommand, 'home');
  assert.equal(plan.active?.helperId, undefined);
});

test('map commands persist a waypoint and helper and leave earlier version-5 saves usable', () => {
  const { save, plan, chosen } = fixture();
  const store = createUIStore(() => {});
  const mapPresenter = new MapPresenter();
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const repository = new SaveRepository('test-cold-night');
    repository.store(save);
    assert.equal(repository.load().coldNightOuting, undefined);
    save.mateId = save.partners[0].id;
    const actions = new ColdNightActions({
      outing: plan,
      ui: {
        get state() {
          return store.getState();
        },
      },
      inspectBurrow() {},
      refreshMap() {
        const journal = store.getState().journal;
        if (journal?.mode === 'map')
          store.setState({
            journal: { mode: 'map', map: { ...journal.map, outing: mapPresenter.outing(save) } },
          });
      },
      persist: () => repository.store(save),
      toast() {},
    });
    store.setState({ gameMenu: 'burrow' });
    actions.execute('cold-night:start:2:food');
    actions.execute('cold-night:assign');
    actions.execute('cold-night:mark:12:18');
    assert.equal(plan.active?.waypoint, undefined, 'marker is writable only from the map');

    store.setState({
      gameMenu: undefined,
      journal: {
        mode: 'map',
        map: {
          size: 110,
          colors: [],
          water: [],
          landmarks: [],
          openings: [],
          player: { x: 0, z: 0, heading: 0 },
          outing: mapPresenter.outing(save),
        },
      },
    });
    assert.equal(simulationPaused(store.getState()), true);
    actions.execute('cold-night:mark:12:18');
    actions.execute('cold-night:mark:130:0');
    const loaded = repository.load();
    assert.deepEqual(mapPresenter.outing(loaded), {
      home: { id: chosen.id, x: chosen.x, z: chosen.z },
      waypoint: { x: 12, z: 18 },
    });
    assert.equal(loaded.coldNightOuting?.helperId, save.mateId);
    actions.execute('cold-night:clear-marker');
    assert.equal(repository.load().coldNightOuting?.waypoint, undefined);

    store.setState({ gameMenu: 'burrow', journal: undefined });
    actions.execute('cold-night:cancel');
    assert.equal(repository.load().coldNightOuting, undefined);
    assert.equal(save.mateCommand, 'home');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
