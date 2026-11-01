import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FamilyCare } from '../src/game/FamilyCare';
import { FamilyMember, RabbitActor } from '../src/game/Entities';
import { GroundItems } from '../src/game/GroundItems';
import { KitWander } from '../src/game/KitWander';
import { PartnerSupport } from '../src/game/PartnerSupport';
import { PanelRenderer } from '../src/game/PanelRenderer';
import { Random } from '../src/game/Random';
import { SaveRepository } from '../src/game/SaveRepository';
import { FoodStore } from '../src/game/Systems';
import { Excavation } from '../src/game/Excavation';
import type { SaveData, PartnerTraits } from '../src/game/types';
import type { Resource, World } from '../src/game/World';

const genes={coat:'cream' as const,ear:1,speed:3,vitality:3,size:1};
const partner:PartnerTraits={id:1,name:'Пушок',x:0,z:0,genes,preference:'bond',temperament:'заботливый',trust:80,familySize:2};
function save():SaveData{return{version:2,seed:14,clock:420,day:1,weather:'clear',messages:[],waste:[],
  player:{x:0,y:-1,z:0,genes,hunger:90,thirst:90,bodyTemp:38,energy:90,bladder:0,bowel:0,health:30,age:0,hidden:true,dirtiness:0,poison:0,milk:30},
  inventory:{clover:0,carrot:0,cabbage:0,mushroom:0,berries:0,toadstool:0,bitterleaf:0,acorn:0},
  nests:[{id:1,x:0,y:-1,z:0,quality:1}],stashes:[{id:1,x:0,y:0,z:0,food:{},materials:{grass:0,twigs:0,fur:0}}],
  materials:{grass:0,twigs:0,fur:0},excavation:[],kits:[],partners:[partner],harvested:[],pregnancy:{fatherId:1,progress:0.88},
  stats:{births:0,grown:0,survived:0,generations:1}};}

test('birth warning precedes delivery, and only an underground nest is a valid birthplace',()=>{
  const data=save(),earth={isSheltered:(_x:number,y:number)=>y< -0.2} as Excavation;
  const care=new FamilyCare(data,earth);
  assert.equal(care.advance(40),'warning');
  assert.equal(care.birthNest()?.id,1);
  assert.equal(care.advance(500),'birth');
  data.player.y=0;
  assert.equal(care.birthNest(),undefined);
  data.player.y=-1;data.nests[0].y=0;
  assert.equal(care.birthNest(),undefined);
});

test('sleep-sized time jumps cannot skip the birth warning',()=>{
  const data=save(),care=new FamilyCare(data,{isSheltered:()=>true} as unknown as Excavation);
  data.pregnancy!.progress=1.1;
  assert.equal(care.advance(330),'warning');
  assert.ok(data.pregnancy!.progress<1.2);
  assert.equal(care.advance(40),'birth');
});

test('fallen branches can be gathered, return later, and discarded food remains collectible',()=>{
  const data=save(),scene=new THREE.Scene();
  const world={treeLocations:[{x:5,z:5}],chunks:{add:(mesh:THREE.Object3D)=>scene.add(mesh)},heightAt:()=>0} as unknown as World;
  const items=new GroundItems(world,data);
  const branch=items.availableBranches(5,5,4)[0];
  assert.ok(branch);
  assert.equal(items.takeBranch(branch.id,data.clock),true);
  assert.equal(items.availableBranches(5,5,4).length,0);
  items.update(data.clock+2880);
  assert.equal(items.availableBranches(5,5,4).length,1);
  const drop=items.drop('carrot',0,0,0);
  assert.equal(items.nearest(0,0,0)?.id,drop.id);
  assert.equal(items.collect(drop,data.clock),true);
  assert.equal(data.drops?.length,0);
  const twig=items.drop('twigs',0,0,0);
  assert.equal(items.nearest(0,0,0)?.kind,'twigs');
  assert.equal(items.collect(twig,data.clock),true);
});

test('existing version-two saves gain defaults for family commands and ground items',()=>{
  const data=save();data.calendarVersion=2;delete data.mateCommand;delete data.mateMessages;
  delete data.partnerCargo;delete data.branchPicked;delete data.drops;delete data.stashes[0].materials;
  const previous=(globalThis as {localStorage?:unknown}).localStorage;
  (globalThis as {localStorage?:unknown}).localStorage={getItem:()=>JSON.stringify(data)};
  const restored=new SaveRepository('test').load();
  assert.equal(restored.mateCommand,'forage');
  assert.deepEqual(restored.drops,[]);
  assert.deepEqual(restored.stashes[0].materials,{grass:0,twigs:0,fur:0});
  (globalThis as {localStorage?:unknown}).localStorage=previous;
});

