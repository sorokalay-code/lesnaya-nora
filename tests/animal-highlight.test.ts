import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ConversationFocus } from '../src/game/session/ConversationFocus';

test('only the current listener is highlighted and switching reuses resources without changing coats', () => {
  const coat = new THREE.MeshStandardMaterial({ color: 0x503b29 });
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const scene = new THREE.Scene();
  const animals = [new THREE.Group(), new THREE.Group()];
  for (const animal of animals) {
    const body = new THREE.Mesh(geometry, coat);
    body.position.y = 1;
    animal.add(body);
    scene.add(animal);
  }
  animals[1].scale.setScalar(0.55);
  animals[1].position.set(2, 3, 4);
  const focus = new ConversationFocus();
  focus.select(animals[0]);
  const marker = animals[0].getObjectByName('conversation-highlight')!;
  assert.ok(marker);
  assert.equal(animals[1].getObjectByName(marker.name), undefined);
  focus.select(animals[0]);
  assert.equal(animals[0].children.filter((child) => child === marker).length, 1);
  const ring = marker.children[0] as THREE.Mesh;
  const ringGeometry = ring.geometry;
  const markerMaterial = ring.material as THREE.Material;
  focus.select(animals[1]);
  assert.equal(animals[0].getObjectByName(marker.name), undefined);
  assert.equal(animals[0].userData.conversing, false);
  assert.equal(animals[1].getObjectByName(marker.name), marker);
  assert.equal(ring.geometry, ringGeometry);
  assert.equal(ring.material, markerMaterial);
  scene.updateMatrixWorld(true);
  const position = new THREE.Vector3();
  ring.getWorldPosition(position);
  assert.ok(Math.abs(position.y - 3.035) < 0.001);
  marker.children[1].getWorldPosition(position);
  assert.ok(position.y > 4.1);
  assert.equal(coat.color.getHex(), 0x503b29);
  focus.select();
  assert.equal(marker.parent, null);
  assert.equal(animals[1].userData.conversing, false);
  focus.dispose();
  geometry.dispose();
  coat.dispose();
});

test('ending the owner disposes only the highlight geometry and material', () => {
  const animal = new THREE.Group();
  const coat = new THREE.MeshBasicMaterial();
  const geometry = new THREE.SphereGeometry();
  animal.add(new THREE.Mesh(geometry, coat));
  const focus = new ConversationFocus();
  focus.select(animal);
  const marker = animal.getObjectByName('conversation-highlight')!;
  let markerResourcesReleased = 0;
  let animalResourcesReleased = 0;
  const meshes = marker.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh,
  );
  for (const mesh of meshes)
    mesh.geometry.addEventListener('dispose', () => markerResourcesReleased++);
  (meshes[0].material as THREE.Material).addEventListener(
    'dispose',
    () => markerResourcesReleased++,
  );
  coat.addEventListener('dispose', () => animalResourcesReleased++);
  geometry.addEventListener('dispose', () => animalResourcesReleased++);
  focus.dispose();
  assert.equal(markerResourcesReleased, 3);
  assert.equal(animalResourcesReleased, 0);
  assert.equal(marker.parent, null);
  assert.equal(animal.userData.conversing, false);
  geometry.dispose();
  coat.dispose();
});
