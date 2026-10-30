import * as THREE from 'three';
import { Random } from './Random';
import { animatePredator, animateRabbit, createHawk, createPredator, createRabbit, type RabbitRig } from './Models';
import { type Genes, type PartnerTraits, type PredatorKind } from './types';

const names = ['Листик', 'Тимофей', 'Пушок', 'Рыжик', 'Ветерок', 'Клевер', 'Туман', 'Шорох', 'Орешек', 'Бор'];
const coats: Genes['coat'][] = ['cream', 'brown', 'gray', 'black', 'white'];

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
  constructor(readonly data: PartnerTraits, private readonly rng: Random) {
    this.rig = createRabbit(data.genes); this.rig.root.position.set(data.x, 0, data.z);
    this.targetX=data.x;this.targetZ=data.z;
  }
  update(dt: number, time: number, playerX: number, playerZ: number): void {
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
  update(time: number, dt: number): void {
    const angle = time * (0.12 + this.index * 0.016) + this.index * 2.5;
    const radius = 1.3 + (this.index % 3) * 0.35;
    this.rig.root.position.set(this.parent.x + Math.cos(angle) * radius, 0, this.parent.z + Math.sin(angle) * radius);
    this.rig.root.rotation.y = -angle;
    animateRabbit(this.rig, time + this.index * 2, true, false, dt);
  }
}

export class Predator {
  readonly root: THREE.Group;
  x: number; z: number; targetX: number; targetZ: number;
  private nextTarget = 0;
  attackCooldown = 0;
  readonly range: number;
  private homeX:number;private homeZ:number;
  constructor(readonly kind: PredatorKind, x: number, z: number, private readonly rng: Random) {
    this.x = this.targetX = x; this.z = this.targetZ = z;
    this.homeX=x;this.homeZ=z;
    this.root = createPredator(kind); this.root.position.set(x, 0, z);
    this.range = kind === 'wolf' ? 15 : kind === 'dog' ? 13 : 11;
  }
  update(dt: number, time: number, px: number, pz: number, hidden: boolean, day: boolean,scent=0,activity=1): boolean {
    const dist = Math.hypot(px - this.x, pz - this.z);
    const hunting = !hidden && dist < this.range*activity*(1+scent*0.4) && (this.kind === 'dog' || !day || dist < 7);
    if (hunting) { this.targetX = px; this.targetZ = pz; }
    else if(Math.hypot(this.x-this.homeX,this.z-this.homeZ)>20){this.targetX=this.homeX;this.targetZ=this.homeZ;}
    else if (time > this.nextTarget || Math.hypot(this.targetX - this.x, this.targetZ - this.z) < 1) {
      this.nextTarget = time + this.rng.range(4, 10);
      this.targetX = Math.max(-95, Math.min(95, this.x + this.rng.range(-14, 14)));
      this.targetZ = Math.max(-95, Math.min(95, this.z + this.rng.range(-14, 14)));
    }
    const angle = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
    const speed = hunting ? (this.kind === 'wolf' ? 3.7 : 3.3) : 0.75;
    this.x += Math.sin(angle) * speed * dt; this.z += Math.cos(angle) * speed * dt;
    this.root.position.set(this.x, Math.abs(Math.sin(time * (hunting ? 13 : 5))) * (hunting ? 0.08 : 0.02), this.z);
    this.root.rotation.y = angle + Math.PI;
    animatePredator(this.root,time,hunting,dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (hunting && dist < 1.5 && this.attackCooldown <= 0) { this.attackCooldown = 3; return true; }
    return false;
  }
}

export class Hawk {
  readonly root=createHawk();
  readonly shadow=new THREE.Mesh(new THREE.CircleGeometry(0.8,24),new THREE.MeshBasicMaterial({color:0x222a23,transparent:true,opacity:0.24,depthWrite:false}));
  private angle:number;
  private diveUntil=0;
  private cooldown=0;
  private homeX:number;private homeZ:number;
  x:number;z:number;
  constructor(x:number,z:number,rng:Random){this.homeX=x;this.homeZ=z;this.x=x;this.z=z;this.angle=rng.range(0,Math.PI*2);this.shadow.rotation.x=-Math.PI/2;}
  update(dt:number,time:number,px:number,pz:number,exposed:boolean):boolean{
    this.cooldown=Math.max(0,this.cooldown-dt);
    const distance=Math.hypot(px-this.x,pz-this.z);
    if(exposed&&distance<24&&this.cooldown<=0&&this.diveUntil<=time){this.diveUntil=time+2.5;this.cooldown=22;}
    if(this.diveUntil>time){
      const fraction=1-(this.diveUntil-time)/2.5;
      const direction=Math.atan2(px-this.x,pz-this.z);
      this.x+=Math.sin(direction)*dt*9;this.z+=Math.cos(direction)*dt*9;
      this.root.position.set(this.x,1.2+Math.abs(fraction-0.6)*17,this.z);
      this.root.rotation.y=direction+Math.PI;
      if(fraction>0.5&&fraction<0.75&&Math.hypot(px-this.x,pz-this.z)<2&&exposed){this.diveUntil=0;return true;}
    }else{
      this.angle+=dt*0.42;this.x=this.homeX+Math.cos(this.angle)*11;this.z=this.homeZ+Math.sin(this.angle)*11;
      this.root.position.set(this.x,11+Math.sin(time*1.4)*0.5,this.z);this.root.rotation.y=-this.angle;
    }
    const wings=this.root.userData.wings as THREE.Group[];
    wings.forEach((w,i)=>w.rotation.z=(i===0?-1:1)*(0.12+Math.sin(time*7)*0.22));
    this.shadow.position.set(this.x,0.05,this.z);this.shadow.scale.setScalar(this.diveUntil>time?1.5:0.85);
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
