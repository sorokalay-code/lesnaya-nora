import type { AppearanceOptions } from '../AnimalAppearance';
import type { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import type { WildlifeProfile } from './types';
import type { HabitatPoint } from '../AnimalHabitats';
import { Mesh, MeshStandardMaterial, type Object3D } from 'three';

const profile: WildlifeProfile = {
  health: 34,
  defense: 0,
  speed: 4.2,
  range: 23,
  radius: 0.28,
  mass: 2.1,
};

/** Фазан кормится и убегает по земле на опушках и лугах. */
export class Pheasant extends ForestAnimal {
  findCover?: (x: number, z: number, threat: HabitatPoint) => HabitatPoint | undefined;
  private cover?: HabitatPoint;
  private coverSearchAt = -Infinity;
  private hen = false;
  private down = false;
  private feathers?: {
    parts: { mesh: Mesh; adult: MeshStandardMaterial; brown: MeshStandardMaterial }[];
    tails: Object3D[];
  };

  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super('pheasant', x, z, rng, profile, appearance);
  }

  useHenPlumage(hen: boolean): void {
    this.hen = hen;
    this.updatePlumage();
  }

  override updateGrowth(progress: number): void {
    super.updateGrowth(progress);
    const down = progress < 0.76;
    if (down !== this.down) {
      this.down = down;
      this.updatePlumage();
    }
  }

  protected override escapeCover(danger: HabitatPoint, time: number): HabitatPoint | undefined {
    if (time >= this.coverSearchAt) {
      this.coverSearchAt = time + 0.8;
      this.cover = this.findCover?.(this.x, this.z, danger);
    }
    return this.cover;
  }

  private updatePlumage(): void {
    if (!this.hen && !this.down && !this.feathers) return;
    if (!this.feathers) {
      const parts: NonNullable<Pheasant['feathers']>['parts'] = [];
      const tails: Object3D[] = [];
      this.root.traverse((part) => {
        if (part.name === 'Tail') tails.push(part);
        if (!(part instanceof Mesh) || !(part.material instanceof MeshStandardMaterial)) return;
        const adult = part.material;
        if (
          !/Copper body|Green neck|Green head|White collar|Red face|Mottled wing/.test(adult.name)
        )
          return;
        const brown = adult.clone();
        parts.push({ mesh: part, adult, brown });
      });
      this.feathers = { parts, tails };
    }
    for (const { mesh, adult, brown } of this.feathers.parts) {
      if (this.hen || this.down) {
        brown.color.set(
          /wing|collar/.test(adult.name) ? 0xa28251 : this.down ? 0xd5b77a : 0xb1976b,
        );
        mesh.material = brown;
      } else {
        mesh.material = adult;
        brown.dispose();
      }
    }
    for (const tail of this.feathers.tails) tail.scale.z = this.down ? 0.25 : this.hen ? 0.65 : 1;
    if (!this.hen && !this.down) this.feathers = undefined;
  }
}
