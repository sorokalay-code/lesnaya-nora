import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_GENES, GeneticTraits } from '../src/game/genetics/GeneticTraits';
import { GenomeInheritance } from '../src/game/genetics/GenomeInheritance';
import { Genealogy } from '../src/game/genetics/Genealogy';
import { GenomeValidation } from '../src/game/genetics/GenomeValidation';
import { CoatDirt } from '../src/game/CoatDirt';
import {
  AnimalFactory,
  RabbitActor,
  RabbitFactory,
  PlayerRabbit,
  createForestAnimal,
} from '../src/game/animals';
import { FangedRabbit } from '../src/game/animals/FangedRabbit';
import { Lynx } from '../src/game/animals/Lynx';
import { Spider } from '../src/game/animals/Spider';
import { PounceAttack } from '../src/game/animals/PounceAttack';
import { WebEscape } from '../src/game/session/WebEscape';
import { createRabbit, animateRabbit, setRabbitAction } from '../src/game/Models';
import { ModelAssets } from '../src/game/ModelAssets';
import { SaveRepository } from '../src/game/SaveRepository';
import { WildlifeEcology } from '../src/game/WildlifeEcology';
import type { World } from '../src/game/World';
import { Random } from '../src/game/Random';
import { SpiderWeb } from '../src/game/SpiderWeb';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { PlayerMovement } from '../src/game/session/PlayerMovement';
import { RabbitPredation } from '../src/game/session/RabbitPredation';
import { AnimalWasteSystem } from '../src/game/session/AnimalWasteSystem';
import { AnimalCollisionSystem } from '../src/game/session/AnimalCollisionSystem';
import { WasteSystem } from '../src/game/systems/WasteSystem';
import { SurvivalSystem } from '../src/game/systems/SurvivalSystem';
import { GeneticsPresenter } from '../src/ui/presenters/GeneticsPresenter';
import { GeneticsPanel } from '../src/ui/components/GeneticsPanel';
import type { Genes } from '../src/game/types';
import type { ViewCamera } from '../src/game/ViewCamera';
import type { Excavation } from '../src/game/Excavation';
import type { Soundscape } from '../src/game/Audio';
import { loadModels } from './model-fixture';

await loadModels('rabbit', 'lynx', 'spider', 'squirrel', 'fox');
const gene = (overrides: Partial<Genes> = {}): Genes => ({
  ...DEFAULT_GENES,
  anatomy: { ...DEFAULT_GENES.anatomy },
  ...overrides,
});
const game = () => NewGameFactory.create(31415, 0, new RabbitFactory(new Random(31468)));
const flat = {
  heightAt: () => 0,
  isSheltered: () => false,
  canMoveTo: () => true,
  floorAt: () => 0,
};

/** Управляемый генератор принудительно вызывает выбранную мутацию для регрессий анатомии. */
class MutationRandom extends Random {
  constructor(private readonly mutation: number) {
    super(1);
  }

  override chance(): boolean {
    return true;
  }

  override int(): number {
    return this.mutation;
  }

  override pick<T>(items: readonly T[]): T {
    return items[0];
  }
}

test('extended genomes inherit deterministically, remain bounded and do not mutate their parents', () => {
  const mother = gene({
    pattern: 'spotted',
    secondaryCoat: 'black',
    eyeColor: 'blue',
    endurance: 5,
  });
  const father = gene({
    pattern: 'piebald',
    secondaryCoat: 'brown',
    eyeColor: 'green',
    immunity: 5,
  });
  const before = JSON.stringify([mother, father]);
  const first = new GenomeInheritance(new Random(42));
  const second = new GenomeInheritance(new Random(42));
  for (let i = 0; i < 300; i++) {
    const child = first.inherit(mother, father);
    assert.deepEqual(child, second.inherit(mother, father));
    assert.ok(GenomeValidation.valid(child));
  }
  assert.equal(JSON.stringify([mother, father]), before);
});

