import * as THREE from 'three';
import { Random } from './Random';
import { animatePredator, animateRabbit, createHawk, createPredator, createRabbit, type RabbitRig } from './Models';
import { type Genes, type PartnerTraits, type PredatorKind } from './types';
import type { Excavation } from './Excavation';

const names = ['Листик', 'Тимофей', 'Пушок', 'Рыжик', 'Ветерок', 'Клевер', 'Туман', 'Шорох', 'Орешек', 'Бор'];
const coats: Genes['coat'][] = ['cream', 'brown', 'gray', 'black', 'white'];
export type GroundHeight=(x:number,z:number)=>number;

export class RabbitFactory {
  constructor(private readonly rng: Random) {}
  genes(): Genes {
    return { coat: this.rng.pick(coats), ear: this.rng.range(0.75, 1.28), speed: this.rng.int(1, 5), vitality: this.rng.int(1, 5), size: this.rng.range(0.88, 1.13) };
  }
  partners(count: number): PartnerTraits[] {
    const out: PartnerTraits[] = [];
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(15, 72);
      out.push({ id: i, name: this.rng.pick(names), x: Math.cos(a) * d, z: Math.sin(a) * d,
        genes: this.genes(), preference: this.rng.pick(['speed', 'vitality', 'rare-coat', 'bond'] as const),
        temperament: this.rng.pick(['смелый', 'заботливый', 'осторожный', 'любопытный'] as const), trust: this.rng.int(0, 18), familySize: this.rng.int(0, 5) });
    }
    return out;
  }
  inherit(mother: Genes, father: Genes): Genes {
    return { coat: this.rng.chance(0.5) ? mother.coat : father.coat,
      ear: Math.max(0.65, Math.min(1.4, (mother.ear + father.ear) / 2 + this.rng.range(-0.13, 0.13))),
      speed: Math.max(1, Math.min(5, Math.round((mother.speed + father.speed) / 2 + this.rng.range(-1.1, 1.1)))),
      vitality: Math.max(1, Math.min(5, Math.round((mother.vitality + father.vitality) / 2 + this.rng.range(-1.1, 1.1)))),
      size: Math.max(0.8, Math.min(1.2, (mother.size + father.size) / 2 + this.rng.range(-0.09, 0.09))) };
  }
}

