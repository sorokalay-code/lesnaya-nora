import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { FamilyMember, RabbitActor, RabbitFactory } from '../src/game/animals';
import { FEMALE_RABBIT_NAMES, MALE_RABBIT_NAMES } from '../src/game/animals/RabbitFactory';
import { Excavation } from '../src/game/Excavation';
import { FamilyCare } from '../src/game/FamilyCare';
import { GroundItems } from '../src/game/GroundItems';
import { KitWander } from '../src/game/KitWander';
import { MODEL_NAMES } from '../src/game/ModelAssets';
import { PartnerSupport } from '../src/game/PartnerSupport';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { FoodStore } from '../src/game/systems';
import type { PartnerTraits, SaveData } from '../src/game/types';
import type { Resource, World } from '../src/game/World';
import { DialogView } from '../src/ui/components/Dialogs';
import { loadModels } from './model-fixture';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';

await loadModels(...MODEL_NAMES);

const genes = { ...DEFAULT_GENES, coat: 'cream' as const, ear: 1, speed: 3, vitality: 3, size: 1 };
const partner: PartnerTraits = {
  id: 1,
  name: 'Пушок',
  x: 0,
  z: 0,
  genes,
  preference: 'bond',
  temperament: 'заботливый',
  trust: 80,
  familySize: 2,
};
function save(): SaveData {
  return {
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
      hunger: 90,
      thirst: 90,
      bodyTemp: 38,
      energy: 90,
      bladder: 0,
      bowel: 0,
      health: 30,
      age: 0,
      hidden: true,
      dirtiness: 0,
      poison: 0,
      milk: 30,
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
    nests: [{ id: 1, x: 0, y: -1, z: 0, quality: 1 }],
    stashes: [{ id: 1, x: 0, y: 0, z: 0, food: {}, materials: { grass: 0, twigs: 0, fur: 0 } }],
    materials: { grass: 0, twigs: 0, fur: 0 },
    excavation: [],
    kits: [],
    partners: [partner],
    harvested: [],
    pregnancy: { fatherId: 1, progress: 0.88 },
    stats: { births: 0, grown: 0, survived: 0, generations: 1 },
  };
}

test('birth warning precedes delivery, and only an underground nest is a valid birthplace', () => {
  const data = save(),
    earth = { isSheltered: (_x: number, y: number) => y < -0.2 } as Excavation;
  const care = new FamilyCare(data, earth);
  assert.equal(care.advance(40), 'warning');
  assert.equal(care.birthNest()?.id, 1);
  assert.equal(care.advance(500), 'birth');
  data.player.y = 0;
  assert.equal(care.birthNest(), undefined);
  data.player.y = -1;
  data.nests[0].y = 0;
  assert.equal(care.birthNest(), undefined);
});

test('sleep-sized time jumps cannot skip the birth warning', () => {
  const data = save(),
    care = new FamilyCare(data, { isSheltered: () => true } as unknown as Excavation);
  data.pregnancy!.progress = 1.1;
  assert.equal(care.advance(330), 'warning');
  assert.ok(data.pregnancy!.progress < 1.2);
  assert.equal(care.advance(40), 'birth');
});

test('fallen branches can be gathered, return later, and discarded food remains collectible', () => {
  const data = save(),
    scene = new THREE.Scene();
  const world = {
    treeLocations: [{ x: 5, z: 5 }],
    chunks: { add: (mesh: THREE.Object3D) => scene.add(mesh) },
    heightAt: () => 0,
  } as unknown as World;
  const items = new GroundItems(world, data);
  const branch = items.availableBranches(5, 5, 4)[0];
  assert.ok(branch);
  assert.equal(items.takeBranch(branch.id, data.clock), true);
  assert.equal(items.availableBranches(5, 5, 4).length, 0);
  items.update(data.clock + 2880);
  assert.equal(items.availableBranches(5, 5, 4).length, 1);
  const drop = items.drop('carrot', 0, 0, 0);
  assert.equal(items.nearest(0, 0, 0)?.id, drop.id);
  assert.equal(items.collect(drop, data.clock), true);
  assert.equal(data.drops?.length, 0);
  const twig = items.drop('twigs', 0, 0, 0);
  assert.equal(items.nearest(0, 0, 0)?.kind, 'twigs');
  assert.equal(items.collect(twig, data.clock), true);
});

