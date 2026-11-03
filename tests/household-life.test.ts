import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RabbitActor, RabbitFactory, PlayerRabbit, Hawk, AnimalFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { GenomeInheritance } from '../src/game/genetics/GenomeInheritance';
import { GenomeValidation } from '../src/game/genetics/GenomeValidation';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { Excavation } from '../src/game/Excavation';
import { KitWander } from '../src/game/KitWander';
import { KitMovement } from '../src/game/session/KitMovement';
import { PartnerSupport } from '../src/game/PartnerSupport';
import { PartnerCare } from '../src/game/PartnerCare';
import { WasteSystem } from '../src/game/systems/WasteSystem';
import { DailyWasteBudget } from '../src/game/systems/DailyWasteBudget';
import { FamilyGrooming } from '../src/game/session/FamilyGrooming';
import { HawkTargeting } from '../src/game/session/HawkTargeting';
import { HawkVictims } from '../src/game/session/HawkVictims';
import { HawkHunting } from '../src/game/session/HawkHunting';
import { AnimalRestraint } from '../src/game/animals/AnimalRestraint';
import { AnimalSimulation } from '../src/game/session/AnimalSimulation';
import { createRabbit, setRabbitAction } from '../src/game/Models';
import { DialogView } from '../src/ui/components/Dialogs';
import { ConversationNavigation } from '../src/ui/ConversationNavigation';
import type { World } from '../src/game/World';
import type { GroundItems } from '../src/game/GroundItems';
import type { KitData } from '../src/game/types';
import { loadModels } from './model-fixture';

await loadModels('rabbit', 'hawk', 'squirrel');
const genes = () => ({ ...DEFAULT_GENES, anatomy: { ...DEFAULT_GENES.anatomy } });
const game = () => {
  const save = NewGameFactory.create(31415, 0, new RabbitFactory(new Random(31468)));
  save.player.genes = genes();
  return save;
};
function house() {
  const save = game(),
    scene = new THREE.Scene();
  const world = {
    heightAt: () => 0,
    rootAt: () => undefined,
    addGroundHole() {},
    resources: [],
    waterSources: [],
  } as unknown as World;
  save.excavation = [
    ...Array.from({ length: 12 }, (_, i) => ({ x: i * 2, y: -3, z: 0 })),
    { x: 10, y: -3.7, z: 2 },
    { x: 10, y: -4.4, z: 4 },
    { x: 10, y: -5.1, z: 6 },
    { x: 80, y: -3, z: 0 },
  ];
  const earth = new Excavation(scene, world, save);
  save.player.x = 0;
  save.player.y = -3.95;
  save.player.z = 0;
  const stash = { id: 1, x: 0, y: -3.95, z: 0, food: {} };
  save.stashes = [stash];
  const data = save.partners[0];
  data.genes = { ...genes(), cleanliness: 5 };
  data.x = 0;
  data.y = -3.95;
  data.z = 0;
  data.dirtiness = 0;
  save.mateId = data.id;
  save.mateCommand = 'home';
  const actor = new RabbitActor(data, new Random(1));
  actor.moveTo(0, 0, -3.95);
  scene.add(actor.root);
  const rigs = new Map<number, ReturnType<typeof createRabbit>>();
  const waste = new WasteSystem(scene, save, (w) => earth.floorAt(w.x, w.z, w.y));
  const lines: string[] = [];
  const care = new PartnerCare(
    { save, earth, waste, rigs, toast: (line) => lines.push(line) },
    new Random(7),
  );
  const support = new PartnerSupport(
    save,
    world,
    earth,
    { availableBranches: () => [] } as unknown as GroundItems,
    new Random(8),
    care,
  );
  return { save, scene, earth, world, stash, actor, rigs, waste, care, support, lines };
}
function child(): KitData {
  return {
    id: 80,
    name: 'Листик',
    genes: genes(),
    age: 1.2,
    hunger: 90,
    health: 100,
    alive: true,
    father: 'Пушок',
    homeX: 0,
    homeY: -3.95,
    homeZ: 0,
    x: 0,
    y: -3.95,
    z: 0,
    dirtiness: 0,
  };
}

test('чужие отходы возникают примерно на 30% реже и пропуск дня нельзя перебросить', () => {
  const save = game();
  save.clock = 0;
  const budget = new DailyWasteBudget(save, new Random(50));
  for (let id = 0; id < 600; id++) assert.equal(budget.ready('wild:' + id, 0.7), false);
  save.clock = 241;
  let emitted = 0;
  for (let id = 0; id < 600; id++) emitted += Number(budget.ready('wild:' + id, 0.7));
  assert.ok(emitted > 380 && emitted < 460, String(emitted));
  for (let id = 0; id < 600; id++) assert.equal(budget.ready('wild:' + id, 0.7), false);
  const restored = new DailyWasteBudget(JSON.parse(JSON.stringify(save)), new Random(20));
  for (let id = 0; id < 600; id++) assert.equal(restored.ready('wild:' + id, 0.7), false);
});

