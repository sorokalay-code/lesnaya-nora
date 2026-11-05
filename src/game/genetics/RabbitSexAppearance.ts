import * as THREE from 'three';
import type { ModelInstance } from '../ModelAssets';
import type { RabbitSex } from '../types';

/** Различает пол силуэтом поверх наследуемых пропорций, не меняя гены и общие ресурсы LOD. */
export class RabbitSexAppearance {
  static apply(model: ModelInstance, sex: RabbitSex, adult: boolean): void {
    model.root.userData.sex = sex;
    for (const variant of model.variants ?? [model]) {
      const head = variant.root.getObjectByName('Head');
      if (head?.parent) {
        const form = this.wrap(head, 'SexHeadForm');
        form.scale.set(adult && sex === 'male' ? 1.24 : 1, adult && sex === 'male' ? 1.1 : 1, 1);
      }
      const body = variant.root.getObjectByName('RabbitForm');
      if (body?.parent)
        this.wrap(body, 'SexBodyForm').scale.set(adult && sex === 'male' ? 1.06 : 1, 1, 1);
      for (const side of ['L', 'R']) {
        const ear = variant.root.getObjectByName(`Ear${side}-form`);
        if (ear?.parent)
          this.wrap(ear, `SexEar${side}Form`).scale.y = adult && sex === 'female' ? 1.16 : 1;
      }
    }
  }

  private static wrap(part: THREE.Object3D, name: string): THREE.Object3D {
    if (part.parent?.name === name) return part.parent;
    const parent = part.parent!;
    const form = new THREE.Group();
    form.name = name;
    parent.add(form);
    form.add(part);
    return form;
  }
}
