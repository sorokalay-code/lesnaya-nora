import * as THREE from 'three';
import type { ModelInstance } from '../ModelAssets';
import { COAT_COLORS, type Genes } from '../types';
import { RabbitConformation } from './RabbitConformation';

type JointPair = { source: THREE.Object3D; copy: THREE.Object3D };
type ExtraPart = JointPair & { joints: JointPair[] };
const EYES = { brown: 0x674323, amber: 0xb28a29, blue: 0x608bba, green: 0x6b9452, red: 0xbd3037 };

/** Применяет фенотип к обоим GLB LOD: узор в общем шейдере, анатомия из копий существующих деталей. */
export class RabbitAppearance {
  private static readonly extras = new WeakMap<THREE.Object3D, ExtraPart[]>();

  static apply(model: ModelInstance, genes: Genes): void {
    const extras: ExtraPart[] = [];
    for (const variant of model.variants ?? [model]) {
      variant.root.traverse((object) => {
        if (
          !(object instanceof THREE.Mesh) ||
          !(object.material instanceof THREE.MeshStandardMaterial)
        )
          return;
        const material = object.material;
        if (material.name === 'eye') {
          material.color.setHex(EYES[genes.anatomy.fangs ? 'red' : genes.eyeColor]);
          material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <color_fragment>',
              '#include <color_fragment>\nif (vColor.r > 0.99) diffuseColor.rgb = vec3(1.0);',
            );
          };
          material.customProgramCacheKey = () => 'rabbit-eye-colour-v1';
        }
        if (material.name === 'fur_base') this.pattern(material, genes);
      });
      this.parts(variant.root, ['PawFL', 'PawFR', 'PawBL', 'PawBR'], genes.anatomy.legs, extras);
      this.parts(variant.root, ['EarL', 'EarR'], genes.anatomy.ears, extras);
      this.parts(variant.root, ['EyeL', 'EyeR'], genes.anatomy.eyes, extras);
      const fangs = variant.root.getObjectByName('Fangs');
      if (fangs) fangs.visible = genes.anatomy.fangs;
    }
    this.extras.set(model.root, extras);
    RabbitConformation.apply(model, genes);
    model.root.userData.legCount = genes.anatomy.legs;
  }

  static animate(model: ModelInstance): void {
    for (const { source, copy, joints } of this.extras.get(model.root) ?? []) {
      copy.quaternion.copy(source.quaternion);
      // Добавочные лапы наследуют также положение стопы и длину верхнего сегмента.
      for (const joint of joints) {
        joint.copy.position.copy(joint.source.position);
        joint.copy.quaternion.copy(joint.source.quaternion);
        joint.copy.scale.copy(joint.source.scale);
      }
    }
  }

  private static parts(
    root: THREE.Object3D,
    names: string[],
    count: number,
    extras: ExtraPart[],
  ): void {
    const parts = names
      .map((name) => root.getObjectByName(name))
      .filter((part): part is THREE.Object3D => part !== undefined);
    parts.forEach((part, index) => {
      part.visible = index >= parts.length - count;
    });
    for (let index = parts.length; index < Math.min(count, parts.length + 2); index++) {
      const source = parts[(index - parts.length) % parts.length];
      if (!source?.parent) continue;
      const copy = source.clone(true);
      copy.traverse((part) => {
        part.name += '-extra-' + index;
      });
      copy.visible = true;
      if (names[0].startsWith('Paw')) copy.position.z = 0;
      else if (names[0].startsWith('Ear')) copy.position.set(index % 2 ? 0.1 : -0.1, 0.18, 0.2);
      else copy.position.set(0, 0.15, -0.28);
      copy.scale.multiplyScalar(names[0].startsWith('Eye') ? 0.8 : 0.88);
      source.parent.add(copy);
      const joints: JointPair[] = [];
      source.traverse((part) => {
        if (!/^(Upper|Foot)[BF][LR]$/.test(part.name)) return;
        const duplicate = copy.getObjectByName(part.name + '-extra-' + index);
        if (duplicate) joints.push({ source: part, copy: duplicate });
      });
      extras.push({ source, copy, joints });
    }
  }

  private static pattern(material: THREE.MeshStandardMaterial, genes: Genes): void {
    if (genes.pattern === 'solid') return;
    const secondary = new THREE.Color(COAT_COLORS[genes.secondaryCoat]);
    material.userData.geneSecondary = secondary;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.geneSecondary = { value: secondary };
      shader.uniforms.genePattern = { value: genes.pattern === 'spotted' ? 1 : 2 };
      shader.vertexShader = 'varying vec3 vGenePosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGenePosition = position;',
      );
      shader.fragmentShader =
        'varying vec3 vGenePosition;\nuniform vec3 geneSecondary;\nuniform float genePattern;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float spots = sin(vGenePosition.x * 23.0 + vGenePosition.y * 7.0) *
          sin(vGenePosition.y * 21.0 + vGenePosition.z * 9.0) * sin(vGenePosition.z * 19.0);
        float patches = sin(vGenePosition.x * 4.5 + vGenePosition.z * 6.0) +
          vGenePosition.y * 0.8;
        float marking = genePattern < 1.5 ? smoothstep(0.34, 0.48, spots) :
          smoothstep(0.3, 0.42, patches);
        diffuseColor.rgb = mix(diffuseColor.rgb, geneSecondary, marking);
      `,
      );
    };
    material.customProgramCacheKey = () => 'rabbit-genetic-pattern-v1';
  }
}
