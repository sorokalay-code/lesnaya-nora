import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assetManifest } from '../tools/assets';
import { assetUrl } from '../src/game/AssetPaths';

test('asset URLs are relative to the configured site base and include a cache version', () => {
  assert.equal(assetUrl('/models/rabbit.glb'), '/models/rabbit.glb?v=dev');
});

test('manifest catches missing resources and changes version for added or replaced sound files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lesnaya-assets-'));
  try {
    assert.throws(() => assetManifest(directory), /Нет обязательного ресурса/);
    for (const file of assetManifest().files) {
      mkdirSync(join(directory, file.path, '..'), { recursive: true });
      copyFileSync(join('public', file.path), join(directory, file.path));
    }
    const original = assetManifest(directory).version;
    mkdirSync(join(directory, 'sounds'));
    writeFileSync(join(directory, 'sounds/bird.ogg'), 'first');
    const added = assetManifest(directory).version;
    assert.notEqual(added, original);
    writeFileSync(join(directory, 'sounds/bird.ogg'), 'second');
    assert.notEqual(assetManifest(directory).version, added);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
