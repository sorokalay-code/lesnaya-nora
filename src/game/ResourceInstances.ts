import * as THREE from 'three';
import {ModelAssets} from './ModelAssets';
import type {FoodKind} from './types';
import type {Resource} from './World';
import type {WorldChunks} from './WorldChunks';

type Part={mesh:THREE.InstancedMesh;transform:THREE.Matrix4};
type Slot={parts:Part[];index:number};

/** Gameplay objects keep their identity; repeated plant geometry is rendered in chunk batches. */
export class ResourceInstances {
  private readonly slots=new Map<number,Slot>();
  private readonly matrix=new THREE.Matrix4();
  constructor(resources:Resource[],chunks:WorldChunks,trackFoliage:(root:THREE.Object3D)=>void){
    const templates=new Map<FoodKind,THREE.Group>(),batches=new Map<string,Resource[]>();
    for(const resource of resources){
      const key=`${Math.floor(resource.x/24)},${Math.floor(resource.z/24)}:${resource.kind}`;
      const batch=batches.get(key)??[];batch.push(resource);batches.set(key,batch);
    }
    for(const resources of batches.values()){
      const first=resources[0];let template=templates.get(first.kind);
      if(!template){template=ModelAssets.shared.create(first.kind).root;template.updateMatrixWorld(true);trackFoliage(template);templates.set(first.kind,template);}
      const parts:Part[]=[];
      template.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        const mesh=new THREE.InstancedMesh(object.geometry,object.material,resources.length);
        mesh.name=`resource-batch-${first.kind}`;mesh.receiveShadow=true;mesh.castShadow=false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        parts.push({mesh,transform:object.matrixWorld.clone()});chunks.add(mesh,first.x,first.z);
      });
      resources.forEach((resource,index)=>{this.slots.set(resource.id,{parts,index});this.sync(resource);});
      // Bounds cover all growth stages; picking a plant cannot shrink the batch's culling bounds.
      for(const part of parts){part.mesh.computeBoundingSphere();if(part.mesh.boundingSphere)part.mesh.boundingSphere.radius+=2;}
    }
  }
  sync(resource:Resource):void{
    const slot=this.slots.get(resource.id);if(!slot)return;
    resource.mesh.updateMatrix();
    for(const part of slot.parts){
      if(resource.available&&resource.mesh.visible)this.matrix.multiplyMatrices(resource.mesh.matrix,part.transform);
      else this.matrix.makeScale(0,0,0);
      part.mesh.setMatrixAt(slot.index,this.matrix);part.mesh.instanceMatrix.needsUpdate=true;
    }
  }
}
