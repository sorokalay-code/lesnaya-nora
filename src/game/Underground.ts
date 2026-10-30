import * as THREE from 'three';
import type { FoodKind, SaveData } from './types';

type Cell={x:number;z:number;level:number;group:THREE.Group;walls:THREE.Mesh[];root?:THREE.Group};
type RootInfo={kind:FoodKind;available:boolean;mesh?:THREE.Object3D}|undefined;
const cellKey=(x:number,z:number,level:number)=>`${level}:${x},${z}`;

/** Excavated voxels share the forest scene and global coordinates. */
export class Underground {
  readonly step=2;
  readonly maxDepth=50;
  readonly maxLevel=24;
  readonly group=new THREE.Group();
  private open=new Set<string>();
  private cells=new Map<string,Cell>();
  private soil=new THREE.MeshStandardMaterial({color:0x705a43,roughness:1,side:THREE.DoubleSide});
  private floorMat=new THREE.MeshStandardMaterial({color:0x8a7052,roughness:1,side:THREE.DoubleSide});
  private rootMat=new THREE.MeshStandardMaterial({color:0xa4774a,roughness:1});
  private vegetableMat=new THREE.MeshStandardMaterial({color:0xd68142,roughness:1});
  private marker=new THREE.Mesh(new THREE.BoxGeometry(1.9,1.85,0.08),new THREE.MeshBasicMaterial({color:0xf5d196,transparent:true,opacity:0.17,depthWrite:false}));
  private light=new THREE.PointLight(0xffe8bd,4,12);
  private lastCull='';
  private lastRootCheck=0;

  constructor(scene:THREE.Scene,private readonly save:SaveData,
    private readonly heightAt:(x:number,z:number)=>number,
    private readonly rootAt:(x:number,z:number,depth:number)=>RootInfo) {
    scene.add(this.group);this.marker.visible=false;this.group.add(this.marker,this.light);
    for(const id of save.excavation??[])if(/^(\d+):(-?\d+),(-?\d+)$/.test(id)&&Number(id.split(':')[0])<=this.maxLevel)this.open.add(id);
    this.rebuild();
  }

  snap(v:number):number{return Math.round(v/this.step);}
  cellX(x:number):number{return this.snap(x)*this.step;}
  floorY(x:number,z:number,level:number):number{return this.heightAt(x,z)-(level+1)*2;}
  depth(level:number):number{return (level+1)*2;}
  isOpen(x:number,z:number,level:number):boolean{return this.open.has(cellKey(this.snap(x),this.snap(z),level));}
  hasShaft(x:number,z:number,level:number):boolean{return this.isOpen(x,z,level);}
  canMove(x:number,z:number,level:number):boolean {
    const gx=this.snap(x),gz=this.snap(z),cx=gx*this.step,cz=gz*this.step;
    if(!this.open.has(cellKey(gx,gz,level)))return false;
    const ox=Math.abs(x-cx),oz=Math.abs(z-cz);
    if(ox<0.81&&oz<0.81)return true;
    const nx=gx+Math.sign(x-cx),nz=gz+Math.sign(z-cz);
    return (ox<0.81||this.open.has(cellKey(nx,gz,level)))&&
      (oz<0.81||this.open.has(cellKey(gx,nz,level)));
  }

  excavate(x:number,z:number,level:number):boolean {
    if(level<0||level>this.maxLevel||Math.abs(x)>103||Math.abs(z)>103)return false;
    const gx=this.snap(x),gz=this.snap(z),id=cellKey(gx,gz,level);
    if(this.open.has(id))return false;
    this.open.add(id);this.save.excavation=[...this.open];this.rebuildAround(gx,gz,level);return true;
  }
  refreshCell(x:number,z:number,level:number):void{
    const gx=this.snap(x),gz=this.snap(z);
    if(this.open.has(cellKey(gx,gz,level)))this.buildCell(gx,gz,level);
  }

  digAhead(x:number,z:number,level:number,facing:number):{success:boolean;reason?:string;x:number;z:number}{
    const tx=this.cellX(x-Math.sin(facing)*1.65),tz=this.cellX(z-Math.cos(facing)*1.65);
    if(Math.abs(tx)>103||Math.abs(tz)>103)return{success:false,reason:'Здесь край исследуемого леса.',x:tx,z:tz};
    if(this.isOpen(tx,tz,level))return{success:false,reason:'Ход уже выкопан. Повернись к земляной стене.',x:tx,z:tz};
    if(!this.isOpen(x,z,level))return{success:false,reason:'Начни копать от существующего хода.',x:tx,z:tz};
    this.excavate(tx,tz,level);return{success:true,x:tx,z:tz};
  }

