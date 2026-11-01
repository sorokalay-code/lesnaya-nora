import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ModelAssets, MODEL_NAMES } from '../src/game/ModelAssets';
import { animateRabbit, createRabbit, setRabbitAction } from '../src/game/Models';
import { loadModels } from './model-fixture';

await loadModels(...MODEL_NAMES);

test('every creature and family prop loads from a GLB with mesh geometry',()=>{
  for(const name of MODEL_NAMES){
    const model=ModelAssets.shared.create(name);
    let meshes=0;
    model.root.traverse(object=>{if(object instanceof THREE.Mesh)meshes++;});
    assert.ok(meshes>0,`${name} has no meshes`);
    if(['rabbit','fox','wolf','dog','lynx','weasel','bear','snake','hawk','deer','squirrel','hedgehog','beaver','moose'].includes(name))
      assert.ok(model.clips.size>0,`${name} has no animations`);
  }
});

test('rabbit instances have independent coat materials and animated digging paws',()=>{
  const base={ear:1,speed:3,vitality:3,size:1};
  const cream=createRabbit({...base,coat:'cream'}),black=createRabbit({...base,coat:'black'});
  const a=cream.root.getObjectByName('Body') as THREE.Mesh;
  const b=black.root.getObjectByName('Body') as THREE.Mesh;
  assert.notEqual(a.material,b.material);
  assert.notEqual((a.material as THREE.MeshStandardMaterial).color.getHex(),(b.material as THREE.MeshStandardMaterial).color.getHex());
  const paw=cream.root.getObjectByName('PawFL')!;
  setRabbitAction(cream,'dig',0,2);
  animateRabbit(cream,.1,false,false,.1);
  assert.ok(Math.abs(paw.rotation.x)>.05);
});
