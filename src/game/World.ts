import * as THREE from 'three';
import { Random, smoothNoise } from './Random';
import { SeasonSystem } from './Systems';
import { WorldChunks } from './WorldChunks';
import { Terrain } from './Terrain';
import { ModelAssets } from './ModelAssets';
import { type Biome, type FoodKind, type SaveData, type Weather } from './types';

export interface Resource { id: number; x: number; z: number; kind: FoodKind; mesh: THREE.Group; available: boolean; regrowAt: number; }
export interface TreeRoot {kind:'acorn';available:boolean;tree:true;id:number}
export interface LandMark { x: number; z: number; label: string; biome: Biome; }

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
const sphere = new THREE.SphereGeometry(1, 8, 6);
const cone = new THREE.ConeGeometry(1, 1, 7);

function blob(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const mesh = new THREE.Mesh(sphere, material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

export class World {
  readonly size = 110;
  readonly scene: THREE.Scene;
  readonly resources: Resource[] = [];
  readonly waterSources: { x: number; z: number }[] = [];
  readonly treeLocations:{x:number;z:number}[]=[];
  readonly landmarks: LandMark[] = [
    { x: 0, z: 0, biome: 'meadow', label: 'Родная поляна' },
    { x: 34, z: 31, biome: 'garden', label: 'Дачный огород' },
    { x: -35, z: 29, biome: 'garden', label: 'Старый огород' },
    { x: -31, z: -25, biome: 'swamp', label: 'Тихая топь' },
    { x: 27, z: -34, biome: 'forest', label: 'Сосновая чаща' },
  ];
  readonly seed: number;
  readonly chunks:WorldChunks;
  readonly terrain:Terrain;
  private seasons:SeasonSystem;
  private currentDay=1;
  private displayedSeason='';
  private groundColors?:THREE.BufferAttribute;
  private baseGroundColors?:Float32Array;
  private groundGeometry?:THREE.BufferGeometry;
  private groundMesh?:THREE.Mesh;
  private groundTiles:{x:number;z:number;indices:number[]}[]=[];
  private holes:{x:number;z:number;radius:number}[]=[];
  private holePatches:THREE.Mesh[]=[];
  private readonly exposedSoil=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
  private treeRootRegrow=new Map<number,number>();
  private currentClock=0;
  private nextResourceSync=0;
  private foliageMaterials=new Map<THREE.MeshStandardMaterial,THREE.Color>();
  private deciduousCrowns:THREE.Object3D[]=[];
  private fallenLeaves:THREE.Object3D[]=[];
  private grassMaterial?:THREE.MeshStandardMaterial;
  private rng: Random;
  private rain?: THREE.Points;
  private butterflies: {mesh:THREE.Group;x:number;z:number;phase:number}[]=[];
  private heightCache=new Map<string,number>();

  constructor(scene: THREE.Scene, seed: number,private readonly save?:SaveData) {
    this.scene = scene; this.seed = seed; this.rng = new Random(seed);this.seasons=new SeasonSystem(seed);this.chunks=new WorldChunks(scene);this.terrain=new Terrain(seed);
    this.exposedSoil.map=ModelAssets.shared.soil??null;
    for(const [id,time] of Object.entries(save?.gnawedRoots??{}))this.treeRootRegrow.set(Number(id),time);
    this.buildGround(); this.buildDecorations(); this.buildResources();
  }

  /** The rendered terrain consists of two triangles per 1 m tile. Gameplay samples those same planes. */
  heightAt(x:number,z:number):number{
    const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz;
    const sample=(gx:number,gz:number)=>{
      const key=`${gx},${gz}`;
      let value=this.heightCache.get(key);
      if(value===undefined){value=this.terrain.heightAt(gx,gz);this.heightCache.set(key,value);}
      return value;
    };
    const h00=sample(ix,iz);
    if(u===0&&v===0)return h00;
    const h11=sample(ix+1,iz+1);
    if(u>=v){const h10=sample(ix+1,iz);return h00+(h10-h00)*u+(h11-h10)*v;}
    const h01=sample(ix,iz+1);
    return h00+(h11-h01)*u+(h01-h00)*v;
  }
  temperatureOffset(x:number,z:number):number{return this.terrain.temperatureOffset(x,z);}
  rootAt(x:number,z:number,depth:number):Resource|TreeRoot|undefined{
    if(depth<=4){
      let best:Resource|undefined,dist=1.45;
      for(const resource of this.resources){
        if(!['carrot','cabbage','clover','bitterleaf','berries'].includes(resource.kind))continue;
        const d=Math.hypot(resource.x-x,resource.z-z);
        if(d<dist){best=resource;dist=d;}
      }
      if(best)return best;
    }
    if(depth>8)return undefined;
    let index=-1,dist=2.4;
    this.treeLocations.forEach((tree,i)=>{const d=Math.hypot(tree.x-x,tree.z-z);if(d<dist){index=i;dist=d;}});
    return index<0?undefined:{kind:'acorn',available:this.currentClock>=(this.treeRootRegrow.get(index)??0),tree:true,id:index};
  }
  gnawTreeRoot(id:number,clock:number):void{
    this.treeRootRegrow.set(id,clock+260);
    if(this.save){this.save.gnawedRoots??={};this.save.gnawedRoots[id]=clock+260;}
  }
  gnawBark(x:number,z:number,clock:number):boolean{
    const index=this.treeLocations.findIndex(t=>Math.hypot(t.x-x,t.z-z)<2.2);
    if(index<0)return false;
    const cooldown=this.save?.gnawedBark?.[index]??0;
    if(clock<cooldown)return false;
    if(this.save){this.save.gnawedBark??={};this.save.gnawedBark[index]=clock+240;}
    return true;
  }

  biomeAt(x: number, z: number): Biome {
    if (Math.hypot(x - 34, z - 31) < 15 || Math.hypot(x + 35, z - 29) < 12) return 'garden';
    if (Math.hypot(x + 31, z + 25) < 19 && smoothNoise(x / 12, z / 12, this.seed + 78) > 0.25) return 'swamp';
    if (Math.hypot(x, z) < 12) return 'meadow';
    const n = smoothNoise(x / 19, z / 19, this.seed) * 0.7 + smoothNoise(x / 8, z / 8, this.seed + 19) * 0.3;
    return n > 0.53 ? 'forest' : 'meadow';
  }

  private buildGround(): void {
    const verts: number[] = [], colors: number[] = [], uvs:number[]=[], indices: number[] = [];
    const color = new THREE.Color();
    const n = 220, step = this.size * 2 / n;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const wx = -this.size + x * step, wz = -this.size + z * step;
      const j = verts.length / 3;
      verts.push(wx, this.heightAt(wx,wz), wz, wx + step, this.heightAt(wx+step,wz), wz,
        wx + step, this.heightAt(wx+step,wz+step), wz + step, wx, this.heightAt(wx,wz+step), wz + step);
      for(const [vx,vz] of [[wx,wz],[wx+step,wz],[wx+step,wz+step],[wx,wz+step]]){
        const biome=this.biomeAt(vx,vz);
        const base=biome==='forest'?0x568255:biome==='meadow'?0x90b672:biome==='swamp'?0x77966e:0xab9268;
        const variation=smoothNoise(vx/7,vz/7,this.seed+101)*.22+smoothNoise(vx/2.3,vz/2.3,this.seed+311)*.1;
        color.setHex(base).multiplyScalar(.84+variation);
        colors.push(color.r,color.g,color.b);
        uvs.push(vx/7,vz/7);
      }
      const tileIndices=[j,j+2,j+1,j,j+3,j+2];indices.push(...tileIndices);
      this.groundTiles.push({x:wx+step/2,z:wz+step/2,indices:tileIndices});
    }
    const geo = new THREE.BufferGeometry();
    this.groundGeometry=geo;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geo.setIndex(indices); geo.computeVertexNormals();
    this.groundColors=geo.getAttribute('color') as THREE.BufferAttribute;this.baseGroundColors=new Float32Array(colors);
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true,map:ModelAssets.shared.ground, roughness: 1, side: THREE.DoubleSide }));
    ground.receiveShadow = true; this.scene.add(ground);this.groundMesh=ground;
  }

  surfaceHit(origin:THREE.Vector3,direction:THREE.Vector3,maxDistance:number):THREE.Vector3|undefined{
    if(!this.groundMesh)return undefined;
    const ray=new THREE.Raycaster(origin,direction,0,maxDistance);
    return ray.intersectObject(this.groundMesh,false)[0]?.point;
  }

  isSurfaceCarved(x:number,z:number):boolean{
    return this.holes.some(h=>Math.hypot(x-h.x,z-h.z)<h.radius);
  }

  addGroundHole(x:number,z:number,radius=1.7):void{
    if(this.holes.some(h=>Math.hypot(h.x-x,h.z-z)<0.1))return;
    this.holes.push({x,z,radius});
    if(!this.groundGeometry)return;
    const indices:number[]=[];
    for(const tile of this.groundTiles){
      if(this.isSurfaceCarved(tile.x,tile.z))continue;
      indices.push(...tile.indices);
    }
    this.groundGeometry.setIndex(indices);this.groundGeometry.computeVertexNormals();
    this.rebuildHolePatches();
  }

  /** Cover the square edges of removed terrain tiles while leaving the dug cavity open. */
  private rebuildHolePatches():void{
    for(const mesh of this.holePatches){mesh.removeFromParent();mesh.geometry.dispose();}
    this.holePatches=[];
    for(const hole of this.holes){
      const geometry=new THREE.RingGeometry(1.5,2.55,48,6);
      const position=geometry.getAttribute('position') as THREE.BufferAttribute;
      const colors:number[]=[];
      for(let i=0;i<position.count;i++){
        const localX=position.getX(i),localZ=position.getY(i);
        const x=hole.x+localX,z=hole.z+localZ;
        position.setXYZ(i,x,this.heightAt(x,z)-0.045,z);
        const biome=this.biomeAt(x,z);
        const grass=new THREE.Color(biome==='forest'?0x54754f:biome==='meadow'?0x81a769:biome==='swamp'?0x688363:0xa48b60);
        const color=new THREE.Color(0x795c43).lerp(grass,Math.min(1,Math.max(0,(Math.hypot(localX,localZ)-1.5)/0.75)));
        colors.push(color.r,color.g,color.b);
      }
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      const original=geometry.getIndex();
      if(original){
        const kept:number[]=[];
        for(let i=0;i<original.count;i+=3){
          const a=original.getX(i),b=original.getX(i+1),c=original.getX(i+2);
          const x=(position.getX(a)+position.getX(b)+position.getX(c))/3;
          const z=(position.getZ(a)+position.getZ(b)+position.getZ(c))/3;
          if(this.isSurfaceCarved(x,z))continue;
          kept.push(a,b,c);
        }
        geometry.setIndex(kept);
      }
      geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,this.exposedSoil);
      mesh.receiveShadow=true;this.scene.add(mesh);this.holePatches.push(mesh);
    }
  }

  private buildDecorations(): void {
    const water = new THREE.MeshStandardMaterial({ color: 0x6c9c94, transparent: true, opacity: 0.74, roughness: 0.3 });
    for (let i = 0; i < 580; i++) {
      const x = this.rng.range(-105, 105), z = this.rng.range(-105, 105), biome = this.biomeAt(x, z);
      if (Math.hypot(x, z) < 6) continue;
      if (biome === 'garden') continue;
      if (biome === 'swamp' && this.rng.chance(0.28)) {
        const puddle=this.terrainDisc(x,z,this.rng.range(1.5,4),0.025,water);
        puddle.name='swamp-water';this.chunks.add(puddle,x,z);
      }
      if (biome === 'forest' && this.rng.chance(0.58)) {
        const deciduous=this.rng.chance(0.55);
        const g=ModelAssets.shared.create(deciduous?'oak':'pine').root;
        g.position.set(x,this.heightAt(x,z),z);
        g.scale.setScalar(this.rng.range(.7,1.38));g.rotation.y=this.rng.range(0,Math.PI*2);
        this.treeLocations.push({x,z});
        if(deciduous){
          const crown=g.getObjectByName('Foliage'),litter=g.getObjectByName('Litter');
          if(crown)this.deciduousCrowns.push(crown);
          if(litter){litter.visible=false;this.fallenLeaves.push(litter);}
        }
        this.trackFoliage(g);
        this.chunks.add(g,x,z);
      } else if (this.rng.chance(0.65)) {
        const kind=this.rng.chance(.34)?'fern':biome==='swamp'&&this.rng.chance(.5)?'reed':'bush';
        const g=ModelAssets.shared.create(kind).root;
        g.position.set(x,this.heightAt(x,z),z);
        g.scale.setScalar(this.rng.range(.75,1.25));g.rotation.y=this.rng.range(0,Math.PI*2);
        this.trackFoliage(g);
        this.chunks.add(g,x,z);
      }
    }
    this.makeGarden(34, 31, 16); this.makeGarden(-35, 29, 13);
    this.makePond(9, -7, 4.4); this.makePond(-28, -25, 6); this.makePond(-39, -18, 3.5);
    this.makeSmallDetails();
    this.makeButterflies();
    this.makeBoundary();
  }

  private trackFoliage(root:THREE.Object3D):void{
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||!(object.material instanceof THREE.MeshStandardMaterial))return;
      const material=object.material;
      if(material.name.startsWith('leaf_')&&!this.foliageMaterials.has(material)){
        const base=new THREE.Color(material.userData.baseColor as number??material.color.getHex());
        material.color.copy(base);this.foliageMaterials.set(material,base);
      }
    });
  }

  private terrainDisc(x:number,z:number,radius:number,offset:number,material:THREE.Material):THREE.Mesh{
    const segments=48,rings=Math.max(3,Math.ceil(radius/0.34));
    const vertices:number[]=[x,this.heightAt(x,z)+offset,z],indices:number[]=[];
    for(let ring=1;ring<=rings;ring++)for(let segment=0;segment<segments;segment++){
      const angle=segment*Math.PI*2/segments,distance=radius*ring/rings;
      const vx=x+Math.cos(angle)*distance,vz=z+Math.sin(angle)*distance;
      vertices.push(vx,this.heightAt(vx,vz)+offset,vz);
    }
    for(let segment=0;segment<segments;segment++)indices.push(0,1+(segment+1)%segments,1+segment);
    for(let ring=1;ring<rings;ring++)for(let segment=0;segment<segments;segment++){
      const a=1+(ring-1)*segments+segment,b=1+(ring-1)*segments+(segment+1)%segments;
      const c=a+segments,d=b+segments;
      indices.push(a,b,c,b,d,c);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;return mesh;
  }

  private makePond(x: number, z: number, radius: number): void {
    const g = new THREE.Group();
    const shore=this.terrainDisc(x,z,radius+0.55,0.015,mat(0x827f5b));g.add(shore);
    const water=this.terrainDisc(x,z,radius,0.035,new THREE.MeshStandardMaterial({color:0x75b1ad,roughness:0.22,metalness:0.08,transparent:true,opacity:0.88}));
    water.name='pond-water';g.add(water);
    const reedMat = mat(0x829d5c);
    for (let i = 0; i < 25; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(radius + 0.2, radius + 1.1);
      const rx=x+Math.cos(a)*d,rz=z+Math.sin(a)*d;
      const reed = new THREE.Mesh(cone, reedMat); reed.position.set(rx,this.heightAt(rx,rz)+0.33,rz);
      reed.scale.set(0.06, this.rng.range(0.5, 0.85), 0.06); g.add(reed);
    }
    for(let i=0;i<7;i++){
      const a=this.rng.range(0,Math.PI*2),d=this.rng.range(0,radius*0.78);
      const px=x+Math.cos(a)*d,pz=z+Math.sin(a)*d;
      const pad=this.terrainDisc(px,pz,this.rng.range(0.25,0.48),0.055,mat(0x5c965e));g.add(pad);
      if(i%3===0)blob(g,mat(0xf2d5df),px,this.heightAt(px,pz)+0.11,pz,0.09,0.06,0.09);
    }
    this.chunks.add(g,x,z); this.waterSources.push({ x, z });
  }

  private makeSmallDetails(): void {
    const grassGeo = new THREE.ConeGeometry(0.12, 0.6, 3), stoneGeo = new THREE.DodecahedronGeometry(0.18, 0);
    this.grassMaterial=mat(0x88b66d);
    const grass = new THREE.InstancedMesh(grassGeo, this.grassMaterial, 2200);
    const stones = new THREE.InstancedMesh(stoneGeo, mat(0x9a9b89), 370);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), mat(0xf4d7aa), 620);
    const dummy = new THREE.Object3D(); const color = new THREE.Color();
    for (let i = 0; i < 2200; i++) {
      const x = this.rng.range(-102, 102), z = this.rng.range(-102, 102);
      dummy.position.set(x, this.heightAt(x,z)+0.25, z); dummy.rotation.y = this.rng.range(0, Math.PI * 2); dummy.scale.setScalar(this.rng.range(0.65, 1.4)); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
      grass.setColorAt(i, color.setHex(this.biomeAt(x,z)==='swamp'?0x76966c:this.biomeAt(x,z)==='garden'?0x94a467:0x8bb467));
    }
    for (let i = 0; i < 370; i++) {
      const sx=this.rng.range(-101,101),sz=this.rng.range(-101,101);
      dummy.position.set(sx, this.heightAt(sx,sz)+0.12, sz); dummy.rotation.y = this.rng.range(0,6.28); dummy.scale.setScalar(this.rng.range(0.6,2.5)); dummy.updateMatrix(); stones.setMatrixAt(i,dummy.matrix);
    }
    for (let i = 0; i < 620; i++) {
      const x = this.rng.range(-102,102), z = this.rng.range(-102,102);
      dummy.position.set(x, this.heightAt(x,z)+0.47, z); dummy.rotation.y = 0; dummy.scale.setScalar(this.rng.range(0.8,1.6)); dummy.updateMatrix(); flowers.setMatrixAt(i,dummy.matrix);
      flowers.setColorAt(i,color.setHex(this.rng.pick([0xf5e6d2,0xeebfc5,0xebdf8b,0xc6b7dd])));
    }
    this.scene.add(grass, stones, flowers);
    const logMat = mat(0x6e5541), moss = mat(0x63875c);
    for (let i = 0; i < 65; i++) {
      const x = this.rng.range(-98,98), z = this.rng.range(-98,98);
      if (this.biomeAt(x,z)==='garden' || Math.hypot(x,z)<12) continue;
      const length=this.rng.range(1.2,3.1),angle=this.rng.range(0,Math.PI*2);
      const dx=Math.cos(angle),dz=Math.sin(angle);
      const start=this.heightAt(x-dx*length/2,z-dz*length/2),end=this.heightAt(x+dx*length/2,z+dz*length/2);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.24,length,7),logMat);
      log.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,(end-start)/length,dz).normalize());
      log.position.set(x,(start+end)/2+0.19,z);log.castShadow=true;this.chunks.add(log,x,z);
      const mossy=new THREE.Group();mossy.position.set(x+0.3,this.heightAt(x+0.3,z),z);blob(mossy,moss,0,0.35,0,0.22,0.08,0.16);this.chunks.add(mossy,x,z);
    }
  }

  private makeButterflies():void {
    const wingGeo=new THREE.SphereGeometry(1,8,6);
    for(let i=0;i<38;i++){
      const x=this.rng.range(-95,95),z=this.rng.range(-95,95);
      if(this.biomeAt(x,z)==='swamp')continue;
      const root=new THREE.Group(),wingMat=mat(this.rng.pick([0xe9c17d,0xd6b5d5,0xe6e2a0,0xa8d1d1]));
      for(const side of [-1,1]){
        const wing=new THREE.Mesh(wingGeo,wingMat);wing.position.set(side*0.12,0,0);wing.scale.set(0.15,0.025,0.1);root.add(wing);
      }
      root.position.set(x,this.heightAt(x,z)+0.9,z);this.chunks.add(root,x,z);this.butterflies.push({mesh:root,x,z,phase:i*2.37});
    }
  }

  private makeGarden(x: number, z: number, r: number): void {
    const fence = mat(0xbca277);
    for (let i = -r; i <= r; i += 2) for (const side of [-1, 1]) {
      if (Math.abs(i) < 3 && side === -1) continue;
      for (const [px, pz] of [[x + i, z + side * r], [x + side * r, z + i]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), fence);
        post.position.set(px, this.heightAt(px,pz)+0.55, pz); post.castShadow = true; this.chunks.add(post,px,pz);
      }
    }
    const hx=x+r*0.58,hz=z+r*0.58;
    const hutY=Math.min(...[-1.5,1.5].flatMap(dx=>[-1.35,1.35].map(dz=>this.heightAt(hx+dx,hz+dz))));
    const hut = new THREE.Group(); hut.position.set(hx,hutY,hz);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.7), mat(0xd5c19a)); wall.position.y = 1.1; wall.castShadow = true; hut.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.5, 4), mat(0x915b47)); roof.position.y = 2.8; roof.rotation.y = Math.PI / 4; hut.add(roof); this.chunks.add(hut,hut.position.x,hut.position.z);
    for (let row = -r + 3; row < r - 3; row += 3) {
      const strip=this.terrainStrip(x+row,z,1.4,r*1.3);
      this.chunks.add(strip,x+row,z);
    }
  }

  private terrainStrip(x:number,z:number,width:number,length:number):THREE.Mesh{
    const columns=4,rows=Math.ceil(length/0.5),vertices:number[]=[],indices:number[]=[];
    for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
      const vx=x-width/2+width*column/columns,vz=z-length/2+length*row/rows;
      vertices.push(vx,this.heightAt(vx,vz)+0.045,vz);
    }
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x6e583d,roughness:1,side:THREE.DoubleSide}));
    mesh.name='garden-soil';return mesh;
  }

  private makeBoundary(): void {
    const fog = new THREE.FogExp2(0xb9d3ba, 0.012); this.scene.fog = fog;
  }

  private buildResources(): void {
    let id = 0;
    for (let i = 0; i < 1050; i++) {
      const x = this.rng.range(-100, 100), z = this.rng.range(-100, 100);
      const biome = this.biomeAt(x, z);
      const kind: FoodKind = biome === 'garden' ? this.rng.pick(['carrot', 'carrot', 'cabbage','bitterleaf']) : biome === 'swamp' ? this.rng.pick(['mushroom', 'berries', 'clover','toadstool','bitterleaf']) : biome === 'forest' ? this.rng.pick(['berries', 'mushroom', 'clover','acorn','toadstool']) : this.rng.pick(['clover','clover','bitterleaf','berries']);
      const mesh = this.resourceModel(kind); mesh.position.set(x, this.heightAt(x,z), z); this.chunks.add(mesh,x,z);
      this.resources.push({ id: id++, x, z, kind, mesh, available: true, regrowAt: 0 });
    }
  }

  private resourceModel(kind: FoodKind): THREE.Group {
    const model=ModelAssets.shared.create(kind).root;
    this.trackFoliage(model);
    return model;
  }

  nearestResource(x: number, z: number, radius = 2): Resource | undefined {
    let best: Resource | undefined, dist = radius;
    for (const r of this.resources) if (r.available&&r.mesh.visible&&r.mesh.parent?.visible) {
      const d = Math.hypot(r.x - x, r.z - z);
      if (d < dist) { dist = d; best = r; }
    }
    return best;
  }

  nearWater(x: number, z: number, radius = 5): boolean {
    return this.waterSources.some(w => Math.hypot(w.x-x,w.z-z) < radius);
  }
  hasCover(x:number,z:number):boolean{
    if(this.biomeAt(x,z)==='forest')return true;
    return this.treeLocations.some(t=>Math.hypot(t.x-x,t.z-z)<3.7);
  }

  harvest(resource: Resource, clock: number): void {
    resource.available = false; resource.mesh.visible = false; resource.regrowAt = clock + (this.seasons.name(this.currentDay)==='Зима'?480:110) + (resource.id % 60);
  }

  update(clock: number, time: number, weather: Weather,day:number,px:number,pz:number): void {
    this.currentDay=day;this.currentClock=clock;this.chunks.update(px,pz);
    this.updateSeason(day);
    if(clock>=this.nextResourceSync){
      this.nextResourceSync=clock+1;
      for (const r of this.resources) {
        if (!r.available && clock >= r.regrowAt)r.available=true;
        r.mesh.visible=r.available&&this.seasons.foodVisible(r.id,r.kind,day);
        r.mesh.scale.setScalar(r.regrowAt>0?Math.min(1,0.25+Math.max(0,clock-r.regrowAt)/90):1);
        if(r.mesh.visible&&Math.hypot(r.x-px,r.z-pz)<28)r.mesh.rotation.y=Math.sin(time*.7+r.id)*.04;
      }
    }
    if (this.rain) {
      this.rain.visible = weather === 'rain'||weather==='snow';
      const material=this.rain.material as THREE.PointsMaterial;
      material.color.setHex(weather==='snow'?0xf4f7f3:0xc7d9db);
      material.size=weather==='snow'?0.2:0.09;
    }
    if(this.scene.fog instanceof THREE.FogExp2)this.scene.fog.density=weather==='mist'?0.026:weather==='rain'?0.017:0.012;
    for(const b of this.butterflies){const bx=b.x+Math.sin(time*0.7+b.phase)*1.5,bz=b.z+Math.cos(time*0.5+b.phase)*1.1;b.mesh.position.set(bx,this.heightAt(bx,bz)+0.8+Math.sin(time*2+b.phase)*0.2,bz);b.mesh.rotation.y=time*0.5+b.phase;b.mesh.children.forEach((wing,i)=>{wing.rotation.z=(i===0?-1:1)*Math.sin(time*19+b.phase)*0.55;});}
  }

  private updateSeason(day:number):void{
    const season=this.seasons.name(day);if(season===this.displayedSeason)return;this.displayedSeason=season;
    if(this.groundColors&&this.baseGroundColors){
      const values=this.groundColors.array as Float32Array;
      for(let i=0;i<values.length;i+=3){
        const r=this.baseGroundColors[i],g=this.baseGroundColors[i+1],b=this.baseGroundColors[i+2];
        if(season==='Зима'){values[i]=r*0.32+0.68;values[i+1]=g*0.34+0.66;values[i+2]=b*0.36+0.64;}
        else if(season==='Осень'){values[i]=Math.min(1,r*1.22);values[i+1]=g*0.88;values[i+2]=b*0.71;}
        else if(season==='Весна'){values[i]=r*0.9;values[i+1]=Math.min(1,g*1.1);values[i+2]=b*0.9;}
        else{values[i]=r;values[i+1]=g;values[i+2]=b;}
      }
      this.groundColors.needsUpdate=true;
    }
    this.foliageMaterials.forEach((base,material)=>{
      material.color.copy(base);
      if(!material.name.includes('pine')&&season==='Осень')material.color.lerp(new THREE.Color(0xb88146),.6);
      if(!material.name.includes('pine')&&season==='Зима')material.color.lerp(new THREE.Color(0x8f9b88),.55);
    });
    this.deciduousCrowns.forEach((c,i)=>{c.visible=season!=='Зима'||i%7===0;});
    this.fallenLeaves.forEach(c=>{c.visible=season==='Осень'||season==='Зима';});
    this.grassMaterial?.color.setHex(season==='Зима'?0xb8c2ae:season==='Осень'?0xc49d66:0x88b66d);
  }

  setRain(): void {
    const count = 800, pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { pos[i * 3] = this.rng.range(-70, 70); pos[i * 3 + 1] = this.rng.range(1, 20); pos[i * 3 + 2] = this.rng.range(-70, 70); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xc7d9db, size: 0.09, transparent: true, opacity: 0.55 }));
    this.rain.visible = false; this.scene.add(this.rain);
  }

  updateRain(dt: number, x: number, z: number, weather:Weather): void {
    if (!this.rain?.visible) return;
    const attr = this.rain.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) { let y = attr.getY(i) - dt * (weather==='snow'?3.2:15); if (y < 0) y = 20; attr.setY(i, y); }
    attr.needsUpdate = true; this.rain.position.x = x; this.rain.position.z = z;
  }
}
