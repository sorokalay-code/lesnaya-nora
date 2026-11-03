import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ModelAssets, MODEL_NAMES } from '../src/game/ModelAssets';
import { createRabbit, animateRabbit, setRabbitAction } from '../src/game/Models';
import { RabbitGait } from '../src/game/RabbitGait';
import { RabbitFactory } from '../src/game/animals';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { GenomeInheritance } from '../src/game/genetics/GenomeInheritance';
import { GenomeValidation } from '../src/game/genetics/GenomeValidation';
import { RabbitFeatures, EAR_TYPES, EYE_SHAPES } from '../src/game/genetics/RabbitFeatures';
import { AnimalAmbience } from '../src/game/audio/AnimalAmbience';
import { AnimalVoiceSources } from '../src/game/audio/AnimalVoiceSources';
import { AnimalCalls } from '../src/game/audio/AnimalCalls';
import { NaturalVoices } from '../src/game/audio/NaturalVoices';
import type { AnimalVoiceCue, AnimalVoiceKind } from '../src/game/audio/AnimalVoice';
import type { VoiceActor } from '../src/game/audio/AnimalVoiceSources';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { JumpMotion } from '../src/game/session/JumpMotion';
import { Random } from '../src/game/Random';
import { GeneticsPresenter } from '../src/ui/presenters/GeneticsPresenter';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);
const genes = () => ({
  ...DEFAULT_GENES,
  anatomy: { ...DEFAULT_GENES.anatomy },
  shape: { ...DEFAULT_GENES.shape! },
});

test('round, almond and tall eyes reuse geometry and keep their shape through actions in both LODs', () => {
  const round = createRabbit({ ...genes(), eyeShape: 'round' });
  const almond = createRabbit({ ...genes(), eyeShape: 'almond' });
  const tall = createRabbit({ ...genes(), eyeShape: 'tall' });
  for (let lod = 0; lod < 2; lod++) {
    const a = round.variants![lod].root.getObjectByName('EyeL')!;
    const b = almond.variants![lod].root.getObjectByName('EyeL')!;
    const c = tall.variants![lod].root.getObjectByName('EyeL')!;
    assert.ok(b.scale.x > a.scale.x && b.scale.y < a.scale.y);
    assert.ok(c.scale.x < a.scale.x && c.scale.y > a.scale.y);
    const irisA = a.children[0] as THREE.Mesh,
      irisB = b.children[0] as THREE.Mesh;
    assert.equal(irisA.geometry, irisB.geometry);
    const baseline = b.scale.clone();
    const model = almond.variants![lod];
    model.mixer!.clipAction(model.clips.get('groom')!).play();
    model.mixer!.update(0.3);
    assert.deepEqual(b.scale, baseline);
  }
});

test('lop ears hang beside the cheeks and animations preserve their genetic base angle', () => {
  for (const type of EAR_TYPES) {
    const rabbit = createRabbit({ ...genes(), earType: type });
    for (const variant of rabbit.variants!) {
      const ear = variant.root.getObjectByName('EarL')!,
        form = ear.parent!;
      const angle = form.rotation.z;
      variant.mixer!.clipAction(variant.clips.get('idle')!).play();
      variant.mixer!.update(0.3);
      assert.equal(form.rotation.z, angle);
      const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(form.quaternion);
      if (type === 'lop') assert.ok(direction.y < -0.8);
      else assert.ok(direction.y > 0);
    }
    const view = GeneticsPresenter.build({ ...genes(), earType: type });
    assert.ok(
      view.effects.some((effect) =>
        effect.includes(RabbitFeatures.ears({ ...genes(), earType: type }).label),
      ),
    );
  }
});

test('appearance traits vary at generation, inherit from parents and reject invalid saved values', () => {
  const factory = new RabbitFactory(new Random(91));
  const generated = Array.from({ length: 200 }, () => factory.genes());
  assert.equal(new Set(generated.map((g) => g.eyeShape)).size, EYE_SHAPES.length);
  assert.equal(new Set(generated.map((g) => g.earType)).size, EAR_TYPES.length);
  const mother = { ...genes(), eyeShape: 'almond' as const, earType: 'lop' as const, stability: 5 };
  const father = {
    ...genes(),
    eyeShape: 'tall' as const,
    earType: 'half-lop' as const,
    stability: 5,
  };
  const inheritance = new GenomeInheritance(new Random(318));
  let inherited = 0;
  for (let i = 0; i < 200; i++) {
    const child = inheritance.inherit(mother, father);
    assert.ok(GenomeValidation.valid(JSON.parse(JSON.stringify(child))));
    if (child.eyeShape !== 'round' && child.earType !== 'upright') inherited++;
  }
  assert.ok(inherited > 190);
  for (const field of ['eyeShape', 'earType'])
    for (const value of ['unknown', null, 2])
      assert.equal(GenomeValidation.valid({ ...genes(), [field]: value }), false);
});