test('partner physically collects food and deposits it in the family stash',()=>{
  const data=save(),scene=new THREE.Scene();data.player.y=0;
  const resource={id:1,x:0.5,z:0,kind:'clover',available:true,mesh:new THREE.Group()} as Resource;
  const world={resources:[resource],treeLocations:[],chunks:{add:(mesh:THREE.Object3D)=>scene.add(mesh)},heightAt:()=>0,
    harvest:(r:Resource)=>{r.available=false;}} as unknown as World;
  const earth={nextStep:()=>undefined,floorAt:()=>0,isSheltered:()=>false} as unknown as Excavation;
  const items=new GroundItems(world,data),actor=new RabbitActor(partner,new Random(2));
  const support=new PartnerSupport(data,world,earth,items,new Random(3));
  support.update(actor,0.5,1,data.stashes[0],data.stashes[0],()=>0);
  assert.equal(resource.available,false);
  assert.equal(data.stashes[0].food.clover,undefined);
  support.update(actor,0.5,2,data.stashes[0],data.stashes[0],()=>0);
  assert.equal(data.stashes[0].food.clover,1);
  assert.equal(data.stashes[0].materials?.grass,1);
  assert.equal(data.stashes[0].materials?.fur,1);
  assert.equal(new FoodStore(data).withdraw(data.stashes[0]),3);
  assert.equal(data.materials.fur,1);
  assert.equal(data.inventory.clover,1);
});

test('partner can return from the surface to an underground family nest',()=>{
  const data=save();data.excavation=[{x:0,y:-0.5,z:0}];
  const world={heightAt:()=>0,addGroundHole:()=>{},rootAt:()=>undefined} as unknown as World;
  const earth=new Excavation(new THREE.Scene(),world,data);
  const mate={...partner,x:3,z:0},actor=new RabbitActor(mate,new Random(9));
  actor.rig.root.userData.baseY=0;
  for(let frame=0;frame<240;frame++)actor.navigateMate(1/60,frame/60,{x:0,y:-0.5,z:0},earth,()=>0);
  assert.ok(Math.hypot(actor.data.x,actor.data.z)<0.8);
  assert.ok((actor.rig.root.userData.baseY as number)< -0.2);
  for(let frame=240;frame<480;frame++)actor.navigateMate(1/60,frame/60,{x:5,y:0,z:0},earth,()=>0);
  assert.ok(actor.data.x>3);
  assert.ok((actor.rig.root.userData.baseY as number)>-0.1);
});

test('other rabbits spread out and kits choose individual tunnel destinations',()=>{
  const a=new FamilyMember(partner,genes,0,false),b=new FamilyMember(partner,genes,1,false);
  a.update(1,0.1,()=>0);b.update(1,0.1,()=>0);
  assert.ok(Math.hypot(a.rig.root.position.x-b.rig.root.position.x,a.rig.root.position.z-b.rig.root.position.z)>3);
  const kit={id:1,age:0.2,x:0,y:-1,z:0,homeX:0,homeY:-1,homeZ:0} as SaveData['kits'][number];
  const earth={floorAt:()=>-1,isSheltered:(x:number,y:number,z:number)=>y<0&&Math.hypot(x,z)<3.5,canMoveTo:()=>true} as unknown as Excavation;
  const wander=new KitWander(new Random(15)),home={x:0,y:-1,z:0};
  const first=wander.target(kit,home,1,earth,()=>0);
  assert.ok(Math.hypot(first.x,first.z)>0.4);
  assert.deepEqual(wander.target(kit,home,2,earth,()=>0),first);
  assert.equal(earth.isSheltered(first.x,first.y,first.z),true);
});

test('partner panel exposes commands and escapes typed messages',()=>{
  const data=save();data.mateId=1;data.mateMessages=[{from:'player',text:'<script>hello</script>',clock:420}];
  const html=new PanelRenderer().matePanel(data,partner);
  assert.match(html,/mate-command:follow/);
  assert.match(html,/mate-command:stay/);
  assert.match(html,/mate-command:forage/);
  assert.match(html,/mate-send/);
  assert.match(html,/&lt;script&gt;hello&lt;\/script&gt;/);
  assert.equal(html.includes('<script>'),false);
  assert.deepEqual(FamilyCare.growth({age:1,hunger:20} as SaveData['kits'][number]),
    {progress:33,daysLeft:2,feedsNeeded:3,food:'молоко или овощи'});
});
