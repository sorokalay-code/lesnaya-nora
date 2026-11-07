import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('low-health vignette does not intercept clicks on desktop UI', () => {
  const styles = readFileSync('src/ui/components/LowHealthVignette.css', 'utf8');

  assert.match(
    styles,
    /\.ui-layer\s*>\s*\.low-health-vignette\s*\{[^}]*pointer-events:\s*none\s*;/s,
  );
});