export class RabbitActor {
  readonly rig: RabbitRig;
  private wanderAngle = 0;
  private nextTurn = 0;
  private activity: 'forage' | 'rest' | 'explore' = 'explore';
  private targetX: number;
  private targetZ: number;
  private tunnelPosition?:{x:number;y:number;z:number};
  private mateForageUntil=0;
  private mateForageTarget?:{x:number;z:number};
  constructor(readonly data: PartnerTraits, private readonly rng: Random) {
    this.rig = createRabbit(data.genes); this.rig.root.position.set(data.x, 0, data.z);
    this.targetX=data.x;this.targetZ=data.z;
  }
  enterTunnel(x:number,y:number,z:number):void{
    this.tunnelPosition={x,y,z};this.data.x=x;this.data.z=z;
    this.rig.root.position.set(x,y,z);this.rig.root.userData.baseY=y;
  }
  leaveTunnel():void{this.tunnelPosition=undefined;}
  updateMate(dt:number,time:number,home:{x:number;y:number;z:number},food:{x:number;z:number}[],earth:Excavation,groundAt:GroundHeight):void{
    this.tunnelPosition=undefined;
    if(time>this.mateForageUntil){
      this.mateForageUntil=time+this.rng.range(10,22);
      this.mateForageTarget=this.rng.chance(0.5)?this.rng.pick(food.filter(f=>Math.hypot(f.x-home.x,f.z-home.z)<18)):undefined;
    }
    let target=this.mateForageTarget??home;
    const opening=earth.openings.slice().sort((a,b)=>Math.hypot(a.x-home.x,a.z-home.z)-Math.hypot(b.x-home.x,b.z-home.z))[0];
    const inside=earth.isSheltered(this.data.x,this.rig.root.position.y,this.data.z);
    if(opening&&this.mateForageTarget&&inside){
      const angle=Math.atan2(this.mateForageTarget.x-opening.x,this.mateForageTarget.z-opening.z);
      target={x:opening.x+Math.sin(angle)*2.4,z:opening.z+Math.cos(angle)*2.4};
    }else if(opening&&!this.mateForageTarget&&earth.isSheltered(home.x,home.y,home.z)&&!inside)
      target=opening;
    const distance=Math.hypot(target.x-this.data.x,target.z-this.data.z);
    const moving=distance>0.7;
    if(moving){
      const heading=Math.atan2(target.x-this.data.x,target.z-this.data.z);
      this.data.x+=Math.sin(heading)*dt*2.2;this.data.z+=Math.cos(heading)*dt*2.2;
      const desired=heading+Math.PI;
      const turn=Math.atan2(Math.sin(desired-this.rig.root.rotation.y),Math.cos(desired-this.rig.root.rotation.y));
      this.rig.root.rotation.y+=THREE.MathUtils.clamp(turn,-dt*3,dt*3);
    }
    const y=earth.floorAt(this.data.x,this.data.z,this.rig.root.position.y);
    this.rig.root.position.x=this.data.x;this.rig.root.position.z=this.data.z;
    this.rig.root.userData.baseY=earth.isSheltered(this.data.x,y,this.data.z)?y:groundAt(this.data.x,this.data.z);
    animateRabbit(this.rig,time+this.data.id,moving,false,dt);
  }
  update(dt: number, time: number, playerX: number, playerZ: number,groundAt:GroundHeight): void {
    if(this.tunnelPosition){
      this.rig.root.position.set(this.tunnelPosition.x,this.tunnelPosition.y,this.tunnelPosition.z);
      this.rig.root.userData.baseY=this.tunnelPosition.y;
      animateRabbit(this.rig,time+this.data.id,false,false,dt);return;
    }
    if (time > this.nextTurn || Math.hypot(this.targetX-this.data.x,this.targetZ-this.data.z)<0.7) {
      this.nextTurn = time + this.rng.range(4, 9);
      this.activity=this.rng.pick(['forage','forage','rest','explore'] as const);
      this.wanderAngle = this.rng.range(-Math.PI, Math.PI);
      const distance=this.activity==='explore'?this.rng.range(4,9):this.rng.range(1.5,4);
      this.targetX=this.data.x+Math.sin(this.wanderAngle)*distance;
      this.targetZ=this.data.z+Math.cos(this.wanderAngle)*distance;
    }
    const near = Math.hypot(playerX - this.data.x, playerZ - this.data.z) < 3;
    const moving=!near&&this.activity!=='rest';
    if (moving) {
      const direction=Math.atan2(this.targetX-this.data.x,this.targetZ-this.data.z);
      const nx = this.data.x + Math.sin(direction) * dt * (this.activity==='explore'?1.4:0.75);
      const nz = this.data.z + Math.cos(direction) * dt * (this.activity==='explore'?1.4:0.75);
      if (Math.hypot(nx, nz) < 95) { this.data.x = nx; this.data.z = nz; }
      this.wanderAngle=direction;
    }
    this.rig.root.position.x = this.data.x; this.rig.root.position.z = this.data.z;
    this.rig.root.userData.baseY=groundAt(this.data.x,this.data.z);
    const targetRotation = near ? Math.atan2(-(playerX - this.data.x), -(playerZ - this.data.z)) : this.wanderAngle + Math.PI;
    const turn=Math.atan2(Math.sin(targetRotation-this.rig.root.rotation.y),Math.cos(targetRotation-this.rig.root.rotation.y));
    this.rig.root.rotation.y+=THREE.MathUtils.clamp(turn,-2.7*dt,2.7*dt);
    animateRabbit(this.rig, time + this.data.id, moving, false, dt);
  }
}

export class FamilyMember {
  readonly rig: RabbitRig;
  constructor(private readonly parent: PartnerTraits, genes: Genes, private readonly index: number, baby: boolean) {
    this.rig = createRabbit(genes, baby);
  }
  update(time: number, dt: number,groundAt:GroundHeight): void {
    const angle = time * (0.12 + this.index * 0.016) + this.index * 2.5;
    const radius = 1.3 + (this.index % 3) * 0.35;
    const x=this.parent.x+Math.cos(angle)*radius,z=this.parent.z+Math.sin(angle)*radius;
    this.rig.root.position.x=x;this.rig.root.position.z=z;
    this.rig.root.userData.baseY=groundAt(x,z);
    this.rig.root.rotation.y = -angle;
    animateRabbit(this.rig, time + this.index * 2, true, false, dt);
  }
}