  setPlayerLight(x:number,y:number,z:number):void{this.light.position.set(x,y+1.2,z);this.light.visible=true;}
  hidePlayerLight():void{this.light.visible=false;this.marker.visible=false;}
  updateVisibility(x:number,z:number,level:number):void{
    const key=`${this.snap(x)},${this.snap(z)},${level}`;
    if(key!==this.lastCull){
      this.lastCull=key;
      for(const cell of this.cells.values())cell.group.visible=Math.abs(cell.level-level)<=1&&Math.hypot(cell.x*2-x,cell.z*2-z)<20;
    }
    if(performance.now()-this.lastRootCheck>800){
      this.lastRootCheck=performance.now();
      for(const cell of this.cells.values())if(cell.group.visible&&cell.root){
        const root=this.rootAt(cell.x*2,cell.z*2,this.depth(cell.level));
        cell.root.visible=!!root?.available&&(!root.mesh||root.mesh.visible);
      }
    }
  }
  updateMarker(x:number,z:number,level:number,facing:number):void{
    const tx=this.cellX(x-Math.sin(facing)*1.65),tz=this.cellX(z-Math.cos(facing)*1.65);
    this.marker.visible=!this.isOpen(tx,tz,level)&&Math.abs(tx)<=103&&Math.abs(tz)<=103;
    this.marker.position.set((x+tx)/2,this.floorY(tx,tz,level)+0.95,(z+tz)/2);this.marker.rotation.y=facing;
  }

  /** Walls shorten the camera boom so the viewpoint stays inside dug air. */
  cameraPoint(target:THREE.Vector3,desired:THREE.Vector3,level:number):THREE.Vector3 {
    const direction=desired.clone().sub(target),length=direction.length();if(length<0.01)return target.clone();direction.normalize();
    const ray=new THREE.Raycaster(target,direction,0,length),objects:THREE.Object3D[]=[];
    for(const cell of this.cells.values())if(cell.level===level&&Math.hypot(cell.x*2-target.x,cell.z*2-target.z)<8)objects.push(...cell.walls);
    const hit=ray.intersectObjects(objects,false)[0],limit=hit?Math.max(0.5,hit.distance-0.22):length;
    const point=target.clone().addScaledVector(direction,Math.min(length,limit));
    const floor=this.floorY(point.x,point.z,level);point.y=Math.max(floor+0.55,Math.min(floor+1.68,point.y));
    if(!this.canMove(point.x,point.z,level))return target.clone().addScaledVector(direction,0.55);
    return point;
  }

  private rebuild():void{for(const id of this.open){const [level,coords]=id.split(':');const [x,z]=coords.split(',').map(Number);this.buildCell(x,z,Number(level));}}
  private rebuildAround(x:number,z:number,level:number):void{
    for(const [cx,cz] of [[x,z],[x+1,z],[x-1,z],[x,z+1],[x,z-1]])if(this.open.has(cellKey(cx,cz,level)))this.buildCell(cx,cz,level);
    for(const vertical of [level-1,level+1])if(this.open.has(cellKey(x,z,vertical)))this.buildCell(x,z,vertical);
  }
  private buildCell(gx:number,gz:number,level:number):void{
    const id=cellKey(gx,gz,level),old=this.cells.get(id);
    if(old){old.group.removeFromParent();old.group.traverse(obj=>{if(obj instanceof THREE.Mesh)obj.geometry.dispose();});}
    const x=gx*this.step,z=gz*this.step,y=this.floorY(x,z,level),group=new THREE.Group();group.position.set(x,y,z);this.group.add(group);
    const walls:THREE.Mesh[]=[];
    const slab=(w:number,h:number,d:number,px:number,py:number,pz:number,material:THREE.Material)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(px,py,pz);mesh.receiveShadow=true;group.add(mesh);return mesh;
    };
    const floorOpening=this.open.has(cellKey(gx,gz,level+1));
    const roofOpening=this.open.has(cellKey(gx,gz,level-1))||level===0&&this.save.burrows.some(b=>Math.hypot(b.x-x,b.z-z)<1.1);
    const panel=(py:number,thickness:number,material:THREE.Material,opening:boolean)=>{
      if(!opening){slab(2,thickness,2,0,py,0,material);return;}
      slab(0.63,thickness,2,-0.685,py,0,material);slab(0.63,thickness,2,0.685,py,0,material);
      slab(0.74,thickness,0.63,0,py,-0.685,material);slab(0.74,thickness,0.63,0,py,0.685,material);
    };
    panel(-0.08,0.12,this.floorMat,floorOpening);panel(1.93,0.18,this.soil,roofOpening);
    for(const [dx,dz,px,pz,w,d] of [[1,0,1,0,0.12,2],[-1,0,-1,0,0.12,2],[0,1,0,1,2,0.12],[0,-1,0,-1,2,0.12]] as const)
      if(!this.open.has(cellKey(gx+dx,gz+dz,level)))walls.push(slab(w,1.94,d,px,0.91,pz,this.soil));
    let rootGroup:THREE.Group|undefined;
    if(level<4){const root=this.rootAt(x,z,this.depth(level));if(root){
      rootGroup=new THREE.Group();rootGroup.visible=root.available&&(!root.mesh||root.mesh.visible);group.add(rootGroup);
      const shape=new THREE.Mesh(new THREE.CylinderGeometry(0.07,root.kind==='carrot'?0.16:0.1,0.8,7),root.kind==='carrot'?this.vegetableMat:this.rootMat);
      shape.position.set(0.22,1.55,-0.18);rootGroup.add(shape);
      for(const side of [-1,1]){const branch=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.05,0.6,5),this.rootMat);
        branch.position.set(side*0.22,1.48,0);branch.rotation.z=side*0.6;rootGroup.add(branch);}
    }}
    this.cells.set(id,{x:gx,z:gz,level,group,walls,root:rootGroup});
  }
}
