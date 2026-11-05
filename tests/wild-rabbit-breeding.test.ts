import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadModels } from './model-fixture';
import { MODEL_NAMES } from '../src/game/ModelAssets';
import { createRabbit } from '../src/game/Models';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';
import { defaultWorldConfig, CREATURE_OPTIONS } from '../src/game/WorldConfig';
import { NewGameFactory } from '../src/game/session/NewGameFactory';
import { WildRabbitBreeding } from '../src/game/session/WildRabbitBreeding';
import { RabbitFactory, AnimalFactory } from '../src/game/animals';
import { Random } from '../src/game/Random';
import { World } from '../src/game/World';
import { Excavation } from '../src/game/Excavation';
import { Genealogy } from '../src/game/genetics/Genealogy';
import { SaveRepository } from '../src/game/SaveRepository';

await loadModels(...MODEL_NAMES);

function fixture() {
  const config = defaultWorldConfig();
  config.size = 50;
  config.water = config.food = config.vegetation = 0;
  config.neighborFamilySize = 0;
  for (const { kind } of CREATURE_OPTIONS) config.creatures[kind] = 0;
  config.creatures.rabbit = 2;
  const save = NewGameFactory.create(14, 0, new RabbitFactory(new Random(1)), config);
  save.partners.forEach((data, index) => {
    data.genes = structuredClone(DEFAULT_GENES);
    data.x = index;
    data.z = 0;
    data.y = 0;
  });
  const world = new World(new THREE.Scene(), save.seed, save);
  const earth = new Excavation(world.scene, world, save);
  const rabbits = save.partners.map((data) => AnimalFactory.rabbit(data, new Random(data.id + 1)));
  for (const actor of rabbits) actor.moveTo(actor.x, actor.z, world.heightAt(actor.x, actor.z));
  const context = { save, world, earth, rabbits };
  return { ...context, breeding: new WildRabbitBreeding(context) };
}

function conceive(f: ReturnType<typeof fixture>) {
  for (let time = 0; time < 8; time += 0.1) {
    f.save.clock += 0.6;
    f.breeding.update(0.1, time);
  }
}

test('new neighbours include both sexes without mutating their inherited coat', () => {
  const records = new RabbitFactory(new Random(31)).partners(16, 0);
  assert.equal(records.filter((r) => r.sex === 'female').length, 8);
  assert.equal(records.filter((r) => r.sex === 'male').length, 8);
  const genes = structuredClone(DEFAULT_GENES);
  const male = createRabbit(genes, false, 'male'),
    female = createRabbit(genes, false, 'female');
  for (const [index, variant] of (male.variants ?? [male]).entries()) {
    const other = (female.variants ?? [female])[index];
    assert.ok(
      variant.root.getObjectByName('SexHeadForm')!.scale.x >
        other.root.getObjectByName('SexHeadForm')!.scale.x,
    );
    assert.ok(
      variant.root.getObjectByName('SexEarLForm')!.scale.y <
        other.root.getObjectByName('SexEarLForm')!.scale.y,
    );
  }
  assert.deepEqual(genes, DEFAULT_GENES);
});

test('unattended adults mate, carry a litter, give birth once and raise adult offspring', () => {
  const f = fixture();
  conceive(f);
  const mother = f.save.partners[1];
  assert.equal(mother.pregnancy?.fatherId, 0);
  const due = mother.pregnancy!.dueAt;
  f.save.clock = due - 1;
  f.breeding.update(0.1, 9);
  assert.equal(f.rabbits.length, 2);
  f.save.clock = due;
  f.breeding.update(0.1, 10);
  assert.equal(mother.pregnancy, undefined);
  assert.ok(f.rabbits.length >= 4 && f.rabbits.length <= 6);
  const child = f.rabbits[2];
  assert.equal(child.data.age, 0);
  assert.equal(child.root.scale.x, child.data.genes.size * 0.55);
  assert.ok(child.data.lineage?.ancestors.some((a) => a.id === mother.lineage?.id));
  assert.ok(child.data.lineage?.ancestors.some((a) => a.id === f.save.partners[0].lineage?.id));
  const count = f.rabbits.length;
  const resumed = new WildRabbitBreeding(f);
  resumed.update(0.1, 11);
  assert.equal(f.rabbits.length, count);
  f.save.clock += 3 * 1440;
  resumed.update(0.1, 12);
  assert.equal(child.data.age, 3);
  assert.equal(child.root.scale.x, child.data.genes.size);
  assert.equal(new Set(f.save.partners.map((p) => p.id)).size, f.save.partners.length);
});

test('same-sex, immature, related, captured and player-partner rabbits do not breed', () => {
  for (const reason of ['same-sex', 'young', 'related', 'captured', 'mate'] as const) {
    const f = fixture();
    const father = f.rabbits[0];
    if (reason === 'same-sex') f.save.partners[1].sex = 'male';
    if (reason === 'young') father.data.age = 1;
    if (reason === 'related')
      father.data.lineage = Genealogy.child('child', [
        { name: 'mother', lineage: f.save.partners[1].lineage! },
      ]);
    if (reason === 'captured') father.root.userData.hawkHeld = true;
    if (reason === 'mate') f.save.mateId = father.data.id;
    conceive(f);
    assert.equal(f.save.partners[1].pregnancy, undefined, reason);
  }
});

test('population ceiling also limits already conceived litters', () => {
  const f = fixture();
  conceive(f);
  const mother = f.save.partners[1];
  f.save.worldConfig!.creatures.rabbit = 0;
  f.save.clock = mother.pregnancy!.dueAt;
  f.breeding.update(0.1, 10);
  assert.equal(f.rabbits.length, 2);
});

test('sex and pregnancy survive repository reload and damaged demographic data is rejected', () => {
  const f = fixture();
  conceive(f);
  let raw = '';
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    },
  });
  try {
    const repository = new SaveRepository('demography');
    repository.store(f.save);
    const restored = repository.load();
    assert.deepEqual(restored.partners[1].pregnancy, f.save.partners[1].pregnancy);
    assert.equal(restored.partners[1].sex, 'female');
    const catalog = JSON.parse(raw) as { slots: { save: typeof f.save }[] };
    for (const patch of [
      { sex: 'unknown' },
      { age: -1 },
      { pregnancy: { fatherId: 123456, dueAt: 0 } },
    ]) {
      raw = JSON.stringify({
        ...catalog,
        slots: catalog.slots.map((slot) => ({
          ...slot,
          save: {
            ...slot.save,
            partners: slot.save.partners.map((partner, i) =>
              i === 1 ? { ...partner, ...patch } : partner,
            ),
          },
        })),
      });
      assert.throws(() => repository.load(), /состояние кроликов/);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
