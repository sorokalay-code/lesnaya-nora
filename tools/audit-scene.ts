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
import {isShelteredWildlife} from './src/game/WildlifeShelterProfiles.ts';
import {MAMMAL_NURSERY} from './src/game/MammalNursery.ts';
import {readFileSync} from 'node:fs';
for(const name of MODEL_NAMES){const data=readFileSync('public/models/'+name+'.glb');await ModelAssets.shared.register(name,data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));}
const map = process.argv.includes('--generated') ? defaultMapGeneration() : undefined;
const wolfDens = process.argv.includes('--wolf-dens');
const wildlifeShelters = process.argv.includes('--wildlife-shelters');
const mammalNurseries = process.argv.includes('--mammal-nurseries');
const config = { ...defaultWorldConfig(), map };
if(wolfDens) for(const {kind} of CREATURE_OPTIONS) if(kind !== 'wolf') config.creatures[kind] = 0;
if(wildlifeShelters) for(const {kind} of CREATURE_OPTIONS) config.creatures[kind] = isShelteredWildlife(kind) || kind === 'roe-deer' ? 1 : 0;
if(mammalNurseries) for(const {kind} of CREATURE_OPTIONS) config.creatures[kind] = kind === 'wolf' ? 3 : kind === 'marmot' ? 4 : 0;
const seed = 31415;
const save = NewGameFactory.create(seed, 0, new RabbitFactory(new Random(seed)), config);
const scene = new THREE.Scene();
const world = new World(scene, seed, save);
let position = {x:0,z:0};
let denScenario;
let shelterScenario;
let nurseryScenario;
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
if(wildlifeShelters) {
  const population = new WorldPopulation({scene,world,save,rng:new Random(seed + 53),markPartner(){}});
  const shelters = save.wildlifeShelters ?? [];
  if(shelters.length !== 7) throw new Error('Не размещены все семь укрытий: ' + JSON.stringify(shelters));
  position = shelters.find(site=>site.kind==='marmot');
  const groundAt = (x,z)=>world.heightAt(x,z);
  let time=0;
  const simulate = (clock, duration) => {
    for(let seconds=0;seconds<duration;seconds+=0.1){
      time+=0.1;
      population.ecology.update(0.1,time,clock,0,0,groundAt,population.predators,false);
    }
    return Object.fromEntries(population.wildlife.map(animal=>[animal.kind,{
      hidden:animal.inShelter,clip:animal.model.activeName,x:animal.x,z:animal.z,
    }]));
  };
  const day=simulate(750,30);
  const night=simulate(1290,45);
  const dawn=simulate(1740,12);
  if(!day.badger.hidden || day.marmot.hidden || night.badger.hidden || !night.marmot.hidden || dawn.marmot.hidden || day['roe-deer'].clip!=='rest')
    throw new Error('Сбой суточного цикла наземных животных: ' + JSON.stringify({day,night,dawn}));
  shelterScenario={shelters,day,night,dawn};
}
if(mammalNurseries) {
  const population = new WorldPopulation({scene,world,save,rng:new Random(seed + 53),markPartner(){}});
  const groundAt = (x,z) => world.heightAt(x,z);
  const site = save.wolfDens?.[0];
  if(!site) throw new Error('На контрольной карте нет волчьего логова.');
  const den = new WolfDen(0,site,groundAt);
  position=den.point(0,-6);
  let now=0;
  const step = (clock, duration) => {
    for(let seconds=0;seconds<duration;seconds+=0.2){
      now+=0.2;
      save.clock=clock+seconds*6;
      population.ecology.prepareHabitats(now,save.clock,population.predators);
      for(const wolf of population.predators)
        wolf.update(0.2,now,position.x,position.z,true,false,groundAt);
      population.ecology.update(0.2,now,save.clock,position.x,position.z,groundAt,population.predators,false);
    }
    return {
      wolves:population.predators.filter(animal=>animal.juvenile).map(animal=>({
        id:animal.root.userData.remainsIdentity, inside:animal.inDen, size:animal.growthScale,
        x:animal.x,z:animal.z,distance:Math.hypot(animal.x-den.entrance.x,animal.z-den.entrance.z),
      })),
      marmots:population.wildlife.filter(animal=>animal.juvenile).map(animal=>({
        id:animal.root.userData.remainsIdentity,inside:animal.inShelter,x:animal.x,z:animal.z,
      })),
    };
  };
  step(save.clock,0.2);
  const due=save.mammalNurseries?.['wolf:0']?.dueAt;
  if(!due) throw new Error('Стая не завела выводок.');
  const born=step(due,3);
  const meeting=step(due+MAMMAL_NURSERY.wolf.meeting+12,40);
  const dawn=step(Math.ceil((due+MAMMAL_NURSERY.wolf.meeting)/1440)*1440+360,15);
  if(born.wolves.length !== 2 || born.wolves.some(wolf=>!wolf.inside) ||
    !born.marmots.length || born.marmots.some(marmot=>!marmot.inside) ||
    meeting.wolves.length !== 2 || meeting.wolves.some(wolf=>wolf.inside || wolf.distance < 5 || wolf.size > 0.55) ||
    !dawn.marmots.some(marmot=>!marmot.inside))
    throw new Error('Выводки не прошли контрольный цикл: ' + JSON.stringify({born,meeting,dawn}));
  nurseryScenario={entrance:den.entrance,due,born,meeting,dawn};
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
console.log(JSON.stringify({seed,layout:map?.layout ?? 'classic',position:[position.x,position.z],scope:mammalNurseries?'litters in and around dens and burrows':wildlifeShelters?'wildlife and shelters near a marmot burrow':wolfDens?'environment and wolves near the den':'environment in active chunks, before camera frustum and shadow passes',denScenario,shelterScenario,nurseryScenario,presets},null,2));
`,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
try {
  await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
