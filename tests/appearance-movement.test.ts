import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AnimalAppearance, NEUTRAL_APPEARANCE } from '../src/game/AnimalAppearance';
import { AnimalFactory, RabbitFactory } from '../src/game/animals';
import { JumpingSpider } from '../src/game/animals/JumpingSpider';
import { Lynx } from '../src/game/animals/Lynx';
import { Hawk } from '../src/game/animals/Hawk';
import { AttackSounds } from '../src/game/audio/AttackSounds';
import type { AttackCue } from '../src/game/audio/AttackCue';
import { NaturalVoices } from '../src/game/audio/NaturalVoices';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { GenomeInheritance } from '../src/game/genetics/GenomeInheritance';
import { GenomeValidation } from '../src/game/genetics/GenomeValidation';
import { RabbitConformation, NEUTRAL_RABBIT_SHAPE } from '../src/game/genetics/RabbitConformation';
import { MODEL_NAMES, ModelAssets } from '../src/game/ModelAssets';
import { createRabbit, animateRabbit } from '../src/game/Models';
import { Random } from '../src/game/Random';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { EnergyRecovery } from '../src/game/systems/EnergyRecovery';
import { WildlifeEcology } from '../src/game/WildlifeEcology';
import type { World } from '../src/game/World';
import type { Genes } from '../src/game/types';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);
const game = () => NewGameFactory.create(31415, 0, new RabbitFactory(new Random(31468)));
const gene = (shape = NEUTRAL_RABBIT_SHAPE): Genes => ({
  ...DEFAULT_GENES,
  anatomy: { ...DEFAULT_GENES.anatomy },
  shape: { ...shape },
});
const bodyMaterial = (root: THREE.Object3D) =>
  (root.getObjectByName('Body') as THREE.Mesh).material as THREE.MeshStandardMaterial;

test('stationary regeneration is tripled both before and after the pause bonus, with moving rate preserved', () => {
  for (const depleted of [false, true]) {
    const player = game().player;
    player.energy = 0;
    if (depleted) player.hunger = 0;
    const recovery = new EnergyRecovery();
    recovery.update(player, 1, 0, false);
    assert.ok(Math.abs(player.energy - (depleted ? 0.36 : 0.54)) < 0.0001);
    const before = player.energy;
    recovery.update(player, 1, 5, false);
    assert.ok(Math.abs(player.energy - before - (depleted ? 0.9 : 3)) < 0.0001);
    const standing = player.energy;
    recovery.update(player, 1, 6, true);
    assert.ok(Math.abs(player.energy - standing - (depleted ? 0.12 : 0.18)) < 0.0001);
    player.energy = 99.9;
    recovery.update(player, 1, 12, false);
    assert.equal(player.energy, 100);
  }
});

test('rabbit conformation changes ears, legs and body in both LODs without duplicating geometry', () => {
  const neutral = createRabbit(gene());
  const shaped = createRabbit(
    gene({
      earWidth: 1.15,
      earBend: 0.25,
      legLength: 1.12,
      bodyWidth: 0.92,
      bodyLength: 1.1,
      headSize: 1.04,
    }),
  );
  for (const [index, variant] of shaped.variants!.entries()) {
    assert.equal(
      (variant.root.getObjectByName('Body') as THREE.Mesh).geometry,
      (neutral.variants![index].root.getObjectByName('Body') as THREE.Mesh).geometry,
    );
    const form = variant.root.getObjectByName('RabbitForm')!;
    assert.equal(form.scale.x, 0.92);
    assert.equal(form.scale.z, 1.1);
    assert.equal(form.matrixAutoUpdate, false);
    assert.equal(variant.root.getObjectByName('PawFL')!.scale.y, 1.12);
    const ear = variant.root.getObjectByName('EarL')!;
    assert.equal(ear.parent!.scale.x, 1.15);
    assert.equal(ear.parent!.rotation.x, 0.25);
  }
  for (let i = 0; i < 30; i++) animateRabbit(shaped, i / 30, true, false, 1 / 30);
  assert.equal(shaped.root.getObjectByName('RabbitForm')!.scale.z, 1.1);
  ModelAssets.shared.release(neutral.root);
  ModelAssets.shared.release(shaped.root);
});

test('shape genes inherit within bounds, survive JSON and are independently created for new games', () => {
  const mother = gene({ ...NEUTRAL_RABBIT_SHAPE, earWidth: 0.85, legLength: 0.9 });
  const father = gene({ ...NEUTRAL_RABBIT_SHAPE, earWidth: 1.15, legLength: 1.1 });
  const inheritance = new GenomeInheritance(new Random(7));
  for (let i = 0; i < 200; i++) {
    const child = inheritance.inherit(mother, father);
    assert.ok(GenomeValidation.valid(child));
    assert.deepEqual(JSON.parse(JSON.stringify(child)).shape, child.shape);
    assert.ok(child.shape!.legLength >= 0.86 && child.shape!.legLength <= 1.14);
  }
  assert.notEqual(game().player.genes.shape, game().player.genes.shape);
  assert.equal(
    GenomeValidation.valid({ ...mother, shape: { ...mother.shape, earWidth: Infinity } }),
    false,
  );
  const old = { ...mother };
  delete old.shape;
  assert.ok(GenomeValidation.valid(old));
  assert.ok(Number.isFinite(RabbitConformation.shape(old).earWidth));
});

