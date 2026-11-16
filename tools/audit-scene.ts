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
import {CREATURE_OPTIONS,defaultWorldConfig} from './src/game/WorldConfig.ts';
import {RabbitFactory} from './src/game/animals/RabbitFactory.ts';
import {Random} from './src/game/Random.ts';
import {GRAPHICS_PRESETS} from './src/game/GraphicsSettings.ts';
import {SceneLighting} from './src/game/session/SceneLighting.ts';
import {WorldPopulation} from './src/game/session/WorldPopulation.ts';
import {WolfDen} from './src/game/WolfDen.ts';
import {readFileSync} from 'node:fs';
for(const name of MODEL_NAMES){const data=readFileSync('public/models/'+name+'.glb');await ModelAssets.shared.register(name,data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));}
const map = process.argv.includes('--generated') ? defaultMapGeneration() : undefined;
const wolfDens = process.argv.includes('--wolf-dens');
const config = { ...defaultWorldConfig(), map };
if(wolfDens) for(const {kind} of CREATURE_OPTIONS) if(kind !== 'wolf') config.creatures[kind] = 0;
const seed = 31415;
const save = NewGameFactory.create(seed, 0, new RabbitFactory(new Random(seed)), config);
const scene = new THREE.Scene();
const world = new World(scene, seed, save);
let position = {x:0,z:0};
let denScenario;
if(wolfDens) {
  const population = new WorldPopulation({scene,world,save,rng:new Random(seed + 53),markPartner(){}});
  const site = save.wolfDens?.[0];
  if(!site) throw new Error('На контрольной карте нет волчьего логова.');
  const groundAt = (x,z)=>world.heightAt(x,z);
  const den = new WolfDen(0,site,groundAt);
  position=den.point(0,-6);
  const pack=population.predators.filter(animal=>animal.kind==='wolf');
  let now=0;
  const simulate = (clock, duration) => {
    for(let seconds=0;seconds<duration;seconds+=0.1){
      now+=0.1;
      population.ecology.prepareHabitats(now, clock + seconds * 6, pack);
      for(const wolf of pack) wolf.update(0.1,now,position.x,position.z,true,false,groundAt);
    }
    return {inside:pack.filter(wolf=>wolf.inDen).length,distances:pack.map(wolf=>Math.hypot(wolf.x-site.x,wolf.z-site.z))};
  };
  denScenario={entrance:den.entrance,approach:den.approach,facing:site.angle,rest:simulate(720,20),hunt:simulate(1090,23),return:simulate(1340,60)};
  if(denScenario.rest.inside !== 2 || denScenario.hunt.inside !== 0 ||
    denScenario.hunt.distances.some(distance=>distance < 10) || denScenario.return.inside !== 2)
    throw new Error('Стая не прошла контрольный цикл: ' + JSON.stringify(denScenario));
}
const lighting = new SceneLighting(scene, new THREE.PerspectiveCamera());
lighting.reset();
lighting.update(save, world, false, false);
world.update(420,0,'clear',1,position.x,position.z);
const presets = {};
for(const [name, settings] of Object.entries(GRAPHICS_PRESETS)) {
  world.applyGraphics(settings,position.x,position.z,'clear');
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
console.log(JSON.stringify({seed,layout:map?.layout ?? 'classic',position:[position.x,position.z],scope:wolfDens?'environment and wolves near the den':'environment in active chunks, before camera frustum and shadow passes',denScenario,presets},null,2));
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
