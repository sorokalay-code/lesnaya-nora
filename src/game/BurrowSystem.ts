import * as THREE from 'three';
import { Underground } from './Underground';
import { makeBurrow } from './Models';
import type { BurrowData, SaveData } from './types';
import type { World } from './World';

/** Owns entrances, excavation and the player's continuous world position. */
export class BurrowSystem {
  readonly earth:Underground;
  readonly entranceMeshes=new Map<number,THREE.Group>();
  constructor(private readonly scene:THREE.Scene,private readonly world:World,private readonly save:SaveData){
    this.earth=new Underground(scene,save,(x,z)=>world.heightAt(x,z),(x,z,depth)=>world.rootAt(x,z,depth));
    for(const burrow of save.burrows)this.addEntrance(burrow);
  }
  get underground():boolean{return this.save.underground!==null;}
  get level():number{return this.save.underground?.level??0;}
  get x():number{return this.save.underground?.x??this.save.player.x;}
  get z():number{return this.save.underground?.z??this.save.player.z;}
  get y():number{return this.underground?this.earth.floorY(this.x,this.z,this.level):this.world.heightAt(this.x,this.z);}
  get currentBurrow():BurrowData|undefined{
    const x=this.x,z=this.z;
    return this.save.burrows.filter(b=>Math.hypot(b.x-x,b.z-z)<5).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
  }
  addEntrance(b:BurrowData):void{
    this.entranceMeshes.get(b.id)?.removeFromParent();
    const model=makeBurrow(b.depth);model.position.set(b.x,this.world.heightAt(b.x,b.z)+0.02,b.z);
    this.scene.add(model);this.entranceMeshes.set(b.id,model);this.world.addGroundHole(b.x,b.z);
    this.earth.excavate(b.x,b.z,0);
    this.earth.refreshCell(b.x,b.z,0);
  }
  createEntrance(x:number,z:number):BurrowData{
    const b:BurrowData={id:Math.max(0,...this.save.burrows.map(v=>v.id))+1,x:this.earth.cellX(x),z:this.earth.cellX(z),depth:1,stores:0,bedding:1,isHome:false};
    this.save.burrows.push(b);this.addEntrance(b);return b;
  }
  enter(b:BurrowData):void{
    this.earth.excavate(b.x,b.z,0);
    this.save.underground={burrowId:b.id,x:b.x,z:b.z,level:0};
    this.save.player.x=b.x;this.save.player.z=b.z;this.save.player.hidden=true;
  }
  exit():boolean{
    const u=this.save.underground;if(!u)return false;
    const b=this.save.burrows.find(v=>Math.hypot(v.x-u.x,v.z-u.z)<1.35);
    if(!b||u.level!==0)return false;
    this.save.player.x=b.x;this.save.player.z=b.z;this.save.player.hidden=false;this.save.underground=null;
    this.earth.hidePlayerLight();return true;
  }
  nearestExit():BurrowData|undefined{return this.save.burrows.find(b=>Math.hypot(b.x-this.x,b.z-this.z)<1.35&&this.level===0);}
  move(dx:number,dz:number):void{
    const u=this.save.underground;if(!u)return;
    if(this.earth.canMove(u.x+dx,u.z,u.level))u.x+=dx;
    if(this.earth.canMove(u.x,u.z+dz,u.level))u.z+=dz;
    this.save.player.x=u.x;this.save.player.z=u.z;
  }
  digAhead(facing:number):{success:boolean;reason?:string;x:number;z:number}{
    return this.earth.digAhead(this.x,this.z,this.level,facing);
  }
  changeLevel(delta:number):{success:boolean;reason?:string;dug?:boolean}{
    const u=this.save.underground;if(!u)return{success:false,reason:'Сначала выкопай вход.'};
    const next=u.level+delta;
    if(next<0)return{success:false,reason:'Выше находится поверхность. У входа нажми H.'};
    if(next>this.earth.maxLevel)return{success:false,reason:'Глубже 50 м копать нельзя.'};
    if(delta<0&&!this.earth.hasShaft(u.x,u.z,next))return{success:false,reason:'Здесь нет вертикального хода наверх.'};
    const dug=delta>0?this.earth.excavate(u.x,u.z,next):false;
    if(dug){const b=this.currentBurrow;if(b)b.depth=Math.max(b.depth,next+1);}
    u.x=this.earth.cellX(u.x);u.z=this.earth.cellX(u.z);u.level=next;
    this.save.player.x=u.x;this.save.player.z=u.z;
    return{success:true,dug};
  }
  updateVisuals(facing:number):void{
    if(this.underground){this.earth.setPlayerLight(this.x,this.y,this.z);this.earth.updateMarker(this.x,this.z,this.level,facing);this.earth.updateVisibility(this.x,this.z,this.level);}
    else{this.earth.hidePlayerLight();this.earth.updateVisibility(this.x,this.z,0);}
    this.earth.group.visible=true;
  }
}
