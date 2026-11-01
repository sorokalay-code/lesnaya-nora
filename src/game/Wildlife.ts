import * as THREE from 'three';
import { Random } from './Random';
import type { GroundHeight } from './Entities';

export type WildlifeKind='deer'|'squirrel'|'hedgehog'|'beaver'|'moose';
const sphere=new THREE.SphereGeometry(1,10,8);
const cone=new THREE.ConeGeometry(1,1,7);
const mat=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:0.95,flatShading:true});
const dark=mat(0x28251f);
const cream=mat(0xe6d6b3);

/** Shared wandering and flight behavior; species supply their own body and gait. */
export abstract class ForestAnimal {
  readonly root=new THREE.Group();
  protected legs:THREE.Group[]=[];
  protected speed=1;
  protected range=8;
  private targetX:number;
  private targetZ:number;
  private nextTarget=0;
  private fleeingUntil=0;
  x:number;
  z:number;
  protected constructor(readonly kind:WildlifeKind,x:number,z:number,protected readonly rng:Random){
    this.x=this.targetX=x;this.z=this.targetZ=z;
  }
  protected body(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,
    x:number,y:number,z:number,sx:number,sy:number,sz:number):THREE.Mesh{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
    mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  protected eye(x:number,y:number,z:number):void{this.body(this.root,sphere,dark,x,y,z,0.048,0.052,0.04);}
  protected leg(x:number,y:number,z:number,length:number,material:THREE.Material):void{
    const pivot=new THREE.Group();pivot.position.set(x,y,z);this.root.add(pivot);
    this.body(pivot,sphere,material,0,-length*0.5,0,0.10,length*0.55,0.11);
    this.body(pivot,sphere,dark,0,-length, -0.055,0.12,0.06,0.16);this.legs.push(pivot);
  }
  update(dt:number,time:number,groundAt:GroundHeight,threats:readonly {x:number;z:number}[]):void{
    const danger=threats.find(p=>Math.hypot(p.x-this.x,p.z-this.z)<6);
    if(danger){
      const away=Math.atan2(this.x-danger.x,this.z-danger.z);
      this.targetX=this.x+Math.sin(away)*this.range;
      this.targetZ=this.z+Math.cos(away)*this.range;
      this.fleeingUntil=time+2.2;
    }else if(time>this.nextTarget||Math.hypot(this.targetX-this.x,this.targetZ-this.z)<0.5){
      this.nextTarget=time+this.rng.range(3,8);
      const angle=this.rng.range(-Math.PI,Math.PI),distance=this.rng.range(2,this.range);
      this.targetX=this.x+Math.sin(angle)*distance;this.targetZ=this.z+Math.cos(angle)*distance;
    }
    const fleeing=time<this.fleeingUntil;
    const moving=fleeing||Math.sin(time*0.47+this.root.id)>-0.3;
    if(moving){
      const angle=Math.atan2(this.targetX-this.x,this.targetZ-this.z);
      const step=dt*this.speed*(fleeing?2:1);
      const nx=THREE.MathUtils.clamp(this.x+Math.sin(angle)*step,-97,97);
      const nz=THREE.MathUtils.clamp(this.z+Math.cos(angle)*step,-97,97);
      this.x=nx;this.z=nz;
      const desired=angle+Math.PI;
      const turn=Math.atan2(Math.sin(desired-this.root.rotation.y),Math.cos(desired-this.root.rotation.y));
      this.root.rotation.y+=THREE.MathUtils.clamp(turn,-dt*4,dt*4);
    }
    this.root.position.set(this.x,groundAt(this.x,this.z),this.z);
    this.legs.forEach((leg,i)=>{
      const stride=moving?Math.sin(time*(fleeing?13:7)+i*Math.PI*0.7)*(fleeing?0.55:0.27):0;
      leg.rotation.x=THREE.MathUtils.damp(leg.rotation.x,stride,9,dt);
    });
    this.root.userData.tailPhase=time;
  }
}

export class Deer extends ForestAnimal {
  constructor(x:number,z:number,rng:Random){
    super('deer',x,z,rng);this.speed=1.55;this.range=11;
    const fur=mat(0xa8784d),muzzle=mat(0xcaa980);
    this.body(this.root,sphere,fur,0,1.1,0,0.52,0.55,0.9);
    this.body(this.root,sphere,cream,0,0.85,-0.4,0.36,0.25,0.38);
    this.body(this.root,sphere,fur,0,1.65,-0.65,0.31,0.55,0.3);
    this.body(this.root,sphere,fur,0,1.95,-0.82,0.4,0.38,0.39);
    this.body(this.root,sphere,muzzle,0,1.82,-1.13,0.24,0.18,0.29);
    for(const side of [-1,1]){
      this.body(this.root,cone,fur,side*0.34,2.3,-0.65,0.17,0.42,0.14);
      this.eye(side*0.33,2.04,-1.03);
      for(const zLeg of [-0.52,0.55])this.leg(side*0.34,0.94,zLeg,0.82,fur);
      const antler=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.045,0.8,5),muzzle);
      antler.position.set(side*0.22,2.62,-0.76);antler.rotation.z=side*0.23;this.root.add(antler);
      for(let i=0;i<2;i++){
        const tine=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.03,0.32,4),muzzle);
        tine.position.set(side*(0.31+i*0.07),2.54+i*0.2,-0.83);tine.rotation.z=side*0.8;this.root.add(tine);
      }
    }
    this.body(this.root,sphere,cream,0,1.16,0.92,0.18,0.18,0.22);
  }
}

