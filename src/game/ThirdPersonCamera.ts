import * as THREE from 'three';
import type { Excavation } from './Excavation';

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

/** Orbit camera with camera-relative movement and a confined tunnel boom. */
export class ThirdPersonCamera {
  private yaw=0.3;
  private pitch=0.27;
  private distance=7.5;
  private pointer?:{x:number;y:number};
  constructor(readonly camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement){
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{if(e.button!==2)return;this.pointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointerup',()=>{this.pointer=undefined;});
    canvas.addEventListener('pointercancel',()=>{this.pointer=undefined;});
    canvas.addEventListener('pointermove',e=>{
      if(!this.pointer)return;
      this.yaw-=(e.clientX-this.pointer.x)*0.006;
      this.pitch=clamp(this.pitch+(e.clientY-this.pointer.y)*0.004,-0.3,1.1);
      this.pointer={x:e.clientX,y:e.clientY};
    });
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=clamp(this.distance+e.deltaY*0.01,2.5,13);},{passive:false});
  }
  resize(width:number,height:number):void{this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  forwardAt(x:number,z:number):{x:number;z:number}{
    const dx=x-this.camera.position.x,dz=z-this.camera.position.z,length=Math.hypot(dx,dz);
    return length>0.01?{x:dx/length,z:dz/length}:{x:-Math.sin(this.yaw),z:-Math.cos(this.yaw)};
  }
  snap(x:number,y:number,z:number,underground:boolean):void{
    this.camera.position.set(x,y+(underground?1.1:4),z+(underground?0.8:6));
  }
  update(x:number,z:number,groundY:number,earth?:Excavation):void{
    const underground=!!earth,shallow=!!earth&&earth.depthAt(x,groundY,z)<1.15&&earth.nearOpening(x,z,2);
    const distance=underground?Math.min(this.distance,shallow?3.7:2.35):this.distance;
    const pitch=underground?clamp(this.pitch,-0.18,0.28):this.pitch;
    const target=new THREE.Vector3(x,groundY+(underground?0.7:0.65),z);
    const planar=Math.cos(pitch)*distance;
    let wanted=new THREE.Vector3(x+Math.sin(this.yaw)*planar,groundY+(underground?0.75:1.5)+Math.sin(pitch)*distance,z+Math.cos(this.yaw)*planar);
    if(earth){
      wanted=earth.cameraPoint(target,wanted);
      if(!earth.contains(this.camera.position))this.camera.position.copy(wanted);
      else this.camera.position.copy(earth.cameraPoint(target,this.camera.position.clone().lerp(wanted,0.35)));
    }else this.camera.position.lerp(wanted,0.13);
    this.camera.lookAt(target);
  }
}
