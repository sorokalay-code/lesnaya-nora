import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelAssets } from '../src/game/ModelAssets';
import { createRabbit } from '../src/game/Models';
import { CoatDirt } from '../src/game/CoatDirt';
import { EventJournal } from '../src/game/EventJournal';
import { Random } from '../src/game/Random';
import { RockField } from '../src/game/RockField';
import { WorldChunks } from '../src/game/WorldChunks';
import { RabbitFactory } from '../src/game/animals';
import { Spider } from '../src/game/animals/Spider';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { FamilyGrooming } from '../src/game/session/FamilyGrooming';
import { SessionActions } from '../src/game/session/SessionActions';
import { SpiderEncounter } from '../src/game/session/SpiderEncounter';
import { WebEscape } from '../src/game/session/WebEscape';
import { AnimalWasteSystem } from '../src/game/session/AnimalWasteSystem';
import { DailyWasteBudget } from '../src/game/systems/DailyWasteBudget';
import { WasteSystem } from '../src/game/systems/WasteSystem';
import { JournalLog } from '../src/ui/components/JournalLog';
import { loadModels } from './model-fixture';

await loadModels('rabbit', 'spider', 'rock_granite', 'rock_moss', 'rock_slate');
const game = () => NewGameFactory.create(31415, 0, new RabbitFactory(new Random(31468)));
const genes = game().player.genes;

function stats(root: THREE.Object3D) {
  let meshes = 0,
    triangles = 0;
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
  });
  return { meshes, triangles, materials };
}

test('autonomous waste is limited per animal per absolute day, including reload and sleep jumps', () => {
  const save = game();
  save.clock = 20;
  let budget = new DailyWasteBudget(save, new Random(1));
  assert.equal(budget.ready('rabbit:1'), false);
  assert.equal(budget.ready('rabbit:2'), false);
  save.clock = 300;
  assert.equal(budget.ready('rabbit:1'), true);
  assert.equal(budget.ready('rabbit:1'), false);
  assert.equal(budget.ready('rabbit:2'), true);
  budget = new DailyWasteBudget(JSON.parse(JSON.stringify(save)), new Random(1));
  assert.equal(budget.ready('rabbit:1'), false);
  save.clock += 1440 * 4;
  budget = new DailyWasteBudget(save, new Random(1));
  assert.equal(budget.ready('rabbit:1'), false);
  save.clock += 241;
  assert.equal(budget.ready('rabbit:1'), true);
  assert.equal(budget.ready('rabbit:1'), false);
});

test('journal persists only the last hundred timestamped events and renders newest first', () => {
  const save = game();
  save.messages = [];
  save.clock = 1440 + 425;
  for (let i = 0; i < 110; i++) EventJournal.append(save, 'Событие ' + i);
  assert.equal(save.messages.length, 100);
  assert.equal(save.messages[0], 'День 2, 07:05 · Событие 10');
  const restored = JSON.parse(JSON.stringify(save)) as typeof save;
  const markup = renderToStaticMarkup(createElement(JournalLog, { entries: restored.messages }));
  assert.ok(markup.indexOf('Событие 109') < markup.indexOf('Событие 108'));
  assert.ok(!markup.includes('Событие 0<'));
  assert.ok(markup.includes('100/100'));
});

test('dirty fur changes both LODs independently of other rabbits and restores original colours', () => {
  const rabbit = createRabbit(genes),
    other = createRabbit(genes);
  const colours = (root: THREE.Object3D) => {
    const values: number[] = [];
    root.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.material instanceof THREE.MeshStandardMaterial &&
        object.material.name.startsWith('fur_')
      )
        values.push(object.material.color.getHex());
    });
    return values;
  };
  const original = colours(rabbit.root),
    untouched = colours(other.root);
  CoatDirt.update(rabbit, 85);
  assert.notDeepEqual(colours(rabbit.root), original);
  assert.deepEqual(colours(other.root), untouched);
  for (const variant of rabbit.variants!) {
    assert.equal(variant.root.getObjectByName('coat-mud'), undefined);
    const material = (variant.root.getObjectByName('Body') as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    assert.equal(material.userData.coatDirtLevel.value, 0.85);
  }
  CoatDirt.update(rabbit, 0);
  assert.deepEqual(colours(rabbit.root), original);
  for (const variant of rabbit.variants!)
    assert.equal(
      ((variant.root.getObjectByName('Body') as THREE.Mesh).material as THREE.MeshStandardMaterial)
        .userData.coatDirtLevel.value,
      0,
    );
  ModelAssets.shared.release(rabbit.root);
  ModelAssets.shared.release(other.root);
});

