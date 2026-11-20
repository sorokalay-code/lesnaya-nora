import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assetManifest } from './assets';

const manifest = assetManifest();
const published = JSON.parse(readFileSync('dist/asset-manifest.json', 'utf8'));
assert.equal(published.version, manifest.version, 'Версия ресурсов сборки устарела');
assert.deepEqual(published.files, manifest.files);
for (const file of manifest.files) {
  assert.deepEqual(
    readFileSync(join('dist', file.path)),
    readFileSync(join('public', file.path)),
    file.path,
  );
}
const html = readFileSync('dist/index.html', 'utf8');
const base = process.env.VITE_BASE_PATH ?? '/lesnaya-nora/';
for (const match of html.matchAll(/(?:src|href)="([^"?#]+)"/g)) {
  const url = match[1];
  if (/^https?:/.test(url)) continue;
  assert.ok(url.startsWith(base), `Путь вне base: ${url}`);
  assert.ok(existsSync(join('dist', url.slice(base.length))), `Не найден файл: ${url}`);
}
assert.ok(!html.includes('/src/'), 'В сборке осталась ссылка на исходники');
const pwa = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
assert.equal(pwa.start_url, base);
assert.equal(pwa.scope, base);
assert.equal(pwa.id, base);
assert.equal(pwa.display, 'standalone');
assert.ok(html.includes(`${base}manifest.webmanifest`), 'HTML не подключает PWA-манифест');
assert.ok(html.includes(`${base}registerSW.js`), 'HTML не регистрирует service worker');
const worker = readFileSync('dist/sw.js', 'utf8');
// Проверяем итоговый precache, чтобы лимит размера или новая маска не потеряли ресурсы.
for (const file of manifest.files) {
  assert.ok(worker.includes(JSON.stringify(file.path)), `Нет офлайн-ресурса: ${file.path}`);
}
assert.ok(worker.includes('index.html'), 'Нет офлайн-страницы запуска');
for (const size of [192, 512]) {
  const icon = readFileSync(`dist/icons/icon-${size}.png`);
  assert.equal(icon.readUInt32BE(16), size);
  assert.equal(icon.readUInt32BE(20), size);
}
console.log(
  `Деплой проверен: ${manifest.files.length} ресурсов, версия ${manifest.version}, base ${base}`,
);