test('damaged current saves do not silently fill missing family data', () => {
  const data = save();
  delete data.drops;
  const previous = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => JSON.stringify(data) };
  assert.throws(() => new SaveRepository('test').load(), /повреждено/);
  (globalThis as { localStorage?: unknown }).localStorage = previous;
});

test('partner physically collects food and deposits it in the family stash', () => {
  const data = save(),
    scene = new THREE.Scene();
  data.player.y = 0;
  data.stashes[0].y = -1;
  const resource = {
    id: 1,
    x: 0.5,
    z: 0,
    kind: 'clover',
    available: true,
    mesh: new THREE.Group(),
  } as Resource;
  const world = {
    resources: [resource],
    treeLocations: [],
    chunks: { add: (mesh: THREE.Object3D) => scene.add(mesh) },
    heightAt: () => 0,
    harvest: (r: Resource) => {
      r.available = false;
    },
  } as unknown as World;
  const earth = {
    nextStep: () => undefined,
    route: (_from: unknown, to: unknown) => [to],
    revision: 0,
    canMoveTo: () => true,
    floorAt: () => 0,
    isSheltered: (_x: number, y: number) => y < -0.2,
  } as unknown as Excavation;
  const items = new GroundItems(world, data),
    actor = new RabbitActor(partner, new Random(2));
  const support = new PartnerSupport(data, world, earth, items, new Random(3));
  support.update(actor, 0.5, 1, () => 0);
  assert.equal(resource.available, false);
  assert.equal(data.stashes[0].food.clover, undefined);
  support.update(actor, 0.5, 2, () => 0);
  assert.equal(data.stashes[0].food.clover, 1);
  assert.equal(data.stashes[0].materials?.grass, 1);
  assert.equal(data.stashes[0].materials?.fur, 1);
  assert.equal(new FoodStore(data).withdraw(data.stashes[0]), 3);
  assert.equal(data.materials.fur, 1);
  assert.equal(data.inventory.clover, 1);
});

test('partner can return from the surface to an underground family nest', () => {
  const data = save();
  data.excavation = [{ x: 0, y: -0.5, z: 0 }];
  const world = {
    heightAt: () => 0,
    addGroundHole: () => {},
    rootAt: () => undefined,
  } as unknown as World;
  const earth = new Excavation(new THREE.Scene(), world, data);
  const mate = { ...partner, x: 3, z: 0 },
    actor = new RabbitActor(mate, new Random(9));
  actor.rig.root.userData.baseY = 0;
  for (let frame = 0; frame < 240; frame++)
    actor.navigateMate(1 / 60, frame / 60, { x: 0, y: -0.5, z: 0 }, earth, () => 0);
  assert.ok(Math.hypot(actor.data.x, actor.data.z) < 0.8);
  assert.ok((actor.rig.root.userData.baseY as number) < -0.2);
  for (let frame = 240; frame < 480; frame++)
    actor.navigateMate(1 / 60, frame / 60, { x: 5, y: 0, z: 0 }, earth, () => 0);
  assert.ok(actor.data.x > 3);
  assert.ok((actor.rig.root.userData.baseY as number) > -0.1);
});

test('partner chooses the closest existing underground stash instead of a surface stash', () => {
  const data = save();
  const surface = data.stashes[0];
  const far = { id: 2, x: 20, y: -2, z: 0, food: {} };
  const near = { id: 3, x: 3, y: -2, z: 0, food: {} };
  data.stashes.push(far, near);
  const earth = { isSheltered: (_x: number, y: number) => y < 0 } as Excavation;
  const support = new PartnerSupport(data, {} as World, earth, {} as GroundItems, new Random(3));
  assert.equal(support.familyStash(), near);
  assert.notEqual(support.familyStash(), surface);
  data.player.x = 18;
  assert.equal(support.familyStash(), far);
  assert.equal(data.stashes.length, 3);
});

