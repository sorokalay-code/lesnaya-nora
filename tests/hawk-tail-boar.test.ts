import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Hawk, PlayerRabbit, RabbitFactory, AnimalFactory } from '../src/game/animals';
import { AnimalRestraint } from '../src/game/animals/AnimalRestraint';
import { HawkCarry } from '../src/game/animals/HawkCarry';
import { HawkHunting } from '../src/game/session/HawkHunting';
import { HawkVictims } from '../src/game/session/HawkVictims';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { PlayerMovement } from '../src/game/session/PlayerMovement';
import { SessionInterface } from '../src/game/session/SessionInterface';
import { SessionActions } from '../src/game/session/SessionActions';
import { RabbitActor, FamilyMember } from '../src/game/animals';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { GenomeInheritance } from '../src/game/genetics/GenomeInheritance';
import { GenomeValidation } from '../src/game/genetics/GenomeValidation';
import { TAIL_TYPES } from '../src/game/genetics/RabbitFeatures';
import { createRabbit, animateRabbit } from '../src/game/Models';
import { CoatDirt } from '../src/game/CoatDirt';
import { CoatDirtTexture } from '../src/game/CoatDirtTexture';
import { Random } from '../src/game/Random';
import type { Excavation } from '../src/game/Excavation';
import type { ViewCamera } from '../src/game/ViewCamera';
import type { Soundscape } from '../src/game/Audio';
import type { ModelInstance } from '../src/game/ModelAssets';
import { loadModels } from './model-fixture';

await loadModels('rabbit', 'hawk', 'boar', 'squirrel');
const genes = () => ({ ...DEFAULT_GENES, anatomy: { ...DEFAULT_GENES.anatomy } });
const flat = { heightAt: () => 0, hasCover: () => false };
const earth = { floorAt: () => 0, isSheltered: () => false };

function scenario() {
  const save = NewGameFactory.create(120, 0, new RabbitFactory(new Random(120)));
  save.player.genes = genes();
  const player = new PlayerRabbit(save.player);
  const hawk = new Hawk(0, 0, new Random(9));
  let resets = 0;
  const context = {
    save,
    player: player.rig,
    rabbits: [],
    families: [],
    wildlife: [],
    predators: [],
    hawks: [hawk],
    world: flat,
    earth,
    toast: () => {},
    resetInput: () => resets++,
  };
  return { save, player, hawk, context, resets: () => resets, hunting: new HawkHunting(context) };
}

test('сокол поднимает крольчиху, запрещает движение и наносит урон только при падении', () => {
  const s = scenario();
  let time = 0;
  while (!s.hunting.busy && time < 4) {
    time += 0.05;
    s.hunting.update(0.05, time, true);
  }
  assert.ok(s.hunting.busy);
  assert.ok(AnimalRestraint.active(s.player.root));
  assert.equal(s.save.player.health, 100);
  const movement = new PlayerMovement(
    s.player,
    new Set(['KeyW']),
    {} as ViewCamera,
    earth as Excavation,
    {} as Soundscape,
  );
  s.hunting.update(1, time + 1, true);
  const held = { ...s.save.player };
  assert.ok(held.y > 3);
  assert.equal(movement.requestJump(time), false);
  assert.equal(movement.move(1, time, false), false);
  movement.settle(1);
  assert.equal(s.save.player.y, held.y);
  assert.equal(s.save.player.x, held.x);
  s.hunting.update(1, time + 2, false);
  assert.equal(s.save.player.y, held.y, 'разговор приостанавливает захват');
  let maxY = held.y,
    fell = false;
  for (let i = 0; s.hunting.busy && i < 90; i++) {
    time += 0.05;
    s.hunting.update(0.05, time, true);
    maxY = Math.max(maxY, s.save.player.y);
    fell ||= s.hunting.playerView?.phase === 'fall';
    assert.equal(s.player.root.position.y, s.save.player.y);
    if (s.hunting.busy) assert.equal(s.save.player.health, 100);
  }
  assert.ok(fell && maxY >= 5.99);
  assert.equal(s.hunting.busy, false);
  assert.equal(s.save.player.y, 0);
  assert.ok(s.save.player.health < 100 && s.save.player.health > 65);
  assert.equal(AnimalRestraint.active(s.player.root), false);
  assert.equal(s.resets(), 2);
});

