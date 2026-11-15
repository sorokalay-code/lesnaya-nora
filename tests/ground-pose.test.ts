import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Vector3 } from 'three';
import { traceGround } from '../src/game/GroundContact';
import { GroundPose } from '../src/game/GroundPose';

test('animals lean with a hillside regardless of heading, while physics and flying poses stay separate', () => {
  const slope = (x: number, z: number) => 0.6 * x - 0.35 * z;
  const root = new Group();
  const model = new Group();
  root.add(model);
  root.position.set(8, slope(8, -6), -6);
  const position = root.position.clone();
  const expected = new Vector3(-0.6, 1, 0.35).normalize();
  for (const heading of [0, Math.PI / 2, -2.2]) {
    root.rotation.y = heading;
    GroundPose.contact(root, 8, -6, slope);
    GroundPose.present(root);
    assert.ok(
      new Vector3(0, 1, 0)
        .applyQuaternion(model.getWorldQuaternion(model.quaternion.clone()))
        .distanceTo(expected) < 1e-9,
    );
    assert.deepEqual(root.position, position);
    assert.equal(root.rotation.y, heading);
  }
  root.userData.jumping = true;
  GroundPose.contact(root, 8, -6, slope);
  GroundPose.present(root);
  assert.equal(model.quaternion.x, 0);
  assert.equal(model.quaternion.z, 0);
});

test('ground steps keep continuous contact, slow uphill and stop at an unwalkable ledge', () => {
  const direction = { x: 0, y: 0, z: 0 };
  const ground = (x: number) => (x > 1 ? 2.6 : x * 0.7);
  const step = { heightAt: ground, surfaceSpeed: true };
  const uphill = traceGround(direction, 1, 0, step);
  const downhill = traceGround({ x: 1, y: ground(1), z: 0 }, 0, 0, step);
  assert.ok(uphill.x > 0.6 && uphill.x < 0.8);
  assert.ok(1 - downhill.x > uphill.x && downhill.x > 0);
  assert.equal(uphill.y, ground(uphill.x));
  assert.equal(downhill.y, ground(downhill.x));
  assert.equal(traceGround({ x: 1, y: ground(1), z: 0 }, 2, 0, step).x, 1);
});
