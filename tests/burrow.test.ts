import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BurrowSystem } from '../src/game/BurrowSystem';
import { Terrain } from '../src/game/Terrain';
import { SaveRepository } from '../src/game/SaveRepository';
import type { SaveData } from '../src/game/types';
import { World } from '../src/game/World';

function fixture():SaveData {
  return {
    version:1,seed:9,clock:420,day:1,weather:'clear',messages:[],waste:[],
    player:{x:2,z:2,genes:{coat:'cream',ear:1,speed:3,vitality:3,size:1},hunger:90,thirst:90,bodyTemp:38,energy:90,bladder:0,health:100,age:0,hidden:false,dirtiness:0,poison:0,milk:10},
    inventory:{clover:0,carrot:0,cabbage:0,mushroom:0,berries:0,toadstool:0,bitterleaf:0,acorn:0},
    burrows:[{id:1,x:2,z:2,depth:1,stores:0,bedding:1,isHome:true}],nests:[],materials:{grass:0,twigs:0,fur:0},
    underground:null,excavation:[],kits:[],partners:[],harvested:[],pregnancy:null,
    stats:{births:0,grown:0,survived:0,generations:1},
  };
}
function fakeWorld():World {
  return {heightAt:(x:number,z:number)=>x*0.05+z*0.03,rootAt:()=>undefined,addGroundHole:()=>{}} as unknown as World;
}

test('connected excavations use global coordinates and persist',()=>{
  const save=fixture(),burrows=new BurrowSystem(new THREE.Scene(),fakeWorld(),save);
  burrows.enter(save.burrows[0]);
  assert.equal(burrows.earth.isOpen(2,2,0),true);
  assert.equal(burrows.digAhead(0).success,true);
  burrows.move(0,-1.1);
  assert.ok(save.player.z<2);
  const second=burrows.createEntrance(2,-2);
  assert.equal(second.z,-2);
  burrows.earth.excavate(2,-2,0);
  burrows.earth.excavate(2,-4,0);
  const restored=new BurrowSystem(new THREE.Scene(),fakeWorld(),structuredClone(save));
  assert.equal(restored.earth.isOpen(2,-4,0),true);
  assert.equal(restored.earth.isOpen(2,2,0),true);
});

test('vertical excavation stops at 50 metres and exit requires the surface shaft',()=>{
  const save=fixture(),burrows=new BurrowSystem(new THREE.Scene(),fakeWorld(),save);
  burrows.enter(save.burrows[0]);
  assert.equal(burrows.exit(),true);
  burrows.enter(save.burrows[0]);
  for(let i=1;i<=24;i++)assert.equal(burrows.changeLevel(1).success,true);
  assert.equal(burrows.earth.depth(burrows.level),50);
  assert.equal(burrows.changeLevel(1).success,false);
  assert.equal(burrows.exit(),false);
  for(let i=24;i>=1;i--)assert.equal(burrows.changeLevel(-1).success,true);
  assert.equal(burrows.exit(),true);
});

test('camera is pulled inside an excavated cell when a wall blocks it',()=>{
  const save=fixture(),burrows=new BurrowSystem(new THREE.Scene(),fakeWorld(),save);
  const y=burrows.earth.floorY(2,2,0);
  const result=burrows.earth.cameraPoint(new THREE.Vector3(2,y+0.7,2),new THREE.Vector3(2,y+1.1,5),0);
  assert.ok(result.z<3);
  assert.ok(result.y>y+0.5&&result.y<y+1.7);
});

test('height and local temperature vary with relief',()=>{
  const terrain=new Terrain(1701);
  const heights=[];for(let x=-80;x<=80;x+=16)for(let z=-80;z<=80;z+=16)heights.push(terrain.heightAt(x,z));
  assert.ok(Math.max(...heights)-Math.min(...heights)>3);
  const hill=heights.indexOf(Math.max(...heights)),low=heights.indexOf(Math.min(...heights));
  const coord=(i:number)=>({x:-80+Math.floor(i/11)*16,z:-80+(i%11)*16});
  const h=coord(hill),l=coord(low);
  assert.ok(terrain.temperatureOffset(h.x,h.z)<terrain.temperatureOffset(0,0));
  assert.ok(terrain.temperatureOffset(l.x,l.z)<=0);
});

test('surface plants and their underground roots share positions',()=>{
  const world=new World(new THREE.Scene(),901,fixture());
  const plant=world.resources.find(r=>r.kind==='carrot'&&world.rootAt(r.x,r.z,2)===r);
  assert.ok(plant);
  assert.equal(plant.mesh.position.y,world.heightAt(plant.x,plant.z));
  assert.equal(world.rootAt(plant.x,plant.z,2),plant);
  world.harvest(plant,420);
  assert.equal(plant.available,false);
  assert.notEqual(world.rootAt(plant.x,plant.z,6),plant);
});

test('legacy local tunnel cells migrate to the shared world grid',()=>{
  const save=fixture();save.burrows[0].cells=['0:0,0','0:1,0','1:1,0'];
  save.underground={burrowId:1,x:2,z:0,level:1};
  delete save.excavation;
  const previous=(globalThis as unknown as {localStorage?:unknown}).localStorage;
  (globalThis as unknown as {localStorage:unknown}).localStorage={getItem:()=>JSON.stringify(save),setItem:()=>{}};
  try{
    const loaded=new SaveRepository().load();
    assert.ok(loaded.excavation?.includes('0:2,1'));
    assert.ok(loaded.excavation?.includes('1:2,1'));
    assert.equal(loaded.underground?.x,4);
    assert.equal(loaded.player.x,4);
  }finally{(globalThis as unknown as {localStorage?:unknown}).localStorage=previous;}
});
