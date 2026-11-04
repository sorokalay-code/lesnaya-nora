import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnimalFactory, PlayerRabbit, RabbitFactory } from '../src/game/animals';
import { AnimalRestraint } from '../src/game/animals/AnimalRestraint';
import { ModelAssets } from '../src/game/ModelAssets';
import { createRabbit, animateRabbit } from '../src/game/Models';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { Genealogy } from '../src/game/genetics/Genealogy';
import { Random } from '../src/game/Random';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { LineageSuccession } from '../src/game/session/LineageSuccession';
import { RabbitFamily } from '../src/game/session/RabbitFamily';
import { FamilyLifecycle } from '../src/game/session/FamilyLifecycle';
import { FamilyCare } from '../src/game/FamilyCare';
import { RabbitReproductiveThreat } from '../src/game/session/RabbitReproductiveThreat';
import { GenomeInheritance } from '../src/game/genetics/GenomeInheritance';
import { HudPresenter } from '../src/ui/presenters/HudPresenter';
import { FoodStore, SeasonSystem } from '../src/game/systems';
import { SaveRepository } from '../src/game/SaveRepository';
import { GameUI } from '../src/ui/GameUI';
import { createUIStore, socialDialogOpen, simulationPaused } from '../src/ui/store';
import { ConversationNavigation } from '../src/ui/ConversationNavigation';
import { DialogView } from '../src/ui/components/Dialogs';
import { InteractionInput } from '../src/game/InteractionInput';
import { GeneticsPresenter } from '../src/ui/presenters/GeneticsPresenter';
import type { KitData } from '../src/game/types';
import type { Excavation } from '../src/game/Excavation';
import type { World } from '../src/game/World';
import type { Soundscape } from '../src/game/Audio';
import { loadModels } from './model-fixture';

await loadModels('rabbit');
const gene = () => ({ ...DEFAULT_GENES, anatomy: { ...DEFAULT_GENES.anatomy } });

function fixture() {
  const save = NewGameFactory.create(892, 0, new RabbitFactory(new Random(892)));
  save.player.genes = gene();
  save.player.name = 'Мама';
  save.player.age = 8;
  save.player.energy = 24;
  const scene = new THREE.Scene(),
    player = new PlayerRabbit(save.player);
  scene.add(player.root);
  const rigs = new Map<number, ReturnType<typeof createRabbit>>();
  const family = {
    rigs,
    add(kit: KitData) {
      const rig = createRabbit(kit.genes, kit.age < 3);
      rig.root.position.set(kit.x ?? kit.homeX, kit.y ?? kit.homeY, kit.z ?? kit.homeZ);
      rig.root.userData.baseY = kit.y ?? kit.homeY;
      rigs.set(kit.id, rig);
      scene.add(rig.root);
    },
    remove(id: number) {
      const rig = rigs.get(id);
      if (rig) {
        ModelAssets.shared.release(rig.root);
        rig.root.removeFromParent();
        rigs.delete(id);
      }
    },
  };
  const daughter: KitData = {
    id: 1,
    name: 'Искорка',
    sex: 'female',
    age: 3.2,
    hunger: 65,
    health: 72,
    alive: true,
    father: 'Пушок',
    homeX: 12,
    homeY: -3,
    homeZ: 4,
    x: 12,
    y: -3,
    z: 4,
    independent: true,
    dirtiness: 47,
    genes: { ...gene(), coat: 'black', tailType: 'drooping', earType: 'lop' },
    lineage: Genealogy.child('child:892:1', [
      { name: 'Мама', lineage: save.player.lineage! },
      { name: 'Пушок', lineage: save.partners[0].lineage! },
    ]),
  };
  save.kits.push(daughter);
  family.add(daughter);
  let safe = true,
    changes = 0;
  const succession = new LineageSuccession({
    save,
    player,
    family,
    earth: { isSheltered: () => true },
    safe: () => safe,
    changed: () => changes++,
    toast: () => {},
  });
  return {
    save,
    player,
    scene,
    family,
    daughter,
    succession,
    changes: () => changes,
    setSafe: (value: boolean) => {
      safe = value;
    },
  };
}

