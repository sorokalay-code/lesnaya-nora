import * as THREE from 'three';
import { hash2 } from './Random';
import { type DropData, type FoodKind, type MaterialKind, type SaveData } from './types';
import { World } from './World';
import { ModelAssets, type ModelName } from './ModelAssets';

export type GroundPickup={id:number;x:number;y:number;z:number;kind:'branch'|FoodKind|MaterialKind};

/** Physical fallen twigs and food dropped from the rabbit's inventory. */
export class GroundItems {
  private readonly branches=new Map<number,{item:GroundPickup;mesh:THREE.Group}>();
  private readonly drops=new Map<number,THREE.Group>();
  constructor(private readonly world:World,private readonly save:SaveData){
    save.branchPicked??={};save.drops??=[];
    this.buildBranches();
    for(const drop of save.drops)this.addDrop(drop);
  }

  private buildBranches():void{
    this.world.treeLocations.forEach((tree,id)=>{
      const angle=hash2(id,11,this.save.seed)*Math.PI*2;
      const distance=0.8+hash2(id,13,this.save.seed)*1.8;
      const x=tree.x+Math.cos(angle)*distance,z=tree.z+Math.sin(angle)*distance;
      const y=this.world.heightAt(x,z)+0.07;
      const mesh=ModelAssets.shared.create('branch').root;mesh.position.set(x,y,z);mesh.rotation.y=angle;
      this.world.chunks.add(mesh,x,z);
      const item:GroundPickup={id,x,y,z,kind:'branch'};
      this.branches.set(id,{item,mesh});
    });
    this.update(this.save.clock);
  }

  update(clock:number):void{
    for(const [id,branch] of this.branches){
      const picked=this.save.branchPicked?.[id];
      branch.mesh.visible=picked===undefined||clock-picked>=2880;
    }
  }

  availableBranches(x:number,z:number,radius:number):GroundPickup[]{
    return [...this.branches.values()].filter(b=>b.mesh.visible&&Math.hypot(b.item.x-x,b.item.z-z)<radius).map(b=>b.item);
  }

  takeBranch(id:number,clock:number):boolean{
    const branch=this.branches.get(id);
    if(!branch?.mesh.visible)return false;
    branch.mesh.visible=false;(this.save.branchPicked??={})[id]=clock;
    return true;
  }

  nearest(x:number,y:number,z:number,radius=2.2):GroundPickup|undefined{
    let best:GroundPickup|undefined,dist=radius;
    const consider=(item:GroundPickup)=>{
      if(Math.abs(item.y-y)>1.35)return;
      const d=Math.hypot(item.x-x,item.z-z);
      if(d<dist){best=item;dist=d;}
    };
    for(const branch of this.branches.values())if(branch.mesh.visible&&branch.mesh.parent?.visible)consider(branch.item);
    for(const drop of this.save.drops??[])if(this.drops.get(drop.id)?.parent?.visible)consider(drop);
    return best;
  }

  collect(item:GroundPickup,clock:number):boolean{
    if(item.kind==='branch')return this.takeBranch(item.id,clock);
    const index=this.save.drops?.findIndex(d=>d.id===item.id)??-1;
    if(index<0)return false;
    this.save.drops!.splice(index,1);this.drops.get(item.id)?.removeFromParent();this.drops.delete(item.id);
    return true;
  }

  drop(kind:FoodKind|MaterialKind,x:number,y:number,z:number):DropData{
    const id=Math.max(0,...(this.save.drops??[]).map(d=>d.id))+1;
    const item:DropData={id,x,y,z,kind};
    (this.save.drops??=[]).push(item);this.addDrop(item);return item;
  }

  private addDrop(item:DropData):void{
    const kind:ModelName=item.kind==='grass'?'grass_bundle':item.kind==='twigs'?'twig_bundle':item.kind==='fur'?'fur_tuft':item.kind;
    const mesh=ModelAssets.shared.create(kind).root;mesh.position.set(item.x,item.y,item.z);
    this.world.chunks.add(mesh,item.x,item.z);this.drops.set(item.id,mesh);
  }
}
