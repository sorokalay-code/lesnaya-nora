import { build } from 'esbuild';
const result = await build({
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: 'scene-audit.ts',
    contents: `
import * as THREE from 'three';
import {ModelAssets,MODEL_NAMES} from './src/game/ModelAssets.ts';
import {World} from './src/game/World.ts';
import {defaultMapGeneration} from './src/game/MapGeneration.ts';
import {NewGameFactory} from './src/game/session/NewGameFactory.ts';
import {defaultWorldConfig} from './src/game/WorldConfig.ts';
import {RabbitFactory} from './src/game/animals/RabbitFactory.ts';
import {Random} from './src/game/Random.ts';
import {GRAPHICS_PRESETS} from './src/game/GraphicsSettings.ts';
import {readFileSync} from 'node:fs';
for(const name of MODEL_NAMES){const data=readFileSync('public/models/'+name+'.glb');await ModelAssets.shared.register(name,data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));}
const map = process.argv.includes('--generated') ? defaultMapGeneration() : undefined;
const save = NewGameFactory.create(31415, 0, new RabbitFactory(new Random(31415)), { ...defaultWorldConfig(), map });
const scene=new THREE.Scene(),world=new World(scene,31415,save);world.update(420,0,'clear',1,0,0);
const presets = {};
for(const [name, settings] of Object.entries(GRAPHICS_PRESETS)) {
  world.applyGraphics(settings,0,0,'clear');
  let meshes=0,triangles=0,shadowMeshes=0,coverInstances=0;
  scene.traverseVisible(object=>{
    if (!object.isMesh) return;
    meshes++;
    shadowMeshes += Number(settings.shadows !== 'off' && object.castShadow);
    triangles += (object.geometry.index?.count??object.geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);
    if (object.name === 'billboard-ground-cover') coverInstances += object.count;
  });
  presets[name] = { meshes, triangles, shadowMeshes, coverInstances };
}
console.log(JSON.stringify({seed:31415,layout:map?.layout ?? 'classic',position:[0,0],scope:'environment in active chunks, before camera frustum and shadow passes',presets},null,2));
`,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);
