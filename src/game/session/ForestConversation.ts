import type { ForestAnimal } from '../animals';
import { animalNames } from '../animals/names';
import { FOOD, type FoodKind, type SaveData } from '../types';
import type { World } from '../World';
import { FRIENDSHIP_TRUST } from '../Friendship';
import { SeasonSystem } from '../systems/SeasonSystem';

export interface ConversationTurn {
  question?: string;
  choices: { action: string; label: string }[];
  relationship: string;
  benefit: string;
}

const interests = {
  bear: 'Я ищу ягоды в лесу.',
  duck: 'Мне нравится у тихого берега.',
  mouse: 'Я ищу семена среди травы.',
  fish: 'Здесь спокойно под водой.',
  boar: 'Я ищу корм под листвой. Пройдёшь тихо, не разбрасывая мои находки?',
  deer: 'Я люблю тихие тропы. Как ты ведёшь себя, когда слышишь шорох?',
  moose: 'Малыши пугаются резких движений. Как нам пройти рядом с твоей семьёй?',
  squirrel: 'Я собираю припасы. Поделишься клевером или морковкой?',
  hedgehog: 'После долгой прогулки я проголодался. У тебя есть безопасное угощение?',
  beaver: 'Чиню дом у воды. Не найдётся ли у тебя лишней веточки?',
};

/** Ветвящиеся разговоры, просьбы и польза дружбы; награды ограничены игровым временем. */
export class ForestConversation {
  private readonly seasons: SeasonSystem;

  constructor(
    private readonly save: SaveData,
    private readonly world: World,
  ) {
    this.seasons = new SeasonSystem(save.seed, save.worldConfig?.seasonLengths);
  }

  view(animal: ForestAnimal): ConversationTurn {
    const question = animal.social.request ? interests[animal.kind] : undefined;
    const choices = !question
      ? []
      : animal.social.request === 'quiet'
        ? [
            { action: 'animal-answer-quiet', label: 'Пойдём тихо, я не буду пугать малышей' },
            { action: 'animal-answer-rush', label: 'Лучше сразу побежать изо всех сил' },
            { action: 'animal-answer-later', label: 'Поговорим об этом позже' },
          ]
        : [
            {
              action: 'animal-food',
              label: animal.kind === 'beaver' ? 'Поделиться веткой' : 'Поделиться безопасной едой',
            },
            { action: 'animal-answer-later', label: 'Сейчас нет, вернусь с припасами' },
          ];
    return {
      question,
      choices,
      relationship:
        animal.trust >= FRIENDSHIP_TRUST ? 'Друг' : animal.trust >= 25 ? 'Знакомый' : 'Незнакомец',
      benefit:
        animal.trust >= FRIENDSHIP_TRUST
          ? 'Друг предупредит о близком хищнике и поделится припасом раз в игровой день.'
          : animal.trust >= 25
            ? 'Знакомый может отметить съедобные растения на карте. Дружба — при 100 доверия.'
            : 'Узнавайте друг друга: беседы, уважительные ответы и угощения повышают доверие.',
    };
  }

  respond(animal: ForestAnimal, action: string): string {
    if (action === 'animal-question') {
      animal.social.request = animal.kind === 'deer' || animal.kind === 'moose' ? 'quiet' : 'food';
      return 'Хорошо, давай познакомимся поближе. У меня тоже есть вопрос к тебе.';
    }
    if (action === 'animal-answer-later') {
      animal.social.request = undefined;
      return 'Хорошо, не торопись. Я рад, что ты прислушиваешься ко мне.';
    }
    if (action === 'animal-answer-quiet' || action === 'animal-answer-rush') {
      if (animal.social.request !== 'quiet') return 'Давай сначала выслушаем друг друга.';
      animal.social.request = undefined;
      if (action === 'animal-answer-rush') {
        animal.befriend(-3);
        return 'От бега и шума становится тревожно. Лучше сначала прислушаться и выбрать укрытие.';
      }
      const changed = this.bond(animal, 12);
      return changed
        ? 'Спасибо! Рядом с тобой спокойно. Если замечу опасность, обязательно предупрежу.'
        : 'Я помню наш разговор. Давай ещё погуляем, прежде чем снова обсуждать это.';
    }
    if (action === 'animal-food') return this.gift(animal);
    if (action === 'animal-help') return this.help(animal);
    if (action === 'animal-path') return this.discover(animal);
    if (action === 'animal-danger') {
      this.bond(animal, 4);
      return animal.kind === 'deer' || animal.kind === 'moose'
        ? 'В поле смотри в небо, а вечером — на опушку. Когда мы подружимся, я буду предупреждать тебя о хищниках рядом.'
        : 'Под деревьями спокойнее. Следи за запахом и не оставляй отходы у гнезда.';
    }
    this.bond(animal, 6);
    return animal.health < animal.maxHealth * 0.45
      ? 'Я поранился и сейчас берегу силы. Спасибо, что остановилась рядом.'
      : this.save.weather === 'rain'
        ? 'Дождь смывает запахи. После него так хорошо пахнут молодые побеги! А как поживает твоя семья?'
        : this.seasons.name(this.save.day) === 'Зима'
          ? 'Зимой особенно ценю тех, кто делится запасами. Твоя семья подготовилась к холодам?'
          : `${animalNames[animal.kind]} тихо приветствует тебя. Сегодня ищу еду и спокойное место для отдыха. Как хорошо встретить знакомого!`;
  }