test('poor stability and close kinship increase mutation risk without guaranteeing a harmful result', () => {
  const healthy = gene({ stability: 5, vitality: 5 }),
    poor = gene({ stability: 1, vitality: 1 });
  assert.ok(GenomeInheritance.risk(poor, poor) > GenomeInheritance.risk(healthy, healthy));
  assert.ok(GenomeInheritance.risk(poor, poor, true) > GenomeInheritance.risk(poor, poor));
  assert.ok(GenomeInheritance.risk(healthy, healthy) > 0);
  const absent = new GenomeInheritance(new MutationRandom(0)).inherit(poor, poor);
  const ears = new GenomeInheritance(new MutationRandom(1)).inherit(poor, poor);
  const eyes = new GenomeInheritance(new MutationRandom(2)).inherit(poor, poor);
  const fangs = new GenomeInheritance(new MutationRandom(3)).inherit(poor, poor);
  assert.equal(absent.anatomy.legs, 0);
  assert.equal(ears.anatomy.ears, 0);
  assert.equal(eyes.anatomy.eyes, 0);
  assert.equal(fangs.anatomy.fangs, true);
  assert.equal(fangs.eyeColor, 'red');
});

test('save format five rejects previous versions and incomplete or non-finite genomes without migration', () => {
  const save = game();
  let stored = '';
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (key === 'qa' ? stored || null : null),
      setItem: (key: string, value: string) => {
        if (key === 'qa') stored = value;
      },
    },
  });
  try {
    const repository = new SaveRepository('qa');
    repository.store(save);
    assert.equal(repository.load().version, 5);
    const catalog = JSON.parse(stored) as { slots: { save: Record<string, unknown> }[] };
    catalog.slots[0].save.version = 3;
    stored = JSON.stringify(catalog);
    assert.throws(() => repository.load(), /старой версии/);
    catalog.slots[0].save = {
      ...save,
      player: { ...save.player, genes: { coat: 'cream' } },
    };
    stored = JSON.stringify(catalog);
    assert.throws(() => repository.load(), /повреждённые гены/);
    assert.equal(GenomeValidation.valid(gene({ endurance: Infinity })), false);
    assert.equal(
      GenomeValidation.valid(gene({ anatomy: { legs: -1, ears: 2, eyes: 2, fangs: false } })),
      false,
    );
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('lineage tracks real generations, shared ancestors and a bounded history across saving', () => {
  const mother = Genealogy.founder('mom'),
    father = Genealogy.founder('dad');
  const child = Genealogy.child('child', [
    { name: 'Мама', lineage: mother },
    { name: 'Папа', lineage: father },
  ]);
  const sibling = Genealogy.child('sibling', [{ name: 'Мама', lineage: mother }]);
  assert.equal(child.generation, 2);
  assert.equal(Genealogy.related(child, sibling), true);
  assert.equal(Genealogy.related(child, Genealogy.founder('stranger')), false);
  let latest = child;
  for (let i = 0; i < 20; i++)
    latest = Genealogy.child('descendant-' + i, [
      { name: 'Родитель', lineage: latest },
      { name: 'Другой родитель', lineage: Genealogy.founder('new-' + i) },
    ]);
  assert.equal(latest.generation, 22);
  assert.ok(latest.ancestors.length <= 32);
  assert.ok(latest.ancestors.every((ancestor) => ancestor.distance <= 5));
  const restored = JSON.parse(JSON.stringify(latest)) as typeof latest;
  assert.deepEqual(restored, latest);
  const view = GeneticsPresenter.build(gene(), child, { genes: gene(), lineage: sibling });
  const html = renderToStaticMarkup(createElement(GeneticsPanel, { data: view }));
  assert.match(html, /поколение 2/);
  assert.match(html, /Папа/);
  assert.match(html, /близкое родство/);
});

test('missing and extra organs affect both LODs while copied legs retain animation and shared geometry', () => {
  const absent = createRabbit(gene({ anatomy: { legs: 0, ears: 0, eyes: 0, fangs: false } }));
  const extra = createRabbit(gene({ anatomy: { legs: 6, ears: 4, eyes: 3, fangs: true } }));
  for (const variant of absent.variants!) {
    for (const name of [
      'PawFL',
      'PawFR',
      'PawBL',
      'PawBR',
      'EarL',
      'EarR',
      'EyeL',
      'EyeR',
      'Fangs',
    ])
      assert.equal(variant.root.getObjectByName(name)!.visible, false, name);
  }
  for (const variant of extra.variants!) {
    assert.ok(variant.root.getObjectByName('Fangs')!.visible);
    const eye = variant.root.getObjectByName('Iris') as THREE.Mesh;
    assert.equal((eye.material as THREE.MeshStandardMaterial).color.getHex(), 0xbd3037);
    const copy = variant.root.getObjectByName('PawFL-extra-4')!;
    const source = variant.root.getObjectByName('PawFL')!;
    assert.equal(
      (copy.children[0] as THREE.Mesh).geometry,
      (source.children[0] as THREE.Mesh).geometry,
    );
  }
  setRabbitAction(extra, 'dig', 0, 2);
  animateRabbit(extra, 0.1, false, false, 0.1);
  const near = extra.variants![0].root;
  assert.ok(
    near
      .getObjectByName('PawFL-extra-4')!
      .quaternion.angleTo(near.getObjectByName('PawFL')!.quaternion) < 0.001,
  );
  ModelAssets.shared.release(absent.root);
  ModelAssets.shared.release(extra.root);
});

test('pattern colours belong to one rabbit and grooming restores both fur colours', () => {
  const first = createRabbit(
    gene({ pattern: 'spotted', secondaryCoat: 'black', eyeColor: 'blue' }),
  );
  const other = createRabbit(
    gene({ pattern: 'piebald', secondaryCoat: 'white', eyeColor: 'green' }),
  );
  const material = (first.root.getObjectByName('Body') as THREE.Mesh)
    .material as THREE.MeshStandardMaterial;
  const second = (other.root.getObjectByName('Body') as THREE.Mesh)
    .material as THREE.MeshStandardMaterial;
  assert.equal(material.customProgramCacheKey(), second.customProgramCacheKey());
  const colour = material.userData.geneSecondary as THREE.Color;
  const original = colour.getHex(),
    untouched = second.color.getHex();
  CoatDirt.update(first, 100);
  assert.equal(colour.getHex(), original);
  assert.equal(material.userData.coatDirtLevel.value, 1);
  assert.equal(second.color.getHex(), untouched);
  CoatDirt.update(first, 0);
  assert.equal(colour.getHex(), original);
  ModelAssets.shared.release(first.root);
  ModelAssets.shared.release(other.root);
});

test('legless rabbits cannot walk or jump and low endurance cannot spend energy below zero', () => {
  const save = game();
  save.player.genes = gene({ anatomy: { legs: 0, ears: 2, eyes: 2, fangs: false } });
  const player = new PlayerRabbit(save.player);
  const movement = new PlayerMovement(
    player,
    new Set(['KeyW']),
    { forwardAt: () => ({ x: 0, z: -1 }) } as unknown as ViewCamera,
    flat as unknown as Excavation,
    { play() {} } as unknown as Soundscape,
  );
  assert.equal(movement.move(1, 1, false), false);
  assert.equal(movement.requestJump(1), false);
  assert.equal(player.z, 0);
  save.player.genes = gene({ endurance: 1 });
  save.player.energy = 10;
  assert.equal(movement.requestJump(2), false);
  assert.equal(save.player.energy, 10);
  const data = game().partners[0];
  data.genes = gene({ anatomy: { legs: 0, ears: 2, eyes: 2, fangs: false } });
  const actor = new RabbitActor(data, new Random(1));
  const point = { x: actor.x, z: actor.z };
  actor.update(1, 100, 100, 100, () => 0);
  assert.deepEqual({ x: actor.x, z: actor.z }, point);
});

test('stamina, resilience, immunity, metabolism and cold resistance change actual needs', () => {
  const tick = (genes: Genes) => {
    const save = game();
    save.player.genes = genes;
    save.player.energy = 40;
    save.player.poison = 60;
    save.player.bodyTemp = 37;
    new SurvivalSystem(save, new Random(1)).tick(1, 1, true, -10, false, () => {});
    return save.player;
  };
  const strong = tick(
    gene({ endurance: 5, vitality: 5, immunity: 5, metabolism: 5, coldResistance: 5 }),
  );
  const weak = tick(
    gene({ endurance: 1, vitality: 1, immunity: 1, metabolism: 1, coldResistance: 1 }),
  );
  assert.ok(strong.energy > weak.energy);
  assert.ok(strong.health > weak.health);
  assert.ok(strong.poison < weak.poison);
  assert.ok(strong.hunger > weak.hunger);
  assert.ok(strong.bodyTemp > weak.bodyTemp);
  assert.ok(
    GeneticTraits.mobility(gene({ anatomy: { legs: 3, ears: 1, eyes: 0, fangs: false } })) < 1,
  );
});

test('the lynx opens with an airborne eight-metre pounce and then uses melee without repeated jumps', () => {
  const lynx = new Lynx(0, 0, new Random(1));
  let hits = 0,
    peak = 0;
  for (let i = 0; i < 20; i++) {
    if (lynx.update(0.05, i * 0.05, 7, 0, false, true, () => 0)) hits++;
    peak = Math.max(peak, lynx.root.position.y);
  }
  assert.ok(peak > 1);
  assert.equal(hits, 1);
  assert.ok(lynx.x > 6);
  for (let i = 20; i < 110; i++) {
    if (lynx.update(0.05, i * 0.05, 7, 0, false, true, () => 0)) hits++;
    assert.ok(lynx.root.position.y < 0.15);
  }
  assert.ok(hits >= 2);
});

test('pounce aims at launch position, can miss a dodging target and lands when the chase is interrupted', () => {
  const pounce = new PounceAttack();
  let position = { x: 0, z: 0 },
    step;
  for (let i = 0; i < 20; i++) {
    step = pounce.update(0.05, i < 6, position, { x: i < 3 ? 8 : -8, z: 0 }, () => 0);
    if (step) position = step;
  }
  assert.ok(position.x > 7.9);
  const lynx = new Lynx(0, 0, new Random(1));
  let hits = 0;
  for (let i = 0; i < 24; i++)
    if (lynx.update(0.05, i * 0.05, i < 3 ? 7 : -7, 0, false, true, () => 0)) hits++;
  assert.equal(hits, 0);
});

test('an opening melee bite also spends the lynx opening attack until the chase ends', () => {
  const lynx = new Lynx(0, 0, new Random(1));
  assert.equal(
    lynx.update(0.05, 0, 1, 0, false, true, () => 0),
    true,
  );
  let peak = 0;
  for (let i = 1; i <= 15; i++) {
    lynx.update(0.05, i * 0.05, 7, 0, false, true, () => 0);
    peak = Math.max(peak, lynx.root.position.y);
  }
  assert.ok(peak < 0.15);
});

test('collision resolution keeps a leaping lynx airborne instead of snapping it to terrain', () => {
  const save = game(),
    lynx = new Lynx(0, 0, new Random(1));
  for (let i = 0; i < 8; i++) lynx.update(0.05, i * 0.05, 7, 0, false, true, () => 0);
  const height = lynx.root.position.y;
  assert.ok(height > 0.5 && !lynx.canMelee);
  save.player.x = lynx.x;
  save.player.z = lynx.z;
  save.player.y = 0;
  const collisions = new AnimalCollisionSystem({
    save,
    world: flat,
    earth: flat,
    rabbits: [],
    families: [],
    predators: [lynx],
    wildlife: [],
    family: { rigs: new Map() },
  } as unknown as ConstructorParameters<typeof AnimalCollisionSystem>[0]);
  collisions.resolve();
  assert.equal(lynx.root.position.y, height);
});

test('new lynx GLBs fit budgets, preserve recognisable tufts and animate the opening jump', () => {
  const model = ModelAssets.shared.create('lynx');
  for (const [index, variant] of model.variants!.entries()) {
    let triangles = 0,
      meshes = 0;
    variant.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    assert.ok(triangles <= (index ? 800 : 1800));
    assert.ok(meshes <= 18);
    assert.ok(variant.clips.has('pounce'));
    const leg = variant.root.getObjectByName('LegFL')!;
    variant.mixer!.clipAction(variant.clips.get('pounce')!).play();
    variant.mixer!.update(0.23);
    assert.ok(Math.abs(leg.rotation.x) > 0.3);
  }
});

test('vertical web connects two trees, detects fast crossings and excludes unrelated heights and sides', () => {
  const web = new SpiderWeb({ x: -3, z: 0 }, { x: 3, z: 0 }, () => 0);
  const positions = web.mesh.geometry.attributes.position;
  let high = 0,
    low = Infinity;
  for (let i = 0; i < positions.count; i++) {
    assert.equal(positions.getZ(i), 0);
    high = Math.max(high, positions.getY(i));
    low = Math.min(low, positions.getY(i));
  }
  assert.ok(high > 2.4 && low < 0.2);
  assert.ok((web.mesh.material as THREE.LineBasicMaterial).opacity <= 0.15);
  assert.equal(web.intersects({ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 2 }), true);
  assert.equal(web.intersects({ x: 0, y: -4, z: -2 }, { x: 0, y: -4, z: 2 }), false);
  assert.equal(web.intersects({ x: 5, y: 0, z: -2 }, { x: 5, y: 0, z: 2 }), false);
  assert.equal(web.intersects({ x: 0, y: 4, z: -2 }, { x: 0, y: 4, z: 2 }), false);
});

test('separate physical escape taps still count when rendering advances only a little simulation time', () => {
  const escape = new WebEscape();
  for (let tap = 0; tap < WebEscape.required; tap++) {
    escape.update(0.01);
    assert.equal(escape.press(tap * 0.15), tap === WebEscape.required - 1);
  }
  assert.equal(escape.hits, WebEscape.required);
});

test('spider waits on its host tree and descends visibly before it can bite', () => {
  const spider = new Spider(0, 0, new Random(1));
  spider.configureHabitat({ x: 0, z: 0 }, { x: 5, z: 0 }, () => 0);
  assert.ok(spider.root.position.y > 4);
  spider.alert(1);
  assert.equal(
    spider.update(0.1, 1.1, 0.8, 0, false, true, () => 0),
    false,
  );
  assert.ok(spider.root.position.y > 3.9 && spider.root.position.y < 4.2);
  for (let i = 0; i < 28; i++) {
    spider.alert(1.2 + i * 0.1);
    spider.update(0.1, 1.2 + i * 0.1, 0.8, 0, false, true, () => 0);
  }
  assert.equal(spider.root.position.y, 0);
  assert.ok(spider.attackCooldown > 0);
});

test('ground predators cannot select a spider four metres above them as a melee rival', () => {
  const spider = new Spider(0, 0, new Random(1));
  spider.configureHabitat({ x: 0, z: 0 }, { x: 5, z: 0 }, () => 0);
  const fox = AnimalFactory.predator('fox', 1, 0, new Random(2));
  const ecology = new WildlifeEcology(
    new THREE.Scene(),
    flat as unknown as World,
    new MutationRandom(0),
  );
  assert.equal(ecology.targetFor(fox, [fox, spider], 1), undefined);
});

test('only the mother family keeps visible dirt; unrelated rabbits remain clean', () => {
  const save = game(),
    scene = new THREE.Scene();
  const mate = new RabbitActor(save.partners[0], new Random(1)),
    neighbour = new RabbitActor(save.partners[1], new Random(2));
  save.mateId = mate.data.id;
  mate.moveTo(0, 0, 0);
  neighbour.moveTo(0, 0, 0);
  neighbour.data.dirtiness = 80;
  CoatDirt.update(neighbour.rig, 80);
  const waste = new WasteSystem(scene, save);
  waste.spawn('urine', 0, 0, 0);
  const hygiene = new AnimalWasteSystem({
    scene,
    save,
    waste,
    earth: flat,
    family: { rigs: new Map() },
    rabbits: [mate, neighbour],
    families: [],
    predators: [],
    wildlife: [],
    hawks: [],
  } as unknown as ConstructorParameters<typeof AnimalWasteSystem>[0]);
  hygiene.update(0.5, 1);
  assert.ok((mate.data.dirtiness ?? 0) > 0);
  assert.equal(neighbour.data.dirtiness, undefined);
  assert.equal(neighbour.root.getObjectByName('coat-mud'), undefined);
  assert.equal(
    ((neighbour.root.getObjectByName('Body') as THREE.Mesh).material as THREE.MeshStandardMaterial)
      .userData.coatDirtLevel.value,
    0,
  );
});

test('fanged adults hunt small wildlife and the player, but respect dialogue truce and underground safety', () => {
  const save = game();
  save.player.x = save.player.y = save.player.z = 0;
  const data = save.partners[0];
  data.genes = gene({ anatomy: { legs: 4, ears: 2, eyes: 2, fangs: true } });
  const actor = AnimalFactory.rabbit(data, new Random(1));
  assert.ok(actor instanceof FangedRabbit);
  actor.moveTo(1.7, 0, 0);
  let combat = false,
    hits = 0,
    hidden = false;
  const wildlife = [createForestAnimal('squirrel', 1.8, 0, new Random(2))];
  const health = wildlife[0].health;
  const predation = new RabbitPredation({
    save,
    world: flat,
    earth: { ...flat, isSheltered: () => hidden },
    rabbits: [actor],
    wildlife,
    combatAllowed: () => combat,
    consequences: {
      predatorAttack() {
        hits++;
      },
    },
    toast() {},
  } as unknown as ConstructorParameters<typeof RabbitPredation>[0]);
  predation.update(0.1, 1);
  assert.equal(wildlife[0].health, health);
  combat = true;
  predation.update(0.1, 2);
  assert.ok(wildlife[0].health < health);
  wildlife.length = 0;
  predation.update(0.1, 6);
  assert.equal(hits, 1);
  hidden = true;
  predation.update(0.1, 10);
  assert.equal(hits, 1);
});