test('mother grooms a nearby partner, pays energy and cannot clean him from afar', () => {
  const save = game(),
    rig = createRabbit(genes),
    mate = save.partners[0];
  save.mateId = mate.id;
  mate.dirtiness = 80;
  rig.root.position.set(save.player.x + 6, save.player.y, save.player.z);
  let persisted = 0;
  const context = {
    save,
    ui: { state: { dialog: undefined } },
    rabbits: [{ data: mate, rig }],
    family: { rigs: new Map() },
    elapsed: () => 10,
    playAction() {},
    persist() {
      persisted++;
    },
    toast() {},
  } as unknown as ConstructorParameters<typeof FamilyGrooming>[0];
  const grooming = new FamilyGrooming(context),
    energy = save.player.energy;
  grooming.execute('mate-groom');
  assert.equal(mate.dirtiness, 80);
  rig.root.position.x = save.player.x + 1;
  CoatDirt.update(rig, 80);
  grooming.execute('mate-groom');
  assert.equal(mate.dirtiness, 0);
  assert.equal(save.player.energy, energy - 3);
  assert.equal(persisted, 1);
  grooming.execute('mate-groom');
  assert.equal(save.player.energy, energy - 3);
  ModelAssets.shared.release(rig.root);
});

test('family contact soils fur between waste scans and ignores waste on another floor', () => {
  const save = game(),
    scene = new THREE.Scene(),
    rig = createRabbit(genes);
  const kit = {
    id: 100,
    name: 'Листик',
    genes,
    age: 1,
    hunger: 20,
    health: 100,
    father: 'Орешек',
    alive: true,
    homeX: 0,
    homeY: -4,
    homeZ: 0,
    x: 0,
    y: -4,
    z: 0,
    dirtiness: 0,
  };
  save.kits = [kit];
  const waste = new WasteSystem(scene, save);
  waste.spawn('urine', 0, 0, 0);
  const hygiene = new AnimalWasteSystem({
    scene,
    save,
    waste,
    earth: { floorAt: () => 0 },
    family: { rigs: new Map([[kit.id, rig]]) },
    rabbits: [],
    families: [],
    wildlife: [],
    predators: [],
    hawks: [],
  } as unknown as ConstructorParameters<typeof AnimalWasteSystem>[0]);
  hygiene.update(0.1, 0);
  assert.equal(kit.dirtiness, 0);
  waste.spawn('pellets', 0, -4, 0);
  hygiene.update(0.1, 0.1);
  assert.ok(kit.dirtiness > 0 && kit.dirtiness < 1);
  assert.equal(rig.root.getObjectByName('coat-mud'), undefined);
  for (let i = 2; i < 8; i++) hygiene.update(0.1, i * 0.1);
  assert.ok(
    ((rig.root.getObjectByName('Body') as THREE.Mesh).material as THREE.MeshStandardMaterial)
      .userData.coatDirtLevel.value > 0,
  );
  ModelAssets.shared.release(rig.root);
});

test('grooming cleans only the selected living child and refreshes its dialog', () => {
  const save = game(),
    rig = createRabbit(genes, true);
  const child = {
    id: 100,
    name: 'Листик',
    genes,
    age: 1,
    hunger: 70,
    health: 100,
    father: 'Орешек',
    alive: true,
    homeX: 0,
    homeY: 0,
    homeZ: 0,
    dirtiness: 75,
  };
  save.kits = [child, { ...child, id: 101, name: 'Лапка' }];
  save.player.x = save.player.y = save.player.z = 0;
  let refreshed = 0;
  const grooming = new FamilyGrooming({
    save,
    ui: {
      state: { dialog: { type: 'kit', kit: child } },
      showDialog() {
        refreshed++;
      },
    },
    rabbits: [],
    family: { rigs: new Map([[child.id, rig]]) },
    elapsed: () => 10,
    playAction() {},
    persist() {},
    toast() {},
  } as unknown as ConstructorParameters<typeof FamilyGrooming>[0]);
  grooming.execute('child-groom');
  assert.equal(child.dirtiness, 0);
  assert.equal(save.kits[1].dirtiness, 75);
  assert.equal(refreshed, 1);
  child.alive = false;
  child.dirtiness = 75;
  grooming.execute('child-groom');
  assert.equal(child.dirtiness, 75);
  ModelAssets.shared.release(rig.root);
});

test('trap routes interact to escape and blocks digging and jumping without opening animal dialogs', () => {
  let presses = 0,
    routed = 0;
  const actions = new SessionActions({
    web: {
      trapped: true,
      struggle() {
        presses++;
      },
    },
    ui: { panelsOpen: false, state: {} },
    refreshHud() {},
    grooming: {
      execute() {
        routed++;
        return true;
      },
    },
  } as unknown as ConstructorParameters<typeof SessionActions>[0]);
  actions.execute('interact');
  actions.execute('struggle');
  for (const command of ['dig', 'dig-down', 'hop']) actions.execute(command);
  assert.equal(presses, 2);
  assert.equal(routed, 0);
});