export class Squirrel extends ForestAnimal {
  constructor(x:number,z:number,rng:Random){
    super('squirrel',x,z,rng);this.speed=1.45;this.range=7;
    const fur=mat(0xb46a39),light=mat(0xe8c994);
    this.body(this.root,sphere,fur,0,0.43,0,0.28,0.39,0.42);
    this.body(this.root,sphere,light,0,0.37,-0.29,0.2,0.25,0.2);
    this.body(this.root,sphere,fur,0,0.77,-0.3,0.31,0.29,0.29);
    this.body(this.root,sphere,light,0,0.67,-0.54,0.18,0.14,0.16);
    for(const side of [-1,1]){
      this.body(this.root,cone,fur,side*0.2,1.07,-0.23,0.12,0.35,0.1);
      this.eye(side*0.22,0.82,-0.48);
      for(const back of [-0.2,0.28])this.leg(side*0.2,0.3,back,0.25,fur);
    }
    const tail=this.body(this.root,sphere,fur,0,0.73,0.66,0.25,0.62,0.3);tail.rotation.x=0.38;
    this.body(this.root,sphere,light,0,1.21,0.82,0.21,0.25,0.22);
  }
}

export class Hedgehog extends ForestAnimal {
  constructor(x:number,z:number,rng:Random){
    super('hedgehog',x,z,rng);this.speed=0.65;this.range=4.5;
    const fur=mat(0x785a42),spines=mat(0x55483b);
    this.body(this.root,sphere,fur,0,0.31,0,0.44,0.33,0.57);
    this.body(this.root,sphere,cream,0,0.26,-0.42,0.31,0.24,0.28);
    this.body(this.root,sphere,dark,0,0.24,-0.7,0.08,0.07,0.09);
    for(const side of [-1,1]){
      this.eye(side*0.22,0.39,-0.58);
      for(const back of [-0.28,0.31])this.leg(side*0.31,0.22,back,0.18,fur);
    }
    for(let i=0;i<36;i++){
      const angle=i*2.4,front=(i%6)/5;
      const x=Math.sin(angle)*0.35,z=-0.27+front*0.73;
      const spine=this.body(this.root,cone,spines,x,0.57,z,0.09,0.38,0.09);
      spine.rotation.z=-x*0.7;spine.rotation.x=z*0.4;
    }
  }
}

export class Beaver extends ForestAnimal {
  constructor(x:number,z:number,rng:Random){
    super('beaver',x,z,rng);this.speed=0.9;this.range=6;
    const fur=mat(0x79523c),tailMat=mat(0x514135);
    this.body(this.root,sphere,fur,0,0.47,0,0.46,0.44,0.7);
    this.body(this.root,sphere,fur,0,0.63,-0.63,0.33,0.29,0.32);
    this.body(this.root,sphere,cream,0,0.52,-0.86,0.23,0.15,0.22);
    this.body(this.root,sphere,cream,-0.09,0.37,-1.02,0.08,0.16,0.07);
    this.body(this.root,sphere,cream,0.09,0.37,-1.02,0.08,0.16,0.07);
    for(const side of [-1,1]){
      this.body(this.root,sphere,fur,side*0.24,0.89,-0.55,0.1,0.13,0.11);
      this.eye(side*0.24,0.72,-0.82);
      for(const back of [-0.4,0.46])this.leg(side*0.31,0.3,back,0.25,fur);
    }
    const paddle=this.body(this.root,sphere,tailMat,0,0.18,0.98,0.29,0.08,0.72);paddle.rotation.x=-0.06;
  }
}

export class Moose extends ForestAnimal {
  constructor(x:number,z:number,rng:Random){
    super('moose',x,z,rng);this.speed=1.05;this.range=10;
    const fur=mat(0x6b523e),antler=mat(0xb49a72);
    this.body(this.root,sphere,fur,0,1.55,0,0.7,0.68,1.15);
    this.body(this.root,sphere,fur,0,2.14,-0.75,0.45,0.65,0.42);
    this.body(this.root,sphere,fur,0,2.43,-1.14,0.48,0.4,0.5);
    this.body(this.root,sphere,fur,0,2.2,-1.62,0.34,0.23,0.38);
    for(const side of [-1,1]){
      this.eye(side*0.36,2.54,-1.37);
      this.body(this.root,cone,fur,side*0.45,2.75,-0.98,0.2,0.42,0.13);
      for(const back of [-0.72,0.7])this.leg(side*0.47,1.23,back,1.14,fur);
      const palm=this.body(this.root,sphere,antler,side*0.84,3.08,-1.03,0.48,0.18,0.25);
      palm.rotation.z=side*0.3;
      for(let i=0;i<3;i++)this.body(this.root,cone,antler,side*(0.63+i*0.2),3.31,-1.02,0.08,0.38,0.08);
    }
  }
}

export function createForestAnimal(kind:WildlifeKind,x:number,z:number,rng:Random):ForestAnimal{
  switch(kind){case'deer':return new Deer(x,z,rng);case'squirrel':return new Squirrel(x,z,rng);
    case'hedgehog':return new Hedgehog(x,z,rng);case'beaver':return new Beaver(x,z,rng);case'moose':return new Moose(x,z,rng);}
}
