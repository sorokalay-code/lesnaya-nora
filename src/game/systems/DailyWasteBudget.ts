import { Random } from '../Random';
import type { SaveData } from '../types';

/** Ограничивает отходы одним случаем за день; необязательный дневной шанс тоже сохраняет пропуск. */
export class DailyWasteBudget {
  private readonly due = new Map<string, { day: number; clock: number }>();
  private currentDay = -1;

  constructor(
    private readonly save: SaveData,
    private readonly rng: Random,
  ) {}

  ready(key: string, chance = 1): boolean {
    const day = Math.floor(this.save.clock / 1440);
    const history = (this.save.animalWasteDays ??= {});
    if (this.currentDay !== day) {
      this.currentDay = day;
      this.due.clear();
      // Старые ID исчезнувших животных не должны бесконечно раздувать сохранение.
      for (const [id, recordedDay] of Object.entries(history))
        if (recordedDay !== day) delete history[id];
    }
    if (history[key] === day) return false;
    const due = this.due.get(key);
    if (!due || due.day !== day) {
      this.due.set(key, { day, clock: this.save.clock + this.rng.range(120, 240) });
      return false;
    }
    if (this.save.clock < due.clock) return false;
    history[key] = day;
    // Пропущенный день тоже записан: частый обход и перезагрузка не перебрасывают шанс.
    return chance >= 1 || this.rng.chance(chance);
  }
}
