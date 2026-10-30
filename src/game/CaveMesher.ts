import * as THREE from 'three';
import type { DigNode } from './types';

type Edge=[DigNode,DigNode];
type Chunk={mesh:THREE.Mesh;center:THREE.Vector3};
const tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];

/** Chunked implicit surface of the union of dug chambers and passages. */
export class CaveMesher {
  readonly group=new THREE.Group();
  private chunks=new Map<string,Chunk>();
  private nodes:DigNode[]=[];
  private edges:Edge[]=[];
  private readonly chunkSize=6;
  private readonly step=0.5;
  private readonly material=new THREE.MeshStandardMaterial({color:0x80694e,roughness:1,side:THREE.BackSide});
  constructor(scene:THREE.Scene,private readonly surfaceAt:(x:number,z:number)=>number=()=>Infinity){scene.add(this.group);}

  addNode(node:DigNode,connections:DigNode[]):void{
    this.nodes.push(node);
    const fresh=connections.map(other=>[node,other] as Edge);
    this.edges.push(...fresh);
    const touched=new Set<string>();
    this.keysForBounds(node.x-2.1,node.y-1.3,node.z-2.1,node.x+2.1,node.y+1.3,node.z+2.1,touched);
    for(const [a,b] of fresh)this.keysForBounds(Math.min(a.x,b.x)-2.1,Math.min(a.y,b.y)-1.3,Math.min(a.z,b.z)-2.1,
      Math.max(a.x,b.x)+2.1,Math.max(a.y,b.y)+1.3,Math.max(a.z,b.z)+2.1,touched);
    for(const key of touched)this.rebuildChunk(key);
  }
  private keysForBounds(minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number,keys:Set<string>):void{
    const s=this.chunkSize;
    for(let x=Math.floor(minX/s);x<=Math.floor(maxX/s);x++)for(let y=Math.floor(minY/s);y<=Math.floor(maxY/s);y++)
      for(let z=Math.floor(minZ/s);z<=Math.floor(maxZ/s);z++)keys.add(`${x},${y},${z}`);
  }
  private rebuildChunk(key:string):void{
    const [cx,cy,cz]=key.split(',').map(Number),s=this.chunkSize;
    const min=new THREE.Vector3(cx*s,cy*s,cz*s),max=min.clone().addScalar(s);
    const nearbyNodes=this.nodes.filter(n=>n.x>min.x-2.1&&n.x<max.x+2.1&&n.y>min.y-1.3&&n.y<max.y+1.3&&n.z>min.z-2.1&&n.z<max.z+2.1);
    const nearbyEdges=this.edges.filter(([a,b])=>Math.max(a.x,b.x)>min.x-2.1&&Math.min(a.x,b.x)<max.x+2.1&&
      Math.max(a.y,b.y)>min.y-1.3&&Math.min(a.y,b.y)<max.y+1.3&&Math.max(a.z,b.z)>min.z-2.1&&Math.min(a.z,b.z)<max.z+2.1);
    const old=this.chunks.get(key);if(old){old.mesh.removeFromParent();old.mesh.geometry.dispose();this.chunks.delete(key);}
    if(!nearbyNodes.length&&!nearbyEdges.length)return;
    const sdf=(x:number,y:number,z:number):number=>{
      let distance=Infinity;
      for(const n of nearbyNodes){const d=Math.hypot((x-n.x)/1.9,(y-n.y)/1.1,(z-n.z)/1.9)-1;if(d<distance)distance=d;}
      for(const [a,b] of nearbyEdges){
        const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy+(z-a.z)*dz)/(dx*dx+dy*dy+dz*dz)));
        const d=Math.hypot((x-a.x-dx*t)/1.9,(y-a.y-dy*t)/1.1,(z-a.z-dz*t)/1.9)-1;
        const h=Math.max(0,0.25-Math.abs(distance-d))/0.25;
        distance=Math.min(distance,d)-h*h*0.0625;
      }
      return distance;
    };
    const n=Math.round(s/this.step),stride=n+1,field=new Float32Array(stride*stride*stride);
    const index=(x:number,y:number,z:number)=>(z*stride+y)*stride+x;
    for(let z=0;z<=n;z++)for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)
      field[index(x,y,z)]=sdf(min.x+x*this.step,min.y+y*this.step,min.z+z*this.step);
    const positions:number[]=[],normals:number[]=[];
    const gradient=(p:THREE.Vector3)=>{
      const h=0.06;
      return new THREE.Vector3(sdf(p.x+h,p.y,p.z)-sdf(p.x-h,p.y,p.z),
        sdf(p.x,p.y+h,p.z)-sdf(p.x,p.y-h,p.z),sdf(p.x,p.y,p.z+h)-sdf(p.x,p.y,p.z-h)).normalize();
    };
    const triangle=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>{
      const above=(p:THREE.Vector3)=>p.y-this.surfaceAt(p.x,p.z)+0.035;
      const clipped:THREE.Vector3[]=[];
      const source=[a,b,c];
      for(let i=0;i<source.length;i++){
        const start=source[i],end=source[(i+1)%source.length],ds=above(start),de=above(end);
        if(ds<=0)clipped.push(start);
        if((ds<0&&de>0)||(ds>0&&de<0))clipped.push(start.clone().lerp(end,ds/(ds-de)));
      }
      for(let i=1;i<clipped.length-1;i++){
        let p=clipped[0],q=clipped[i],r=clipped[i+1];
        if(q.clone().sub(p).cross(r.clone().sub(p)).dot(gradient(p))<0){[q,r]=[r,q];}
        for(const vertex of [p,q,r]){
          positions.push(vertex.x,vertex.y,vertex.z);
          const normal=gradient(vertex);normals.push(normal.x,normal.y,normal.z);
        }
      }
    };
    for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const points=corners.map(([ox,oy,oz])=>new THREE.Vector3(min.x+(x+ox)*this.step,min.y+(y+oy)*this.step,min.z+(z+oz)*this.step));
      const values=corners.map(([ox,oy,oz])=>field[index(x+ox,y+oy,z+oz)]);
      if(values.every(v=>v>=0)||values.every(v=>v<0))continue;
      for(const tet of tetrahedra){
        const inside=tet.filter(i=>values[i]<0),outside=tet.filter(i=>values[i]>=0);
        const cross=(i:number,j:number)=>points[i].clone().lerp(points[j],values[i]/(values[i]-values[j]));
        if(inside.length===1)triangle(cross(inside[0],outside[0]),cross(inside[0],outside[1]),cross(inside[0],outside[2]));
        else if(inside.length===3)triangle(cross(outside[0],inside[0]),cross(outside[0],inside[1]),cross(outside[0],inside[2]));
        else if(inside.length===2){
          const a=cross(inside[0],outside[0]),b=cross(inside[0],outside[1]);
          const c=cross(inside[1],outside[0]),d=cross(inside[1],outside[1]);
          triangle(a,b,c);triangle(b,d,c);
        }
      }
    }
    if(!positions.length)return;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,this.material);mesh.receiveShadow=true;this.group.add(mesh);
    this.chunks.set(key,{mesh,center:min.clone().addScalar(s/2)});
  }
  nearby(target:THREE.Vector3,radius:number):THREE.Mesh[]{
    return [...this.chunks.values()].filter(c=>c.center.distanceTo(target)<radius).map(c=>c.mesh);
  }
  updateVisibility(x:number,y:number,z:number):void{
    const p=new THREE.Vector3(x,y,z);
    for(const chunk of this.chunks.values())chunk.mesh.visible=chunk.center.distanceTo(p)<32;
  }
  get chunkCount():number{return this.chunks.size;}
}
