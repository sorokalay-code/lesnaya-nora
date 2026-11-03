import type { UIAction } from '../../types';
import type { ConversationPage, SocialDialog } from '../../ConversationNavigation';
import { ConversationButton as Button, SectionLink } from './ConversationLayout';
import type { WildlifeKind } from '../../../game/animals';

const greetings: Record<WildlifeKind, string> = {
  deer: 'Я прислушиваюсь к лесу. Если хрустнет ветка — лучше отойти.',
  squirrel: 'Сегодня ищу орехи и молодые побеги.',
  hedgehog: 'Иду не спеша. Лес большой, торопиться некуда.',
  beaver: 'Вода рядом — значит, дом недалеко.',
  moose: 'Я спокойно пасусь. Не пугай малышей в лесу.',
  boar: 'Под листвой столько вкусного. Я тебя не трону, если ты не нападаешь.',
};

/** Разводит лесные вопросы, дружбу и сведения о здоровье по самостоятельным экранам. */
export function ForestConversationView({
  data,
  page,
  onAction,
}: {
  data: Extract<SocialDialog, { type: 'animal' }>;
  page: ConversationPage;
  onAction: UIAction;
}) {
  const button = (action: string, label: string) => (
    <Button key={action} {...{ action, onAction }}>
      {label}
    </Button>
  );
  return (
    <>
      <p className="speech">«{data.line ?? greetings[data.kind]}»</p>
      {page === 'profile' ? (
        <>
          <div className="conversation-badges">
            <span>{data.mood}</span>
            <span>
              ♥ {Math.round(data.health)}/{Math.round(data.maxHealth)}
            </span>
            <span>♡ Доверие {Math.round(data.trust)}/100</span>
          </div>
          <p className="conversation-note">
            {data.conversation?.benefit ?? 'Знакомься, помогай и укрепляй дружбу.'}
          </p>
        </>
      ) : page === 'talk' ? (
        <div className="dialog-choices">
          {data.conversation?.question ? (
            <>
              <p className="conversation-question">{data.conversation.question}</p>
              {data.conversation.choices.map((c) => button(c.action, c.label))}
            </>
          ) : (
            <>
              {button('animal-observe', 'Как проходит твой день?')}
              {button('animal-question', 'Хочешь о чём-нибудь спросить?')}
              {button('animal-danger', 'Что тебя тревожит в лесу?')}
            </>
          )}
        </div>
      ) : page === 'relationship' ? (
        <>
          <p className="friendship-label">♡ {data.conversation?.relationship ?? 'Знакомство'}</p>
          <p className="conversation-note">{data.conversation?.benefit}</p>
          <div className="dialog-choices">
            {button('animal-food', data.kind === 'beaver' ? 'Подарить веточку' : 'Угостить едой')}
            {button('animal-help', 'Попросить припас у друга')}
            {button('animal-path', 'Покажи место с едой на карте')}
          </div>
        </>
      ) : (
        <>
          <div className="conversation-badges">
            <span>{data.mood}</span>
            <span>♡ Доверие {Math.round(data.trust)}/100</span>
          </div>
          <div className="conversation-grid">
            <SectionLink
              page="talk"
              icon="☏"
              title="Поговорить"
              description={
                data.conversation?.question
                  ? 'Тебя о чём-то спрашивают'
                  : 'Вопросы и лесные новости'
              }
              onAction={onAction}
            />
            <SectionLink
              page="relationship"
              icon="♡"
              title="Дружба и помощь"
              description="Подарки, припасы и места на карте"
              onAction={onAction}
            />
            <SectionLink
              page="profile"
              icon="❧"
              title="О животном"
              description="Самочувствие и доверие"
              onAction={onAction}
            />
          </div>
        </>
      )}
    </>
  );
}
