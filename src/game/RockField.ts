import * as THREE from 'three';
import { ModelAssets, type ModelName } from './ModelAssets';
import { Random } from './Random';
import type { WorldChunks } from './WorldChunks';

type Rock = { x: number; y: number; z: number; scale: number; rotation: number; kind: ModelName };

/** Размещает крупные GLB-камни пакетами по чанкам, без отдельных материалов и кадровых обновлений. */
export class RockField {
  constructor(
    seed: number,
    chunks: WorldChunks,
    heightAt: (x: number, z: number) => number,
    canPlace: (x: number, z: number) => boolean,
    worldScale = 1,
  ) {
    const rng = new Random(seed + 18743),
      batches = new Map<string, Rock[]>();
    const kinds: ModelName[] = ['rock_granite', 'rock_moss', 'rock_slate'];
    for (let i = 0; i < Math.round(180 * worldScale ** 2); i++) {
      const x = rng.range(-100, 100) * worldScale,
        z = rng.range(-100, 100) * worldScale;
      if (Math.hypot(x, z) < 9 || !canPlace(x, z)) continue;
      const scale = rng.range(0.3, 1.5),
        kind = rng.pick(kinds);
      const y =
        Math.min(
          heightAt(x, z),
          heightAt(x + scale * 0.5, z),
          heightAt(x - scale * 0.5, z),
          heightAt(x, z + scale * 0.5),
          heightAt(x, z - scale * 0.5),
        ) - 0.025;
      const key = `${Math.floor(x / 24)},${Math.floor(z / 24)}:${kind}`;
      const batch = batches.get(key) ?? [];
      batch.push({ x, y, z, scale, rotation: rng.range(0, Math.PI * 2), kind });
      batches.set(key, batch);
    }
    const templates = new Map<ModelName, THREE.Group>(),
      transform = new THREE.Object3D(),
      matrix = new THREE.Matrix4();
    for (const rocks of batches.values()) {
      const first = rocks[0];
      let template = templates.get(first.kind);
      if (!template) {
        template = ModelAssets.shared.create(first.kind).root;
        template.updateMatrixWorld(true);
        templates.set(first.kind, template);
      }
      template.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return;
        const batch = new THREE.InstancedMesh(part.geometry, part.material, rocks.length);
        batch.name = `rock-batch-${first.kind}`;
        batch.receiveShadow = true;
        batch.castShadow = false;
        rocks.forEach((rock, index) => {
          transform.position.set(rock.x, rock.y, rock.z);
          transform.rotation.set(0, rock.rotation, 0);
          transform.scale.setScalar(rock.scale);
          transform.updateMatrix();
          matrix.multiplyMatrices(transform.matrix, part.matrixWorld);
          batch.setMatrixAt(index, matrix);
        });
        batch.computeBoundingSphere();
        chunks.add(batch, first.x, first.z);
      });
    }
  }
}
