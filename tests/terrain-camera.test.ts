import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {World} from '../src/game/World';
import {FamilyMember, Hawk, Predator, RabbitActor, RabbitFactory} from '../src/game/Entities';
import {Random} from '../src/game/Random';
import {ViewCamera} from '../src/game/ViewCamera';
import {createForestAnimal, type WildlifeKind} from '../src/game/Wildlife';

const scene=new THREE.Scene();
const world=new World(scene,31415);
const groundAt=(x:number,z:number)=>world.heightAt(x,z);

test('gameplay height follows the exact triangles of the rendered terrain',()=>{
  const ground=(world as unknown as {groundMesh:THREE.Mesh}).groundMesh;
  for(const [x,z] of [[12.23,5.71],[-35.36,22.48],[43.84,-18.11],[0.27,-0.64]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,40,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(ground,false)[0];
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.y-world.heightAt(x,z))<0.0001);
  }
});

test('pond and swamp water vertices lie directly on the local terrain',()=>{
  const water:THREE.Mesh[]=[];
  scene.traverse(object=>{if(object instanceof THREE.Mesh&&['pond-water','swamp-water'].includes(object.name))water.push(object);});
  assert.ok(water.some(mesh=>mesh.name==='pond-water'));
  for(const mesh of water){
    const offset=mesh.name==='pond-water'?0.035:0.025;
    const positions=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for(let i=0;i<positions.count;i++)
      assert.ok(Math.abs(positions.getY(i)-groundAt(positions.getX(i),positions.getZ(i))-offset)<0.0001);
  }
});

test('garden soil follows the relief along each row',()=>{
  const rows:THREE.Mesh[]=[];
  scene.traverse(object=>{if(object instanceof THREE.Mesh&&object.name==='garden-soil')rows.push(object);});
  assert.ok(rows.length>2);
  for(const mesh of rows){
    const positions=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for(let i=0;i<positions.count;i++)
      assert.ok(Math.abs(positions.getY(i)-groundAt(positions.getX(i),positions.getZ(i))-0.045)<0.0001);
  }
});

test('rabbits and predators stay grounded while moving across a hill',()=>{
  const rng=new Random(44),factory=new RabbitFactory(rng),partner=factory.partners(1)[0];
  partner.x=51;partner.z=23;
  const rabbit=new RabbitActor(partner,rng),member=new FamilyMember(partner,factory.genes(),0,false);
  const predator=new Predator('fox',52,22,rng);
  for(const time of [1,1.016,1.032,1.048]){
    rabbit.update(0.016,time,-80,-80,groundAt);
    member.update(time,0.016,groundAt);
    predator.update(0.016,time,-80,-80,false,true,groundAt);
    for(const root of [rabbit.rig.root,member.rig.root,predator.root]){
      const delta=root.position.y-groundAt(root.position.x,root.position.z);
      assert.ok(delta>=-0.001&&delta<0.2);
    }
  }
  const hawk=new Hawk(43,11,rng);
  hawk.update(0.016,5,-80,-80,false,groundAt);
  assert.ok(hawk.root.position.y-groundAt(hawk.x,hawk.z)>10);
  assert.ok(Math.abs(hawk.shadow.position.y-groundAt(hawk.x,hawk.z)-0.05)<0.0001);
});

test('new forest animals wander on terrain and react to nearby predators',()=>{
  const kinds:WildlifeKind[]=['deer','squirrel','hedgehog','beaver'];
  for(const [index,kind] of kinds.entries()){
    const animal=createForestAnimal(kind,25+index*2,12,new Random(index+500));
    const startX=animal.x,startZ=animal.z;
    for(let frame=0;frame<180;frame++)animal.update(1/60,frame/60,groundAt,[{x:startX+1,z:startZ}]);
    assert.ok(Math.hypot(animal.x-startX,animal.z-startZ)>0.1);
    assert.ok(Math.abs(animal.root.position.y-groundAt(animal.x,animal.z))<0.001);
    assert.equal((animal as unknown as {legs:THREE.Group[]}).legs.length,4);
  }
});

test('view switches between eye height and the orbit camera',()=>{
  const camera=new THREE.PerspectiveCamera(60,1,0.1,350);
  const canvas={addEventListener:()=>{}} as unknown as HTMLCanvasElement;
  const view=new ViewCamera(camera,canvas);
  view.setMode('first');view.update(4,5,2);
  assert.equal(view.isFirstPerson,true);
  assert.ok(Math.abs(camera.position.y-2.82)<0.0001);
  assert.ok(Math.hypot(camera.position.x-4,camera.position.z-5)<0.0001);
  assert.equal(camera.children[0].visible,true);
  view.toggleMode();view.update(4,5,2);
  assert.equal(view.mode,'third');
  assert.ok(Math.hypot(camera.position.x-4,camera.position.z-5)>3);
  assert.equal(camera.children[0].visible,false);
});
