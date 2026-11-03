import * as THREE from 'three';
import { ModelAssets, type ModelInstance } from './ModelAssets';
import { Random } from './Random';

export interface AppearanceTraits {
  size: number;
  bodyWidth: number;
  bodyLength: number;
  legLength: number;
  headSize: number;
  tailLength: number;
  palette: number;
}
export type AppearanceOptions = Partial<AppearanceTraits>;
export const NEUTRAL_APPEARANCE: AppearanceTraits = {
  size: 1,
  bodyWidth: 1,
  bodyLength: 1,
  legLength: 1,
  headSize: 1,
  tailLength: 1,
  palette: 0,
};

/** Небольшие вариации силуэта и общей палитры сохраняют вид животного, геометрию и число отрисовок. */
export class AnimalAppearance {
  static seeded(kind: string, x: number, z: number): AppearanceTraits {
    const salt = [...kind].reduce((value, char) => Math.imul(value, 31) + char.charCodeAt(0), 17);
    const rng = new Random(salt ^ Math.round(x * 1000) ^ Math.imul(Math.round(z * 1000), 719));
    return {
      size: rng.range(0.94, 1.06),
      bodyWidth: rng.range(0.95, 1.05),
      bodyLength: rng.range(0.95, 1.05),
      legLength: rng.range(0.95, 1.05),
      headSize: rng.range(0.96, 1.04),
      tailLength: rng.range(0.93, 1.07),
      palette: rng.int(0, 4),
    };
  }

  static normalize(options: AppearanceOptions = {}): AppearanceTraits {
    const range = (value: number | undefined, min: number, max: number) =>
      value !== undefined && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 1;
    return {
      size: range(options.size, 0.9, 1.1),
      bodyWidth: range(options.bodyWidth, 0.92, 1.08),
      bodyLength: range(options.bodyLength, 0.92, 1.08),
      legLength: range(options.legLength, 0.92, 1.08),
      headSize: range(options.headSize, 0.94, 1.06),
      tailLength: range(options.tailLength, 0.9, 1.1),
      palette: Number.isFinite(options.palette)
        ? Math.max(0, Math.min(4, Math.round(options.palette!)))
        : 0,
    };
  }

  static apply(model: ModelInstance, appearance: AppearanceTraits): void {
    model.root.scale.setScalar(appearance.size);
    for (const variant of model.variants ?? [model]) {
      const visual =
        variant.root.getObjectByName('Visual') ?? variant.root.getObjectByName('Spider');
      if (!visual?.parent) continue;
      const form = new THREE.Group();
      form.name = 'CreatureForm';
      visual.parent.add(form);
      form.add(visual);
      form.scale.set(appearance.bodyWidth, 1, appearance.bodyLength);
      const head = visual.getObjectByName('Head');
      head?.scale.set(
        appearance.headSize / appearance.bodyWidth,
        appearance.headSize,
        appearance.headSize / appearance.bodyLength,
      );
      const legs: THREE.Object3D[] = [];
      visual.traverse((part) => {
        if (/^Leg(?:[BF][LR]|[LR]\d)$/.test(part.name)) legs.push(part);
        if (!(part instanceof THREE.Mesh)) return;
        const tint = (material: THREE.Material) =>
          ModelAssets.shared.tintedMaterial(material, appearance.palette);
        part.material = Array.isArray(part.material)
          ? part.material.map(tint)
          : tint(part.material);
      });
      for (const leg of legs) leg.scale.y *= appearance.legLength;
      form.position.y = (legs[0]?.position.y ?? 0) * (appearance.legLength - 1);
      const tail = visual.getObjectByName('Tail');
      if (tail) tail.scale.z *= appearance.tailLength;
      form.updateMatrix();
      form.matrixAutoUpdate = false;
    }
  }
}
