import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { MODEL_NAMES, ModelAssets } from '../src/game/ModelAssets';
import { animateRabbit, createRabbit, setRabbitAction } from '../src/game/Models';
import { ResourceInstances } from '../src/game/ResourceInstances';
import { World, type Resource } from '../src/game/World';
import { isEvergreen, isTreeSpecies, TREE_SPECIES } from '../src/game/TreeSpecies';
import { isShrubSpecies, SHRUB_SPECIES } from '../src/game/ShrubSpecies';
import { SeasonSystem } from '../src/game/systems';
import { WorldChunks } from '../src/game/WorldChunks';
import { AmbientFlight } from '../src/game/AmbientFlight';
import { loadModels } from './model-fixture';
import { DEFAULT_GENES } from '../src/game/genetics/GeneticTraits';

await loadModels(...MODEL_NAMES);
const genes = { ...DEFAULT_GENES, coat: 'cream' as const, ear: 1, speed: 3, vitality: 3, size: 1 };

test('ambient flight keeps five variants per batch and removes insects and migrant birds in winter', () => {
  const scene = new THREE.Scene();
  const flight = new AmbientFlight(scene, {
    seed: 41,
    scale: 0.22,
    vegetation: 5,
    butterflies: [{ x: 0, z: 0 }],
    heightAt: () => 0,
    biomeAt: () => 'meadow',
    nearWater: () => true,
  });
  const insects = scene.getObjectByName('ambient-insects');
  const birds = scene.getObjectByName('ambient-birds');
  assert.ok(insects instanceof THREE.InstancedMesh && birds instanceof THREE.InstancedMesh);
  assert.equal(scene.children.length, 2);
  const colors = (mesh: THREE.InstancedMesh) => {
    const color = new THREE.Color();
    return new Set(
      Array.from({ length: mesh.count }, (_, i) => {
        mesh.getColorAt(i, color);
        return color.getHex();
      }),
    );
  };
  flight.update(0, 0, 0, 'Лето');
  assert.equal(colors(insects).size, 5);
  assert.equal(colors(birds).size, 5);
  const summerBirds = birds.count;
  flight.update(0, 0, 0, 'Зима');
  assert.equal(insects.count, 0);
  assert.equal(insects.visible, false);
  assert.ok(birds.count > 0 && birds.count < summerBirds);
  assert.ok(!colors(birds).has(0x6885bc) && !colors(birds).has(0xf0a068));
});