export class Predator {
  readonly root: THREE.Group;
  readonly maxHealth:number;
  health:number;
  x: number; z: number; targetX: number; targetZ: number;
  private nextTarget = 0;
  attackCooldown = 0;
  huntingPlayer=false;
  readonly range: number;
  private homeX:number;private homeZ:number;
  private tunnelPosition?:{x:number;y:number;z:number};
  private retreatUntil=0;
  private retreatX=0;private retreatZ=0;
  constructor(readonly kind: PredatorKind, x: number, z: number, private readonly rng: Random) {
    this.x = this.targetX = x; this.z = this.targetZ = z;
    this.homeX=x;this.homeZ=z;
    this.root = createPredator(kind); this.root.position.set(x, 0, z);
    this.maxHealth=kind==='bear'?160:kind==='wolf'?75:kind==='dog'?70:kind==='lynx'?60:kind==='fox'?45:kind==='weasel'?28:20;
    this.health=this.maxHealth;
    this.range = kind === 'wolf' ? 15 : kind === 'dog' ? 13 : kind==='lynx'?14:kind==='weasel'?9:kind==='bear'?12:kind==='snake'?5:11;
  }
  enterTunnel(x:number,y:number,z:number):void{
    this.tunnelPosition={x,y,z};this.x=x;this.z=z;this.root.position.set(x,y,z);
  }
  leaveTunnel():void{this.tunnelPosition=undefined;}
  get alive():boolean{return this.health>0;}
  get underground():boolean{return this.tunnelPosition!==undefined;}
  receiveAttack(damage:number,time:number,attacker:{x:number;z:number}):void{
    this.health=Math.max(0,this.health-damage);
    this.retreatUntil=time+2.5;
    const angle=Math.atan2(this.x-attacker.x,this.z-attacker.z);
    this.retreatX=this.x+Math.sin(angle)*9;this.retreatZ=this.z+Math.cos(angle)*9;
  }
  update(dt: number, time: number, px: number, pz: number, hidden: boolean, day: boolean,groundAt:GroundHeight,scent=0,activity=1,prey?:{x:number;z:number}): boolean {
    this.attackCooldown=Math.max(0,this.attackCooldown-dt);
    this.huntingPlayer=false;
    if(this.tunnelPosition){
      this.x=this.tunnelPosition.x;this.z=this.tunnelPosition.z;
      this.root.position.set(this.x,this.tunnelPosition.y,this.z);
      animatePredator(this.root,time,false,dt);return false;
    }
    const dist = Math.hypot(px - this.x, pz - this.z);
    const hunting = time>=this.retreatUntil&&!hidden && dist < this.range*activity*(1+scent*0.4) && (this.kind === 'dog'||this.kind==='weasel'||this.kind==='snake'||!day||dist < (this.kind==='lynx'?10:7));
    this.huntingPlayer=hunting;
    const chasingPrey=!hunting&&time>=this.retreatUntil&&prey!==undefined;
    if(time<this.retreatUntil){this.targetX=this.retreatX;this.targetZ=this.retreatZ;}
    else if (hunting) { this.targetX = px; this.targetZ = pz; }
    else if(chasingPrey){this.targetX=prey.x;this.targetZ=prey.z;}
    else if(Math.hypot(this.x-this.homeX,this.z-this.homeZ)>20){this.targetX=this.homeX;this.targetZ=this.homeZ;}
    else if (time > this.nextTarget || Math.hypot(this.targetX - this.x, this.targetZ - this.z) < 1) {
      this.nextTarget = time + this.rng.range(4, 10);
      this.targetX = Math.max(-95, Math.min(95, this.x + this.rng.range(-14, 14)));
      this.targetZ = Math.max(-95, Math.min(95, this.z + this.rng.range(-14, 14)));
    }
    const angle = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
    const speed = hunting||chasingPrey||time<this.retreatUntil ? (this.kind === 'wolf' ? 3.7 : this.kind==='lynx'?4.15:this.kind==='weasel'?4.4:this.kind==='bear'?2.8:this.kind==='snake'?2.1:3.3) : this.kind==='weasel'?1.15:this.kind==='snake'?0.45:0.75;
    const step=Math.min(speed*dt,Math.hypot(this.targetX-this.x,this.targetZ-this.z));
    this.x=THREE.MathUtils.clamp(this.x+Math.sin(angle)*step,-97,97);
    this.z=THREE.MathUtils.clamp(this.z+Math.cos(angle)*step,-97,97);
    this.root.position.set(this.x,groundAt(this.x,this.z)+Math.abs(Math.sin(time * (hunting||chasingPrey ? 13 : 5))) * (hunting||chasingPrey ? 0.08 : 0.02),this.z);
    this.root.rotation.y = angle + Math.PI;
    animatePredator(this.root,time,hunting||chasingPrey,dt);
    if (hunting && dist < (this.kind==='bear'?2.3:1.5) && this.attackCooldown <= 0) { this.attackCooldown = this.kind==='snake'?6:3; return true; }
    return false;
  }
}