test('управление взрослой дочерью сохраняет мир, родословную, здоровье и ссылки сервисов', () => {
  const f = fixture(),
    { save, player, daughter } = f;
  save.mateId = save.partners[0].id;
  save.partnerCargo = { food: 'carrot', grass: 2, twigs: 1, fur: 0 };
  const root = player.root,
    rig = player.rig,
    state = save.player,
    inventory = save.inventory,
    clock = save.clock;
  const oldLine = save.player.lineage!.id;
  const oldBody = player.root.getObjectByName('Body') as THREE.Mesh;
  const geometry = oldBody.geometry;
  assert.equal(f.succession.switchTo(daughter.id), true);
  assert.equal(player.root, root);
  assert.equal(player.rig, rig);
  assert.equal(save.player, state);
  assert.equal(player.x, 12);
  assert.equal(player.health, 72);
  assert.equal(save.player.lineage?.id, daughter.lineage?.id);
  assert.equal(save.player.genes.tailType, 'drooping');
  assert.equal(save.player.hidden, true);
  assert.equal(save.player.dirtiness, 47);
  assert.equal(save.clock, clock);
  assert.equal(save.inventory, inventory);
  assert.equal(save.inventory.carrot, 1);
  assert.equal(save.materials.twigs, 1);
  assert.equal(save.mateId, undefined);
  assert.equal(f.family.rigs.has(daughter.id), false);
  const mother = save.kits.find((k) => k.lineage?.id === oldLine)!;
  assert.ok(mother.alive && mother.independent);
  assert.equal(mother.condition?.energy, 24);
  assert.equal(RabbitFamily.relationship(save, mother), 'Твоя мать');
  assert.equal(save.kits.length, 1);
  assert.equal(f.changes(), 1);
  assert.equal((player.root.getObjectByName('Body') as THREE.Mesh).geometry, geometry);
  const view = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  view.position.set(12, 1, 10);
  view.lookAt(12, -2, 4);
  ModelAssets.shared.updateView(view);
  animateRabbit(player.rig, 1, true, false, 0.1);
  assert.ok(player.rig.variants!.some((v) => v.activeName));
  assert.equal(player.root.position.y, -3);
});

test('смена героини повторно проверяет возраст, пол, жизнь, беременность и захват', () => {
  const f = fixture();
  f.daughter.age = 2.99;
  assert.equal(f.succession.switchTo(1), false);
  f.daughter.age = 3;
  f.daughter.sex = 'male';
  assert.equal(f.succession.switchTo(1), false);
  f.daughter.sex = 'female';
  f.daughter.health = 0;
  assert.equal(f.succession.switchTo(1), false);
  f.daughter.health = 100;
  f.save.pregnancy = { fatherId: 1, progress: 0.5 };
  assert.equal(f.succession.switchTo(1), false);
  f.save.pregnancy = null;
  f.setSafe(false);
  assert.equal(f.succession.switchTo(1), false);
  f.setSafe(true);
  AnimalRestraint.hold(f.family.rigs.get(1)!.root);
  assert.equal(f.succession.switchTo(1), false);
  AnimalRestraint.release(f.family.rigs.get(1)!.root);
  assert.equal(f.succession.switchTo(1), true);
  assert.equal(f.changes(), 1);
});

test('мутации выбранной дочери продолжают анимироваться после замены модели', () => {
  const f = fixture();
  f.daughter.genes.anatomy.legs = 6;
  f.daughter.genes.anatomy.ears = 3;
  assert.ok(f.succession.switchTo(1));
  for (let i = 0; i < 10; i++) animateRabbit(f.player.rig, i * 0.05, true, false, 0.05);
  for (const variant of f.player.rig.variants!) {
    const copy = variant.root.getObjectByName('PawFL-extra-4')!;
    const source = variant.root.getObjectByName('PawFL')!;
    assert.ok(copy);
    assert.ok(copy.quaternion.angleTo(source.quaternion) < 0.0001);
    const footCopy = copy.getObjectByName('FootFL-extra-4')!;
    const foot = source.getObjectByName('FootFL')!;
    assert.ok(footCopy.position.distanceTo(foot.position) < 0.0001);
  }
});

