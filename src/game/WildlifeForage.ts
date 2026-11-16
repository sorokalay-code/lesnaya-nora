import type { Habitat, HabitatPoint } from './AnimalHabitats';
import { WILDLIFE_HABITATS } from './HabitatProfiles';
import type { WildlifeKind } from './animals/types';
import type { Resource } from './World';

const FOOD_RADIUS = 9;
const CELL_SIZE = 12;

/** Индексирует неподвижные растения; животные оценивают корм только в соседних ячейках. */
export class WildlifeForage {
  private readonly grid = new Map<string, Resource[]>();
  private resourceCount = -1;

  constructor(private readonly resources: readonly Resource[]) {}

  find(
    animal: HabitatPoint & { kind: WildlifeKind; habitat?: Habitat; destination?: HabitatPoint },
    risk: (x: number, z: number) => number,
  ): Resource | undefined {
    const diet = WILDLIFE_HABITATS[animal.kind].food;
    if (!diet.length) return;
    if (this.resources.length !== this.resourceCount) this.index();

    const left = this.cell(animal.x - FOOD_RADIUS);
    const right = this.cell(animal.x + FOOD_RADIUS);
    const top = this.cell(animal.z - FOOD_RADIUS);
    const bottom = this.cell(animal.z + FOOD_RADIUS);
    const localRisk = risk(animal.x, animal.z);
    let best: Resource | undefined;
    let bestScore = Infinity;
    for (let x = left; x <= right; x++) {
      for (let z = top; z <= bottom; z++) {
        const plants = this.grid.get(`${x}:${z}`);
        if (!plants) continue;
        for (const plant of plants) {
          if (!plant.available || !diet.includes(plant.kind)) continue;
          const distance = Math.hypot(plant.x - animal.x, plant.z - animal.z);
          if (distance >= FOOD_RADIUS) continue;
          const home = animal.habitat;
          if (home && Math.hypot(plant.x - home.x, plant.z - home.z) > home.radius) continue;
          if (
            home?.profile.mode === 'roaming' &&
            animal.destination &&
            Math.hypot(plant.x - animal.destination.x, plant.z - animal.destination.z) >
              home.radius * 0.58
          )
            continue;

          const danger = risk(plant.x, plant.z);
          if (danger > 1.45 && danger > localRisk + 0.24) continue;
          const score = distance + danger * 5 + diet.indexOf(plant.kind) * 0.35;
          if (score < bestScore) {
            bestScore = score;
            best = plant;
          }
        }
      }
    }
    return best;
  }

  private cell(value: number): number {
    return Math.floor(value / CELL_SIZE);
  }

  private index(): void {
    this.resourceCount = this.resources.length;
    this.grid.clear();
    for (const plant of this.resources) {
      const key = `${this.cell(plant.x)}:${this.cell(plant.z)}`;
      const cell = this.grid.get(key);
      if (cell) cell.push(plant);
      else this.grid.set(key, [plant]);
    }
  }
}