test('animal constructor properties preserve the species and reuse geometry plus bounded shared palettes', () => {
  const first = AnimalFactory.predator('fox', 0, 0, new Random(1), NEUTRAL_APPEARANCE);
  const options = {
    size: 1.05,
    bodyWidth: 0.97,
    bodyLength: 1.04,
    legLength: 1.03,
    headSize: 0.98,
    palette: 3,
  };
  const second = AnimalFactory.predator('fox', 1, 0, new Random(1), options);
  const third = AnimalFactory.predator('fox', 2, 0, new Random(1), options);
  assert.equal(first.kind, second.kind);
  assert.equal(second.root.scale.x, 1.05);
  assert.equal(
    (first.root.getObjectByName('Body') as THREE.Mesh).geometry,
    (second.root.getObjectByName('Body') as THREE.Mesh).geometry,
  );
  assert.notEqual(bodyMaterial(first.root), bodyMaterial(second.root));
  assert.equal(bodyMaterial(second.root), bodyMaterial(third.root));
  assert.ok(Math.abs(second.profile.radius - first.profile.radius * 1.05 * 0.97) < 0.0001);
  let disposed = false;
  bodyMaterial(second.root).addEventListener('dispose', () => {
    disposed = true;
  });
  ModelAssets.shared.release(second.root);
  assert.equal(disposed, false);
  assert.ok(third.root.getObjectByName('Head'));
});

test('appearance generation is deterministic, bounded and does not consume behavioural randomness', () => {
  assert.deepEqual(AnimalAppearance.seeded('deer', 4, 5), AnimalAppearance.seeded('deer', 4, 5));
  assert.notDeepEqual(AnimalAppearance.seeded('deer', 4, 5), AnimalAppearance.seeded('deer', 6, 5));
  const rng = new Random(1),
    other = new Random(1);
  AnimalFactory.forest('deer', 1, 2, rng);
  AnimalFactory.forest('deer', 1, 2, other, NEUTRAL_APPEARANCE);
  assert.equal(rng.next(), other.next());
  const malformed = AnimalAppearance.normalize({ size: Infinity, legLength: 3, palette: 100 });
  assert.equal(malformed.size, 1);
  assert.equal(malformed.legLength, 1.08);
  assert.equal(malformed.palette, 4);
});

test('wildlife retains its personal appearance after walking, saving and reloading', () => {
  const save = game();
  save.wildlife = [
    {
      id: 8,
      kind: 'deer',
      x: 2,
      z: 3,
      health: 60,
      social: { trust: 40 },
      appearance: { ...NEUTRAL_APPEARANCE, palette: 2, headSize: 1.03 },
    },
  ];
  const world = { heightAt: () => 0 } as unknown as World;
  const ecology = new WildlifeEcology(new THREE.Scene(), world, new Random(1), save);
  ecology.populate();
  ecology.animals[0].x = 20;
  ecology.capture();
  const restored = new WildlifeEcology(
    new THREE.Scene(),
    world,
    new Random(2),
    JSON.parse(JSON.stringify(save)),
  );
  restored.populate();
  assert.deepEqual(restored.animals[0].appearance, ecology.animals[0].appearance);
  assert.equal(restored.animals[0].trust, 40);
});

test('jumping spider patrols a tree, launches a short jump and can leap again after a cooldown', () => {
  const spider = new JumpingSpider(0, 0, new Random(1));
  for (let i = 0; i < 400; i++) spider.update(0.05, i * 0.05, 100, 100, false, true, () => 0);
  assert.ok(Math.hypot(spider.x, spider.z) < 4);
  let peak = 0,
    hits = 0;
  const target = { x: spider.x + 5, z: spider.z };
  for (let i = 0; i < 20; i++) {
    if (spider.update(0.05, 20 + i * 0.05, target.x, target.z, false, true, () => 0)) hits++;
    peak = Math.max(peak, spider.root.position.y);
  }
  assert.ok(peak > 0.8 && hits === 1);
  for (let i = 0; i < 100; i++) spider.update(0.05, 21 + i * 0.05, 100, 100, false, true, () => 0);
  const again = { x: spider.x + 5, z: spider.z };
  peak = 0;
  for (let i = 0; i < 20; i++) {
    spider.update(0.05, 26 + i * 0.05, again.x, again.z, false, true, () => 0);
    peak = Math.max(peak, spider.root.position.y);
  }
  assert.ok(peak > 0.8);
});

