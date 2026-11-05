import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StartupLoader } from '../src/ui/components/StartupLoader';

test('startup loader shows resource progress', () => {
  const markup = renderToStaticMarkup(
    createElement(StartupLoader, { loaded: 42, total: 100, onRetry: () => {} }),
  );

  assert.match(markup, /Загружено ресурсов: 42 из 100/);
  assert.match(markup, /value="42"/);
  assert.match(markup, /42%/);
});

test('startup loader offers a retry when resource loading fails', () => {
  const markup = renderToStaticMarkup(
    createElement(StartupLoader, {
      loaded: 0,
      total: 0,
      error: true,
      onRetry: () => {},
    }),
  );

  assert.match(markup, /Не удалось загрузить ресурсы/);
  assert.match(markup, /Обновить страницу/);
  assert.doesNotMatch(markup, /<progress/);
});
