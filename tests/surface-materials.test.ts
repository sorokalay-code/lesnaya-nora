import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { animalSurface, SURFACE_TEXTURES } from '../src/game/SurfaceMaterials';
import { surfacePixel } from '../tools/build-surface-textures';
import { ModelAssets } from '../src/game/ModelAssets';
import { loadModels } from './model-fixture';
import { GroundCover } from '../src/game/GroundCover';
import { WorldChunks } from '../src/game/WorldChunks';
import { Random } from '../src/game/Random';

await loadModels('fallen_log');

test('surface patterns match animal coverings and preserve eyes and hard details', () => {
  assert.equal(animalSurface('rabbit', 'fur_base'), 'coat');
  assert.equal(animalSurface('boar', 'boar_palette'), 'coat');
  assert.equal(animalSurface('duck', 'fur_base'), 'feather');
  assert.equal(animalSurface('pike', 'pike_palette'), 'scales');
  assert.equal(animalSurface('spider', 'chitin'), 'chitin');
  for (const material of ['eye', 'eye_shine', 'tooth', 'beak', 'antler', 'pink'])
    assert.equal(animalSurface('rabbit', material), undefined);
  for (const kind of SURFACE_TEXTURES) {
    assert.deepEqual(surfacePixel(kind, 17, 35), surfacePixel(kind, 145, 163));
    assert.notDeepEqual(surfacePixel(kind, 17, 35), surfacePixel(kind, 3, 11));
  }
});

test('logs retain UVs on bark and cut ends and share their exported resources', () => {
  const a = ModelAssets.shared.create('fallen_log').root;
  const b = ModelAssets.shared.create('fallen_log').root;
  const parts: THREE.Mesh[] = [];
  a.traverse((part) => {
    if (part instanceof THREE.Mesh) parts.push(part);
  });
  assert.equal(parts.length, 2);
  assert.deepEqual(
    new Set(parts.map((part) => (part.material as THREE.MeshStandardMaterial).name)),
    new Set(['surface_bark', 'surface_wood']),
  );
  for (const part of parts) {
    assert.ok(part.geometry.hasAttribute('uv'));
    let shared = false;
    b.traverse((other) => {
      if (
        other instanceof THREE.Mesh &&
        other.geometry === part.geometry &&
        other.material === part.material
      )
        shared = true;
    });
    assert.ok(shared);
  }
});

test('ground cover responds to scene lights with a matte material and receives sunlight', () => {
  const scene = new THREE.Scene();
  new GroundCover(new WorldChunks(scene), new Random(41), {
    seed: 41,
    scale: 1,
    density: 0.1,
    heightAt: () => 0,
    biomeAt: () => 'meadow',
    wet: () => false,
  });
  let count = 0;
  scene.traverse((part) => {
    if (!(part instanceof THREE.InstancedMesh)) return;
    count++;
    assert.ok(part.material instanceof THREE.MeshStandardMaterial);
    assert.equal(part.material.roughness, 1);
    assert.equal(part.material.emissive.getHex(), 0);
  });
  assert.ok(count > 0);
});
