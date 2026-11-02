import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),viteRequire=createRequire(require.resolve('vite'));
const {build}=await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
const result=await build({stdin:{resolveDir:process.cwd(),sourcefile:'scene-audit.ts',contents:`
import * as THREE from 'three';
import {ModelAssets,MODEL_NAMES} from './src/game/ModelAssets.ts';
import {World} from './src/game/World.ts';
import {readFileSync} from 'node:fs';
for(const name of MODEL_NAMES){const data=readFileSync('public/models/'+name+'.glb');await ModelAssets.shared.register(name,data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));}
const scene=new THREE.Scene(),world=new World(scene,31415);world.update(420,0,'clear',1,0,0);
let meshes=0,triangles=0,shadowMeshes=0;
scene.traverseVisible(object=>{if(object.isMesh){meshes++;shadowMeshes+=Number(object.castShadow);triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);}});
console.log(JSON.stringify({seed:31415,position:[0,0],scope:'environment in active chunks, before camera frustum and shadow passes',meshes,triangles,shadowMeshes},null,2));
`},bundle:true,platform:'node',format:'esm',write:false});
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
