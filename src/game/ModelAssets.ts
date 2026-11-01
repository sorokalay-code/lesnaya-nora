import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export const MODEL_NAMES = ['rabbit','fox','wolf','dog','lynx','weasel','bear','snake','hawk',
  'deer','squirrel','hedgehog','beaver','moose','nest','stash','oak','pine','fern','reed','bush',
  'carrot','cabbage','mushroom','toadstool','berries','acorn','clover','bitterleaf'] as const;
export type ModelName = typeof MODEL_NAMES[number];

export interface ModelInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  active?: THREE.AnimationAction;
  activeName?: string;
}

/** Loads each authored GLB once; game actors only clone meshes and play embedded clips. */
export class ModelAssets {
  static readonly shared = new ModelAssets();
  private readonly loader = new GLTFLoader();
  private readonly glbs = new Map<ModelName,GLTF>();
  private loading?: Promise<void>;
  private furTexture?:THREE.Texture;
  private leafTexture?:THREE.Texture;

  async preload():Promise<void>{
    if(this.loading)return this.loading;
    this.loading=(async()=>{
      const [fur,leaf]=await Promise.all(['/textures/fur.png','/textures/leaf.png'].map(path=>new THREE.TextureLoader().loadAsync(path)));
      for(const texture of [fur,leaf]){texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;}
      this.furTexture=fur;this.leafTexture=leaf;
      await Promise.all(MODEL_NAMES.map(async name=>{
        const glb=await this.loader.loadAsync(`/models/${name}.glb`);
        this.prepare(glb);
        this.glbs.set(name,glb);
      }));
    })();
    try{await this.loading;}catch(err){this.loading=undefined;throw err;}
  }

  /** Tests can register GLB bytes without a browser network or DOM. */
  async register(name:ModelName,bytes:ArrayBuffer):Promise<void>{
    const glb=await this.loader.parseAsync(bytes,'');
    this.prepare(glb);
    this.glbs.set(name,glb);
  }

  private prepare(glb:GLTF):void{
    glb.scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials){
        if(!(material instanceof THREE.MeshStandardMaterial))continue;
        if(material.name.startsWith('leaf_'))material.userData.baseColor=material.color.getHex();
        if(material.name.startsWith('fur_')&&this.furTexture)material.map=this.furTexture;
        if(material.name.startsWith('leaf_')&&this.leafTexture)material.map=this.leafTexture;
      }
    });
  }

  create(name:ModelName):ModelInstance{
    const source=this.glbs.get(name);
    if(!source)throw new Error(`Модель ${name} ещё не загружена`);
    const root=new THREE.Group();root.name=name;
    const visual=source.scene.clone(true);root.add(visual);
    visual.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      object.castShadow=true;object.receiveShadow=true;
      const sourceMaterial=object.material;
      const materialForInstance=(material:THREE.Material)=>name==='rabbit'?material.clone():material;
      object.material=Array.isArray(sourceMaterial)?sourceMaterial.map(materialForInstance):materialForInstance(sourceMaterial);
    });
    return{root,mixer:new THREE.AnimationMixer(root),clips:new Map(source.animations.map(clip=>[clip.name,clip]))};
  }

  play(instance:ModelInstance,name:string,dt:number,speed=1):void{
    const clip=instance.clips.get(name);
    if(!clip)return;
    if(instance.activeName!==name){
      const next=instance.mixer.clipAction(clip);
      next.reset();next.enabled=true;next.setEffectiveWeight(1);next.setEffectiveTimeScale(speed);next.fadeIn(.18).play();
      instance.active?.fadeOut(.18);
      instance.active=next;instance.activeName=name;
    }else instance.active?.setEffectiveTimeScale(speed);
    instance.mixer.update(dt);
  }
}
