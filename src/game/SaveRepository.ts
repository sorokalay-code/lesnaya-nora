import { defaultWorldConfig, validWorldConfig } from './WorldConfig';
import type { SaveData } from './types';
import { GenomeValidation } from './genetics/GenomeValidation';
import { validRemains } from './RemainsData';

export const SAVE_VERSION = 5;

export interface SaveSlotSummary {
  id: string;
  adventureId: string;
  adventureName: string;
  name: string;
  kind: 'autosave' | 'manual';
  createdAt: number;
  updatedAt: number;
  version: number;
  day: number;
  clock: number;
  seed: number;
  biome: string;
  worldSize: number;
  playerX: number;
  playerZ: number;
  playerCoat: string;
  supported: boolean;
}

interface StoredSaveSlot extends SaveSlotSummary {
  save: unknown;
}

interface SaveCatalog {
  version: 1;
  nextAdventureNumber: number;
  slots: StoredSaveSlot[];
}

/** Хранит независимые приключения и снимки, принимая только текущую версию формата. */
export class SaveRepository {
  private static idCounter = 0;

  constructor(
    private readonly key = 'lesnaya-nora-save-slots-v1',
    private readonly legacyKey = 'lesnaya-nora-save-v4',
  ) {}

  exists(): boolean {
    return this.list().some((slot) => slot.supported);
  }

  hasLegacySave(): boolean {
    return localStorage.getItem(this.legacyKey) !== null;
  }

  nextAdventureName(): string {
    return `Приключение ${this.readCatalog().nextAdventureNumber}`;
  }

  createAdventureId(): string {
    return `adventure-${Date.now()}-${++SaveRepository.idCounter}`;
  }

