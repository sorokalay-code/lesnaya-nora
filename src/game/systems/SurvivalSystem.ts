import { Random } from '../Random';
import { EnergyRecovery } from './EnergyRecovery';
import { FOOD, type FoodKind, type SaveData } from '../types';
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
/** Обновляет потребности, температуру, загрязнение, отравление и здоровье крольчихи. */
export class SurvivalSystem {
  private lastDiarrhea = 0;
  private readonly recovery = new EnergyRecovery();

  constructor(
    private readonly save: SaveData,
    private readonly rng: Random,
  ) {}

  tick(
    dt: number,
    elapsed: number,
    moving: boolean,
    ambient: number,
    warm: boolean,
    onDiarrhea: () => void,
  ): void {
    const p = this.save.player;
    p.hunger = clamp(p.hunger - dt * (moving ? 0.14 : 0.07), 0, 100);
    this.recovery.update(p, dt, elapsed, moving);
    if (moving) p.energy = clamp(p.energy - dt * 0.09, 0, 100);
    p.thirst = clamp(p.thirst - dt * (moving ? 0.15 : 0.09), 0, 100);
    p.bladder = clamp(p.bladder + dt * 0.075, 0, 100);
    p.bowel = clamp(p.bowel + dt * 0.055, 0, 100);
    p.bodyTemp = clamp(
      p.bodyTemp +
        ((warm ? 38.6 : 38.4 - Math.max(0, 12 - ambient) * 0.36) - p.bodyTemp) *
          Math.min(1, dt * (warm ? 0.09 : 0.022)),
      28,
      41,
    );
    p.poison = clamp(p.poison - dt * 0.32, 0, 100);
    if (p.poison > 25) {
      p.health = clamp(p.health - dt * (p.poison > 60 ? 0.25 : 0.11) * 0.8, 0, 100);
      p.thirst = clamp(p.thirst - dt * 0.09, 0, 100);
    }

    if (p.poison > 42 && elapsed - this.lastDiarrhea > 20) {
      this.lastDiarrhea = elapsed;
      onDiarrhea();
      p.bowel = clamp(p.bowel - 30, 0, 100);
      p.dirtiness = clamp(p.dirtiness + 15, 0, 100);
    }

    if (
      p.hunger < 10 ||
      p.energy < 5 ||
      p.bladder > 95 ||
      p.bowel > 95 ||
      p.thirst < 10 ||
      p.bodyTemp < 34 ||
      p.dirtiness > 82
    )
      p.health = clamp(
        p.health - dt * (p.thirst < 2 || p.bodyTemp < 32 ? 0.4 : 0.18) * 0.8,
        0,
        100,
      );
    else if (p.hunger > 55 && p.energy > 55 && p.thirst > 50 && p.poison < 15)
      p.health = clamp(p.health + dt * 0.025, 0, 100);

    if (p.hunger > 45 && p.thirst > 40 && p.poison < 30)
      p.milk = clamp(p.milk + dt * 0.055, 0, 100);
  }

  eat(kind: FoodKind): boolean {
    const p = this.save.player,
      food = FOOD[kind];
    p.hunger = clamp(p.hunger + food.nutrition, 0, 100);
    p.thirst = clamp(p.thirst + food.moisture, 0, 100);
    p.bladder = clamp(p.bladder + Math.max(1, food.moisture * 0.4), 0, 100);
    p.bowel = clamp(p.bowel + 7, 0, 100);
    const poisoned = this.rng.chance(food.poisonRisk);
    if (poisoned) p.poison = clamp(Math.max(p.poison, 45 + this.rng.range(0, 35)), 0, 100);

    return poisoned;
  }

  groom(): void {
    const p = this.save.player;
    p.dirtiness = 0;
    p.energy = clamp(p.energy - 3, 0, 100);
  }
}
