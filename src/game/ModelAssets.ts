import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export const CREATURE_NAMES = [
  'rabbit',
  'fox',
  'wolf',
  'dog',
  'lynx',
  'weasel',
  'bear',
  'snake',
  'hawk',
  'deer',
  'squirrel',
  'hedgehog',
  'beaver',
  'moose',
] as const;
export const MODEL_NAMES = [
  ...CREATURE_NAMES,
  'nest',
  'stash',
  'oak',
  'pine',
  'fern',
  'reed',
  'bush',
  'carrot',
  'cabbage',
  'mushroom',
  'toadstool',
  'berries',
  'acorn',
  'clover',
  'bitterleaf',
  'branch',
  'grass_bundle',
  'twig_bundle',
  'fur_tuft',
] as const;
export type ModelName = (typeof MODEL_NAMES)[number];
export interface ModelInstance {
  root: THREE.Group;
  mixer?: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  active?: THREE.AnimationAction;
  activeName?: string;
  variants?: ModelInstance[];
  distance?: number;
  inView?: boolean;
  pendingTime?: number;
  selectedVariant?: ModelInstance;
}

/** Загружает общие GLB, создаёт экземпляры, управляет детализацией и анимациями. */

export class ModelAssets {
  static readonly shared = new ModelAssets();
  private readonly loader = new GLTFLoader();
  private readonly glbs = new Map<ModelName, GLTF>();
  private readonly low = new Map<ModelName, GLTF>();
  private readonly clipMaps = new WeakMap<GLTF, Map<string, THREE.AnimationClip>>();
  private readonly actors = new Set<ModelInstance>();
  private readonly sharedGeometry = new Set<THREE.BufferGeometry>();
  private readonly sharedMaterials = new Set<THREE.Material>();
  private loading?: Promise<void>;
  private textures: THREE.Texture[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly bounds = new THREE.Sphere(new THREE.Vector3(), 3);

  async preload(): Promise<void> {
    if (this.loading) return this.loading;

    this.loading = (async () => {
      this.textures = await Promise.all(
        ['fur', 'leaf', 'ground', 'soil'].map((name) =>
          new THREE.TextureLoader().loadAsync(`/textures/${name}.png`),
        ),
      );
      for (const texture of this.textures) {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }

      await Promise.all(
        MODEL_NAMES.map(async (name) => {
          const glb = await this.loader.loadAsync(`/models/${name}.glb`);
          this.prepare(glb);
          this.glbs.set(name, glb);
          if ((CREATURE_NAMES as readonly string[]).includes(name)) {
            const low = await this.loader.loadAsync(`/models/${name}-low.glb`);
            this.prepare(low);
            this.low.set(name, low);
          }
        }),
      );
    })();
    try {
      await this.loading;
    } catch (err) {
      this.loading = undefined;
      throw err;
    }
  }

  get ground(): THREE.Texture | undefined {
    return this.textures[2];
  }

  get soil(): THREE.Texture | undefined {
    return this.textures[3];
  }

  async register(name: ModelName, bytes: ArrayBuffer, low = false): Promise<void> {
    const glb = await this.loader.parseAsync(bytes, '');
    this.prepare(glb);
    (low ? this.low : this.glbs).set(name, glb);
  }

  private prepare(glb: GLTF): void {
    this.clipMaps.set(glb, new Map(glb.animations.map((clip) => [clip.name, clip])));
    glb.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      this.sharedGeometry.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        this.sharedMaterials.add(material);
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;

        if (material.name.startsWith('leaf_'))
          material.userData.baseColor = material.color.getHex();

        if (material.name.startsWith('fur_') && this.textures[0]) material.map = this.textures[0];

        if (material.name.startsWith('leaf_') && this.textures[1]) material.map = this.textures[1];
      }
    });
  }

  create(name: ModelName): ModelInstance {
    const source = this.glbs.get(name);
    if (!source) throw new Error(`Модель ${name} ещё не загружена`);

    const materials = new Map<THREE.Material, THREE.Material>();
    const build = (glb: GLTF): ModelInstance => {
      const root = new THREE.Group();
      root.name = name;
      root.add(glb.scene.clone(true));
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;

        object.updateMatrix();
        object.matrixAutoUpdate = false;
        object.receiveShadow = true;
        const sourceMaterial = object.material;
        const materialForInstance = (material: THREE.Material) => {
          if (name !== 'rabbit') return material;

          let copy = materials.get(material);
          if (!copy) {
            copy = material.clone();
            materials.set(material, copy);
          }
          return copy;
        };
        object.material = Array.isArray(sourceMaterial)
          ? sourceMaterial.map(materialForInstance)
          : materialForInstance(sourceMaterial);
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        object.castShadow =
          glb.animations.length > 0
            ? material.name === 'fur_base'
            : name === 'oak' || name === 'pine';
      });
      return {
        root,
        mixer: glb.animations.length ? new THREE.AnimationMixer(root) : undefined,
        clips: this.clipMaps.get(glb)!,
      };
    };
    const high = build(source),
      low = this.low.get(name);
    if (!high.mixer) return high;

    if (!low) {
      this.actors.add(high);
      return high;
    }

    const distant = build(low),
      root = new THREE.Group(),
      lod = new THREE.LOD();
    root.name = name;
    distant.root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = false;
    });
    lod.addLevel(high.root, 0);
    lod.addLevel(distant.root, 22, 0.15);
    distant.root.visible = false;
    root.add(lod);
    const instance: ModelInstance = { root, clips: high.clips, variants: [high, distant] };
    this.actors.add(instance);
    return instance;
  }

  updateView(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.cameraPosition);
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    for (const actor of this.actors) {
      actor.root.getWorldPosition(this.bounds.center);
      this.bounds.center.y += 0.7;
      actor.distance = this.bounds.center.distanceTo(this.cameraPosition);
      actor.inView = this.frustum.intersectsSphere(this.bounds);
      const lod = actor.root.children.find((child) => child instanceof THREE.LOD);
      if (lod instanceof THREE.LOD) lod.update(camera);
    }
  }

  play(instance: ModelInstance, name: string, dt: number, speed = 1): void {
    if (!instance.root.visible) return;

    const target = instance.variants?.find((v) => v.root.visible) ?? instance;
    const clip = target.clips.get(name);
    if (!clip || !target.mixer) return;

    const previous = instance.selectedVariant;
    const changed = target.activeName !== name || !target.active;
    if (changed) {
      const next = target.mixer.clipAction(clip);
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(speed);
      next.fadeIn(0.18).play();
      target.active?.fadeOut(0.18);
      target.active = next;
      target.activeName = name;
    } else target.active?.setEffectiveTimeScale(speed);

    if (
      previous &&
      previous !== target &&
      previous.activeName === name &&
      previous.active &&
      target.active
    ) {
      target.active.time = previous.active.time;
      target.pendingTime = 0;
    }

    if (instance.variants) instance.selectedVariant = target;

    instance.activeName = name;
    target.pendingTime = (target.pendingTime ?? 0) + dt;
    const interval = instance.inView === false ? 0.2 : (instance.distance ?? 0) > 22 ? 1 / 15 : 0;
    if (changed || target.pendingTime >= interval) {
      target.mixer.update(target.pendingTime);
      target.pendingTime = 0;
    }
  }

  release(root: THREE.Object3D): void {
    for (const actor of this.actors) {
      let ancestor: THREE.Object3D | null = actor.root;
      while (ancestor && ancestor !== root) ancestor = ancestor.parent;
      if (!ancestor) continue;

      for (const variant of actor.variants ?? [actor]) {
        variant.mixer?.stopAllAction();
        variant.mixer?.uncacheRoot(variant.root);
      }

      this.actors.delete(actor);
    }

    const geometry = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    const visit = (object: THREE.Object3D) => {
      if (object instanceof THREE.Camera) return;

      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.Line
      ) {
        if (!this.sharedGeometry.has(object.geometry)) geometry.add(object.geometry);

        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          if (!this.sharedMaterials.has(material)) materials.add(material);

        if (object instanceof THREE.InstancedMesh) object.dispose();
      }

      object.children.forEach(visit);
    };
    visit(root);
    geometry.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
}