export class Hawk {
  readonly root=createHawk();
  readonly shadow=new THREE.Mesh(new THREE.CircleGeometry(0.8,24),new THREE.MeshBasicMaterial({color:0x222a23,transparent:true,opacity:0.24,depthWrite:false}));
  private targetX:number;private targetZ:number;private nextTurn=0;
  private diveUntil=0;
  private cooldown=0;
  private readonly rng:Random;
  x:number;z:number;
  constructor(x:number,z:number,rng:Random){this.x=this.targetX=x;this.z=this.targetZ=z;this.rng=rng;this.shadow.rotation.x=-Math.PI/2;}
  update(dt:number,time:number,px:number,pz:number,exposed:boolean,groundAt:GroundHeight):boolean{
    this.cooldown=Math.max(0,this.cooldown-dt);
    const distance=Math.hypot(px-this.x,pz-this.z);
    if(exposed&&distance<18&&this.cooldown<=0&&this.diveUntil<=time){this.diveUntil=time+2.5;this.cooldown=35;}
    if(this.diveUntil>time){
      const fraction=1-(this.diveUntil-time)/2.5;
      const direction=Math.atan2(px-this.x,pz-this.z);
      this.x+=Math.sin(direction)*dt*9;this.z+=Math.cos(direction)*dt*9;
      this.root.position.set(this.x,groundAt(this.x,this.z)+1.2+Math.abs(fraction-0.6)*17,this.z);
      this.root.rotation.y=direction+Math.PI;
      if(fraction>0.5&&fraction<0.75&&Math.hypot(px-this.x,pz-this.z)<2&&exposed){this.diveUntil=0;return true;}
    }else{
      if(time>=this.nextTurn||Math.hypot(this.targetX-this.x,this.targetZ-this.z)<3){
        this.nextTurn=time+this.rng.range(7,15);
        this.targetX=this.rng.range(-85,85);this.targetZ=this.rng.range(-85,85);
      }
      const heading=Math.atan2(this.targetX-this.x,this.targetZ-this.z);
      this.x+=Math.sin(heading)*dt*5.5;this.z+=Math.cos(heading)*dt*5.5;
      this.root.position.set(this.x,groundAt(this.x,this.z)+13+Math.sin(time*1.4)*0.5,this.z);this.root.rotation.y=heading+Math.PI;
    }
    const wings=this.root.userData.wings as THREE.Group[];
    wings.forEach((w,i)=>w.rotation.z=(i===0?-1:1)*(0.12+Math.sin(time*7)*0.22));
    this.shadow.position.set(this.x,groundAt(this.x,this.z)+0.05,this.z);this.shadow.scale.setScalar(this.diveUntil>time?1.5:0.85);
    return false;
  }
}

export function partnerScore(p: PartnerTraits, genes: Genes): number {
  const base = p.trust;
  switch (p.preference) {
    case 'speed': return base + genes.speed * 5;
    case 'vitality': return base + genes.vitality * 5;
    case 'rare-coat': return base + (genes.coat === 'white' || genes.coat === 'black' ? 27 : 8);
    case 'bond': return base + 14;
  }
}
