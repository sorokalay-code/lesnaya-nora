import type { UIAction } from '../../types';
import type { ConversationPage, SocialDialog } from '../../ConversationNavigation';
import { RabbitFamily } from '../../../game/session/RabbitFamily';
import { GeneticsPanel } from '../GeneticsPanel';
import { ConversationButton as Button, SectionLink } from './ConversationLayout';

/** Показывает уход за малышом, взрослые беседы и отдельное подтверждение передачи управления. */
export function KitConversationView({
  data,
  page,
  onAction,
}: {
  data: Extract<SocialDialog, { type: 'kit' }>;
  page: ConversationPage;
  onAction: UIAction;
}) {
  const { kit } = data,
    young = kit.age < 3,
    female = RabbitFamily.sex(kit) === 'female';
  const button = (action: string, label: string, primary = false) => (
    <Button key={action} {...{ action, onAction, primary }}>
      {label}
    </Button>
  );
  if (page === 'profile') return <GeneticsPanel data={data.genetics} expanded />;
  if (page === 'succession')
    return (
      <>
        <div className="succession-banner">
          <span>❀</span>
          <h3>Новая героиня — {kit.name}?</h3>
        </div>
        <p className="conversation-note">
          Ты получишь её внешность, гены, здоровье и родословную. Прежняя крольчиха останется
          самостоятельным животным в этом же мире.
        </p>
        <ul className="succession-rules">
          <li>Лес, раскопы, гнёзда, склады и общий багаж сохраняются.</li>
          <li>Пара прежней крольчихи не переходит дочери: ей нужно создать свою семью.</li>
          <li>История линии и поколения продолжаются. Переключение сохранится автоматически.</li>
        </ul>
        {data.succession?.reason && (
          <p className="conversation-warning">{data.succession.reason}</p>
        )}
        <div className="dialog-choices">
          <Button
            action="lineage-switch"
            onAction={onAction}
            primary
            disabled={!data.succession?.available}
          >
            Начать её историю
          </Button>
          {button('dialog-back', 'Остаться текущей героиней')}
        </div>
      </>
    );
  const line =
    data.line ??
    (young
      ? 'Побудь со мной, пожалуйста!'
      : female
        ? 'Как хорошо снова встретиться!'
        : 'Я живу самостоятельно, но всегда рад нашей встрече.');
  return (
    <>
      <p className="speech">«{line}»</p>
      <div className="conversation-badges">
        <span>{data.relationship ?? (young ? 'Твой крольчонок' : 'Твой взрослый ребёнок')}</span>
        <span>{female ? '♀ Девочка' : '♂ Мальчик'}</span>
        <span>♥ {Math.round(kit.health)}%</span>
        <span>✿ {Math.round(kit.hunger)}%</span>
      </div>
      {page === 'care' ? (
        <div className="dialog-choices">
          {button(
            'child-groom',
            'Почистить шерсть · чистота ' + Math.round(100 - (kit.dirtiness ?? 0)) + '%',
          )}
          {young && (
            <>
              {button('child-follow', 'Иди за мной')}
              {button('child-stay', 'Жди здесь')}
              {button('child-rest', 'Отдыхай в гнезде')}
            </>
          )}
        </div>
      ) : page === 'talk' ? (
        <div className="dialog-choices">
          {button('child-news', 'Как твоя самостоятельная жизнь?')}
          {button('child-family', 'Вспомнить наше гнездо')}
        </div>
      ) : (
        <div className="conversation-grid">
          <SectionLink
            page="care"
            icon="✧"
            title="Уход и забота"
            description={young ? 'Чистота, следование и отдых' : 'Помочь с чистотой шерсти'}
            onAction={onAction}
          />
          {!young && (
            <SectionLink
              page="talk"
              icon="☏"
              title="Поговорить"
              description="Новости самостоятельной жизни"
              onAction={onAction}
            />
          )}
          <SectionLink
            page="profile"
            icon="❀"
            title="Гены и родословная"
            description={'Поколение ' + (data.genetics?.generation ?? 1)}
            onAction={onAction}
          />
          {data.succession && (
            <SectionLink
              page="succession"
              icon="♕"
              title="Продолжить линию"
              description="Выбрать игровым персонажем"
              onAction={onAction}
            />
          )}
        </div>
      )}
    </>
  );
}
