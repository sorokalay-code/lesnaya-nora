import { nestHasKits, stashItemCount } from '../../game/session/ShelterController';
import type { NestData } from '../../game/types';
import type { ForestAnimal } from '../../game/animals';
import { animalNames } from '../../game/animals/names';
import type { Excavation } from '../../game/Excavation';
import { FamilyCare, GESTATION_DAYS } from '../../game/FamilyCare';
import { RabbitFamily } from '../../game/session/RabbitFamily';
import type { GroundPickup } from '../../game/GroundItems';
import type { FoodStore, SeasonSystem } from '../../game/systems';
import {
  FOOD,
  type FoodKind,
  type KitData,
  type PartnerTraits,
  type SaveData,
  type StashData,
} from '../../game/types';
import type { Resource, World } from '../../game/World';
import type { HudView, PromptPart } from '../types';
import { SWIM_DEPTH } from '../../game/WaterNavigation';
import { atUndergroundNest } from '../../game/NestBedding';

/** Преобразует изменяемые игровые данные в независимый снимок для React-интерфейса. */
export class HudPresenter {
  build(
    save: SaveData,
    world: World,
    earth: Excavation,
    firstPerson: boolean,
    store: FoodStore,
    seasons: SeasonSystem,
    air: number,
    threat: number,
    partner?: PartnerTraits,
    resource?: Resource,
    stash?: StashData,
    child?: KitData,
    animal?: ForestAnimal,
    item?: GroundPickup,
    nest?: NestData,
  ): HudView {
    const p = save.player,
      underground = earth.isSheltered(p.x, p.y, p.z),
      young = save.kits.filter((k) => k.alive && k.age < 3),
      mate = save.partners.find((p) => p.id === save.mateId);
    const minutes = Math.floor(save.clock % 1440),
      hour = minutes / 60,
      clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const daypart =
      hour < 5 || hour >= 21 ? 'Ночь' : hour < 10 ? 'Утро' : hour < 17 ? 'День' : 'Вечер';
    const weather = { clear: '☀ Ясно', rain: '☂ Дождь', mist: '☁ Туман', snow: '❄ Снег' }[
      save.weather
    ];
    const biome = underground
      ? `Под землёй · ${Math.round(earth.depthAt(p.x, p.y, p.z))} м`
      : { forest: 'Лес', meadow: 'Луг', swamp: 'Болото', garden: 'Огород' }[
          world.biomeAt(p.x, p.z)
        ];
    const swimming = !underground && (world.waterAt?.(p.x, p.z)?.depth ?? 0) > SWIM_DEPTH;
    const insideNest = !!nest && underground && atUndergroundNest(earth, p, nest);
    const dig: PromptPart = swimming
      ? { text: 'Плыви к берегу · в воде нельзя прыгать и копать' }
      : firstPerson
        ? { text: 'ЛКМ — копать по прицелу · удерживай для продолжения' }
        : { key: 'B', text: 'Переключись на вид от первого лица для копания' };
    let prompt: PromptPart[];
    if (underground) {
      const root = world.rootAt(p.x, p.z, earth.depthAt(p.x, p.y, p.z));
      prompt = [dig, { text: 'Иди по склону' }];
      if (earth.moistureAt(p) === 'damp')
        prompt.push({ text: 'Сырой грунт · согревание медленнее' });
      if (firstPerson) prompt.push({ key: ']', text: 'Копать вверх' });
      if (insideNest && young.length) prompt.push({ key: 'F', text: 'Кормить из гнезда' });
      if (root?.available && (!('mesh' in root) || root.mesh.visible)) {
        prompt.push({ key: 'Q', text: 'Грызть корень' });
        if (!('tree' in root)) prompt.push({ key: 'T', text: 'Унести растение' });
      }

      if (stash) prompt.push({ key: 'K/O', text: 'Тайник' });
    } else if (child) prompt = [{ key: 'E', text: `Поговорить: ${child.name}` }];
    else if (partner) prompt = [{ key: 'E', text: `Поговорить: ${partner.name}` }];
    else if (animal) prompt = [{ key: 'E', text: `Пообщаться: ${animalNames[animal.kind]}` }];
    else if (item)
      prompt = [
        {
          key: 'E',
          text: `Подобрать: ${item.kind === 'branch' || item.kind === 'twigs' ? 'ветка' : item.kind === 'grass' ? 'трава' : item.kind === 'fur' ? 'пух' : FOOD[item.kind].label}`,
        },
      ];
    else if (resource) prompt = [{ key: 'E', text: `Собрать: ${FOOD[resource.kind].label}` }];
    else {
      prompt = [dig];
      if (stash) prompt.push({ key: 'K/O', text: 'Тайник' });
      if (world.nearWater(p.x, p.z)) prompt.push({ key: 'V', text: 'Пить воду' });
    }

    const bar = (label: string, value: number, color: string, icon: string) => ({
      label,
      value,
      color,
      icon,
    });
    return {
      playerName: p.name,
      familyCount: save.kits.filter((k) => k.alive && k.health > 0).length,
      lineageMembers: save.kits
        .filter((k) => k.alive && k.health > 0 && k.age >= 3 && RabbitFamily.sex(k) === 'female')
        .map((k) => ({
          id: k.id,
          name: k.name,
          relationship: RabbitFamily.relationship(save, k),
          generation: k.lineage?.generation ?? 1,
        })),
      nearbyShelter: {
        stash: stash ? { items: stashItemCount(stash) } : undefined,
        nest: nest
          ? { occupied: nestHasKits(save, nest), inside: insideNest, insulated: nest.insulated }
          : undefined,
      },
      underground,
      status: underground ? '● ПОД ЗЕМЛЁЙ' : threat < 8 ? '● ОПАСНОСТЬ' : '● В ЛЕСУ',
      bars: [
        bar('Сытость', p.hunger, '#bdcf79', '✿'),
        bar('Жажда', p.thirst, '#93bcca', '◈'),
        bar('Силы', p.energy, '#93c5ab', '◆'),
        bar('Здоровье', p.health, '#dc9f9a', '♥'),
        bar('Моча L', p.bladder, '#c7a8cc', '◌'),
        bar('Помёт P', p.bowel, '#bba586', '●'),
        bar('Чистота', 100 - p.dirtiness, '#e4c894', '✧'),
        ...(p.poison > 1 ? [bar('Отравление', p.poison, '#b47b9c', '☠')] : []),
      ],
      temperature: p.bodyTemp,
      inventory: (Object.keys(FOOD) as FoodKind[])
        .filter((kind) => save.inventory[kind] > 0)
        .map((kind) => ({ kind, ...FOOD[kind], count: save.inventory[kind] })),
      carried: store.carried(),
      capacity: store.capacity,
      milk: p.milk,
      materials: { ...save.materials },
      mate: mate ? { name: mate.name } : undefined,
      young: young.map((kit) => {
        const growth = FamilyCare.growth(kit);
        return {
          id: kit.id,
          name: kit.name,
          progress: growth.progress,
          daysLeft: growth.daysLeft,
          hunger: kit.hunger,
          care: kit.hunger >= 70 ? 'сыт' : `подкорми: ${growth.feedsNeeded} раз · ${growth.food}`,
        };
      }),
      familyText: young.length
        ? `${young.length} малышей нуждаются в заботе`
        : mate
          ? 'Партнёр помогает семье и приносит припасы'
          : 'Найди партнёра и создай семью',
      grown: save.stats.grown,
      nests: save.nests.length,
      pregnancyProgress: save.pregnancy
        ? Math.min(100, Math.round((save.pregnancy.progress / GESTATION_DAYS) * 100))
        : undefined,
      birthWarning: !!save.pregnancy?.warned,
      worldInfo: [
        `◷ День ${save.day} · ${clock} · ${daypart}`,
        `✿ ${seasons.name(save.day)}`,
        `${weather} · ${Math.round(air)}°C`,
        `⌁ ${biome}`,
      ],
      prompt,
    };
  }
}
