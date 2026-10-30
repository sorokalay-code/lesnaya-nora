import * as THREE from 'three';
import { Random, smoothNoise } from './Random';
import { SeasonSystem } from './Systems';
import { WorldChunks } from './WorldChunks';
import { Terrain } from './Terrain';
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
  private groundTiles:{x:number;z:number;indices:number[]}[]=[];
  private holes:{x:number;z:number;radius:number}[]=[];
  private treeRootRegrow=new Map<number,number>();
  private currentClock=0;
  private foliageMaterials:THREE.MeshStandardMaterial[]=[];
  private deciduousCrowns:THREE.Group[]=[];
  private fallenLeaves:THREE.Group[]=[];
  private grassMaterial?:THREE.MeshStandardMaterial;
  private rng: Random;
  private rain?: THREE.Points;
  private butterflies: {mesh:THREE.Group;x:number;z:number;phase:number}[]=[];

  constructor(scene: THREE.Scene, seed: number,private readonly save?:SaveData) {
    this.scene = scene; this.seed = seed; this.rng = new Random(seed);this.seasons=new SeasonSystem(seed);this.chunks=new WorldChunks(scene);this.terrain=new Terrain(seed);
    for(const [id,time] of Object.entries(save?.gnawedRoots??{}))this.treeRootRegrow.set(Number(id),time);
    this.buildGround(); this.buildDecorations(); this.buildResources();
  }

  heightAt(x:number,z:number):number{return this.terrain.heightAt(x,z);}
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

  biomeAt(x: number, z: number): Biome {
    if (Math.hypot(x - 34, z - 31) < 15 || Math.hypot(x + 35, z - 29) < 12) return 'garden';
    if (Math.hypot(x + 31, z + 25) < 19 && smoothNoise(x / 12, z / 12, this.seed + 78) > 0.25) return 'swamp';
    if (Math.hypot(x, z) < 12) return 'meadow';
    const n = smoothNoise(x / 19, z / 19, this.seed) * 0.7 + smoothNoise(x / 8, z / 8, this.seed + 19) * 0.3;
    return n > 0.53 ? 'forest' : 'meadow';
  }

  private buildGround(): void {
    const verts: number[] = [], colors: number[] = [], indices: number[] = [];
    const color = new THREE.Color();
    const n = 110, step = this.size * 2 / n;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const wx = -this.size + x * step, wz = -this.size + z * step;
      const biome = this.biomeAt(wx + step / 2, wz + step / 2);
      const palette = biome === 'forest' ? [0x496d4b, 0x54754f, 0x5a7952] : biome === 'meadow' ? [0x789d62, 0x81a769, 0x8caf70] : biome === 'swamp' ? [0x5b795f, 0x688363, 0x7e8d6a] : [0x997e55, 0xa48b60, 0x8e7651];
      color.setHex(palette[this.rng.int(0, 2)]);
      const j = verts.length / 3;
      verts.push(wx, this.heightAt(wx,wz), wz, wx + step, this.heightAt(wx+step,wz), wz,
        wx + step, this.heightAt(wx+step,wz+step), wz + step, wx, this.heightAt(wx,wz+step), wz + step);
      for (let k = 0; k < 4; k++) colors.push(color.r, color.g, color.b);
      const tileIndices=[j,j+2,j+1,j,j+3,j+2];indices.push(...tileIndices);
      this.groundTiles.push({x:wx+step/2,z:wz+step/2,indices:tileIndices});
    }
    const geo = new THREE.BufferGeometry();
    this.groundGeometry=geo;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    this.groundColors=geo.getAttribute('color') as THREE.BufferAttribute;this.baseGroundColors=new Float32Array(colors);
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    ground.receiveShadow = true; this.scene.add(ground);
  }

  addGroundHole(x:number,z:number,radius=1.1):void{
    if(this.holes.some(h=>Math.hypot(h.x-x,h.z-z)<0.1))return;
    this.holes.push({x,z,radius});
    if(!this.groundGeometry)return;
    const indices:number[]=[];
    for(const tile of this.groundTiles){
      if(this.holes.some(h=>Math.hypot(tile.x-h.x,tile.z-h.z)<h.radius+0.4))continue;
      indices.push(...tile.indices);
    }
    this.groundGeometry.setIndex(indices);this.groundGeometry.computeVertexNormals();
  }

  private buildDecorations(): void {
    const bark = mat(0x735b43), leaves = [mat(0x447349), mat(0x54844e), mat(0x3e6948)], pine = mat(0x355f46);
    this.foliageMaterials=[...leaves,pine];
    const water = new THREE.MeshStandardMaterial({ color: 0x6c9c94, transparent: true, opacity: 0.74, roughness: 0.3 });
    const flower = [mat(0xf5d277), mat(0xf5e6db), mat(0xe9b3bb), mat(0xcabfe8)];
    for (let i = 0; i < 580; i++) {
      const x = this.rng.range(-105, 105), z = this.rng.range(-105, 105), biome = this.biomeAt(x, z);
      if (Math.hypot(x, z) < 6) continue;
      if (biome === 'garden') continue;
      if (biome === 'swamp' && this.rng.chance(0.28)) {
        const puddle = new THREE.Mesh(new THREE.CircleGeometry(this.rng.range(1.5, 4), 12), water);
        puddle.rotation.x = -Math.PI / 2; puddle.position.set(x, this.heightAt(x,z)+0.012, z); this.chunks.add(puddle,x,z);
      }
      if (biome === 'forest' && this.rng.chance(0.58)) {
        const g = new THREE.Group(); g.position.set(x, this.heightAt(x,z), z); const h = this.rng.range(5.5, 12.5);
        this.treeLocations.push({x,z});
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.43, h * 0.66, 9), bark);
        trunk.position.y = h * 0.33; trunk.castShadow = true; g.add(trunk);
        if (this.rng.chance(0.45)) {
          for (let l = 0; l < 3; l++) {
            const crown = new THREE.Mesh(new THREE.ConeGeometry(2.1 - l * 0.25, 3.1, 8), pine);
            crown.position.y = h * 0.5 + l * 1.1; crown.castShadow = true; g.add(crown);
          }
        } else {
          const crownGroup=new THREE.Group();g.add(crownGroup);this.deciduousCrowns.push(crownGroup);
          blob(crownGroup, this.rng.pick(leaves), 0, h * 0.78, 0, 2.1, 1.85, 2.1);
          for(let branch=0;branch<4;branch++){
            const a=branch*Math.PI/2+this.rng.range(-0.2,0.2);
            const branchMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.13,2.1,6),bark);
            branchMesh.position.set(Math.cos(a)*0.65,h*0.67,Math.sin(a)*0.65);
            branchMesh.rotation.z=Math.cos(a)*0.72;branchMesh.rotation.x=-Math.sin(a)*0.72;g.add(branchMesh);
            blob(crownGroup,this.rng.pick(leaves),Math.cos(a)*1.4,h*0.68,Math.sin(a)*1.4,1.3,1.1,1.25);
          }
          const litter=new THREE.Group();g.add(litter);this.fallenLeaves.push(litter);
          for(let leaf=0;leaf<12;leaf++){
            const a=leaf*2.4,d=0.6+(leaf%4)*0.42;
            const fall=new THREE.Mesh(new THREE.PlaneGeometry(0.22,0.12),mat(leaf%3===0?0xb57b45:0xc29b58));
            fall.rotation.x=-Math.PI/2;fall.rotation.z=a;fall.position.set(Math.cos(a)*d,0.025,Math.sin(a)*d);litter.add(fall);
          }
          litter.visible=false;
        }
        this.chunks.add(g,x,z);
      } else if (this.rng.chance(0.65)) {
        const g = new THREE.Group(); g.position.set(x, this.heightAt(x,z), z);
        if(this.rng.chance(0.34)){
          for(let leaf=0;leaf<7;leaf++){
            const a=leaf*Math.PI*2/7;
            const frond=blob(g,this.rng.pick(leaves),Math.cos(a)*0.32,0.36,Math.sin(a)*0.32,0.12,0.38,0.08);
            frond.rotation.z=Math.cos(a)*0.55;frond.rotation.x=-Math.sin(a)*0.55;
          }
        }else if(biome==='swamp'&&this.rng.chance(0.5)){
          for(let reed=0;reed<8;reed++){
            const stalk=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.04,this.rng.range(0.7,1.4),4),leaves[0]);
            stalk.position.set(this.rng.range(-0.35,0.35),0.55,this.rng.range(-0.35,0.35));g.add(stalk);
          }
        }else{
          const bushMat = biome === 'swamp' ? leaves[0] : leaves[1];
          blob(g, bushMat, 0, 0.27, 0, 0.62, 0.38, 0.56);
          if (this.rng.chance(0.4)) for (let k = 0; k < 4; k++) blob(g, this.rng.pick(flower), this.rng.range(-0.4, 0.4), 0.56, this.rng.range(-0.3, 0.3), 0.07, 0.07, 0.07);
        }
        this.chunks.add(g,x,z);
      }
    }
    this.makeGarden(34, 31, 16); this.makeGarden(-35, 29, 13);
    this.makePond(9, -7, 4.4); this.makePond(-28, -25, 6); this.makePond(-39, -18, 3.5);
    this.makeSmallDetails();
    this.makeButterflies();
    this.makeBoundary();
  }

  private makePond(x: number, z: number, radius: number): void {
    const g = new THREE.Group(); g.position.set(x, this.heightAt(x,z), z);
    const shore = new THREE.Mesh(new THREE.CircleGeometry(radius + 0.55, 28), mat(0x827f5b));
    shore.rotation.x = -Math.PI / 2; shore.position.y = 0.014; g.add(shore);
    const water = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), new THREE.MeshStandardMaterial({ color: 0x75b1ad, roughness: 0.22, metalness: 0.08, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.025; g.add(water);
    const reedMat = mat(0x829d5c);
    for (let i = 0; i < 25; i++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(radius + 0.2, radius + 1.1);
      const reed = new THREE.Mesh(cone, reedMat); reed.position.set(Math.cos(a) * d, 0.33, Math.sin(a) * d);
      reed.scale.set(0.06, this.rng.range(0.5, 0.85), 0.06); g.add(reed);
    }
    for(let i=0;i<7;i++){
      const a=this.rng.range(0,Math.PI*2),d=this.rng.range(0,radius*0.78);
      const pad=new THREE.Mesh(new THREE.CircleGeometry(this.rng.range(0.25,0.48),10),mat(0x5c965e));
      pad.rotation.x=-Math.PI/2;pad.position.set(Math.cos(a)*d,0.033,Math.sin(a)*d);g.add(pad);
      if(i%3===0)blob(g,mat(0xf2d5df),pad.position.x,0.08,pad.position.z,0.09,0.06,0.09);
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
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.24,this.rng.range(1.2,3.1),7),logMat);
      log.rotation.z = Math.PI/2; log.rotation.y = this.rng.range(0,6.28); log.position.set(x,this.heightAt(x,z)+0.24,z); log.castShadow=true; this.chunks.add(log,x,z);
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
    const hut = new THREE.Group(); hut.position.set(x + r * 0.58, this.heightAt(x+r*0.58,z+r*0.58), z + r * 0.58);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.7), mat(0xd5c19a)); wall.position.y = 1.1; wall.castShadow = true; hut.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.5, 4), mat(0x915b47)); roof.position.y = 2.8; roof.rotation.y = Math.PI / 4; hut.add(roof); this.chunks.add(hut,hut.position.x,hut.position.z);
    for (let row = -r + 3; row < r - 3; row += 3) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, r * 1.3), mat(0x6e583d));
      strip.position.set(x + row, this.heightAt(x+row,z)+0.05, z); this.chunks.add(strip,x+row,z);
    }
  }

  private makeBoundary(): void {
    const fog = new THREE.FogExp2(0xb9d3ba, 0.012); this.scene.fog = fog;
  }

  private buildResources(): void {
    let id = 0;
    for (let i = 0; i < 670; i++) {
      const x = this.rng.range(-100, 100), z = this.rng.range(-100, 100);
      const biome = this.biomeAt(x, z);
      const kind: FoodKind = biome === 'garden' ? this.rng.pick(['carrot', 'carrot', 'cabbage','bitterleaf']) : biome === 'swamp' ? this.rng.pick(['mushroom', 'berries', 'clover','toadstool','bitterleaf']) : biome === 'forest' ? this.rng.pick(['berries', 'mushroom', 'clover','acorn','toadstool']) : this.rng.pick(['clover','clover','bitterleaf','berries']);
      const mesh = this.resourceModel(kind); mesh.position.set(x, this.heightAt(x,z), z); this.chunks.add(mesh,x,z);
      this.resources.push({ id: id++, x, z, kind, mesh, available: true, regrowAt: 0 });
    }
  }

  private resourceModel(kind: FoodKind): THREE.Group {
    const g = new THREE.Group();
    const green = mat(0x4a8c48), darkGreen = mat(0x3f7040);
    if (kind === 'carrot') {
      const root = new THREE.Mesh(cone, mat(0xe58b44)); root.rotation.x = Math.PI; root.position.y = 0.18; root.scale.set(0.14, 0.48, 0.14); g.add(root);
      for (let i = 0; i < 3; i++) { const leaf = new THREE.Mesh(cone, green); leaf.position.set((i - 1) * 0.12, 0.5, 0); leaf.scale.set(0.08, 0.4, 0.07); g.add(leaf); }
    } else if (kind === 'cabbage') {
      blob(g, green, 0, 0.22, 0, 0.35, 0.28, 0.35);
      for (let i = 0; i < 4; i++) blob(g, darkGreen, Math.cos(i * Math.PI / 2) * 0.23, 0.13, Math.sin(i * Math.PI / 2) * 0.23, 0.22, 0.1, 0.15);
    } else if (kind === 'mushroom'||kind==='toadstool') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.35, 7), mat(0xf2e9cb)); stem.position.y = 0.19; g.add(stem);
      blob(g, mat(kind==='toadstool'?0xb94e45:0xa26d5b), 0, 0.38, 0, 0.27, 0.11, 0.27);
      if(kind==='toadstool')for(let i=0;i<4;i++)blob(g,mat(0xf5e6d3),Math.cos(i*1.57)*0.12,0.46,Math.sin(i*1.57)*0.12,0.035,0.02,0.035);
    } else if (kind === 'berries') {
      blob(g, darkGreen, 0, 0.24, 0, 0.33, 0.26, 0.33);
      const berry = mat(0x6d4e8a);
      for (let i = 0; i < 5; i++) blob(g, berry, Math.cos(i * 2.5) * 0.2, 0.37, Math.sin(i * 2.5) * 0.2, 0.07, 0.07, 0.07);
    } else if(kind==='acorn'){
      blob(g,mat(0x8f603c),0,0.14,0,0.16,0.2,0.15);
      blob(g,mat(0x604834),0,0.29,0,0.18,0.07,0.17);
    } else {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        blob(g, green, Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17, 0.16, 0.06, 0.11);
      }
      blob(g, mat(kind==='bitterleaf'?0x8d7390:0xeed9d8), 0, 0.18, 0, 0.07, 0.08, 0.07);
    }
    return g;
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
    for (const r of this.resources) {
      if (!r.available && clock >= r.regrowAt)r.available=true;
      r.mesh.visible=r.available&&this.seasons.foodVisible(r.id,r.kind,day);
    }
    for (const r of this.resources) if (r.available && r.mesh.visible) r.mesh.rotation.y = Math.sin(time * 0.7 + r.id) * 0.04;
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
    const foliageColors=[0x447349,0x54844e,0x3e6948,0x355f46];
    this.foliageMaterials.forEach((material,i)=>{material.color.setHex(foliageColors[i]);if(season==='Осень'&&i<3)material.color.lerp(new THREE.Color(0xb88146),0.6);if(season==='Зима'&&i<3)material.color.lerp(new THREE.Color(0x8f9b88),0.55);});
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