  list(): SaveSlotSummary[] {
    return this.readCatalog()
      .slots.map(({ save: _save, ...slot }) => slot)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  storeAutosave(save: SaveData, adventureId: string, adventureName: string): void {
    this.assertCurrentVersion(save);
    const catalog = this.readCatalog();
    const id = `autosave:${adventureId}`;
    const previous = catalog.slots.find((slot) => slot.id === id);
    const now = Date.now();
    if (!catalog.slots.some((slot) => slot.adventureId === adventureId))
      catalog.nextAdventureNumber++;
    const slot = this.makeSlot({
      id,
      adventureId,
      adventureName,
      name: 'Автосохранение',
      kind: 'autosave',
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      save,
    });
    catalog.slots = catalog.slots.filter((entry) => entry.id !== id);
    catalog.slots.push(slot);
    this.writeCatalog(catalog);
  }

  storeManual(save: SaveData, adventureId: string, adventureName: string): SaveSlotSummary {
    this.assertCurrentVersion(save);
    const catalog = this.readCatalog();
    const number =
      Math.max(
        0,
        ...catalog.slots
          .filter((slot) => slot.adventureId === adventureId && slot.kind === 'manual')
          .map((slot) => Number(slot.name.match(/^Сохранение (\d+)$/)?.[1] ?? 0)),
      ) + 1;
    const now = Date.now();
    const slot = this.makeSlot({
      id: `manual-${now}-${++SaveRepository.idCounter}`,
      adventureId,
      adventureName,
      name: `Сохранение ${number}`,
      kind: 'manual',
      createdAt: now,
      updatedAt: now,
      save,
    });
    catalog.slots.push(slot);
    this.writeCatalog(catalog);
    const { save: _save, ...summary } = slot;
    return summary;
  }

  delete(id: string): void {
    const catalog = this.readCatalog();
    const remaining = catalog.slots.filter((slot) => slot.id !== id);
    if (remaining.length === catalog.slots.length) throw new Error('Сохранение уже удалено');
    catalog.slots = remaining;
    this.writeCatalog(catalog);
  }

  loadSlot(id?: string): { save: SaveData; slot: SaveSlotSummary } {
    const catalog = this.readCatalog();
    const stored = id
      ? catalog.slots.find((slot) => slot.id === id)
      : (catalog.slots
          .filter((slot) => slot.supported)
          .sort((left, right) => right.updatedAt - left.updatedAt)[0] ??
        catalog.slots.sort((left, right) => right.updatedAt - left.updatedAt)[0]);
    if (!stored) throw new Error(id ? 'Сохранение не найдено' : 'Нет доступных сохранений');

    const save = this.validateSave(stored.save);
    const { save: _data, ...slot } = stored;
    return { save, slot };
  }

  store(save: SaveData): void {
    this.storeAutosave(save, 'default', 'Приключение');
  }

  load(): SaveData {
    return this.loadSlot().save;
  }

  private makeSlot({
    id,
    adventureId,
    adventureName,
    name,
    kind,
    createdAt,
    updatedAt,
    save,
  }: {
    id: string;
    adventureId: string;
    adventureName: string;
    name: string;
    kind: StoredSaveSlot['kind'];
    createdAt: number;
    updatedAt: number;
    save: SaveData;
  }): StoredSaveSlot {
    return {
      id,
      adventureId,
      adventureName,
      name,
      kind,
      createdAt,
      updatedAt,
      version: save.version,
      day: save.day,
      clock: save.clock,
      seed: save.seed,
      biome: save.worldConfig?.biome ?? defaultWorldConfig().biome,
      worldSize: save.worldConfig?.size ?? defaultWorldConfig().size,
      playerX: save.player.x,
      playerZ: save.player.z,
      playerCoat: save.player.genes.coat,
      supported: save.version === SAVE_VERSION,
      save: structuredClone(save),
    };
  }

  private readCatalog(): SaveCatalog {
    const raw = localStorage.getItem(this.key);
    if (!raw) return { version: 1, nextAdventureNumber: 1, slots: [] };

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('Каталог сохранений повреждён');
    }
    if (!isRecord(value) || value.version !== 1 || typeof value.nextAdventureNumber !== 'number')
      throw new Error('Каталог сохранений повреждён');
    if (!Number.isSafeInteger(value.nextAdventureNumber) || value.nextAdventureNumber < 1)
      throw new Error('Каталог сохранений повреждён');
    if (!Array.isArray(value.slots)) throw new Error('Каталог сохранений повреждён');

    const slots: StoredSaveSlot[] = [];
    for (const slot of value.slots) {
      if (!isStoredSlot(slot)) throw new Error('Каталог сохранений повреждён');
      slots.push({
        ...slot,
        supported:
          slot.version === SAVE_VERSION &&
          isRecord(slot.save) &&
          slot.save.version === SAVE_VERSION,
      });
    }

    return { version: 1, nextAdventureNumber: value.nextAdventureNumber, slots };
  }

  private writeCatalog(catalog: SaveCatalog): void {
    localStorage.setItem(this.key, JSON.stringify(catalog));
  }

  private assertCurrentVersion(save: SaveData): void {
    if (save.version !== SAVE_VERSION)
      throw new Error('Нельзя сохранить приключение в несовместимой версии формата.');
  }

  private validateSave(input: unknown): SaveData {
    if (!isRecord(input)) throw new Error('Сохранение повреждено');
    const data = input as unknown as SaveData;
    if (
      data.version !== SAVE_VERSION ||
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

    for (const rabbit of data.partners)
      rabbit.sex ??= rabbit.id === data.mateId || rabbit.id % 2 === 0 ? 'male' : 'female';
    if (data.worldConfig !== undefined && !validWorldConfig(data.worldConfig))
      throw new Error('Сохранение содержит повреждённые настройки мира.');

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredSlot(value: unknown): value is StoredSaveSlot {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.adventureId === 'string' &&
    typeof value.adventureName === 'string' &&
    typeof value.name === 'string' &&
    (value.kind === 'autosave' || value.kind === 'manual') &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    typeof value.version === 'number' &&
    typeof value.day === 'number' &&
    typeof value.clock === 'number' &&
    typeof value.seed === 'number' &&
    typeof value.biome === 'string' &&
    typeof value.worldSize === 'number' &&
    typeof value.playerX === 'number' &&
    typeof value.playerZ === 'number' &&
    typeof value.playerCoat === 'string' &&
    typeof value.supported === 'boolean' &&
    typeof value.save === 'object' &&
    value.save !== null
  );
}