test('spider GLBs keep an animated near rig and a three-mesh distant silhouette', () => {
  const model = ModelAssets.shared.create('spider');
  assert.equal(model.variants?.length, 2);
  const [near, far] = model.variants!;
  assert.ok(stats(near.root).triangles <= 1600);
  assert.ok(stats(near.root).meshes <= 11);
  assert.ok(stats(far.root).triangles <= 510);
  assert.equal(stats(far.root).meshes, 3);
  for (const variant of model.variants!)
    assert.deepEqual([...variant.clips.keys()].sort(), ['attack', 'idle', 'run', 'spin', 'walk']);
  const leg = near.root.getObjectByName('LegL0')!;
  const rotation = leg.quaternion.clone();
  near.mixer!.clipAction(near.clips.get('run')!).play();
  near.mixer!.update(0.13);
  assert.ok(rotation.angleTo(leg.quaternion) > 0.05);
  far.mixer!.clipAction(far.clips.get('run')!).play();
  far.mixer!.update(0.13);
  assert.ok(far.root.getObjectByName('Spider')!.position.y > 0);
  ModelAssets.shared.release(model.root);
});

test('decorative rocks use tiny GLBs, share batches and respect chunk visibility', () => {
  for (const kind of ['rock_granite', 'rock_moss', 'rock_slate'] as const) {
    const model = ModelAssets.shared.create(kind);
    assert.ok(stats(model.root).triangles <= 50);
    assert.ok(stats(model.root).meshes <= 2);
    ModelAssets.shared.release(model.root);
  }
  const scene = new THREE.Scene(),
    chunks = new WorldChunks(scene);
  new RockField(
    31415,
    chunks,
    () => 3,
    () => true,
  );
  const batches: THREE.InstancedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) batches.push(object);
  });
  assert.ok(batches.length > 0 && batches.every((batch) => !batch.castShadow));
  assert.ok(batches.some((batch) => batch.count > 1));
  const matrix = new THREE.Matrix4();
  batches[0].getMatrixAt(0, matrix);
  assert.ok(Math.abs(matrix.elements[13] - 2.975) < 0.00001);
  chunks.update(0, 0);
  let visible = 0;
  scene.traverseVisible((object) => {
    if (object instanceof THREE.InstancedMesh) visible++;
  });
  assert.ok(visible > 0 && visible < batches.length);
});

test('escape requires thirty distinct taps and ignores same-frame repeated events', () => {
  const escape = new WebEscape();
  assert.equal(escape.press(), false);
  for (let i = 0; i < 30; i++) escape.press();
  assert.equal(escape.hits, 1);
  for (let i = 1; i < WebEscape.required; i++) {
    escape.update(0.12);
    assert.equal(escape.press(), i === WebEscape.required - 1);
  }
  assert.equal(escape.hits, WebEscape.required);
  escape.reset();
  assert.equal(escape.hits, 0);
});

function encounter() {
  const save = game(),
    scene = new THREE.Scene(),
    player = createRabbit(genes);
  const spider = new Spider(0, 0, new Random(1));
  save.player.x = 0.8;
  save.player.z = save.player.y = 0;
  save.player.hidden = false;
  const lines: string[] = [];
  let inputSeconds = 0;
  const traps = new SpiderEncounter({
    inputClock: () => (inputSeconds += 0.12),
    scene,
    save,
    player,
    spiders: [spider],
    world: { heightAt: () => 0 },
    toast: (text: string) => lines.push(text),
  } as ConstructorParameters<typeof SpiderEncounter>[0]);
  return { save, scene, player, spider, lines, traps };
}

test('web gives a grace period, pauses for conversations and calls its spider only at the deadline', () => {
  const { traps, spider, lines } = encounter();
  traps.update(0.1, 1, false);
  assert.equal(traps.trapped, false);
  traps.update(0.1, 1.1, true);
  assert.equal(traps.trapped, true);
  traps.update(9, 10.1, false);
  assert.equal(traps.view()!.danger, false);
  assert.equal(
    spider.update(0.1, 10.1, 0.8, 0, false, true, () => 0),
    false,
  );
  traps.update(8, 18.1, true);
  assert.equal(traps.view()!.danger, true);
  assert.equal(
    spider.update(0.1, 18.1, 0.8, 0, false, true, () => 0),
    true,
  );
  assert.equal(
    spider.update(0.1, 18.2, 0.8, 0, false, true, () => 0),
    false,
  );
  assert.equal(lines.filter((line) => line.includes('приближается')).length, 1);
});

test('escaping breaks the web for four game hours and dead owners release the player', () => {
  const { traps, save, spider } = encounter();
  traps.update(0.1, 1, true);
  for (let i = 0; i < WebEscape.required; i++) {
    traps.update(0.12, 1 + i * 0.12, true);
    traps.struggle();
  }
  assert.equal(traps.trapped, false);
  assert.ok(Object.values(save.webCooldowns!)[0] > save.clock);
  traps.update(0.1, 4, true);
  assert.equal(traps.trapped, false);
  save.clock += 241;
  traps.update(0.1, 5, true);
  assert.equal(traps.trapped, true);
  spider.health = 0;
  traps.update(0.1, 5.1, true);
  assert.equal(traps.trapped, false);
});