test('jumping spider model has animated near legs, a three-mesh LOD and a jump clip', () => {
  const model = ModelAssets.shared.create('jumping-spider');
  for (const [index, variant] of model.variants!.entries()) {
    let meshes = 0,
      triangles = 0;
    variant.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    assert.ok(meshes <= (index ? 3 : 11));
    assert.ok(triangles <= (index ? 510 : 1600));
    assert.ok(variant.clips.has('jump'));
  }
});

test('predators and hawks emit attack cues at attack starts rather than on every animation frame', () => {
  const fox = AnimalFactory.predator('fox', 0, 0, new Random(1));
  const cues: AttackCue[] = [];
  fox.setAttackListener((cue) => cues.push(cue));
  fox.update(0.05, 1, 1, 0, false, true, () => 0);
  fox.update(0.05, 1.05, 1, 0, false, true, () => 0);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].phase, 'strike');
  const lynx = new Lynx(0, 0, new Random(1));
  lynx.setAttackListener((cue) => cues.push(cue));
  lynx.update(0.05, 2, 7, 0, false, true, () => 0);
  assert.equal(cues.at(-1)!.phase, 'leap');
  const hawk = new Hawk(0, 0, new Random(1));
  hawk.setAttackListener((cue) => cues.push(cue));
  hawk.update(0.05, 3, 2, 0, true, () => 0);
  assert.equal(cues.at(-1)!.kind, 'hawk');
});

test('attack audio attenuates and pans, ignores far events and truce, and removes old subscriptions', () => {
  let time = 0,
    combat = true;
  const heard: { volume: number; pan: number }[] = [];
  const sound = new AttackSounds({
    sound: {
      attack(_kind, _phase, volume = 1, pan = 0) {
        heard.push({ volume, pan });
      },
    },
    listener: () => ({ x: 0, y: 0, z: 0 }),
    facing: () => ({ x: 0, z: -1 }),
    combatAllowed: () => combat,
    elapsed: () => time,
  });
  const fox = AnimalFactory.predator('fox', 4, 0, new Random(1));
  sound.bind([fox]);
  fox.playAttack(0);
  assert.equal(heard.length, 1);
  assert.ok(heard[0].pan > 0);
  const cue: AttackCue = { kind: 'fox', phase: 'strike', x: 20, y: 0, z: 0, time: 1 };
  time = 1;
  sound.emit(cue);
  assert.ok(heard[1].volume < heard[0].volume);
  time = 2;
  sound.emit({ ...cue, x: 30 });
  assert.equal(heard.length, 2);
  combat = false;
  fox.playAttack(3);
  assert.equal(heard.length, 2);
  combat = true;
  sound.dispose();
  fox.playAttack(4);
  assert.equal(heard.length, 2);
});

/** Записывает параметры синтеза, не создавая аппаратный аудиоконтекст в тестах. */
class RecordedVoices extends NaturalVoices {
  tones: number[] = [];
  noises: number[] = [];

  override tone(start: number): void {
    this.tones.push(start);
  }

  override noise(frequency: number): void {
    this.noises.push(frequency);
  }
}

test('attack voices distinguish growls, hisses, bird cries and spider rustles', () => {
  const context = {
    sampleRate: 100,
    createBuffer: () => ({ getChannelData: () => new Float32Array(200) }),
  };
  const voice = new RecordedVoices(context as unknown as AudioContext, {} as AudioNode);
  voice.attack('bear', 'strike', 1, 0);
  assert.ok(voice.tones.at(-1)! < 100);
  voice.attack('hawk', 'strike', 1, 0);
  assert.ok(voice.tones.at(-1)! > 1000);
  voice.attack('snake', 'strike', 1, 0);
  assert.ok(voice.noises.at(-1)! > 2000);
  voice.attack('jumping-spider', 'leap', 1, 0);
  assert.ok(voice.noises.at(-1)! > 3000);
});

test('animal gaits lift paws, differentiate walk and gallop, and rabbit bounds use paired legs', () => {
  const model = ModelAssets.shared.create('fox').variants![0];
  const leg = model.root.getObjectByName('LegFL')!,
    baseline = leg.position.clone();
  const action = model.mixer!.clipAction(model.clips.get('walk')!).play();
  model.mixer!.update(0.2);
  const angle = leg.rotation.x;
  model.mixer!.update(0.6);
  assert.ok(Math.abs(angle - leg.rotation.x) > 0.3);
  assert.ok(leg.position.distanceTo(baseline) > 0.01);
  action.stop();
  model.mixer!.clipAction(model.clips.get('run')!).play();
  model.mixer!.update(0.1);
  assert.ok(
    model.root
      .getObjectByName('LegFL')!
      .quaternion.angleTo(model.root.getObjectByName('LegBL')!.quaternion) > 0.4,
  );
  const rabbit = createRabbit(gene());
  animateRabbit(rabbit, 0.2, true, false, 0.2);
  const root = rabbit.variants![0].root;
  assert.ok(
    root.getObjectByName('PawFL')!.quaternion.angleTo(root.getObjectByName('PawFR')!.quaternion) <
      0.001,
  );
});
