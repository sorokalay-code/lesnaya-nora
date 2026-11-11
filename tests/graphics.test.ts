import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  GRAPHICS_PRESETS,
  GraphicsPreferences,
  graphicsPreset,
} from '../src/game/GraphicsSettings';
import { GroundCover } from '../src/game/GroundCover';
import { Random } from '../src/game/Random';
import { WorldChunks, WORLD_CHUNK_SIZE } from '../src/game/WorldChunks';
import { SceneLighting } from '../src/game/session/SceneLighting';

test('graphics presets and individual changes survive a reload and reject invalid values', () => {
  let saved = '{"shadows":"broken","details":"off"}';
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  const preferences = new GraphicsPreferences(storage, false);
  assert.equal(preferences.settings.shadows, 'medium');
  assert.equal(preferences.settings.details, 'off');
  assert.deepEqual(preferences.change('preset', 'quality'), GRAPHICS_PRESETS.quality);
  assert.equal(graphicsPreset(preferences.settings), 'quality');
  assert.equal(preferences.change('shadows', '__proto__'), undefined);
  assert.equal(preferences.change('unknown', 'low'), undefined);
  preferences.change('shadows', 'off');
  assert.equal(graphicsPreset(preferences.settings), undefined);
  assert.deepEqual(new GraphicsPreferences(storage, true).settings, {
    ...GRAPHICS_PRESETS.quality,
    shadows: 'off',
  });
  const reset = new GraphicsPreferences(storage, true).change('reset', undefined);
  assert.equal(reset?.shadows, 'low');
  assert.equal(reset?.resolution, 'medium');
});

test('distance changes visibility immediately at the same player position', () => {
  const scene = new THREE.Scene();
  const chunks = new WorldChunks(scene);
  const object = new THREE.Object3D();
  chunks.add(object, 2 * WORLD_CHUNK_SIZE, 0);
  chunks.setRadius(1, 0, 0);
  assert.equal(object.parent?.visible, false);
  chunks.setRadius(3, 0, 0);
  assert.equal(object.parent?.visible, true);
});

test('reduced decor submits fewer instances and switching back preserves dug openings', () => {
  const scene = new THREE.Scene();
  const cover = new GroundCover(new WorldChunks(scene), new Random(6), {
    seed: 6,
    scale: 1,
    density: 1,
    heightAt: () => 0,
    biomeAt: () => 'meadow',
    wet: () => false,
  });
  const meshes: THREE.InstancedMesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) meshes.push(object);
  });
  const count = () => meshes.reduce((sum, mesh) => sum + (mesh.visible ? mesh.count : 0), 0);
  const full = count();
  cover.setDetailDensity(0.45);
  assert.ok(count() > 0 && count() < full / 2);
  cover.setDetailDensity(0);
  assert.equal(count(), 0);
  cover.clearOpening({ minX: -110, maxX: 110, minZ: -110, maxZ: 110, maxY: 1 }, () => -1);
  cover.setDetailDensity(1);
  assert.equal(count(), full);
  const matrix = new THREE.Matrix4();
  for (const mesh of meshes) {
    mesh.getMatrixAt(0, matrix);
    assert.equal(matrix.determinant(), 0);
  }
});

test('changing shadow resolution frees the old map and turning shadows off disables the caster', () => {
  const scene = new THREE.Scene();
  const lighting = new SceneLighting(scene, new THREE.PerspectiveCamera());
  lighting.reset();
  const sun = scene.children.find(
    (object): object is THREE.DirectionalLight => object instanceof THREE.DirectionalLight,
  )!;
  lighting.setShadowSize(1024);
  const old = new THREE.WebGLRenderTarget(1024, 1024);
  let released = false;
  old.addEventListener('dispose', () => {
    released = true;
  });
  sun.shadow.map = old;
  lighting.setShadowSize(2048);
  assert.equal(released, true);
  assert.equal(sun.shadow.map, null);
  assert.equal(sun.shadow.mapSize.x, 2048);
  lighting.setShadowSize(0);
  assert.equal(sun.castShadow, false);
  lighting.setShadowSize(512);
  assert.equal(sun.castShadow, true);
  assert.equal(sun.shadow.mapSize.x, 512);
});
