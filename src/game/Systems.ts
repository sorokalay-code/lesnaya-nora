import * as THREE from 'three';
import {ModelAssets} from './ModelAssets';
import { hash2, Random } from './Random.ts';
import { FOOD, type FoodKind, type SaveData, type Season, type StashData, type WasteData, type Weather } from './types.ts';

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

export class SeasonSystem {
  constructor(private readonly seed:number){}
  name(day:number):Season{return (['Весна','Лето','Осень','Зима'] as const)[Math.floor((day-1)/30)%4];}
  temperature(day:number,clock:number,weather:Weather):number{
    const base={Весна:13,Лето:25,Осень:9,Зима:-3}[this.name(day)];
    const hour=clock%1440/60;
    return base+Math.cos((hour-14)/24*Math.PI*2)*5+{clear:0,rain:-4,mist:-2,snow:-6}[weather];
  }
  foodVisible(id:number,kind:FoodKind,day:number):boolean{
    const season=this.name(day);
    const chance=season==='Зима'?(kind==='mushroom'||kind==='acorn'?0.28:kind==='carrot'||kind==='cabbage'?0.08:0.14):
      season==='Осень'?(kind==='berries'||kind==='acorn'?0.98:0.78):season==='Лето'?0.93:0.82;
    return hash2(id,Math.floor((day-1)/30),this.seed+499)<chance;
  }
  predatorActivity(day:number):number{return this.name(day)==='Зима'?1.25:1;}
}

export class SurvivalSystem {
  private lastDiarrhea=0;
  constructor(private readonly save:SaveData,private readonly rng:Random){}
  tick(dt:number,elapsed:number,moving:boolean,ambient:number,warm:boolean,onDiarrhea:()=>void):void{
    const p=this.save.player;
    p.hunger=clamp(p.hunger-dt*(moving?0.14:0.07),0,100);
    p.energy=clamp(p.energy-dt*(moving?0.09:0.025),0,100);
    p.thirst=clamp(p.thirst-dt*(moving?0.15:0.09),0,100);
    p.bladder=clamp(p.bladder+dt*0.075,0,100);
    p.bowel=clamp(p.bowel+dt*0.055,0,100);
    p.bodyTemp=clamp(p.bodyTemp+((warm?38.6:38.4-Math.max(0,12-ambient)*0.36)-p.bodyTemp)*Math.min(1,dt*(warm?0.09:0.022)),28,41);
    p.poison=clamp(p.poison-dt*0.32,0,100);
    if(p.poison>25){p.health=clamp(p.health-dt*(p.poison>60?0.25:0.11)*0.8,0,100);p.thirst=clamp(p.thirst-dt*0.09,0,100);}
    if(p.poison>42&&elapsed-this.lastDiarrhea>20){this.lastDiarrhea=elapsed;onDiarrhea();p.bowel=clamp(p.bowel-30,0,100);p.dirtiness=clamp(p.dirtiness+15,0,100);}
    if(p.hunger<10||p.energy<5||p.bladder>95||p.bowel>95||p.thirst<10||p.bodyTemp<34||p.dirtiness>82)p.health=clamp(p.health-dt*(p.thirst<2||p.bodyTemp<32?0.4:0.18)*0.8,0,100);
    else if(p.hunger>55&&p.energy>55&&p.thirst>50&&p.poison<15)p.health=clamp(p.health+dt*0.025,0,100);
    if(p.hunger>45&&p.thirst>40&&p.poison<30)p.milk=clamp(p.milk+dt*0.055,0,100);
  }
  eat(kind:FoodKind):boolean{
    const p=this.save.player,food=FOOD[kind];
    p.hunger=clamp(p.hunger+food.nutrition,0,100);p.thirst=clamp(p.thirst+food.moisture,0,100);p.bladder=clamp(p.bladder+Math.max(1,food.moisture*0.4),0,100);p.bowel=clamp(p.bowel+7,0,100);
    const poisoned=this.rng.chance(food.poisonRisk);
    if(poisoned)p.poison=clamp(Math.max(p.poison,45+this.rng.range(0,35)),0,100);
    return poisoned;
  }
  groom():void{const p=this.save.player;p.dirtiness=clamp(p.dirtiness-37,0,100);p.energy=clamp(p.energy-3,0,100);}
}