test('гибель сокола начинает падение с текущей высоты', () => {
  const s = scenario();
  let time = 0;
  while (!s.hunting.busy && time < 4) s.hunting.update(0.05, (time += 0.05), true);
  s.hunting.update(1, (time += 1), true);
  const height = s.save.player.y;
  s.hawk.health = 0;
  s.hunting.update(0.05, (time += 0.05), true);
  assert.equal(s.hunting.playerView?.phase, 'fall');
  assert.ok(s.save.player.y > 0 && s.save.player.y < height);
  for (let i = 0; s.hunting.busy && i < 40; i++) s.hunting.update(0.05, (time += 0.05), true);
  assert.equal(s.save.player.y, 0);
  assert.ok(s.save.player.health < 100);
});

test('сокол охотится на мелких соседей, кабана поднять нельзя; укрытие защищает', () => {
  const s = scenario();
  s.save.player.x = 60;
  s.player.root.position.x = 60;
  const squirrel = AnimalFactory.forest('squirrel', 0, 0, new Random(8));
  squirrel.health = 10;
  const boar = AnimalFactory.forest('boar', 0, 0, new Random(2));
  const context = { ...s.context, wildlife: [squirrel, boar] };
  const names = [...new HawkVictims(context).all()].map((v) => v.name);
  assert.ok(names.includes('Белка'));
  assert.ok(!names.includes('Кабан'));
  const hunt = new HawkHunting(context);
  let wasHeld = false;
  for (let time = 0.05; time < 6; time += 0.05) {
    hunt.update(0.05, time, true);
    if (AnimalRestraint.active(squirrel.root)) {
      wasHeld = true;
      const y = squirrel.root.position.y;
      squirrel.update(1, time, () => 0, []);
      assert.equal(squirrel.root.position.y, y);
    }
  }
  assert.ok(wasHeld);
  assert.equal(squirrel.alive, false);
  assert.equal(squirrel.root.visible, false);
  assert.equal(boar.health, boar.maxHealth);
  const covered = scenario();
  const protectedHunt = new HawkHunting({
    ...covered.context,
    world: { ...flat, hasCover: () => true },
  });
  for (let t = 0; t < 8; t += 0.05) protectedHunt.update(0.05, t, true);
  assert.equal(protectedHunt.busy, false);
  assert.equal(covered.save.player.health, 100);
});

test('смена героини отменяет охоту на удалённый NPC до захвата', () => {
  const s = scenario();
  s.save.player.x = 60;
  s.player.root.position.x = 60;
  const squirrel = AnimalFactory.forest('squirrel', 0, 0, new Random(8));
  const context = { ...s.context, wildlife: [squirrel] };
  const hunting = new HawkHunting(context);
  hunting.update(0.1, 0.1, true);
  context.wildlife.length = 0;
  hunting.resetTargets();
  for (let t = 0.2; t < 5; t += 0.05) hunting.update(0.05, t, true);
  assert.equal(AnimalRestraint.active(squirrel.root), false);
  assert.equal(squirrel.health, squirrel.maxHealth);
  assert.equal(hunting.busy, false);
});

test('падение использует высоту места приземления, а не точки захвата', () => {
  const carry = new HawkCarry({ x: 0, y: 3, z: 0 }, 0, 0.8);
  let result = carry.update(0, () => 0);
  for (let i = 0; i < 100 && !result.landed; i++) result = carry.update(0.05, () => 1);
  assert.ok(result.landed);
  assert.equal(result.y, 1);
  assert.equal(result.fallHeight, 8);
});

test('адаптер захвата синхронизирует семью и сохраняет повреждения кролов', () => {
  const s = scenario();
  const mate = new RabbitActor(s.save.partners[0], new Random(3));
  const background = new FamilyMember(s.save.partners[0], genes(), 0, true);
  const kit = {
    id: 200,
    name: 'Листик',
    genes: genes(),
    age: 1,
    hunger: 80,
    health: 100,
    father: mate.data.name,
    alive: true,
    homeX: 0,
    homeY: 0,
    homeZ: 0,
    dirtiness: 0,
  };
  s.save.kits.push(kit);
  const rig = createRabbit(kit.genes, true);
  const victims = [
    ...new HawkVictims({
      ...s.context,
      rabbits: [mate],
      families: [background],
      family: { rigs: new Map([[kit.id, rig]]) },
    }).all(),
  ];
  for (const root of [mate.root, background.root, rig.root]) {
    const victim = victims.find((v) => v.root === root)!;
    victim.move(2, 5, -3);
    assert.equal(root.position.y, 5);
    assert.equal(root.userData.baseY, 5);
    victim.hurt(10);
  }
  assert.equal(mate.data.y, 5);
  assert.equal(s.save.kits[0].y, 5);
  assert.ok(s.save.kits[0].health < 100);
  assert.equal(new RabbitActor(mate.data, new Random(3)).health, mate.health);
  assert.equal(s.save.familyHealth?.[background.data.id], background.health);
});

