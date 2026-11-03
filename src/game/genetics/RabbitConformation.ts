import * as THREE from 'three';
import type { ModelInstance } from '../ModelAssets';
import type { Genes } from '../types';
import type { RabbitShape } from './types';
import { RabbitFeatures } from './RabbitFeatures';

export const NEUTRAL_RABBIT_SHAPE: RabbitShape = {
  earWidth: 1,
  earBend: 0,
  legLength: 1,
  bodyWidth: 1,
  bodyLength: 1,
  headSize: 1,
};

/** Наследуемые пропорции меняются статическими обёртками над ригом, не затрагивая общую GLB-геометрию. */
export class RabbitConformation {
  static shape(genes: Genes): RabbitShape {
    return (
      genes.shape ?? {
        earWidth: 0.95 + genes.vitality * 0.015,
        earBend: (genes.ear - 1) * 0.4,
        legLength: 0.955 + genes.speed * 0.015,
        bodyWidth: 0.94 + genes.vitality * 0.015,
        bodyLength: 0.955 + genes.endurance * 0.015,
        headSize: 1,
      }
    );
  }

  static apply(model: ModelInstance, genes: Genes): void {
    const shape = this.shape(genes);
    for (const variant of model.variants ?? [model]) {
      const visual = variant.root.getObjectByName('Visual');
      if (!visual?.parent) continue;
      const form = this.wrap(visual, 'RabbitForm');
      form.scale.set(shape.bodyWidth, 1, shape.bodyLength);
      form.position.y = 0.41 * (shape.legLength - 1);
      const head = visual.getObjectByName('Head');
      head?.scale.set(
        shape.headSize / shape.bodyWidth,
        shape.headSize,
        shape.headSize / shape.bodyLength,
      );
      const parts: THREE.Object3D[] = [];
      visual.traverse((part) => {
        if (/^(Ear[LR]|Eye[LR]|Paw[BF][LR])(-extra-\d+)?$/.test(part.name)) parts.push(part);
      });
      for (const part of parts) {
        if (part.name.startsWith('Paw')) part.scale.y *= shape.legLength;
        else if (part.name.startsWith('Eye')) {
          const eyes = RabbitFeatures.eyes(genes);
          part.scale.x *= eyes.width;
          part.scale.y *= eyes.height;
        } else {
          const ears = RabbitFeatures.ears(genes);
          const side = part.name.startsWith('EarL') ? -1 : 1;
          const ear = this.wrap(part, part.name + '-form');
          ear.scale.x = shape.earWidth * ears.width;
          ear.rotation.x = shape.earBend;
          ear.rotation.z = -side * ears.angle + side * shape.earBend * 0.25;
          ear.updateMatrix();
          ear.matrixAutoUpdate = false;
        }
      }
      form.updateMatrix();
      form.matrixAutoUpdate = false;
    }
    model.root.userData.bodyWidth = shape.bodyWidth;
    model.root.userData.bodyLength = shape.bodyLength;
  }

  private static wrap(part: THREE.Object3D, name: string): THREE.Group {
    const wrapper = new THREE.Group();
    wrapper.name = name;
    wrapper.position.copy(part.position);
    part.position.set(0, 0, 0);
    part.parent!.add(wrapper);
    wrapper.add(part);
    return wrapper;
  }
}
