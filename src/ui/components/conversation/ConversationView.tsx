import type { UIAction } from '../../types';
import type { ConversationPage, SocialDialog } from '../../ConversationNavigation';
import { animalNames } from '../../../game/animals/names';
import { ConversationLayout } from './ConversationLayout';
import { RabbitConversationView } from './RabbitConversationView';
import { KitConversationView } from './KitConversationView';
import { ForestConversationView } from './ForestConversationView';

/** Маршрутизирует типизированный снимок беседы к отдельному представлению вида собеседника. */
export function ConversationView({
  data,
  page,
  onAction,
  message,
  onMessage,
}: {
  data: SocialDialog;
  page: ConversationPage;
  onAction: UIAction;
  message: string;
  onMessage: (value: string) => void;
}) {
  const title =
    data.type === 'animal'
      ? animalNames[data.kind]
      : data.type === 'kit'
        ? data.kit.name
        : data.partner.name;
  const subtitle =
    data.type === 'animal'
      ? 'ВСТРЕЧА В ЛЕСУ'
      : data.type === 'partner'
        ? 'ЛЕСНОЙ РАЗГОВОР'
        : 'МОЯ СЕМЬЯ';
  return (
    <ConversationLayout {...{ title, subtitle, page, onAction }}>
      {data.type === 'animal' ? (
        <ForestConversationView {...{ data, page, onAction }} />
      ) : data.type === 'kit' ? (
        <KitConversationView {...{ data, page, onAction }} />
      ) : (
        <RabbitConversationView {...{ data, page, onAction, message, onMessage }} />
      )}
    </ConversationLayout>
  );
}
