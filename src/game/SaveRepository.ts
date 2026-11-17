import { ADDED_ANIMALS, defaultWorldConfig, validWorldConfig } from './WorldConfig';
import type { SaveData } from './types';
import { GenomeValidation } from './genetics/GenomeValidation';
import { validRemains } from './RemainsData';
import { playerSex } from './RabbitSex';
import { isColdNightGoal } from './ColdNightPlan';
import { MAX_BURROW_FUR } from './BurrowFur';
import { DEN_BED } from './WolfDen';
import { isShelteredWildlife } from './WildlifeShelterProfiles';
import { isWildlifeShelterSite } from './WildlifeShelters';

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
  preview?: string;
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

  storeAutosave(
    save: SaveData,
    adventureId: string,
    adventureName: string,
    preview?: string,
  ): void {
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
      preview,
    });
    catalog.slots = catalog.slots.filter((entry) => entry.id !== id);
    catalog.slots.push(slot);
    this.writeCatalog(catalog);
  }

  storeManual(
    save: SaveData,
    adventureId: string,
    adventureName: string,
    preview?: string,
  ): SaveSlotSummary {
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
      preview,
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
    preview,
  }: {
    id: string;
    adventureId: string;
    adventureName: string;
    name: string;
    kind: StoredSaveSlot['kind'];
    createdAt: number;
    updatedAt: number;
    save: SaveData;
    preview?: string;
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
      preview,
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

    if (!['clear', 'cloudy', 'rain', 'mist', 'snow'].includes(data.weather)) data.weather = 'clear';

    if (
      !GenomeValidation.valid(data.player.genes) ||
      !data.partners.every((partner) => partner && GenomeValidation.valid(partner.genes)) ||
      !data.kits.every((kit) => kit && GenomeValidation.valid(kit.genes))
    )
      throw new Error('Сохранение содержит неполные или повреждённые гены. Начни новую историю.');

    if (
      (data.player.sex !== undefined &&
        data.player.sex !== 'female' &&
        data.player.sex !== 'male') ||
      (data.pregnancy != null &&
        (!Number.isFinite(data.pregnancy.progress) ||
          data.pregnancy.progress < 0 ||
          (data.pregnancy.warned !== undefined && typeof data.pregnancy.warned !== 'boolean') ||
          (data.pregnancy.motherId !== undefined
            ? playerSex(data.player) !== 'male' ||
              data.pregnancy.fatherId !== undefined ||
              data.pregnancy.trauma !== undefined ||
              !Number.isSafeInteger(data.pregnancy.motherId) ||
              data.pregnancy.motherId !== data.mateId ||
              !data.partners.some((rabbit) => rabbit.id === data.mateId && rabbit.sex === 'female')
            : playerSex(data.player) !== 'female' ||
              !Number.isSafeInteger(data.pregnancy.fatherId) ||
              (data.pregnancy.trauma !== undefined && data.pregnancy.trauma !== true)))) ||
      data.nests.some(
        (nest) => !nest || (nest.insulated !== undefined && nest.insulated !== true),
      ) ||
      (data.player.originKitId !== undefined &&
        (!Number.isSafeInteger(data.player.originKitId) || data.player.originKitId < 1)) ||
      data.kits.some(
        (kit) =>
          (kit.sex !== undefined && kit.sex !== 'female' && kit.sex !== 'male') ||
          (kit.adopted !== undefined && kit.adopted !== true) ||
          (kit.motherId !== undefined &&
            (!Number.isSafeInteger(kit.motherId) || kit.motherId < 0)) ||
          (kit.command === 'relocate' && !data.nests.some((nest) => nest.id === kit.nestId)) ||
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
      Reflect.deleteProperty(data.worldConfig.creatures, 'scolopendra');
      const defaults = defaultWorldConfig().creatures;
      for (const kind of ['duck', 'mouse', 'fish', ...ADDED_ANIMALS] as const) {
        if (data.worldConfig.creatures[kind] === undefined)
          data.worldConfig.creatures[kind] = defaults[kind];
      }
    }
    if (
      data.partners.some(
        (rabbit) =>
          (rabbit.sex !== undefined && rabbit.sex !== 'female' && rabbit.sex !== 'male') ||
          (rabbit.age !== undefined && (!Number.isFinite(rabbit.age) || rabbit.age < 0)) ||
          (rabbit.wildParentId !== undefined &&
            (!Number.isSafeInteger(rabbit.wildParentId) || rabbit.wildParentId < 0)) ||
          (rabbit.lost !== undefined && ((rabbit.age ?? 3) >= 3 || !validLostKit(rabbit.lost))) ||
          (rabbit.nextMatingAt !== undefined &&
            (!Number.isFinite(rabbit.nextMatingAt) || rabbit.nextMatingAt < 0)) ||
          (rabbit.nextNursingAt !== undefined &&
            (rabbit.sex !== 'female' ||
              !Number.isFinite(rabbit.nextNursingAt) ||
              rabbit.nextNursingAt < 0)) ||
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
    if (data.wolves !== undefined && !validWolfStates(data.wolves, data.worldConfig.size))
      throw new Error('Сохранение содержит повреждённые данные волчьих стай.');
    if (data.wolfDens !== undefined && !validWolfDens(data.wolfDens, data.worldConfig.size))
      throw new Error('Сохранение содержит повреждённые данные волчьих логовищ.');
    if (data.wildlife !== undefined && !validHabitatSlots(data.wildlife))
      throw new Error('Сохранение содержит повреждённые места обитания животных.');
    if (!validMammalPopulation(data))
      throw new Error('Сохранение содержит повреждённые данные выводков млекопитающих.');
    if (
      data.wildlifeShelters !== undefined &&
      !validWildlifeShelters(data.wildlifeShelters, data.worldConfig.size)
    )
      throw new Error('Сохранение содержит повреждённые укрытия животных.');
    if (data.coldNightOuting !== undefined && !validColdNightOuting(data, data.worldConfig.size))
      throw new Error('Сохранение содержит повреждённый план вылазки.');
    if (data.burrowFur !== undefined && !validFurPatches(data.burrowFur))
      throw new Error('Сохранение содержит повреждённые данные утепления норы.');
    if (Array.isArray(data.remains))
      data.remains = data.remains.filter(
        (entry: unknown) => !isRecord(entry) || entry.kind !== 'scolopendra',
      );
    if (Array.isArray(data.deadPopulation))
      data.deadPopulation = data.deadPopulation.filter(
        (id: unknown) => typeof id !== 'string' || !/^scolopendra:\d+$/.test(id),
      );
    if (data.remains !== undefined && !validRemains(data.remains))
      throw new Error('Сохранение содержит повреждённые останки животных.');
    if (
      data.deadPopulation !== undefined &&
      (!Array.isArray(data.deadPopulation) ||
        !data.deadPopulation.every(
          (id) =>
            typeof id === 'string' && /^(predator|hawk|owl|pike|mammal|wildlife):\d+$/.test(id),
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

function validLostKit(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { hunger, since, lastClock } = value;
  return (
    typeof hunger === 'number' &&
    Number.isFinite(hunger) &&
    hunger >= 0 &&
    hunger <= 100 &&
    typeof since === 'number' &&
    Number.isFinite(since) &&
    since >= 0 &&
    typeof lastClock === 'number' &&
    Number.isFinite(lastClock) &&
    lastClock >= since
  );
}

function validFurPatches(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const positions = new Set<string>();
  return value.every((entry: unknown) => {
    if (!isRecord(entry)) return false;
    const { x, y, z, amount } = entry;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      typeof amount !== 'number' ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > MAX_BURROW_FUR
    )
      return false;
    const position = `${x}:${y}:${z}`;
    if (positions.has(position)) return false;
    positions.add(position);
    return true;
  });
}

function validColdNightOuting(save: SaveData, size: number): boolean {
  const outing: unknown = save.coldNightOuting;
  if (!isRecord(outing) || !isColdNightGoal(outing.goal)) return false;
  if (
    !Number.isSafeInteger(outing.stashId) ||
    !save.stashes.some((stash) => stash?.id === outing.stashId)
  )
    return false;
  if (
    outing.helperId !== undefined &&
    (!Number.isSafeInteger(outing.helperId) ||
      outing.helperId !== save.mateId ||
      save.mateCommand !== 'forage' ||
      !save.partners.some((rabbit) => rabbit.id === outing.helperId))
  )
    return false;

  const marker = outing.waypoint;
  return (
    marker === undefined ||
    (isRecord(marker) &&
      typeof marker.x === 'number' &&
      Math.abs(marker.x) <= size &&
      typeof marker.z === 'number' &&
      Math.abs(marker.z) <= size)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validWolfStates(value: unknown, size: number): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([id, state]) => {
    if (!/^predator:\d+$/.test(id) || !isRecord(state)) return false;
    if (state.state === 'vacant')
      return (
        typeof state.replaceAt === 'number' &&
        Number.isFinite(state.replaceAt) &&
        state.replaceAt >= 0
      );
    return (
      state.state === 'alive' &&
      typeof state.health === 'number' &&
      Number.isFinite(state.health) &&
      state.health > 0 &&
      (state.denDepth === undefined ||
        (typeof state.denDepth === 'number' && state.denDepth > 0 && state.denDepth <= DEN_BED)) &&
      typeof state.x === 'number' &&
      Math.abs(state.x) <= size &&
      typeof state.z === 'number' &&
      Math.abs(state.z) <= size
    );
  });
}

function validWolfDens(value: unknown, size: number): boolean {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([id, site]) =>
        /^\d+$/.test(id) &&
        isRecord(site) &&
        typeof site.x === 'number' &&
        Math.abs(site.x) < size &&
        typeof site.z === 'number' &&
        Math.abs(site.z) < size &&
        typeof site.angle === 'number' &&
        site.angle >= 0 &&
        site.angle < 2 * Math.PI,
    )
  );
}

function validMammalPopulation(data: SaveData): boolean {
  const counter = data.nextMammalId;
  if (counter !== undefined && !positiveId(counter)) return false;
  if (data.marmotImmigrationAt !== undefined && !validMinute(data.marmotImmigrationAt))
    return false;

  const liveIds = new Set<number>();
  const socialIds = new Set(data.wildlife?.map((animal) => animal.id));
  const addId = (id: unknown) => {
    if (!positiveId(id) || counter === undefined || id >= counter || liveIds.has(id)) return false;
    liveIds.add(id);
    return true;
  };

  for (const wolf of Object.values(data.wolves ?? {}))
    if (wolf.state === 'alive') {
      if (wolf.individual !== undefined && !addId(wolf.individual)) return false;
      if (wolf.origin !== undefined && (!wolf.individual || !validMammalOrigin(wolf.origin)))
        return false;
    }
  for (const animal of data.wildlife ?? []) {
    if (animal.mammalId !== undefined && (animal.kind !== 'marmot' || !addId(animal.mammalId)))
      return false;
    if (
      animal.mammalOrigin !== undefined &&
      (!animal.mammalId || !validMammalOrigin(animal.mammalOrigin))
    )
      return false;
  }

  const nurseries = data.mammalNurseries;
  if (nurseries !== undefined && !isRecord(nurseries)) return false;
  const size = data.worldConfig?.size ?? 110;
  for (const [key, state] of Object.entries(nurseries ?? {})) {
    if (!/^(wolf|marmot):\d+$/.test(key) || !isRecord(state) || !validMinute(state.nextAt))
      return false;
    if (!Array.isArray(state.young) || state.young.length > 2) return false;
    const parents = state.parents;
    if ((parents !== undefined || state.young.length) && !validMammalParents(parents)) return false;
    if (state.dueAt !== undefined && (!parents || !validMinute(state.dueAt) || state.young.length))
      return false;
    const wolf = key.startsWith('wolf:');
    for (const young of state.young) {
      if (!isRecord(young) || !addId(young.id)) return false;
      if (
        !validMinute(young.bornAt) ||
        !validMinute(young.lastCare) ||
        !validMinute(young.checkedAt) ||
        young.lastCare < young.bornAt ||
        young.checkedAt < young.lastCare ||
        typeof young.health !== 'number' ||
        !Number.isFinite(young.health) ||
        young.health <= 0 ||
        typeof young.x !== 'number' ||
        !(Math.abs(young.x) <= size) ||
        typeof young.z !== 'number' ||
        !(Math.abs(young.z) <= size)
      )
        return false;
      if (wolf) {
        if (
          young.socialId !== undefined ||
          young.inside !== undefined ||
          (young.denDepth !== undefined &&
            (typeof young.denDepth !== 'number' ||
              !(young.denDepth > 0 && young.denDepth <= DEN_BED)))
        )
          return false;
      } else {
        if (
          young.denDepth !== undefined ||
          (young.inside !== undefined && young.inside !== true) ||
          !positiveId(young.socialId) ||
          socialIds.has(young.socialId) ||
          (young.social !== undefined && !validNurserySocial(young.social))
        )
          return false;
        socialIds.add(young.socialId);
      }
    }
  }
  return true;
}

function validMammalOrigin(value: unknown): boolean {
  return isRecord(value) && validMinute(value.bornAt) && validMammalParents(value.parents);
}

function validMammalParents(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] !== value[1] &&
    value.every((id) => typeof id === 'string' && /^(wildlife|predator|mammal):\d+$/.test(id))
  );
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validMinute(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validNurserySocial(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.trust !== 'number' ||
    !(value.trust >= 0 && value.trust <= 100)
  )
    return false;
  if (value.request !== undefined && value.request !== 'food' && value.request !== 'quiet')
    return false;
  return ['escortUntil', 'lastGreetingAt', 'lastBondAt', 'lastGiftAt', 'lastHelpDay'].every(
    (key) => value[key] === undefined || validMinute(value[key]),
  );
}

function validHabitatSlots(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const slots = new Set<string>();
  for (const animal of value) {
    if (!isRecord(animal) || typeof animal.kind !== 'string') return false;
    if (
      animal.inShelter !== undefined &&
      (animal.inShelter !== true || !isShelteredWildlife(animal.kind))
    )
      return false;
    const slot = animal.habitatSlot;
    if (slot === undefined) continue;
    if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 0) return false;
    const key = `${animal.kind}:${slot}`;
    if (slots.has(key)) return false;
    slots.add(key);
  }
  return true;
}

function validWildlifeShelters(value: unknown, size: number): boolean {
  if (!Array.isArray(value) || value.length > 2048) return false;
  const slots = new Set<string>();
  for (const site of value) {
    if (!isWildlifeShelterSite(site, size)) return false;
    const key = `${site.kind}:${site.slot}`;
    if (slots.has(key)) return false;
    slots.add(key);
  }
  return true;
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
    (value.preview === undefined ||
      (typeof value.preview === 'string' &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.preview))) &&
    typeof value.save === 'object' &&
    value.save !== null
  );
}