function stats(root: THREE.Object3D) {
  let meshes = 0,
    triangles = 0;
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material);
    }
  });
  return { meshes, triangles, materials };
}
test('fern stays within the vegetation budget and static props have no mixer', () => {
  const fern = ModelAssets.shared.create('fern'),
    metrics = stats(fern.root);
  assert.equal(metrics.meshes, 1);
  assert.ok(metrics.triangles < 1500);
  assert.equal(fern.mixer, undefined);
  assert.ok(stats(ModelAssets.shared.create('oak').root).meshes <= 8);
});
test('oak leaf cards retain a seasonal crown with an alpha cutout material', () => {
  const oak = ModelAssets.shared.create('oak').root;
  const crown = oak.getObjectByName('Foliage');
  assert.ok(crown && oak.getObjectByName('Litter'));
  assert.ok(stats(crown).triangles <= 70);
  assert.equal(stats(crown).meshes, 1);
  const [material] = stats(crown).materials;
  assert.ok(material instanceof THREE.MeshStandardMaterial);
  assert.ok(material.alphaTest > 0);
  assert.equal(material.side, THREE.DoubleSide);
});
test('forest trees and shrubs use cutout crowns and only evergreens keep their crowns in winter', () => {
  const scene = new THREE.Scene();
  const world = new World(scene, 31415);
  const day = new SeasonSystem(31415).startDay(3);
  world.update((day - 1) * 1440, 0, 'clear', day, 0, 0);
  const seen = new Set<string>();
  scene.traverse((object) => {
    const species = object.name;
    if (!isTreeSpecies(species) && !isShrubSpecies(species)) return;
    const crown = object.getObjectByName('Foliage');
    if (!crown) return;
    seen.add(object.name);
    if (isTreeSpecies(species)) {
      const bark = crown.parent?.children.find(
        (child): child is THREE.Mesh =>
          child instanceof THREE.Mesh && child.material.name === `bark_${species}_texture`,
      );
      assert.ok(bark);
      const uv = bark.geometry.getAttribute('uv');
      assert.ok(uv && Array.from({ length: uv.count }, (_, i) => uv.getY(i)).some((v) => v > 2));
    }
    const metrics = stats(crown);
    assert.equal(metrics.meshes, 1);
    assert.ok(metrics.triangles <= 150);
    const [material] = metrics.materials;
    assert.ok(material instanceof THREE.MeshStandardMaterial && material.alphaTest > 0);
    assert.equal(crown.visible, isEvergreen(species) || species === 'juniper');
  });
  assert.deepEqual([...seen].sort(), [...TREE_SPECIES, ...SHRUB_SPECIES].sort());
});
test('rabbit LOD preserves actions and ear genes with fewer triangles at distance', () => {
  const rabbit = createRabbit({ ...genes, ear: 1.2 }),
    scene = new THREE.Scene();
  scene.add(rabbit.root);
  scene.updateMatrixWorld(true);
  assert.equal(rabbit.variants?.length, 2);
  assert.ok(
    stats(rabbit.variants![1].root).triangles < stats(rabbit.variants![0].root).triangles * 0.4,
  );
  assert.ok(stats(rabbit.root).materials.size <= 14);
  rabbit.variants![1].root.traverse((object) => {
    if (object instanceof THREE.Mesh) assert.equal(object.castShadow, false);
  });
  rabbit.root.traverse((object) => {
    if (object.name === 'EarL') assert.equal(object.scale.y, 1.2);
  });
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 3, 45);
  camera.lookAt(0, 0.5, 0);
  ModelAssets.shared.updateView(camera);
  assert.equal(rabbit.variants![1].root.visible, true);
  setRabbitAction(rabbit, 'dig', 0, 2);
  animateRabbit(rabbit, 0.1, false, false, 0.1);
  assert.equal(rabbit.variants![1].activeName, 'dig');
  assert.ok(Math.abs(rabbit.variants![1].root.getObjectByName('PawFL')!.rotation.x) > 0.05);
  animateRabbit(rabbit, 3, true, false, 0.1);
  assert.equal(rabbit.variants![1].activeName, 'hop');
  ModelAssets.shared.release(rabbit.root);
});
test('resource batches hide picked plants immediately and restore growth without rebuilding geometry', () => {
  const scene = new THREE.Scene(),
    chunks = new WorldChunks(scene);
  const make = (id: number, x: number) => {
    const mesh = new THREE.Group();
    mesh.position.x = x;
    chunks.add(mesh, x, 0);
    return { id, x, z: 0, kind: 'carrot', mesh, available: true, regrowAt: 0 } as Resource;
  };
  const first = make(1, 1),
    second = make(2, 2),
    renderer = new ResourceInstances([first, second], chunks, () => {});
  const batches: THREE.InstancedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) batches.push(object);
  });
  assert.ok(batches.length <= 2);
  const geometry = batches[0].geometry,
    bounds = batches[0].boundingSphere!.clone(),
    matrix = new THREE.Matrix4();
  first.available = false;
  first.mesh.visible = false;
  renderer.sync(first);
  batches[0].getMatrixAt(0, matrix);
  assert.equal(matrix.determinant(), 0);
  first.available = true;
  first.mesh.visible = true;
  first.mesh.scale.setScalar(0.5);
  renderer.sync(first);
  batches[0].getMatrixAt(0, matrix);
  assert.ok(matrix.determinant() > 0);
  assert.equal(batches[0].geometry, geometry);
  assert.deepEqual(batches[0].boundingSphere, bounds);
});
test('releasing a rabbit disposes its materials while retaining shared GLB geometry', () => {
  const rabbit = createRabbit(genes),
    body = rabbit.root.getObjectByName('Body') as THREE.Mesh;
  let materialDisposed = false,
    geometryDisposed = false;
  (body.material as THREE.Material).addEventListener('dispose', () => {
    materialDisposed = true;
  });
  const geometryListener = () => {
    geometryDisposed = true;
  };
  body.geometry.addEventListener('dispose', geometryListener);
  ModelAssets.shared.release(rabbit.root);
  assert.equal(materialDisposed, true);
  assert.equal(geometryDisposed, false);
  body.geometry.removeEventListener('dispose', geometryListener);
});
test('chunks freeze static transforms while preserving moving decorations', () => {
  const scene = new THREE.Scene(),
    chunks = new WorldChunks(scene),
    tree = new THREE.Group(),
    butterfly = new THREE.Group();
  tree.position.x = 5;
  tree.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  chunks.add(tree, 5, 0);
  chunks.add(butterfly, 0, 0, true);
  assert.equal(tree.matrixAutoUpdate, false);
  assert.equal(tree.children[0].matrixWorldAutoUpdate, false);
  assert.equal(tree.matrixWorld.elements[12], 5);
  butterfly.position.x = 3;
  scene.updateMatrixWorld();
  assert.equal(butterfly.matrixWorld.elements[12], 3);
});
