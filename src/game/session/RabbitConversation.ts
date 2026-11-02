import type { PartnerTraits, SaveData } from '../types';

export interface DialogQuestion {
  prompt: string;
  choices: { action: string; label: string }[];
}

/** Вопросы кролов зависят от характера; доверие от ответов нельзя наращивать повторными кликами. */
export class RabbitConversation {
  private asking?: number;

  constructor(private readonly save: SaveData) {}

  ask(partner: PartnerTraits): void {
    this.asking = partner.id;
  }

  question(partner: PartnerTraits): DialogQuestion | undefined {
    if (this.asking !== partner.id) return;
    const prompt = {
      заботливый: 'Что для тебя самое важное, когда малыши проголодались?',
      осторожный: 'Незнакомец спрашивает, где твоё гнездо. Что ты ответишь?',
      смелый: 'У опушки показалась лиса. Как мы защитим семью?',
      любопытный: 'Хочется найти новую тропу. Как отправимся исследовать лес?',
    }[partner.temperament];
    return {
      prompt,
      choices: [
        {
          action: 'rabbit-answer-care',
          label: {
            заботливый: 'Сначала поем сама, накоплю молоко и покормлю малышей',
            осторожный: 'Сначала познакомлюсь; местоположение гнезда сохраню в секрете',
            смелый: 'Уведём малышей в глубокий ход и переждём',
            любопытный: 'Осмотримся вместе и запомним дорогу домой',
          }[partner.temperament],
        },
        {
          action: 'rabbit-answer-risk',
          label: {
            заботливый: 'Пусть сами поищут еду далеко от гнезда',
            осторожный: 'Сразу покажу всё гнездо любому встречному',
            смелый: 'Попробуем прогнать лису в открытом поле',
            любопытный: 'Побежим куда глаза глядят, без припасов',
          }[partner.temperament],
        },
        { action: 'rabbit-answer-listen', label: 'А как бы ты поступил?' },
      ],
    };
  }

  answer(partner: PartnerTraits, action: string): string {
    if (this.asking !== partner.id) return 'Давай сначала выслушаем вопрос друг друга.';
    this.asking = undefined;
    if (action === 'rabbit-answer-risk') {
      partner.trust = Math.max(0, partner.trust - 3);
      return 'Я бы не стал так рисковать. Мне спокойнее, когда мы заботимся о безопасности семьи.';
    }
    const rewarded = this.save.clock - (partner.lastConversationAt ?? -Infinity) >= 120;
    if (rewarded) {
      partner.lastConversationAt = this.save.clock;
      partner.trust = Math.min(100, partner.trust + (action === 'rabbit-answer-care' ? 10 : 5));
    }
    return action === 'rabbit-answer-listen'
      ? 'Я сначала прислушался бы к лесу, позаботился о малышах и выбрал дорогу рядом с укрытием. А потом можно идти вместе.'
      : rewarded
        ? 'Мне близок твой ответ. С тобой я чувствую, что мы можем позаботиться друг о друге.'
        : 'Я помню твой ответ. Давай вернёмся к разговору после прогулки.';
  }
}
