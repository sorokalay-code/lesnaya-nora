import type { DialogViewModel } from './types';

export type ConversationPage =
  'overview' | 'talk' | 'profile' | 'care' | 'commands' | 'chat' | 'relationship' | 'succession';
export type SocialDialog = Extract<
  DialogViewModel,
  { type: 'partner' | 'mate' | 'kit' | 'animal' }
>;

/** Задаёт доступные разделы общения и устойчивую идентичность собеседника для обновлений ответа. */
export class ConversationNavigation {
  static subject(data?: DialogViewModel): string {
    if (!data) return '';
    if (data.type === 'partner' || data.type === 'mate') return data.type + ':' + data.partner.id;
    if (data.type === 'kit') return 'kit:' + data.kit.id;
    if (data.type === 'animal') return 'animal:' + (data.id ?? data.kind);
    return data.type;
  }

  static allows(data: DialogViewModel, page: string): page is ConversationPage {
    const pages: Record<SocialDialog['type'], readonly ConversationPage[]> = {
      partner: ['overview', 'talk', 'profile', 'relationship'],
      mate: ['overview', 'talk', 'profile', 'commands', 'care', 'chat'],
      kit: [
        'overview',
        'talk',
        'profile',
        'care',
        ...(data.type === 'kit' && data.succession ? ['succession' as const] : []),
      ],
      animal: ['overview', 'talk', 'profile', 'relationship'],
    };
    return data.type in pages && pages[data.type as SocialDialog['type']].some((p) => p === page);
  }
}