test('rabbit feet remain level and meet the ground during stance; swing lifts them in both LODs', () => {
  for (const lod of [0, 1])
    for (const name of ['hop', 'run'] as const) {
      const rabbit = createRabbit(genes()),
        variant = rabbit.variants![lod],
        root = variant.root;
      const clip = variant.clips.get(name)!;
      variant.mixer!.clipAction(clip).play();
      for (const phase of [0.04, 0.14, 0.7, 0.9]) {
        variant.mixer!.setTime(phase * clip.duration);
        rabbit.root.updateMatrixWorld(true);
        for (const suffix of ['FL', 'FR', 'BL', 'BR']) {
          const foot = root.getObjectByName('Foot' + suffix)!;
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
            foot.getWorldQuaternion(new THREE.Quaternion()),
          );
          assert.ok(up.y > 0.999, name + suffix + ' foot tilts');
          const rear = suffix.startsWith('B');
          const stance = (phase + (rear ? 0.15 : 0.42)) % 1 < 0.42;
          const bottom = new THREE.Box3().setFromObject(foot, true).min.y;
          assert.ok(bottom > -0.012, name + suffix + ' sinks into ground: ' + bottom);
          if (stance) assert.ok(bottom < 0.015, name + suffix + ' floats during stance: ' + bottom);
        }
      }
      variant.mixer!.setTime(0.42 * clip.duration);
      rabbit.root.updateMatrixWorld(true);
      assert.ok(new THREE.Box3().setFromObject(root.getObjectByName('FootFL')!, true).min.y > 0.05);
      assert.ok(new THREE.Box3().setFromObject(root.getObjectByName('FootBL')!, true).min.y > 0.05);
    }
});

test('rabbit sprint cadence follows speed and physical jumps do not double the vertical motion', () => {
  const root = new THREE.Group();
  let gait = RabbitGait.update(root, true, false, false, 0.1);
  for (let i = 0; i < 12; i++) {
    root.position.z -= 0.9;
    gait = RabbitGait.update(root, true, false, false, 0.1);
  }
  assert.equal(gait.clip, 'run');
  assert.ok(gait.rate > 1);
  for (let i = 0; i < 16; i++) {
    root.position.z -= 0.25;
    gait = RabbitGait.update(root, true, false, false, 0.1);
  }
  assert.equal(gait.clip, 'hop');
  const rabbit = createRabbit(genes());
  rabbit.root.userData.baseY = 4;
  rabbit.root.userData.jumpHeight = 0.7;
  rabbit.root.userData.jumping = true;
  animateRabbit(rabbit, 0.25, true, false, 0.25);
  assert.equal(rabbit.activeName, 'jump');
  assert.ok(Math.abs(rabbit.clips.get('jump')!.duration - JumpMotion.duration) < 0.00001);
  assert.equal(rabbit.root.position.y, 4.7);
  assert.equal(rabbit.root.getObjectByName('Visual')!.position.y, 0);
});

test('extra mutant paws keep articulated feet synchronized while retaining their smaller size', () => {
  const rabbit = createRabbit({ ...genes(), anatomy: { legs: 6, ears: 3, eyes: 3, fangs: false } });
  animateRabbit(rabbit, 0.3, true, false, 0.3);
  const root = rabbit.variants![0].root;
  assert.deepEqual(
    root.getObjectByName('FootFL-extra-4')!.position,
    root.getObjectByName('FootFL')!.position,
  );
  assert.deepEqual(
    root.getObjectByName('UpperFL-extra-4')!.scale,
    root.getObjectByName('UpperFL')!.scale,
  );
  assert.ok(
    root.getObjectByName('PawFL-extra-4')!.scale.y < root.getObjectByName('PawFL')!.scale.y,
  );
  setRabbitAction(rabbit, 'dig', 0.4, 1);
  rabbit.root.position.z -= 1.8;
  animateRabbit(rabbit, 0.5, true, false, 0.2);
  assert.equal(rabbit.activeName, 'dig');
  assert.equal(rabbit.selectedVariant!.active!.getEffectiveTimeScale(), 1);
});

