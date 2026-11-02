import type { SaveData } from './types';

/** Хранит и проверяет актуальный формат сохранения без миграций старых версий. */

export class SaveRepository {
  constructor(private readonly key = 'lesnaya-nora-save-v3') {}

  exists(): boolean {
    try {
      return !!localStorage.getItem(this.key);
    } catch {
      return false;
    }
  }

  store(save: SaveData): void {
    localStorage.setItem(this.key, JSON.stringify(save));
  }

  load(): SaveData {
    const raw = localStorage.getItem(this.key);
    if (!raw) throw new Error('Сохранение не найдено');

    const data = JSON.parse(raw) as SaveData;
    if (
      data.version !== 3 ||
      !Number.isFinite(data.seed) ||
      !Number.isFinite(data.player?.y) ||
      !Array.isArray(data.excavation) ||
      !Array.isArray(data.nests) ||
      !Array.isArray(data.stashes) ||
      !Array.isArray(data.kits) ||
      !Array.isArray(data.partners) ||
      !Array.isArray(data.drops)
    )
      throw new Error('Сохранение повреждено или создано в старой версии игры');

    return data;
  }
}