test('чужие отходы и помёт птицы исчезают за день, семейные остаются три дня', () => {
  const save = game(),
    scene = new THREE.Scene();
  let fertilized = 0;
  const waste = new WasteSystem(
    scene,
    save,
    (w) => w.y,
    () => fertilized++,
  );
  const own = waste.spawn('pellets', 0, 0, 0);
  waste.spawn('urine', 2, 0, 0, 1, 'wild');
  waste.spawn('bird', 4, 0, 0);
  save.clock += 1440;
  waste.update(0, 20, 0, 20);
  assert.deepEqual(
    save.waste.map((w) => w.id),
    [own.id],
  );
  assert.equal(fertilized, 2);
  const reload = new WasteSystem(scene, save);
  save.clock += 2880;
  reload.update(0, 20, 0, 20);
  assert.equal(save.waste.length, 0);
});

test('малыши выбирают дальние комнаты и разные глубины только своей связной норы', () => {
  const { save, earth, world } = house(),
    kit = child(),
    wander = new KitWander(new Random(11));
  const area = earth.roamingFloors(save.player);
  assert.ok(area.length >= 15);
  assert.equal(area, earth.roamingFloors({ x: 22, y: -3.95, z: 0 }));
  assert.notEqual(area, earth.roamingFloors({ x: 80, y: -3.95, z: 0 }));
  const destinations = [];
  for (let i = 0; i < 120; i++) {
    wander.forget(kit.id);
    const point = wander.target(kit, save.player, i, earth, () => 0);
    destinations.push(point);
    assert.ok(point.x < 30 && earth.isSheltered(point.x, point.y, point.z));
  }
  assert.ok(destinations.some((p) => p.x > 16));
  assert.ok(destinations.some((p) => p.y < -5));
  const movement = new KitMovement({ save, earth, world }, new KitWander(new Random(13)));
  const rig = createRabbit(kit.genes, true);
  let far = 0;
  for (let i = 0; i < 2400; i++) {
    movement.update(kit, rig, i * 0.05, 0.05);
    far = Math.max(far, kit.x ?? 0);
  }
  assert.ok(far > 12, 'малыш действительно прошёл дальше радиуса гнезда: ' + far);
});

test('партнёр дома гуляет по ходам, но приказ ждать не превращается в прогулку', () => {
  const { actor, support, save } = house();
  let far = 0;
  for (let i = 0; i < 2000; i++) {
    support.update(actor, 0.05, i * 0.05, () => 0);
    far = Math.max(far, actor.x);
  }
  assert.ok(far > 12, String(far));
  save.mateCommand = 'stay';
  save.mateStay = { x: actor.x, y: Number(actor.root.userData.baseY), z: actor.z };
  const from = actor.root.position.clone();
  for (let i = 2000; i < 2200; i++) support.update(actor, 0.05, i * 0.05, () => 0);
  assert.ok(actor.root.position.distanceTo(from) < 0.01);
});

test('чистоплотный папа подходит к ребёнку и очищает его, затем может убрать отдельную кучку', () => {
  const f = house(),
    kit = child();
  kit.x = 6;
  kit.dirtiness = 80;
  f.save.kits.push(kit);
  const rig = createRabbit(kit.genes, true);
  rig.root.position.set(6, -3.95, 0);
  f.rigs.set(kit.id, rig);
  for (let i = 0; i < 500 && kit.dirtiness; i++) f.support.update(f.actor, 0.05, i * 0.05, () => 0);
  assert.equal(kit.dirtiness, 0);
  assert.ok(f.actor.x > 4);
  assert.ok(f.lines.some((line) => line.includes(kit.name)));
  const mess = f.waste.spawn('pellets', 12, -3.95, 0);
  kit.dirtiness = 80;
  for (let i = 500; i < 1000 && f.save.waste.some((w) => w.id === mess.id); i++)
    f.support.update(f.actor, 0.05, i * 0.05, () => 0);
  assert.ok(!f.save.waste.some((w) => w.id === mess.id));
  assert.ok(f.lines.some((line) => line.includes('убрал нечистоты')));
});

test('партнёр завершает уход перед возвращением к поиску припасов и не перебивает его вырыванием пуха', () => {
  const f = house(),
    kit = child();
  kit.dirtiness = 85;
  f.save.kits.push(kit);
  const rig = createRabbit(kit.genes, true);
  rig.root.position.set(0, -3.95, 0);
  f.rigs.set(kit.id, rig);
  f.care.update(f.actor, f.stash, 0.05, 0, () => 0, true);
  f.save.mateCommand = 'forage';
  for (let i = 1; i < 55; i++) f.support.update(f.actor, 0.05, i * 0.05, () => 0);
  assert.equal(kit.dirtiness, 0);
});