test('при захвате игровые команды и запись незавершённой траектории запрещены', () => {
  const s = scenario();
  for (let time = 0; !s.hunting.busy && time < 4; time += 0.05) s.hunting.update(0.05, time, true);
  assert.ok(s.hunting.busy);
  let writes = 0,
    worldActions = 0;
  const notices: string[] = [];
  // Для ранних защит достаточно этих зависимостей: остальной маршрут не должен вызываться.
  const session = new SessionInterface({
    canSave: () => !s.hunting.busy,
    ui: { store: { setState: () => {} } },
    toast: (text: string) => notices.push(text),
    saves: { store: () => writes++ },
  } as unknown as ConstructorParameters<typeof SessionInterface>[0]);
  session.persist(false);
  session.persist(true);
  assert.equal(writes, 0);
  assert.equal(notices.length, 1);
  const actions = new SessionActions({
    restrained: () => AnimalRestraint.active(s.player.root),
    grooming: {
      execute: () => {
        worldActions++;
        return true;
      },
    },
  } as unknown as ConstructorParameters<typeof SessionActions>[0]);
  for (const action of ['dig', 'dig-down', 'hop', 'eat', 'groom', 'interact', 'mate-follow'])
    actions.execute(action);
  assert.equal(worldActions, 0);
});

test('варианты хвоста наследуются и сохраняют форму после анимации обоих LOD', () => {
  for (const tailType of TAIL_TYPES) {
    const genome = { ...genes(), tailType };
    assert.ok(GenomeValidation.valid(genome));
    for (let seed = 1; seed <= 12; seed++) {
      const child = new GenomeInheritance(new Random(seed)).inherit(genome, genome);
      assert.ok(TAIL_TYPES.includes(child.tailType!));
    }
    const rig = createRabbit(genome);
    const model: ModelInstance = rig;
    for (const variant of model.variants ?? [model]) {
      const form = variant.root.getObjectByName('Tail-form')!;
      assert.ok(form);
      const matrix = form.matrix.clone();
      animateRabbit(rig, 1, true, false, 0.1);
      assert.ok(form.matrix.equals(matrix));
    }
  }
  assert.equal(GenomeValidation.valid({ ...genes(), tailType: 'fox' }), false);
  const generated = new Set(
    Array.from({ length: 80 }, (_, i) => new RabbitFactory(new Random(i + 1)).genes().tailType),
  );
  assert.equal(generated.size, 4);
});

test('текстура грязи совмещается с генетическим узором без дополнительных мешей', () => {
  const rig = createRabbit({ ...genes(), pattern: 'spotted' });
  let before = 0;
  rig.root.traverse((part) => {
    if (part instanceof THREE.Mesh) before++;
  });
  CoatDirt.update(rig, 90);
  const body = rig.root.getObjectByName('Body') as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  body.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.ok(shader.fragmentShader.includes('coatStain'));
  assert.equal(shader.uniforms.coatDirtMap.value, CoatDirtTexture.texture);
  assert.equal(shader.uniforms.coatDirtLevel.value, 0.9);
  let after = 0;
  rig.root.traverse((part) => {
    if (part instanceof THREE.Mesh) after++;
  });
  assert.equal(after, before);
  CoatDirt.update(rig, 0);
  assert.equal(shader.uniforms.coatDirtLevel.value, 0);
});

test('кабан узнаваем, анимирован и имеет компактный дальний LOD', () => {
  const boar = AnimalFactory.forest('boar', 0, 0, new Random(8));
  assert.equal(boar.kind, 'boar');
  assert.ok(boar.defense > 0);
  for (const [index, variant] of boar.model.variants!.entries()) {
    let meshes = 0,
      triangles = 0;
    const materials = new Set<THREE.Material>();
    variant.root.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      meshes++;
      const geometry = part.geometry as THREE.BufferGeometry;
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      assert.ok(geometry.attributes.color);
      for (const material of Array.isArray(part.material) ? part.material : [part.material])
        materials.add(material);
    });
    assert.equal(meshes, 7);
    assert.equal(materials.size, 1);
    assert.ok(triangles < (index === 0 ? 2100 : 800));
    for (const clip of ['idle', 'walk', 'run', 'graze']) assert.ok(variant.clips.has(clip));
  }
});
