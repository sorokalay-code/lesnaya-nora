import { defaultWorldConfig, validWorldConfig } from './WorldConfig';
import type { SaveData } from './types';
import { GenomeValidation } from './genetics/GenomeValidation';

/** Хранит и проверяет актуальный формат сохранения без миграций старых версий. */

export class SaveRepository {
  constructor(private readonly key = 'lesnaya-nora-save-v4') {}

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
      data.version !== 4 ||
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

    if (
      !GenomeValidation.valid(data.player.genes) ||
      !data.partners.every((partner) => partner && GenomeValidation.valid(partner.genes)) ||
      !data.kits.every((kit) => kit && GenomeValidation.valid(kit.genes))
    )
      throw new Error('Сохранение содержит неполные или повреждённые гены. Начни новую историю.');

    if (
      (data.player.originKitId !== undefined &&
        (!Number.isSafeInteger(data.player.originKitId) || data.player.originKitId < 1)) ||
      data.kits.some(
        (kit) =>
          (kit.sex !== undefined && kit.sex !== 'female' && kit.sex !== 'male') ||
          (kit.condition !== undefined &&
            (!kit.condition ||
              typeof kit.condition !== 'object' ||
              !['thirst', 'bodyTemp', 'energy', 'bladder', 'bowel', 'poison', 'milk'].every((key) =>
                Number.isFinite(kit.condition?.[key as keyof NonNullable<typeof kit.condition>]),
              ))),
      )
    )
      throw new Error('Сохранение содержит повреждённое состояние семейной линии.');

    if (data.worldConfig !== undefined && !validWorldConfig(data.worldConfig))
      throw new Error('Сохранение содержит повреждённые настройки мира.');

    // У существующих сохранений v4 мир был фиксированным; его параметры совпадают с дефолтами.
    data.worldConfig ??= defaultWorldConfig();
    return data;
  }
}
