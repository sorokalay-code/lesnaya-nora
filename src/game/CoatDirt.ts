import * as THREE from 'three';
import type { RabbitRig } from './Models';
import { CoatDirtTexture } from './CoatDirtTexture';

interface CoatState {
  step: number;
  level: { value: number };
  materials: { material: THREE.MeshStandardMaterial; color: THREE.Color; roughness: number }[];
}

/** Накладывает грязевые разводы поверх шерсти и наследуемого узора, сохраняя исходные материалы и LOD. */
export class CoatDirt {
  private static readonly states = new WeakMap<RabbitRig, CoatState>();

  static forget(rig: RabbitRig): void {
    this.states.delete(rig);
  }

  static update(rig: RabbitRig, value: number): void {
    const step = Math.max(0, Math.min(100, Math.round(value)));
    let state = this.states.get(rig);
    if (!state && step === 0) return;
    if (!state) {
      state = this.prepare(rig);
      this.states.set(rig, state);
    }
    if (state.step === step) return;
    state.step = step;
    state.level.value = step / 100;
    const mud = new THREE.Color(0x83723f);
    for (const { material, color, roughness } of state.materials) {
      material.color.copy(color).lerp(mud, (step / 100) * 0.12);
      material.roughness = roughness + (((1 - roughness) * step) / 100) * 0.4;
    }
  }

  private static prepare(rig: RabbitRig): CoatState {
    const materials = new Set<THREE.MeshStandardMaterial>();
    rig.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        if (material instanceof THREE.MeshStandardMaterial && material.name.startsWith('fur_'))
          materials.add(material);
    });
    const level = { value: 0 };
    for (const material of materials) {
      const previous = material.onBeforeCompile.bind(material),
        key = material.customProgramCacheKey();
      material.userData.coatDirtLevel = level;
      material.onBeforeCompile = (shader, renderer) => {
        previous(shader, renderer);
        shader.uniforms.coatDirtLevel = level;
        shader.uniforms.coatDirtMap = { value: CoatDirtTexture.texture };
        shader.vertexShader = 'varying vec2 vCoatUv;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvCoatUv = uv;',
        );
        shader.fragmentShader =
          'varying vec2 vCoatUv;\nuniform float coatDirtLevel;\nuniform sampler2D coatDirtMap;\n' +
          shader.fragmentShader;
        // Вставка после цвета и roughness сохраняет генетический узор и не добавляет отдельный проход.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `
          #include <roughnessmap_fragment>
          vec4 coatStain = texture2D(coatDirtMap, vCoatUv * vec2(1.7, 1.1));
          float stainEdge = 1.0 - coatDirtLevel * 0.9;
          float stainAmount = smoothstep(stainEdge - 0.08, stainEdge + 0.08, coatStain.a)
            * min(1.0, coatDirtLevel * 1.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, coatStain.rgb, stainAmount * 0.93);
          roughnessFactor = mix(roughnessFactor, 1.0, stainAmount);
        `,
        );
      };
      material.customProgramCacheKey = () => key + '|coat-stain-v3';
      material.needsUpdate = true;
    }
    return {
      step: -1,
      level,
      materials: [...materials].map((material) => ({
        material,
        color: material.color.clone(),
        roughness: material.roughness,
      })),
    };
  }
}
