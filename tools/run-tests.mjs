import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite'));
const { build } = await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
const directory = await mkdtemp(join(tmpdir(), 'lesnaya-nora-tests-'));

try {
  const tests = (await readdir('tests')).filter((file) => /\.test\.tsx?$/.test(file));
  await build({
    entryPoints: tests.map((file) => join('tests', file)),
    outdir: directory,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    banner: {
      js: `import {createRequire as testRequire} from 'node:module';const require=testRequire(${JSON.stringify(pathToFileURL(resolve('package.json')).href)});`,
    },
  });
  const files = (await readdir(directory)).filter((file) => file.endsWith('.mjs'));
  const result = spawnSync(
    process.execPath,
    ['--test', ...files.map((file) => join(directory, file))],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  // Удаляем только временный каталог, созданный именно этим запуском тестов.
  if (resolve(directory).startsWith(resolve(tmpdir()) + sep)) {
    await rm(directory, { recursive: true, force: true });
  }
}
