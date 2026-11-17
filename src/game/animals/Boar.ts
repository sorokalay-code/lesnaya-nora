import type { AppearanceOptions } from '../AnimalAppearance';
import { Random } from '../Random';
import { ForestAnimal } from './ForestAnimal';
import { BufferGeometry, Color, Float32BufferAttribute, Mesh } from 'three';

/** Мирный кабан пасётся в лесу и отвечает на нападение; сам не охотится на кроликов. */
export class Boar extends ForestAnimal {
  private stripes?: Mesh[];

  constructor(x: number, z: number, rng: Random, appearance?: AppearanceOptions) {
    super(
      'boar',
      x,
      z,
      rng,
      { health: 105, defense: 17, speed: 1.25, range: 10, radius: 0.8, mass: 4 },
      appearance,
    );
  }

  override updateGrowth(progress: number): void {
    super.updateGrowth(progress);
    if (progress < 0.75 && !this.stripes) {
      this.stripes = [];
      for (const variant of this.model.variants ?? [this.model]) {
        const visual = variant.root.getObjectByName('Visual');
        const body = visual?.children.find((object): object is Mesh => object instanceof Mesh);
        if (!visual || !body) continue;

        const stripes = new Mesh(stripeGeometry(), body.material);
        stripes.name = 'PigletStripes';
        stripes.receiveShadow = true;
        visual.add(stripes);
        this.stripes.push(stripes);
      }
    }
    for (const stripe of this.stripes ?? []) stripe.visible = progress < 0.75;
  }
}

/** Продольные светлые полосы повторяют эллипсоид корпуса в обоих LOD кабана. */
function stripeGeometry(): BufferGeometry {
  const positions: number[] = [];
  const lengthSegments = 14;
  const point = (index: number, angle: number) => {
    const length = -0.68 + (index / lengthSegments) * 1.49;
    const width = Math.sqrt(1 - length * length);
    return [
      Math.sin(angle) * width * 0.518,
      0.63 + Math.cos(angle) * width * 0.468,
      0.13 + 0.81 * length,
    ];
  };
  for (const angle of [-1.2, -0.76, -0.34, 0.34, 0.76, 1.2]) {
    for (let index = 0; index < lengthSegments; index++) {
      const a = point(index, angle - 0.065);
      const b = point(index, angle + 0.065);
      const c = point(index + 1, angle - 0.065);
      const d = point(index + 1, angle + 0.065);
      positions.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  const color = new Color(0xbd9157);
  const rgb = [color.r, color.g, color.b];
  const colors = positions.map((_, index) => rgb[index % 3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
