import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AnimalAppearance } from './AnimalAppearance';
import { ModelAssets } from './ModelAssets';
import { createRabbit } from './Models';
import type { RemainsData, RemainsKind } from './RemainsData';

/** Строит спокойный силуэт тела и простые общие скелеты; владеет кэшем костяной геометрии. */
export class RemainsVisuals {
  private readonly skeletons = new Map<RemainsKind, THREE.BufferGeometry>();
  private readonly bone = new THREE.MeshStandardMaterial({ color: 0xd9cfad, roughness: 1 });
  private readonly chitin = new THREE.MeshStandardMaterial({ color: 0x76624a, roughness: 1 });

  body(data: RemainsData): THREE.Group {
    const model =
      data.kind === 'rabbit' && data.genes
        ? createRabbit(data.genes)
        : ModelAssets.shared.create(data.kind);
    if (data.appearance) AnimalAppearance.apply(model, data.appearance);
    // У длинношеих видов голова опускается к плечам: поза живой модели сбоку
    // оставляла бы заметный просвет между черепом и корпусом.
    if (data.kind === 'deer' || data.kind === 'moose') {
      for (const variant of model.variants ?? [model]) {
        const head = variant.root.getObjectByName('Head');
        if (head) {
          head.position.y -= data.kind === 'deer' ? 0.35 : 0.45;
          head.position.z += 0.12;
        }
      }
    }
    model.root.scale.copy(data.scale);
    const materials = new Map<THREE.Material, THREE.Material>();
    model.root.traverse((part) => {
      if (part.name.startsWith('Eye') || part.name.startsWith('Glint') || part.name === 'Fangs')
        part.visible = false;
      if (!(part instanceof THREE.Mesh)) return;
      const muted = (material: THREE.Material) => {
        let copy = materials.get(material);
        if (!copy) {
          copy = material.clone();
          copy.onBeforeCompile = material.onBeforeCompile;
          copy.customProgramCacheKey = material.customProgramCacheKey;
          if (copy instanceof THREE.MeshStandardMaterial) {
            copy.color.lerp(new THREE.Color(0x77746b), 0.3);
            copy.roughness = 1;
          }
          materials.set(material, copy);
        }
        return copy;
      };
      const previous = part.material;
      part.material = Array.isArray(previous) ? previous.map(muted) : muted(previous);
    });
    // Созданные для живого кролика личные материалы больше не используются после замены.
    if (data.kind === 'rabbit') for (const material of materials.keys()) material.dispose();
    ModelAssets.shared.freeze(model);
    const root = new THREE.Group();
    root.name = 'animal-body';
    const lying = new THREE.Group();
    const spider = data.kind === 'spider' || data.kind === 'jumping-spider';
    // Крылья остаются на земле, а не встают вертикально при повороте птицы на бок.
    lying.rotation.z = data.kind === 'hawk' || spider ? 0 : Math.PI / 2;
    if (spider) lying.rotation.x = Math.PI;
    lying.add(model.root);
    root.add(lying);
    root.updateMatrixWorld(true);
    lying.position.y = -new THREE.Box3().setFromObject(lying).min.y + 0.025;
    return root;
  }

  skeleton(data: RemainsData): THREE.Group {
    let geometry = this.skeletons.get(data.kind);
    if (!geometry) {
      geometry = this.buildSkeleton(data.kind);
      this.skeletons.set(data.kind, geometry);
    }
    const root = new THREE.Group();
    const spider = data.kind === 'spider' || data.kind === 'jumping-spider';
    root.name = spider ? 'animal-exoskeleton' : 'animal-skeleton';
    const mesh = new THREE.Mesh(geometry, spider ? this.chitin : this.bone);
    mesh.scale.copy(data.scale);
    root.add(mesh);
    return root;
  }