test('animal ambience respects distance, individual pauses, conversations, night and underground separation', () => {
  const root = new THREE.Group();
  root.position.set(4, 0, 0);
  const actor: VoiceActor = { root, kind: 'rabbit', activity: 'rest' };
  const calls: AnimalVoiceCue[] = [];
  const ambience = new AnimalAmbience({
    sources: { all: () => [actor] },
    listener: () => ({ x: 0, y: 0, z: 0 }),
    facing: () => ({ x: 0, z: -1 }),
    sheltered: (p) => p.y < -2,
    sound: (cue) => calls.push(cue),
    rng: new Random(13),
  });
  ambience.update(3, false);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].pan > 0 && calls[0].volume < 1);
  for (let t = 4; t < 20; t++) ambience.update(t, false);
  assert.equal(calls.length, 1);
  root.position.y = -4;
  ambience.update(60, false);
  assert.equal(calls.length, 1);
  root.position.set(35, 0, 0);
  ambience.update(70, false);
  assert.equal(calls.length, 1);
  root.position.set(4, 0, 0);
  root.userData.conversing = true;
  ambience.update(80, false);
  assert.equal(calls.length, 1);
  root.userData.conversing = false;
  actor.kind = 'hawk';
  ambience.update(90, true);
  assert.equal(calls.length, 1);
  ambience.update(100, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].kind, 'hawk');
});

/** Регистрирует звуковые фразы без аппаратного AudioContext для проверки палитры голосов. */
class CallRecorder extends NaturalVoices {
  notes: { frequency: number; duration: number; volume: number; pan: number }[] = [];

  override vocal(
    start: number,
    _end: number,
    duration: number,
    volume: number,
    _delay = 0,
    pan = 0,
  ): void {
    this.notes.push({ frequency: start, duration, volume, pan });
  }

  override noise(frequency: number, duration: number, volume: number, _delay = 0, pan = 0): void {
    this.notes.push({ frequency, duration, volume, pan });
  }
}

test('natural voice palette includes every land species and the hawk with bounded spatial gain', () => {
  const context = {
    sampleRate: 100,
    createBuffer: () => ({ getChannelData: () => new Float32Array(200) }),
  };
  const recorder = new CallRecorder(context as unknown as AudioContext, {} as AudioNode);
  const calls = new AnimalCalls(recorder);
  const kinds: AnimalVoiceKind[] = [
    'rabbit',
    'deer',
    'moose',
    'squirrel',
    'hedgehog',
    'beaver',
    'fox',
    'wolf',
    'dog',
    'lynx',
    'weasel',
    'bear',
    'hawk',
    'snake',
  ];
  for (const kind of kinds) {
    recorder.notes = [];
    calls.play({ kind, activity: 'move', volume: 0.4, pan: -0.6 });
    assert.ok(recorder.notes.length > 0, kind);
    assert.ok(
      recorder.notes.every(
        (note) =>
          Number.isFinite(note.frequency) &&
          note.frequency > 0 &&
          note.volume > 0 &&
          note.volume < 0.4 &&
          note.pan === -0.6,
      ),
    );
    if (kind === 'wolf') assert.ok(recorder.notes.some((note) => note.duration > 1));
    if (kind === 'bear') assert.ok(recorder.notes.some((note) => note.frequency < 100));
  }
});

test('voice sources omit dead animals and use current family rigs and actions', () => {
  const save = NewGameFactory.create(123, 0, new RabbitFactory(new Random(19)));
  const rig = createRabbit(genes());
  rig.activeName = 'eat';
  const data = {
    id: 1,
    name: 'Лапка',
    genes: genes(),
    age: 0.4,
    hunger: 80,
    health: 100,
    father: 'Листик',
    alive: true,
    homeX: 0,
    homeY: 0,
    homeZ: 0,
  };
  save.kits = [data];
  const sources = new AnimalVoiceSources({
    save,
    rabbits: [],
    families: [],
    wildlife: [],
    predators: [],
    hawks: [],
    family: { rigs: new Map([[1, rig]]) },
  });
  assert.equal([...sources.all()][0].activity, 'eat');
  rig.activeName = 'idle';
  assert.equal([...sources.all()][0].activity, 'young');
  data.alive = false;
  assert.equal([...sources.all()].length, 0);
});
