import type { UIAction } from '../../types';
import type { ConversationPage, SocialDialog } from '../../ConversationNavigation';
import { GeneticsPanel } from '../GeneticsPanel';
import { ConversationButton as Button, SectionLink } from './ConversationLayout';

type RabbitDialog = Extract<SocialDialog, { type: 'partner' | 'mate' }>;

/** Разделяет разговор с кролом, отношения пары, приказы и переписку на короткие экраны. */
export function RabbitConversationView({
  data,
  page,
  onAction,
  message,
  onMessage,
}: {
  data: RabbitDialog;
  page: ConversationPage;
  onAction: UIAction;
  message: string;
  onMessage: (value: string) => void;
}) {
  const p = data.partner,
    mate = data.type === 'mate';
  const button = (action: string, label: string, primary = false) => (
    <Button key={action} action={action} onAction={onAction} primary={primary}>
      {label}
    </Button>
  );
  const link = (page: ConversationPage, icon: string, title: string, description: string) => (
    <SectionLink key={page} {...{ page, icon, title, description, onAction }} />
  );
  if (page === 'profile') return <GeneticsPanel data={data.genetics} expanded />;
  if (mate && page === 'commands')
    return (
      <>
        <p className="conversation-note">Задание останется активным после закрытия окна.</p>
        <div className="dialog-choices">
          {(
            [
              ['follow', 'Иди за мной'],
              ['stay', 'Жди здесь'],
              ['forage', 'Найди припасы для тайника'],
              ['home', 'Вернись домой'],
            ] as const
          ).map(([command, label], i) => (
            <button
              key={command}
              data-action={'mate-command:' + command}
              aria-pressed={data.command === command}
              className={data.command === command ? 'primary' : ''}
              onClick={() => onAction('mate-command:' + command)}
            >
              <kbd>{i + 1}</kbd> {label}
              {data.command === command ? ' · сейчас' : ''}
            </button>
          ))}
        </div>
      </>
    );
  if (mate && page === 'care')
    return (
      <>
        <p className="conversation-note">Для ухода нужно быть рядом с партнёром.</p>
        <div className="dialog-choices">
          {button(
            'mate-groom',
            'Почистить шерсть · чистота ' + Math.round(100 - (p.dirtiness ?? 0)) + '%',
          )}
        </div>
      </>
    );
  if (mate && page === 'chat')
    return (
      <>
        <div className="mate-chat" role="log" aria-label="Переписка с партнёром">
          {!data.messages.length && <p>Здесь появится ваша переписка.</p>}
          {data.messages.slice(-12).map((entry, i) => (
            <p key={entry.clock + '-' + i}>
              <b>{entry.from === 'player' ? 'Ты' : p.name}:</b> {entry.text}
            </p>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAction('mate-send');
          }}
        >
          <label className="conversation-input-label" htmlFor="mate-message">
            Твоё сообщение
          </label>
          <input
            id="mate-message"
            className="mate-message"
            value={message}
            onChange={(e) => onMessage(e.target.value)}
            maxLength={120}
            placeholder="Написать партнёру…"
            aria-label="Сообщение партнёру"
          />
          <div className="dialog-choices">
            <button type="submit" data-action="mate-send">
              Передать сообщение ↵ Enter
            </button>
          </div>
        </form>
      </>
    );
  if (!mate && page === 'relationship')
    return (
      <>
        <div className="conversation-badges">
          <span>♡ Доверие {Math.round(p.trust)}/100</span>
          <span>✦ Совместимость {Math.round(data.score)}/100</span>
        </div>
        <p className="conversation-note">
          {p.temperament} крол. Ценит{' '}
          {
            {
              speed: 'быстроту',
              vitality: 'здоровье',
              'rare-coat': 'редкий окрас',
              bond: 'близость и доверие',
            }[p.preference]
          }
          .
        </p>
        <div className="dialog-choices">
          {button('compliment', 'Ты мне нравишься')}
          {button('gift', 'Подарить еду')}
          {button(
            'court',
            data.paired ? 'Планировать новых крольчат' : 'Предложить создать семью',
            true,
          )}
          {data.paired && (
            <>
              {button('mate-panel', 'Приказы и сообщения')}
              <div className="conversation-danger">{button('divorce', 'Разойтись')}</div>
            </>
          )}
        </div>
        {data.genetics?.risk !== undefined && (
          <p className="genetic-risk">
            Риск мутации потомства: {data.genetics.risk}%.
            {data.genetics.related && ' Есть близкое родство — риск повышен.'} Подробности — в
            разделе «Гены и родословная».
          </p>
        )}
      </>
    );
  const line = mate
    ? 'Я рядом. Скажи, чем помочь нашей семье.'
    : (data.line ??
      (data.paired
        ? 'Я вернулся домой. Рад тебя видеть!'
        : p.temperament === 'осторожный'
          ? 'Сначала давай узнаем друг друга получше.'
          : 'Рад тебя видеть! О чём поговорим?'));
  return (
    <>
      <p className="speech">«{line}»</p>
      {page === 'talk' && !mate ? (
        <div className="dialog-choices">
          {data.question && (
            <>
              <p className="conversation-question">{data.question.prompt}</p>
              {data.question.choices.map((c) => button(c.action, c.label))}
            </>
          )}
          {button('rabbit-question', 'Теперь твоя очередь: что хочешь спросить?')}
          {button('ask-home', 'Как живёт твоя семья?')}
          {button('ask-food', 'Где искать еду и воду?')}
          {button('ask-danger', 'Чего ты опасаешься?')}
        </div>
      ) : (
        <>
          <div className="conversation-badges">
            <span>♡ Доверие {Math.round(p.trust)}/100</span>
            <span>{p.temperament}</span>
            {mate && <span>Твой партнёр</span>}
          </div>
          <div className="conversation-grid">
            {mate ? (
              <>
                {link('commands', '➜', 'Приказы', 'Следовать, ждать, приносить припасы')}
                {link('chat', '✉', 'Сообщения', 'Личная переписка')}
                {link('care', '✧', 'Уход', 'Помочь с чистотой шерсти')}
              </>
            ) : (
              <>
                {link(
                  'talk',
                  '☏',
                  'Поговорить',
                  data.question ? 'У него есть вопрос к тебе' : 'Семья, еда и лесные новости',
                )}
                {link('relationship', '♡', 'Отношения', 'Подарки, совместимость и семья')}
              </>
            )}
            {link('profile', '❀', 'Гены и родословная', 'Особенности и известные предки')}
          </div>
          {mate && (
            <div className="dialog-choices">{button('mate-talk', 'Поговорить о семье')}</div>
          )}
        </>
      )}
    </>
  );
}