export class WasteSystem {
  private meshes=new Map<number,THREE.Group>();
  constructor(private readonly scene:THREE.Scene,private readonly save:SaveData,private readonly groundY:(w:WasteData)=>number=w=>w.y){
    for(const waste of save.waste)this.addModel(waste);
  }
  spawn(kind:WasteData['kind'],x:number,y:number,z:number):WasteData{
    const id=Math.max(0,...this.save.waste.map(w=>w.id))+1;
    const waste:WasteData={id,kind,x,y,z,age:this.save.clock};waste.y=this.groundY(waste);this.save.waste.push(waste);this.addModel(waste);return waste;
  }
  private addModel(w:WasteData):void{
    w.y=this.groundY(w);
    const root=new THREE.Group();root.position.set(w.x,w.y,w.z);
    const material=new THREE.MeshStandardMaterial({color:w.kind==='urine'?0xd6c680:w.kind==='diarrhea'?0x795f3d:0x594330,roughness:1,transparent:w.kind!=='pellets',opacity:w.kind==='pellets'?1:0.75});
    if(w.kind==='pellets')for(let i=0;i<5;i++){
      const m=new THREE.Mesh(new THREE.SphereGeometry(0.08,7,5),material);m.position.set(Math.cos(i*2.4)*0.18,0.08,Math.sin(i*2.4)*0.18);root.add(m);
    }else{
      const m=new THREE.Mesh(new THREE.CircleGeometry(w.kind==='diarrhea'?0.42:0.36,16),material);m.rotation.x=-Math.PI/2;m.position.y=0.016;root.add(m);
    }
    this.scene.add(root);this.meshes.set(w.id,root);
  }
  update(dt:number,px:number,py:number,pz:number):void{
    const p=this.save.player;
    for(const w of this.save.waste){
      if(Math.hypot(px-w.x,pz-w.z)<0.7&&Math.abs(py-w.y)<1.2)p.dirtiness=clamp(p.dirtiness+dt*(w.kind==='pellets'?0.16:0.6),0,100);
    }
    if(this.save.waste.length>180){const old=this.save.waste.splice(0,this.save.waste.length-180);old.forEach(w=>{
      const mesh=this.meshes.get(w.id);if(mesh){ModelAssets.shared.release(mesh);mesh.removeFromParent();}this.meshes.delete(w.id);
    });}
  }
}

export class FoodStore {
  readonly capacity=18;
  constructor(private readonly save:SaveData){}
  carried():number{return (Object.keys(FOOD) as FoodKind[]).reduce((sum,k)=>sum+(this.save.inventory[k]??0),0);}
  deposit(stash:StashData):number{
    let total=0;
    for(const kind of Object.keys(FOOD) as FoodKind[]){const amount=this.save.inventory[kind]??0;if(!amount)continue;
      stash.food[kind]=(stash.food[kind]??0)+amount;this.save.inventory[kind]=0;total+=amount;}
    return total;
  }
  withdraw(stash:StashData):number{
    let total=0;
    for(const kind of Object.keys(FOOD) as FoodKind[]){
      const space=this.capacity-this.carried();if(space<=0)break;
      const amount=Math.min(space,stash.food[kind]??0);
      stash.food[kind]=(stash.food[kind]??0)-amount;this.save.inventory[kind]+=amount;total+=amount;
    }
    if(stash.materials)for(const kind of ['grass','twigs','fur'] as const){
      const amount=stash.materials[kind]??0;
      this.save.materials[kind]+=amount;stash.materials[kind]=0;total+=amount;
    }
    return total;
  }
}