test('without underground storage partner follows mother and keeps cargo without creating a stash', (t) => {
  const data = save();
  data.mateCommand = 'forage';
  data.partnerCargo = { food: 'clover', grass: 1, twigs: 2, fur: 1 };
  const before = structuredClone(data.stashes);
  const cargo = structuredClone(data.partnerCargo);
  const earth = { isSheltered: () => false } as Excavation;
  const actor = new RabbitActor({ ...partner }, new Random(2));
  const targets: object[] = [];
  t.mock.method(actor, 'navigateMate', (_dt: number, _time: number, target: object) => {
    targets.push(target);
    return true;
  });
  const support = new PartnerSupport(data, {} as World, earth, {} as GroundItems, new Random(3));
  for (let frame = 0; frame < 120; frame++) support.update(actor, 1 / 60, frame / 60, () => 0);
  assert.equal(data.mateCommand, 'follow');
  assert.ok(targets.every((target) => target === data.player));
  assert.deepEqual(data.stashes, before);
  assert.deepEqual(data.partnerCargo, cargo);

  data.mateCommand = 'home';
  support.update(actor, 1 / 60, 3, () => 0);
  assert.equal(data.mateCommand, 'follow');
  data.mateCommand = 'stay';
  data.mateStay = { x: 7, y: 0, z: 5 };
  support.update(actor, 1 / 60, 4, () => 0);
  assert.equal(targets.at(-1), data.mateStay);
  assert.equal(data.mateCommand, 'stay');
});

test('other rabbits spread out and kits choose individual tunnel destinations', () => {
  const a = new FamilyMember(partner, genes, 0, false),
    b = new FamilyMember(partner, genes, 1, false);
  a.update(1, 0.1, () => 0);
  b.update(1, 0.1, () => 0);
  assert.ok(
    Math.hypot(
      a.rig.root.position.x - b.rig.root.position.x,
      a.rig.root.position.z - b.rig.root.position.z,
    ) > 3,
  );
  const kit = {
    id: 1,
    age: 0.2,
    x: 0,
    y: -1,
    z: 0,
    homeX: 0,
    homeY: -1,
    homeZ: 0,
  } as SaveData['kits'][number];
  const earth = {
    floorAt: () => -1,
    isSheltered: (x: number, y: number, z: number) => y < 0 && Math.hypot(x, z) < 3.5,
    canMoveTo: () => true,
  } as unknown as Excavation;
  const wander = new KitWander(new Random(15)),
    home = { x: 0, y: -1, z: 0 };
  const first = wander.target(kit, home, 1, earth, () => 0);
  assert.ok(Math.hypot(first.x, first.z) > 0.4);
  assert.deepEqual(
    wander.target(kit, home, 2, earth, () => 0),
    first,
  );
  assert.equal(earth.isSheltered(first.x, first.y, first.z), true);
});

test('family and wild rabbits receive names from the set matching their sex', () => {
  const female = new FamilyMember(partner, genes, 0, false).data;
  const male = new FamilyMember(partner, genes, 1, false).data;

  assert.equal(female.sex, 'female');
  assert.ok(FEMALE_RABBIT_NAMES.includes(female.name));
  assert.equal(male.sex, 'male');
  assert.ok(MALE_RABBIT_NAMES.includes(male.name));
  assert.ok(FEMALE_RABBIT_NAMES.length >= 20);
  assert.ok(MALE_RABBIT_NAMES.length >= 20);

  const partners = new RabbitFactory(new Random(17)).partners(20);
  assert.ok(
    partners.every((rabbit) =>
      (rabbit.sex === 'female' ? FEMALE_RABBIT_NAMES : MALE_RABBIT_NAMES).includes(rabbit.name),
    ),
  );
});

test('partner panel exposes commands and escapes typed messages', () => {
  const data = save();
  data.mateId = 1;
  data.mateMessages = [{ from: 'player', text: '<script>hello</script>', clock: 420 }];
  const render = (page: 'commands' | 'chat') =>
    renderToStaticMarkup(
      createElement(DialogView, {
        data: {
          type: 'mate',
          partner,
          command: data.mateCommand ?? 'forage',
          messages: data.mateMessages ?? [],
        },
        page,
        message: '',
        onMessage: () => {},
        onAction: () => {},
      }),
    );
  const commands = render('commands'),
    html = render('chat');
  assert.match(commands, /mate-command:follow/);
  assert.match(commands, /mate-command:stay/);
  assert.match(commands, /mate-command:forage/);
  assert.match(html, /mate-send/);
  assert.match(html, /&lt;script&gt;hello&lt;\/script&gt;/);
  assert.equal(html.includes('<script>'), false);
  assert.deepEqual(FamilyCare.growth({ age: 1, hunger: 20 } as SaveData['kits'][number]), {
    progress: 33,
    daysLeft: 2,
    feedsNeeded: 3,
    food: 'молоко или овощи',
  });
});
