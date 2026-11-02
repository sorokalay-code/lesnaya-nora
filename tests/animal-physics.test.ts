import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimalPhysics, type PhysicalBody } from '../src/game/AnimalPhysics';

function body(id: number, x: number, z: number, sheltered = false, y = 0, mass = 1): PhysicalBody {
  const item: PhysicalBody = {
    id,
    x,
    y,
    z,
    radius: 0.5,
    mass,
    sheltered,
    moveTo() {
      return true;
    },
  };
  return item;
}
test('nearby animals separate without moving a fixed player', () => {
  const player = body(0, 0, 0, false, 0, Infinity),
    rabbit = body(1, 0.25, 0);
  new AnimalPhysics().resolve([player, rabbit]);
  assert.equal(player.x, 0);
  assert.ok(Math.hypot(rabbit.x - player.x, rabbit.z - player.z) > 0.25);
});
test('surface animals do not collide with animals inside a tunnel', () => {
  const surface = body(1, 0, 0),
    tunnel = body(2, 0, 0, true, -1);
  new AnimalPhysics().resolve([surface, tunnel]);
  assert.equal(surface.x, 0);
  assert.equal(tunnel.x, 0);
});
test('spatial grid resolves neighboring cells', () => {
  const a = body(1, 2.9, 0),
    b = body(2, 3.2, 0);
  new AnimalPhysics().resolve([a, b]);
  assert.ok(b.x - a.x > 0.3);
});
