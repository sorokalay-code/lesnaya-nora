import type { HabitatPoint } from './AnimalHabitats';
import { ForestAnimal, RabbitActor } from './animals';
import type { WildlifeKind } from './animals/types';
import type { PredatorKind } from './types';

type Prey = ForestAnimal | RabbitActor;
type PreyKind = WildlifeKind | 'rabbit';
const CELL = 16;
const SEARCH_RADIUS = 14;
const diets: Partial<Record<PredatorKind, readonly PreyKind[]>> = {
  wolf: ['deer', 'roe-deer', 'boar', 'rabbit', 'marmot', 'moose', 'beaver', 'squirrel'],
  fox: ['mouse', 'rabbit', 'mole', 'marmot', 'chipmunk', 'pheasant', 'duck', 'frog'],
  lynx: ['rabbit', 'roe-deer', 'pheasant', 'squirrel', 'deer', 'marmot'],
  weasel: ['mouse', 'mole', 'chipmunk', 'frog', 'rabbit'],
  snake: ['mouse', 'frog', 'mole'],
  dog: ['rabbit', 'pheasant'],
};

export function preyRank(hunter: PredatorKind, prey: Prey): number {
  const kind = prey instanceof ForestAnimal ? prey.kind : 'rabbit';
  const preferred = diets[hunter];
  if (!preferred) return kind === 'fish' ? -1 : 0;
  const index = preferred.indexOf(kind);
  return index < 0 ? -1 : preferred.length - index;
}

/** Индекс добычи для выбора ближайшей жертвы и планирования охотничьего маршрута. */
export class HuntingGrounds {
  private readonly grid = new Map<string, Prey[]>();

  refresh(
    animals: readonly ForestAnimal[],
    rabbits: readonly RabbitActor[],
    eligible: (actor: Prey) => boolean,
  ): void {
    this.grid.clear();
    for (const population of [animals, rabbits]) {
      for (const actor of population) {
        if (!eligible(actor)) continue;
        const key = `${this.cell(actor.x)}:${this.cell(actor.z)}`;
        const group = this.grid.get(key);
        if (group) group.push(actor);
        else this.grid.set(key, [actor]);
      }
    }
  }

  score(hunter: PredatorKind, point: HabitatPoint): number {
    let score = 0;
    this.around(point, (actor, distance) => {
      const rank = preyRank(hunter, actor);
      if (rank >= 0) score += (1 + rank * 0.16) * (1 - distance / SEARCH_RADIUS);
    });
    return score;
  }

  around(point: HabitatPoint, visit: (actor: Prey, distance: number) => void): void {
    for (let x = this.cell(point.x - SEARCH_RADIUS); x <= this.cell(point.x + SEARCH_RADIUS); x++)
      for (
        let z = this.cell(point.z - SEARCH_RADIUS);
        z <= this.cell(point.z + SEARCH_RADIUS);
        z++
      ) {
        const group = this.grid.get(`${x}:${z}`);
        if (!group) continue;
        for (const actor of group) {
          const distance = Math.hypot(actor.x - point.x, actor.z - point.z);
          if (distance < SEARCH_RADIUS) visit(actor, distance);
        }
      }
  }

  private cell(value: number): number {
    return Math.floor(value / CELL);
  }
}