test('ген 1 отключает автоматическую уборку и вылизывание, ген 5 разрешает уход даже на поверхности', () => {
  const f = house();
  f.actor.data.genes.cleanliness = 1;
  f.actor.data.dirtiness = 70;
  const mess = f.waste.spawn('pellets', 0, -3.95, 0);
  for (let i = 0; i < 2000; i++) f.support.update(f.actor, 0.05, i * 0.05, () => 0);
  assert.equal(f.actor.data.dirtiness, 70);
  assert.ok(f.save.waste.some((w) => w.id === mess.id));
  f.actor.data.genes.cleanliness = 5;
  f.actor.moveTo(40, 40, 0);
  f.save.mateCommand = 'stay';
  f.save.mateStay = { x: 40, y: 0, z: 40 };
  for (let i = 2000; i < 2100; i++) f.support.update(f.actor, 0.05, i * 0.05, () => 0);
  assert.equal(f.actor.data.dirtiness, 0);
});

test('автоматический уход не перебивает случку или приём пищи партнёра', () => {
  const f = house();
  f.actor.data.dirtiness = 80;
  setRabbitAction(f.actor.rig, 'mate', f.actor.data.id, 3.1);
  for (let i = 0; i < 20; i++) f.support.update(f.actor, 0.05, i * 0.05, () => 0);
  assert.equal(f.actor.root.userData.action, 'mate');
  assert.equal(f.actor.data.dirtiness, 80);
});

test('чистоплотность генерируется, наследуется и проверяется при загрузке генома', () => {
  const generated = new Set(
    Array.from({ length: 100 }, (_, i) => new RabbitFactory(new Random(i + 1)).genes().cleanliness),
  );
  assert.equal(generated.size, 5);
  for (let i = 0; i < 40; i++) {
    const inherited = new GenomeInheritance(new Random(i + 1)).inherit(
      { ...genes(), cleanliness: 1 },
      { ...genes(), cleanliness: 5 },
    );
    assert.ok(
      Number.isInteger(inherited.cleanliness) &&
        inherited.cleanliness! >= 1 &&
        inherited.cleanliness! <= 5,
    );
  }
  for (const value of [0, 6, 2.5, '5', null])
    assert.equal(GenomeValidation.valid({ ...genes(), cleanliness: value }), false);
});

test('ручной уход за ребёнком и партнёром работает в поле, в том числе через обычную беседу', () => {
  const save = game();
  save.player.genes.cleanliness = 1;
  save.player.x = 20;
  save.player.y = 4;
  save.player.z = 20;
  const kit = { ...child(), x: 21, y: 4, z: 20, dirtiness: 90 };
  save.kits = [kit];
  const rig = createRabbit(kit.genes, true);
  rig.root.position.set(21, 4, 20);
  const mate = new RabbitActor(save.partners[0], new Random(5));
  mate.moveTo(20, 21, 4);
  mate.data.dirtiness = 80;
  save.mateId = mate.data.id;
  let dialog: Parameters<typeof DialogView>[0]['data'] = { type: 'kit', kit };
  const cleaner = new FamilyGrooming({
    save,
    rabbits: [mate],
    family: { rigs: new Map([[kit.id, rig]]) },
    elapsed: () => 4,
    ui: {
      get state() {
        return { dialog };
      },
      showDialog(next) {
        dialog = next;
      },
    },
    playAction() {},
    persist() {},
    toast() {},
  } as unknown as ConstructorParameters<typeof FamilyGrooming>[0]);
  cleaner.execute('child-groom');
  assert.equal(kit.dirtiness, 0);
  dialog = { type: 'partner', partner: mate.data, paired: true, score: 100 };
  cleaner.execute('mate-groom');
  assert.equal(mate.data.dirtiness, 0);
  assert.ok(ConversationNavigation.allows(dialog, 'care'));
  const html = renderToStaticMarkup(
    createElement(DialogView, {
      data: dialog,
      page: 'care',
      message: '',
      onMessage() {},
      onAction() {},
    }),
  );
  assert.ok(html.includes('mate-groom') && html.includes('в любом месте'));
  mate.moveTo(40, 40, 4);
  mate.data.dirtiness = 80;
  cleaner.execute('mate-groom');
  assert.equal(mate.data.dirtiness, 80);
});

