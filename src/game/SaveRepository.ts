import { defaultWorldConfig, validWorldConfig } from './WorldConfig';
import type { SaveData } from './types';
import { GenomeValidation } from './genetics/GenomeValidation';
import { validRemains } from './RemainsData';

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
      (data.pregnancy != null &&
        (!Number.isSafeInteger(data.pregnancy.fatherId) ||
          !Number.isFinite(data.pregnancy.progress) ||
          data.pregnancy.progress < 0 ||
          (data.pregnancy.trauma !== undefined && data.pregnancy.trauma !== true))) ||
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

    if (data.worldConfig?.creatures && typeof data.worldConfig.creatures === 'object') {
      const defaults = defaultWorldConfig().creatures;
      for (const kind of ['duck', 'mouse', 'fish'] as const) {
        if (data.worldConfig.creatures[kind] === undefined)
          data.worldConfig.creatures[kind] = defaults[kind];
      }
    }
    if (
      data.partners.some(
        (rabbit) =>
          (rabbit.sex !== undefined && rabbit.sex !== 'female' && rabbit.sex !== 'male') ||
          (rabbit.age !== undefined && (!Number.isFinite(rabbit.age) || rabbit.age < 0)) ||
          (rabbit.nextMatingAt !== undefined &&
            (!Number.isFinite(rabbit.nextMatingAt) || rabbit.nextMatingAt < 0)) ||
          (rabbit.pregnancy !== undefined &&
            (!rabbit.pregnancy ||
              rabbit.sex !== 'female' ||
              !Number.isFinite(rabbit.pregnancy.dueAt) ||
              rabbit.pregnancy.dueAt < 0 ||
              !Number.isSafeInteger(rabbit.pregnancy.fatherId) ||
              !data.partners.some((father) => father.id === rabbit.pregnancy?.fatherId))),
      )
    )
      throw new Error('Сохранение содержит повреждённое состояние кроликов.');

    // Прежние v4 не хранили пол соседей. Текущий партнёр остаётся кролом;
    // остальные получают воспроизводимый пол, чтобы жизнь старого мира тоже продолжалась.
    for (const rabbit of data.partners)
      rabbit.sex ??= rabbit.id === data.mateId || rabbit.id % 2 === 0 ? 'male' : 'female';
    if (data.worldConfig !== undefined && !validWorldConfig(data.worldConfig))
      throw new Error('Сохранение содержит повреждённые настройки мира.');

    // У существующих сохранений v4 мир был фиксированным; его параметры совпадают с дефолтами.
    data.worldConfig ??= defaultWorldConfig();
    data.worldConfig.leaveRemains ??= true;
    if (data.remains !== undefined && !validRemains(data.remains))
      throw new Error('Сохранение содержит повреждённые останки животных.');
    if (
      data.deadPopulation !== undefined &&
      (!Array.isArray(data.deadPopulation) ||
        !data.deadPopulation.every(
          (id) => typeof id === 'string' && /^(predator|hawk|pike):\d+$/.test(id),
        ))
    )
      throw new Error('Сохранение содержит повреждённое состояние популяции.');
    if (
      data.nextRemainsId !== undefined &&
      (!Number.isSafeInteger(data.nextRemainsId) || data.nextRemainsId < 1)
    )
      throw new Error('Сохранение содержит повреждённый счётчик останков.');
    data.nextRemainsId = (data.remains ?? []).reduce(
      (next, entry) => Math.max(next, entry.id + 1),
      data.nextRemainsId ?? 1,
    );
    return data;
  }
}
