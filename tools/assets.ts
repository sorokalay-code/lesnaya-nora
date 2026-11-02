import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CREATURE_NAMES, MODEL_NAMES } from '../src/game/ModelAssets';

export interface AssetEntry {
  path: string;
  bytes: number;
  sha256: string;
}

/** Сканирует все ресурсы, включая новые модели, текстуры и звуковые файлы. */
export function assetManifest(directory = 'public') {
  const files: AssetEntry[] = [];
  function scan(relative: string) {
    for (const name of readdirSync(join(directory, relative)).sort()) {
      const path = relative ? `${relative}/${name}` : name;
      if (statSync(join(directory, path)).isDirectory()) scan(path);
      else {
        const data = readFileSync(join(directory, path));
        if (data.subarray(0, 60).toString().startsWith('version https://git-lfs.github.com/spec')) {
          throw new Error(`Вместо ресурса загружен указатель Git LFS: ${path}`);
        }
        files.push({
          path,
          bytes: data.length,
          sha256: createHash('sha256').update(data).digest('hex'),
        });
      }
    }
  }
  scan('');
  const required = [
    ...MODEL_NAMES.map((name) => `models/${name}.glb`),
    ...CREATURE_NAMES.map((name) => `models/${name}-low.glb`),
    ...['fur', 'leaf', 'ground', 'soil'].map((name) => `textures/${name}.png`),
  ];
  for (const path of required) {
    if (!files.some((file) => file.path === path))
      throw new Error(`Нет обязательного ресурса: ${path}`);
  }
  const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
  return { version, files };
}
