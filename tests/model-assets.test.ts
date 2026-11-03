import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { MODEL_NAMES, ModelAssets } from '../src/game/ModelAssets';
import { animateRabbit, createRabbit, setRabbitAction } from '../src/game/Models';
import { loadModels } from './model-fixture';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';

await loadModels(...MODEL_NAMES);

test('every creature and family prop loads from a GLB with mesh geometry', () => {
  for (const name of MODEL_NAMES) {
    const model = ModelAssets.shared.create(name);
    let meshes = 0;
    model.root.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes++;
    });
    assert.ok(meshes > 0, `${name} has no meshes`);
    if (
      [
        'rabbit',
        'fox',
        'wolf',
        'dog',
        'lynx',
        'weasel',
        'bear',
        'snake',
        'hawk',
        'deer',
        'squirrel',
        'hedgehog',
        'beaver',
        'moose',
      ].includes(name)
    )
      assert.ok(model.clips.size > 0, `${name} has no animations`);
  }
});

test('rabbit instances have independent coat materials and animated digging paws', () => {
  const base = { ...DEFAULT_GENES, ear: 1, speed: 3, vitality: 3, size: 1 };
  const cream = createRabbit({ ...base, coat: 'cream' }),
    black = createRabbit({ ...base, coat: 'black' });
  const a = cream.root.getObjectByName('Body') as THREE.Mesh;
  const b = black.root.getObjectByName('Body') as THREE.Mesh;
  assert.notEqual(a.material, b.material);
  assert.notEqual(
    (a.material as THREE.MeshStandardMaterial).color.getHex(),
    (b.material as THREE.MeshStandardMaterial).color.getHex(),
  );
  const paw = cream.root.getObjectByName('PawFL')!;
  setRabbitAction(cream, 'dig', 0, 2);
  animateRabbit(cream, 0.1, false, false, 0.1);
  assert.ok(Math.abs(paw.rotation.x) > 0.05);
});
test('snake and hawk GLB files include attack clips', () => {
  assert.ok(ModelAssets.shared.create('snake').clips.has('attack'));
  assert.ok(ModelAssets.shared.create('hawk').clips.has('strike'));
});

test('both rabbit LODs keep articulated hind legs without pale spheres on their flanks', () => {
  const model = ModelAssets.shared.create('rabbit');
  const point = new THREE.Vector3();
  for (const variant of model.variants ?? [model]) {
    variant.root.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      assert.ok(variant.root.getObjectByName('PawB' + side));
      assert.ok(variant.root.getObjectByName('UpperB' + side));
      assert.ok(variant.root.getObjectByName('FootB' + side));
    }
    // Светлый мех допустим на животе, ступнях и хвосте, но не поверх боков задних лап.
    // Проверяем экспортированную геометрию: при объединении мешей имена деталей исчезают.
    variant.root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshStandardMaterial) ||
        object.material.name !== 'fur_light'
      )
        return;

      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
        const onRearFlank =
          Math.abs(point.x) > 0.33 &&
          point.y > 0.35 &&
          point.y < 0.8 &&
          point.z > 0.15 &&
          point.z < 0.55;
        assert.equal(onRearFlank, false, `${object.name}: светлый выступ сбоку задней лапы`);
      }
    });
    for (const clip of ['hop', 'run', 'jump', 'swim']) assert.ok(variant.clips.has(clip));
  }
});
