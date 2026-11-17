import type { Random } from '../Random';
import type { AppearanceOptions } from '../AnimalAppearance';
import { ForestAnimal } from './ForestAnimal';
import { Mesh, MeshStandardMaterial } from 'three';

/** Утка перемещается по берегу и плавает на поверхности. */
export class Duck extends ForestAnimal {
  private down?: { mesh: Mesh; adult: MeshStandardMaterial; young: MeshStandardMaterial }[];

  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'duck',
      x,
      z,
      rng,
      { swimSpeed: 1.8, health: 28, defense: 0, speed: 1.1, range: 7, radius: 0.23, mass: 0.45 },
      appearance,
    );
  }

  override get swimSpeed(): number {
    return super.swimSpeed * Math.sqrt(this.growthScale);
  }

  override updateGrowth(progress: number): void {
    super.updateGrowth(progress);
    if (progress < 0.82 && !this.down) {
      this.down = [];
      for (const variant of this.model.variants ?? [this.model])
        variant.root.traverse((part) => {
          if (!(part instanceof Mesh) || !(part.material instanceof MeshStandardMaterial)) return;
          const adult = part.material;
          if (!/^duck_(body|belly|head)/.test(adult.name)) return;
          const young = adult.clone();
          young.color.set(adult.name.startsWith('duck_body') ? 0xdac06b : 0xe8d998);
          part.material = young;
          this.down?.push({ mesh: part, adult, young });
        });
    }
    if (progress >= 0.82 && this.down) {
      for (const { mesh, adult, young } of this.down) {
        mesh.material = adult;
        young.dispose();
      }
      this.down = undefined;
    }
  }
}