function hunting() {
  const save = game(),
    player = new PlayerRabbit(save.player),
    hawk = new Hawk(0, 0, new Random(4));
  const squirrel = AnimalFactory.forest('squirrel', 0, 7, new Random(7));
  let covered = false;
  const lines: string[] = [];
  const context = {
    save,
    player: player.rig,
    rabbits: [],
    families: [],
    wildlife: [squirrel],
    predators: [],
    hawks: [hawk],
    world: { heightAt: () => 0, hasCover: () => covered },
    earth: { floorAt: () => 0, isSheltered: () => false },
    toast: (line: string) => lines.push(line),
  };
  return {
    save,
    player,
    hawk,
    squirrel,
    context,
    lines,
    cover: () => {
      covered = true;
    },
    hunting: new HawkHunting(context),
  };
}

test('сокол чаще выбирает игрока, но очень близкая ослабленная добыча остаётся приоритетной', () => {
  const f = hunting();
  f.save.player.x = 8;
  f.player.root.position.x = 8;
  const victims = [...new HawkVictims(f.context).all()],
    targeting = new HawkTargeting();
  assert.equal(targeting.choose(victims, f.hawk, () => true)?.player, true);
  f.squirrel.moveTo(1, 0, 0);
  f.squirrel.health = 2;
  assert.equal(targeting.choose(victims, f.hawk, () => true)?.player, false);
});

test('сокол ненадолго преследует игрока за пределами радиуса пикирования, а кроны прерывают охоту', () => {
  const f = hunting();
  f.context.wildlife.length = 0;
  f.save.player.x = 23;
  f.player.root.position.x = 23;
  f.hunting.update(0.2, 0.2, true);
  assert.ok(f.hawk.x > 0, 'полетел к игроку вместо случайного маршрута');
  f.cover();
  for (let t = 0.3; t < 5; t += 0.1) f.hunting.update(0.1, t, true);
  assert.equal(f.hunting.busy, false);
  assert.equal(f.save.player.health, 100);
  assert.equal(AnimalRestraint.active(f.player.root), false);
});

test('захват посторонней добычи не создаёт уведомления, а захват члена семьи сообщает его имя', () => {
  const f = hunting();
  f.save.player.x = 70;
  f.player.root.position.x = 70;
  f.squirrel.moveTo(0, 0, 0);
  for (let t = 0; t < 6; t += 0.05) f.hunting.update(0.05, t, true);
  assert.equal(f.lines.length, 0);
  const g = hunting();
  g.context.wildlife.length = 0;
  g.save.player.x = 70;
  g.player.root.position.x = 70;
  const actor = new RabbitActor(g.save.partners[0], new Random(3));
  actor.moveTo(0, 0, 0);
  g.save.mateId = actor.data.id;
  const engine = new HawkHunting({ ...g.context, rabbits: [actor] });
  for (let t = 0; t < 6; t += 0.05) engine.update(0.05, t, true);
  assert.ok(g.lines.some((line) => line.includes(actor.data.name)));
});

test('погоня сокола ограничена по времени и сменяется свободным полётом, если игрок убегает', () => {
  const f = hunting();
  f.context.wildlife.length = 0;
  for (let t = 0; t < 1; t += 0.1) {
    f.save.player.x = 23 + t * 7;
    f.player.root.position.x = f.save.player.x;
    f.hunting.update(0.1, t, true);
  }
  assert.ok(f.hawk.x > 5);
  assert.ok(Math.abs(f.hawk.z) < 0.01);
  for (let t = 1; t < 8; t += 0.1) {
    f.save.player.x = 23 + t * 7;
    f.player.root.position.x = f.save.player.x;
    f.hunting.update(0.1, t, true);
  }
  assert.ok(Math.abs(f.hawk.z) > 0.1, 'после короткой погони сокол вернулся к патрулю');
  assert.equal(f.hunting.busy, false);
});

test('экология продолжает обновляться, но чужие нападения и драки не публикуются в уведомления', () => {
  const save = game(),
    lines: string[] = [];
  let updates = 0;
  const engine = new AnimalSimulation({
    save,
    player: createRabbit(save.player.genes),
    rabbits: [],
    families: [],
    wildlife: [],
    predators: [],
    hawks: [],
    world: { heightAt: () => 0 },
    earth: { isSheltered: () => false },
    rng: new Random(1),
    state: {},
    groundAt: () => 0,
    ecology: {
      update() {
        updates++;
        return [
          { kind: 'hunt', x: 0, z: 0, subject: 'белку' },
          { kind: 'defend', x: 0, z: 0, subject: 'олень' },
          { kind: 'fight', x: 0, z: 0, subject: 'волк' },
        ];
      },
    },
    collisions: { resolve() {} },
    traffic: { update: () => [] },
    toast: (line: string) => lines.push(line),
  } as unknown as ConstructorParameters<typeof AnimalSimulation>[0]);
  engine.update(0.05, 1, false);
  assert.equal(updates, 1);
  assert.deepEqual(lines, []);
});