  private buildSkeleton(kind: RemainsKind): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const bone = (a: THREE.Vector3, b: THREE.Vector3, radius = 0.035) => {
      const geometry = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 5);
      const transform = new THREE.Object3D();
      transform.position.copy(a).add(b).multiplyScalar(0.5);
      transform.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
      transform.updateMatrix();
      geometry.applyMatrix4(transform.matrix);
      parts.push(geometry);
    };
    const point = (x: number, z: number, y = 0.1) => new THREE.Vector3(x, y, z);
    const skull = (width: number, length: number, z: number) => {
      const geometry = new THREE.SphereGeometry(1, 8, 5);
      geometry.scale(width, width * 0.7, length);
      geometry.translate(0, width * 0.7 + 0.04, z);
      parts.push(geometry);
    };
    if (kind === 'snake') {
      for (let i = 0; i < 16; i++) {
        const z = i * 0.15;
        const x = Math.sin(i * 0.5) * 0.2;
        bone(point(x, z), point(Math.sin((i + 1) * 0.5) * 0.2, z + 0.15));
        bone(point(x - 0.11, z), point(x + 0.11, z), 0.02);
      }
      skull(0.12, 0.2, -0.1);
    } else if (kind === 'spider' || kind === 'jumping-spider') {
      skull(0.18, 0.32, 0);
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const joint = point(side * 0.45, (i - 1.5) * 0.3);
          bone(point(side * 0.1, (i - 1.5) * 0.12), joint, 0.025);
          bone(joint, point(side * 0.25, (i - 1.5) * 0.18), 0.02);
        }
    } else {
      const large =
        kind === 'moose'
          ? 1.8
          : ['deer', 'bear'].includes(kind)
            ? 1.5
            : ['squirrel', 'hedgehog'].includes(kind)
              ? 0.55
              : ['rabbit', 'beaver', 'pike'].includes(kind)
                ? 0.8
                : 1;
      const length = 0.65 * large;
      bone(point(0, -length), point(0, length), 0.05);
      skull(0.17 * large, 0.25 * large, -length - 0.17 * large);
      for (let i = 0; i < 5; i++)
        for (const side of [-1, 1]) {
          const z = -length * 0.55 + i * length * 0.25;
          const joint = point(side * 0.25 * large, z, 0.2 * large);
          bone(point(0, z, 0.18), joint, 0.025);
          bone(joint, point(side * 0.33 * large, z + 0.06), 0.025);
        }
      if (kind === 'pike' || kind === 'fish') {
        for (const side of [-1, 1]) bone(point(0, length), point(side * 0.28, length + 0.3));
      } else if (kind === 'hawk') {
        for (const side of [-1, 1]) {
          bone(point(0, -0.2), point(side * 0.65, 0.1));
          bone(point(side * 0.65, 0.1), point(side * 1.15, 0.55));
          bone(point(side * 0.1, 0.3), point(side * 0.2, 0.8));
        }
      } else {
        for (const side of [-1, 1])
          for (const end of [-1, 1]) {
            const joint = point(side * 0.45 * large, end * length * 0.7);
            bone(point(0, end * length * 0.65), joint);
            bone(joint, point(side * 0.55 * large, end * length * 0.7 - 0.35 * large));
          }
        if (kind === 'deer' || kind === 'moose')
          for (const side of [-1, 1]) {
            bone(point(side * 0.15, -length - 0.1), point(side * 0.55, -length - 0.6));
            bone(point(side * 0.38, -length - 0.4), point(side * 0.7, -length - 0.3));
          }
        if (kind === 'rabbit')
          for (const side of [-1, 1])
            bone(point(side * 0.055, -length - 0.2), point(side * 0.055, -length - 0.4), 0.025);
      }
    }
    const geometry = mergeGeometries(parts);
    if (!geometry) throw new Error('Не удалось создать скелет');
    for (const part of parts) part.dispose();
    return geometry;
  }

  dispose(): void {
    for (const geometry of this.skeletons.values()) geometry.dispose();
    this.skeletons.clear();
    this.bone.dispose();
    this.chitin.dispose();
  }
}