test('возврат к прежней крольчихе не восполняет её силы, а новое поколение не переиспользует id', () => {
  const f = fixture();
  f.save.player.poison = 19;
  f.save.player.thirst = 28;
  f.succession.switchTo(1);
  const mother = f.save.kits[0];
  assert.ok(RabbitFamily.nextId(f.save) > mother.id);
  assert.equal(f.succession.switchTo(mother.id), true);
  assert.equal(f.save.player.energy, 24);
  assert.equal(f.save.player.poison, 19);
  assert.equal(f.save.player.thirst, 28);
  assert.equal(f.save.kits[0].id, 1);
  assert.equal(f.save.kits[0].name, 'Искорка');
  assert.equal(RabbitFamily.relationship(f.save, f.save.kits[0]), 'Твоя дочь');
});

test('после перехода новорождённые получают пол и родословную третьего поколения', () => {
  const f = fixture();
  f.succession.switchTo(1);
  const earth = { isSheltered: () => true } as Excavation;
  f.save.nests.push({ id: 1, x: 12, y: -3, z: 4, quality: 100 });
  const family = new FamilyLifecycle({
    save: f.save,
    scene: f.scene,
    earth,
    world: { heightAt: () => 0 } as World,
    care: new FamilyCare(f.save, earth),
    rng: new Random(12),
    genetics: new RabbitFactory(new Random(12)),
    sound: { play() {} } as Soundscape,
    temperature: () => 20,
    persist() {},
    toast() {},
    playAction() {},
  });
  f.save.pregnancy = { fatherId: f.save.partners[1].id, progress: 1.3 };
  family.birth();
  const babies = f.save.kits.filter((k) => k.age === 0);
  assert.ok(babies.length >= 2);
  assert.ok(babies.every((k) => k.sex === 'female' || k.sex === 'male'));
  assert.ok(babies.every((k) => k.lineage?.generation === 3));
  assert.ok(babies.every((k) => k.id !== f.save.player.originKitId));
  assert.ok(
    babies.every((k) =>
      k.lineage?.ancestors.some((a) => a.id === f.save.player.lineage!.id && a.distance === 1),
    ),
  );
});

test('беременность после нападения видна вместе с крольчатами и сохраняет родословную отца', () => {
  const f = fixture();
  const { save } = f;
  f.daughter.age = 1;
  const father = save.partners[1];
  father.genes = { ...gene(), anatomy: { ...gene().anatomy, fangs: true } };
  save.mateId = save.partners[0].id;
  const rng = new Random(12);
  const actor = AnimalFactory.rabbit(father, rng);
  let sheltered = true;
  const threat = new RabbitReproductiveThreat(save, {
    sheltered: (point) => point === save.player && sheltered,
    floorAt: (_x, _z, y) => y,
    waterDepthAt: () => 0,
  });
  const player = save.player;
  actor.moveTo(player.x + 5, player.z, player.y);
  assert.equal(threat.update(0.1, 0, [actor], true), undefined);
  assert.equal(threat.view, undefined);
  assert.equal(save.pregnancy, null);

  sheltered = false;
  let time = 0;
  while (time < 400 && !threat.view) threat.update(0.1, (time += 0.1), [actor], true);
  assert.deepEqual(threat.view, { name: father.name, phase: 'warning' });
  assert.equal(actor.x, player.x + 5);
  assert.equal(save.pregnancy, null);
  sheltered = true;
  threat.update(0.1, (time += 0.1), [actor], true);
  assert.equal(threat.view, undefined);
  assert.equal(save.pregnancy, null);

  sheltered = false;
  let ran = false;
  for (let frame = 0; frame < 4000 && !save.pregnancy; frame++) {
    threat.update(0.1, (time += 0.1), [actor], true);
    if (threat.view?.phase === 'chase' && actor.x < player.x + 5) ran = true;
  }
  assert.ok(ran);
  assert.equal(threat.view, undefined);
  assert.deepEqual(save.pregnancy, { fatherId: father.id, progress: 0, trauma: true });
  const careEarth = { isSheltered: () => true } as Excavation;
  const care = new FamilyCare(save, careEarth);
  care.advance(864);
  const world = {
    heightAt: () => 0,
    nearWater: () => false,
    biomeAt: () => 'meadow',
  } as unknown as World;
  const hud = new HudPresenter().build(
    save,
    world,
    { isSheltered: () => false } as Excavation,
    false,
    new FoodStore(save),
    new SeasonSystem(save.seed),
    20,
    0,
  );
  assert.equal(hud.young.length, 1);
  assert.equal(hud.pregnancyProgress, 50);

  save.nests.push({ id: 1, x: player.x, y: player.y, z: player.z, quality: 100 });
  const family = new FamilyLifecycle({
    save,
    scene: f.scene,
    earth: careEarth,
    world,
    care,
    rng,
    genetics: new RabbitFactory(rng),
    sound: { play() {} } as Soundscape,
    temperature: () => 20,
    persist() {},
    toast() {},
    playAction() {},
  });
  family.birth();
  const newborns = save.kits.filter((kit) => kit.age === 0);
  assert.ok(newborns.length >= 2);
  assert.ok(newborns.every((kit) => kit.father === father.name));
  assert.ok(
    newborns.every((kit) =>
      kit.lineage?.ancestors.some((ancestor) => ancestor.id === father.lineage?.id),
    ),
  );
  assert.ok(
    GenomeInheritance.risk(player.genes, father.genes, false, 0.25) >
      GenomeInheritance.risk(player.genes, father.genes),
  );
});

