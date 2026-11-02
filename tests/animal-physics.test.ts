import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimalPhysics, type PhysicalBody } from '../src/game/AnimalPhysics';
import { bodyContact } from '../src/game/BodyContact';

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

test('capsule contacts separate long rabbit bodies at different headings and scales', () => {
  for (const heading of [0, Math.PI / 2, Math.PI / 4]) {
    const player = {
      ...body(0, 0, 0, false, 0, Infinity),
      halfLength: 0.4,
      heading: 0,
      radius: 0.43,
    };
    const rabbit = { ...body(1, 0.2, 0.8), halfLength: 0.4, heading, radius: 0.43 };
    new AnimalPhysics().resolve([player, rabbit]);
    assert.ok(bodyContact(player, rabbit).distance >= player.radius + rabbit.radius - 0.001);
    assert.equal(player.x, 0);
    assert.equal(player.z, 0);
  }
});

test('when one body cannot move against a wall, the other body takes the separation', () => {
  const blocked = body(1, 0, 0),
    mobile = body(2, 0.2, 0);
  blocked.moveTo = () => false;
  new AnimalPhysics().resolve([blocked, mobile]);
  assert.equal(blocked.x, 0);
  assert.ok(Math.hypot(mobile.x, mobile.z) >= 0.999);
});

test('repeated following cannot penetrate the fixed mother or other small bodies', () => {
  const mother = { ...body(0, 0, 0, false, 0, Infinity), halfLength: 0.4, radius: 0.43 };
  const kits = Array.from({ length: 4 }, (_, i) => ({
    ...body(i + 1, 0, 0),
    radius: 0.2,
    halfLength: 0.18,
  }));
  const physics = new AnimalPhysics();
  for (let frame = 0; frame < 120; frame++) {
    for (const kit of kits) {
      kit.x *= 0.98;
      kit.z *= 0.98;
    }
    physics.resolve([mother, ...kits]);
  }
  for (const kit of kits)
    assert.ok(bodyContact(mother, kit).distance >= mother.radius + kit.radius - 0.005);
});
