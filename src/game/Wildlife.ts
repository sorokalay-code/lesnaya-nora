import * as THREE from 'three';
import { Random } from './Random';
import type { GroundHeight } from './Entities';
import { ModelAssets, type ModelInstance } from './ModelAssets';

export type WildlifeKind='deer'|'squirrel'|'hedgehog'|'beaver'|'moose';

/** Shared behavior; the species geometry and gait are authored in GLB files. */
export class ForestAnimal {
  readonly model:ModelInstance;
  readonly root:THREE.Group;
  readonly maxHealth:number;
  health:number;
  readonly defense:number;
  trust=0;
  protected legs:THREE.Object3D[]=[];
  private readonly speed:number;
  private readonly range:number;
  private targetX:number;
  private targetZ:number;
  private nextTarget=0;
  private fleeingUntil=0;
  private fightingUntil=0;
  private eatingUntil=0;
  private nextGraze=0;
  x:number;
  z:number;

  constructor(readonly kind:WildlifeKind,x:number,z:number,private readonly rng:Random){
    this.model=ModelAssets.shared.create(kind);this.root=this.model.root;
    this.legs=['LegFL','LegFR','LegBL','LegBR'].map(name=>this.root.getObjectByName(name)).filter((leg):leg is THREE.Object3D=>!!leg);
    this.x=this.targetX=x;this.z=this.targetZ=z;
    this.maxHealth=kind==='moose'?130:kind==='deer'?65:kind==='beaver'?48:kind==='hedgehog'?30:23;
    this.health=this.maxHealth;
    this.defense=kind==='moose'?25:kind==='beaver'?7:kind==='deer'?5:kind==='hedgehog'?4:0;
    this.speed=kind==='deer'?1.55:kind==='squirrel'?1.45:kind==='moose'?1.05:kind==='beaver'?.9:.65;
    this.range=kind==='deer'?11:kind==='moose'?10:kind==='squirrel'?7:kind==='beaver'?6:4.5;
  }
  get alive():boolean{return this.health>0;}
  get mood():string{return this.health<this.maxHealth*.45?'раненое':this.fleeingUntil>this.root.userData.tailPhase?'напуганное':this.trust>25?'доверчивое':'осторожное';}
  befriend(amount:number):void{this.trust=THREE.MathUtils.clamp(this.trust+amount,0,100);this.fleeingUntil=0;}
  receiveAttack(damage:number,time:number,attacker:{x:number;z:number}):number{
    this.health=Math.max(0,this.health-damage);
    if(!this.alive)return 0;
    this.targetX=this.x+(this.x-attacker.x)*3;this.targetZ=this.z+(this.z-attacker.z)*3;
    this.fleeingUntil=time+4;
    if(this.defense>0&&this.health>this.maxHealth*.3){
      this.fightingUntil=time+2;this.fleeingUntil=0;return this.defense;
    }
    return 0;
  }
  update(dt:number,time:number,groundAt:GroundHeight,threats:readonly {x:number;z:number}[],food?:{x:number;z:number}):boolean{
    const danger=threats.find(p=>Math.hypot(p.x-this.x,p.z-this.z)<6);
    if(danger){
      if(time<this.fightingUntil){this.targetX=danger.x;this.targetZ=danger.z;}
      else{
        const away=Math.atan2(this.x-danger.x,this.z-danger.z);
        this.targetX=this.x+Math.sin(away)*this.range;
        this.targetZ=this.z+Math.cos(away)*this.range;
        this.fleeingUntil=time+2.2;
      }
    }else if(food&&time>this.fleeingUntil){this.targetX=food.x;this.targetZ=food.z;}
    else if(time>this.nextTarget||Math.hypot(this.targetX-this.x,this.targetZ-this.z)<.5){
      this.nextTarget=time+this.rng.range(3,8);
      const angle=this.rng.range(-Math.PI,Math.PI),distance=this.rng.range(2,this.range);
      this.targetX=this.x+Math.sin(angle)*distance;this.targetZ=this.z+Math.cos(angle)*distance;
    }
    const fleeing=time<this.fleeingUntil;
    const grazing=!!food&&!danger&&Math.hypot(food.x-this.x,food.z-this.z)<1.3;
    if(grazing&&time>=this.nextGraze){this.nextGraze=time+this.rng.range(6,11);this.eatingUntil=time+1.6;}
    const moving=!grazing&&time>this.eatingUntil&&(fleeing||!!food||Math.sin(time*.47+this.root.id)>-.55);
    if(moving){
      const angle=Math.atan2(this.targetX-this.x,this.targetZ-this.z);
      const step=dt*this.speed*(fleeing?2:1);
      this.x=THREE.MathUtils.clamp(this.x+Math.sin(angle)*step,-97,97);
      this.z=THREE.MathUtils.clamp(this.z+Math.cos(angle)*step,-97,97);
      const desired=angle+Math.PI;
      const turn=Math.atan2(Math.sin(desired-this.root.rotation.y),Math.cos(desired-this.root.rotation.y));
      this.root.rotation.y+=THREE.MathUtils.clamp(turn,-dt*4,dt*4);
    }
    this.root.position.set(this.x,groundAt(this.x,this.z),this.z);
    ModelAssets.shared.play(this.model,time<this.eatingUntil?'graze':moving?(fleeing?'run':'walk'):'idle',dt);
    this.root.userData.tailPhase=time;
    return grazing&&time<this.eatingUntil;
  }
}

export function createForestAnimal(kind:WildlifeKind,x:number,z:number,rng:Random):ForestAnimal{
  return new ForestAnimal(kind,x,z,rng);
}
