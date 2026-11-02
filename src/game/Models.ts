import * as THREE from 'three';
import { COAT_COLORS, type Genes, type PredatorKind } from './types';
import { ModelAssets, type ModelInstance } from './ModelAssets';

export interface RabbitRig extends ModelInstance {leftEar:THREE.Object3D;rightEar:THREE.Object3D;}
export type RabbitAction='eat'|'defecate'|'lie'|'sit'|'mate'|'groom'|'pluck'|'nurse'|'dig';

export function setRabbitAction(r:RabbitRig,action:RabbitAction,time:number,duration:number):void{
  r.root.userData.action=action;r.root.userData.actionUntil=time+duration;
}

export function createRabbit(genes:Genes,baby=false):RabbitRig{
  const model=ModelAssets.shared.create('rabbit');
  model.root.scale.setScalar((baby?.55:1)*genes.size);
  model.root.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||!(object.material instanceof THREE.MeshStandardMaterial))return;
    if(object.material.name==='fur_base')object.material.color.setHex(COAT_COLORS[genes.coat]);
    if(object.material.name==='fur_light'&&genes.coat==='black')object.material.color.setHex(0x9caaa6);
  });
  const leftEar=model.root.getObjectByName('EarL');
  const rightEar=model.root.getObjectByName('EarR');
  if(!leftEar||!rightEar)throw new Error('У модели кролика нет ушей');
  leftEar.scale.y=rightEar.scale.y=genes.ear*(baby?.78:1);
  return{...model,leftEar,rightEar};
}

export function animateRabbit(r:RabbitRig,time:number,moving:boolean,frightened=false,dt=1/60):void{
  const state=r.root.userData as {action?:RabbitAction;actionUntil?:number};
  const action=state.actionUntil!==undefined&&time<state.actionUntil?state.action:undefined;
  if(!action)state.action=undefined;
  const clip=action??(moving?(frightened?'run':'hop'):'idle');
  ModelAssets.shared.play(r,clip,dt,frightened?1.2:1);
  r.root.position.y=(r.root.userData.baseY as number|undefined)??r.root.position.y;
}

export function createPredator(kind:PredatorKind):THREE.Group{
  const model=ModelAssets.shared.create(kind);
  model.root.userData.model=model;
  return model.root;
}
export function animatePredator(root:THREE.Group,_time:number,running:boolean,dt:number,moving=true,attacking=false):void{
  const model=root.userData.model as ModelInstance;
  ModelAssets.shared.play(model,attacking?'attack':moving?(running?'run':'walk'):'idle',dt);
}
export function createHawk():THREE.Group{
  const model=ModelAssets.shared.create('hawk');model.root.userData.model=model;return model.root;
}
export function animateHawk(root:THREE.Group,flapping:boolean,dt:number,striking=false):void{
  ModelAssets.shared.play(root.userData.model as ModelInstance,striking?'strike':flapping?'flap':'glide',dt);
}
export function makeNest():THREE.Group{return ModelAssets.shared.create('nest').root;}
export function makeStash():THREE.Group{return ModelAssets.shared.create('stash').root;}