  private bond(animal: ForestAnimal, amount: number): boolean {
    if (this.save.clock - (animal.social.lastBondAt ?? -Infinity) < 120) return false;
    animal.social.lastBondAt = this.save.clock;
    animal.befriend(amount);
    return true;
  }

  private gift(animal: ForestAnimal): string {
    if (this.save.clock - (animal.social.lastGiftAt ?? -Infinity) < 180)
      return 'Спасибо, мне пока хватит. Давай просто побудем рядом.';
    if (animal.kind === 'beaver') {
      if (this.save.materials.twigs < 1)
        return 'Для моего дома нужна веточка. Они лежат под деревьями.';
      this.save.materials.twigs--;
    } else {
      const kind = (['clover', 'carrot', 'cabbage'] as FoodKind[]).find(
        (food) => this.save.inventory[food] > 0,
      );
      if (!kind) return 'У тебя нет подходящей еды. Принеси клевер, морковь или капусту.';
      this.save.inventory[kind]--;
    }
    animal.social.lastGiftAt = this.save.clock;
    animal.befriend(animal.social.request === 'food' ? 28 : 20);
    animal.social.request = undefined;
    return animal.trust >= FRIENDSHIP_TRUST
      ? 'Спасибо! Теперь я считаю тебя другом. Можешь попросить помощи, и я предупрежу тебя об опасности.'
      : 'Спасибо за заботу! Я запомню тебя. Приходи ещё, когда снова отправишься гулять.';
  }

  private discover(animal: ForestAnimal): string {
    if (animal.trust < 25)
      return 'Мы пока мало знакомы. Давай сначала поговорим или поделимся припасами.';
    const food = this.world.resources
      .filter((resource) => resource.available && FOOD[resource.kind].poisonRisk <= 0.04)
      .sort(
        (a, b) =>
          Math.hypot(a.x - animal.x, a.z - animal.z) - Math.hypot(b.x - animal.x, b.z - animal.z),
      )[0];
    if (!food) return 'Сейчас я не знаю, где осталась еда. Проверь лес позже: растения отрастают.';
    const discoveries = (this.save.discoveries ??= []);
    const label = `Друг: ${FOOD[food.kind].label}`;
    if (!discoveries.some((point) => point.x === food.x && point.z === food.z)) {
      discoveries.push({ x: food.x, z: food.z, label });
      if (discoveries.length > 12) discoveries.shift();
    }
    return `Я отметил на карте место, где растёт ${FOOD[food.kind].label.toLowerCase()}. Нажми M или открой карту в меню. Другие животные тоже могут съесть растения.`;
  }

  private help(animal: ForestAnimal): string {
    if (animal.trust < FRIENDSHIP_TRUST)
      return 'Мне нужно узнать тебя получше. Друзьями становимся при 100 доверия.';
    if (animal.social.lastHelpDay === this.save.day)
      return 'Сегодня я уже поделился запасами. Загляни в другой игровой день.';
    if (animal.kind === 'beaver') this.save.materials.twigs++;
    else {
      if (Object.values(this.save.inventory).reduce((sum, count) => sum + count, 0) >= 18)
        return 'Твой багаж полон. Освободи место, и я поделюсь.';
      this.save.inventory.clover++;
    }
    animal.social.lastHelpDay = this.save.day;
    return animal.kind === 'beaver'
      ? 'Возьми веточку для своего гнезда. Рад помочь другу!'
      : 'Я оставил для тебя немного клевера. Позаботься о себе и о малышах!';
  }
}