test('выбранная героиня и её семейная история переживают сохранение и загрузку', () => {
  const f = fixture();
  f.succession.switchTo(1);
  let raw = '';
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      setItem: (_key: string, value: string) => {
        raw = value;
      },
      getItem: () => raw,
    },
  });
  try {
    const repository = new SaveRepository();
    repository.store(f.save);
    const restored = repository.load();
    assert.equal(restored.player.originKitId, 1);
    assert.equal(restored.player.name, 'Искорка');
    assert.equal(restored.player.lineage!.generation, 2);
    assert.equal(restored.kits[0].name, 'Мама');
    assert.equal(restored.kits[0].condition?.energy, 24);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('разделы диалога сохраняются при ответе и сбрасываются при смене собеседника; Esc возвращает назад', () => {
  const store = createUIStore(() => {});
  const facade = {
    store,
    get state() {
      return store.getState();
    },
  } as GameUI;
  const f = fixture();
  GameUI.prototype.showDialog.call(facade, { type: 'kit', kit: f.daughter });
  GameUI.prototype.openDialogPage.call(facade, 'profile');
  GameUI.prototype.showDialog.call(facade, { type: 'kit', kit: f.daughter, line: 'Ответ' });
  assert.equal(store.getState().conversationPage, 'profile');
  assert.ok(socialDialogOpen(store.getState()));
  assert.equal(simulationPaused(store.getState()), false);
  GameUI.prototype.openDialogPage.call(facade, 'commands');
  assert.equal(store.getState().conversationPage, 'profile');
  GameUI.prototype.showDialog.call(facade, { type: 'kit', kit: { ...f.daughter, id: 8 } });
  assert.equal(store.getState().conversationPage, 'overview');
  const input = new InteractionInput();
  assert.equal(
    input.action('Escape', {
      playing: true,
      dialogPageOpen: true,
      dialogOpen: true,
      panelsOpen: true,
      mateMenuOpen: false,
      editable: false,
    }),
    'dialog-back',
  );
  assert.equal(ConversationNavigation.allows({ type: 'help' }, 'profile'), false);
});

test('короткое знакомство скрывает полную родословную и подтверждение смены персонажа', () => {
  const f = fixture();
  const data = {
    type: 'kit' as const,
    kit: f.daughter,
    succession: f.succession.offer(f.daughter),
    genetics: GeneticsPresenter.build(f.daughter.genes, f.daughter.lineage),
  };
  const render = (page: 'overview' | 'profile' | 'succession') =>
    renderToStaticMarkup(
      createElement(DialogView, { data, page, onAction() {}, message: '', onMessage() {} }),
    );
  assert.ok(render('overview').includes('Продолжить линию'));
  assert.ok(!render('overview').includes('Играть за Искорка'));
  assert.ok(!render('overview').includes('Известные предки'));
  assert.ok(render('profile').includes('Известные предки'));
  assert.ok(render('profile').includes('Назад'));
  assert.ok(render('succession').includes('data-action="lineage-switch"'));
});
