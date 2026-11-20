import assert from 'node:assert/strict';
import test from 'node:test';
import { pwaOptions } from '../tools/pwa';

for (const base of ['/lesnaya-nora/', '/', '/games/forest.v2/']) {
  test(`PWA stays inside ${base} and preserves the running session`, () => {
    const options = pwaOptions(base);
    const manifest = options.manifest;
    assert.ok(manifest && typeof manifest === 'object');
    assert.equal(manifest.start_url, base);
    assert.equal(manifest.scope, base);
    assert.equal(manifest.id, base);
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons?.every((icon) => icon.src.startsWith(`${base}icons/`)));
    assert.equal(options.workbox?.skipWaiting, false);
    assert.equal(options.workbox?.clientsClaim, false);
    assert.equal(options.devOptions?.enabled, false);
    assert.equal(options.workbox?.navigateFallback, `${base}index.html`);
    const routes = options.workbox?.navigateFallbackAllowlist;
    assert.ok(routes?.some((route) => route.test(`${base}index.html`)));
    if (base !== '/') assert.ok(routes?.every((route) => !route.test('/another-game/')));
    const ignored = options.workbox?.ignoreURLParametersMatching;
    assert.ok(ignored?.some((pattern) => pattern.test('v')));
    assert.ok(ignored?.every((pattern) => !pattern.test('variant')));
  });
}
