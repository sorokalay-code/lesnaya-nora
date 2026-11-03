import { FOOD, type FoodKind } from '../../game/types';
import { ControlGuide } from './ControlGuide';
import { GeneticsPanel } from './GeneticsPanel';
import type { DialogViewModel, UIAction } from '../types';

import type { ReactNode } from 'react';
import { animalNames } from '../../game/animals/names';
const coatName = (coat: string) =>
  ({ cream: 'кремовый', brown: 'каштановый', gray: 'серый', black: 'чёрный', white: 'белый' })[
    coat
  ] ?? coat;
const fmt = Math.round;

function Choice({
  action,
  children,
  onAction,
  primary = false,
  pressed,
}: {
  action: string;
  children: ReactNode;
  onAction: UIAction;
  primary?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      className={primary ? 'primary' : ''}
      data-action={action}
      aria-pressed={pressed}
      onClick={() => onAction(action)}
    >
      {children}
    </button>
  );
}

function Heading({
  eyebrow,
  title,
  onAction,
}: {
  eyebrow: string;
  title: string;
  onAction: UIAction;
}) {
  return (
    <div className="dialog-top">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      <button aria-label="Закрыть" onClick={() => onAction('close')}>
        ×
      </button>
    </div>
  );
}

/** Декларативные окна общения; команды передаются обратно в игровой слой через порт действий. */
export function DialogView({
  data,
  onAction,
  message,
  onMessage,
}: {
  data: DialogViewModel;
  onAction: UIAction;
  message: string;
  onMessage: (value: string) => void;
}) {
  const choice = (action: string, label: string, primary = false) => (
    <Choice key={action} action={action} primary={primary} onAction={onAction}>
      {label}
    </Choice>
  );
  switch (data.type) {
    case 'help':
      return (
        <>
          <Heading eyebrow="СПРАВКА" title="Управление" onAction={onAction} />
          <ControlGuide />
          <p>
            Esc закрывает окно. На телефоне используй джойстик и кнопки, камеру поворачивай свайпом.
          </p>
        </>
      );
    case 'remove':
      return (
        <>
          <Heading
            eyebrow="УБЕЖИЩЕ"
            title={data.kind === 'stash' ? 'Разобрать склад?' : 'Разобрать гнездо?'}
            onAction={onAction}
          />
          <p>
            {data.kind === 'stash'
              ? `Внутри ${data.items} предметов. Склад и его содержимое будут удалены. Сначала забери нужные припасы.`
              : 'Материалы гнезда будут потеряны. Разобрать можно только освобождённое от малышей гнездо.'}
          </p>
          <div className="dialog-actions">
            {choice('cancel-remove', 'Отмена — вернуться в меню')}
            <button
              className="danger-button"
              data-action="confirm-remove"
              onClick={() => onAction('confirm-remove')}
            >
              Разобрать навсегда
            </button>
          </div>
        </>
      );
    case 'self':
      return (
        <>
          <Heading eyebrow="МОЯ КРОЛЬЧИХА" title="Твоя история" onAction={onAction} />
          <GeneticsPanel data={data.genetics} />
          <p className="dialog-meta">
            Окрас: {coatName(data.player.genes.coat)} · возраст {data.player.age.toFixed(1)} игровых
            дней
          </p>
          <div className="gene-list">
            {[
              ['Здоровье', data.player.health],
              ['Силы', data.player.energy],
              ['Сытость', data.player.hunger],
              ['Молоко', data.player.milk],
            ].map(([label, value]) => (
              <span key={label}>
                {label} {fmt(Number(value))}%
              </span>
            ))}
          </div>
          <p className="speech">
            {data.pregnant
              ? 'Ты ждёшь крольчат. Для родов нужно гнездо внутри выкопанной земли.'
              : 'Лес полон тропинок и новых встреч.'}
          </p>
        </>
      );
    case 'mate': {
      const commands = [
        ['follow', 'Иди за мной'],
        ['stay', 'Жди здесь'],
        ['forage', 'Найди припасы для тайника'],
        ['home', 'Вернись домой'],
      ] as const;
      return (
        <>
          <Heading eyebrow="МОЯ СЕМЬЯ" title={data.partner.name} onAction={onAction} />
          <GeneticsPanel data={data.genetics} />
          <p className="dialog-shortcuts">
            1–4 — приказы · Enter — написать · Esc — вернуться в лес
          </p>
          <p className="dialog-meta">
            Партнёр · {data.partner.temperament} · доверие {fmt(data.partner.trust)}/100
          </p>
          <p className="speech">«Я рядом. Скажи, чем помочь нашей семье.»</p>
          <div className="dialog-choices">
            {commands.map(([command, label], index) => (
              <Choice
                key={command}
                action={`mate-command:${command}`}
                onAction={onAction}
                primary={data.command === command}
                pressed={data.command === command}
              >
                <kbd>{index + 1}</kbd> {label}
              </Choice>
            ))}
            {choice('mate-talk', 'Поговорить о семье')}
            {choice(
              'mate-groom',
              `Почистить шерсть · чистота ${Math.round(100 - (data.partner.dirtiness ?? 0))}%`,
            )}
          </div>
          <div className="mate-chat" role="log">
            {data.messages.slice(-6).map((entry, index) => (
              <p key={`${entry.clock}-${index}`}>
                <b>{entry.from === 'player' ? 'Ты' : data.partner.name}:</b> {entry.text}
              </p>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onAction('mate-send');
            }}
          >
            <input
              id="mate-message"
              className="mate-message"
              value={message}
              onChange={(event) => onMessage(event.target.value)}
              maxLength={120}
              placeholder="Написать партнёру..."
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
    }
    case 'partner': {
      const p = data.partner,
        preference = {
          speed: 'быстроту',
          vitality: 'здоровье',
          'rare-coat': 'редкий окрас',
          bond: 'близость и доверие',
        }[p.preference];
      return (
        <>
          <Heading eyebrow="ЛЕСНОЙ РАЗГОВОР" title={p.name} onAction={onAction} />
          <GeneticsPanel data={data.genetics} />
          <p className="speech">
            «
            {data.line ??
              (data.paired
                ? 'Я вернулся домой. Рад тебя видеть!'
                : p.temperament === 'осторожный'
                  ? 'Сначала давай узнаем друг друга получше.'
                  : 'Рад тебя видеть! Что хочешь узнать?')}
            »
          </p>
          <p className="dialog-meta">
            {data.paired ? 'Твой партнёр · ' : ''}
            {p.temperament} крол · семья: {p.familySize} · ценит {preference}
          </p>
          <div className="gene-list">
            <span>Окрас: {coatName(p.genes.coat)}</span>
            <span>Скорость: {'◆'.repeat(p.genes.speed)}</span>
            <span>Здоровье: {'◆'.repeat(p.genes.vitality)}</span>
            <span>Доверие: {fmt(p.trust)}/100</span>
            <span>Совместимость: {fmt(data.score)}/100</span>
          </div>
          <div className="dialog-choices">
            {data.question && (
              <>
                <p className="speech">{data.question.prompt}</p>
                {data.question.choices.map(({ action, label }) => choice(action, label))}
              </>
            )}
            {choice('rabbit-question', 'Теперь твоя очередь: что хочешь спросить?')}
            {choice('ask-home', 'Как живёт твоя семья?')}
            {choice('ask-food', 'Где искать еду и воду?')}
            {choice('ask-danger', 'Чего ты опасаешься?')}
            {choice('compliment', 'Ты мне нравишься')}
            {choice('gift', 'Подарить еду')}
            {choice(
              'court',
              data.paired ? 'Планировать новых крольчат' : 'Предложить создать семью',
              true,
            )}
            {data.paired && (
              <>
                {choice('mate-panel', 'Приказы и сообщения')}
                {choice('divorce', 'Разойтись')}
              </>
            )}
          </div>
        </>
      );
    }
    case 'kit':
      return (
        <>
          <Heading eyebrow="МОЯ СЕМЬЯ" title={data.kit.name} onAction={onAction} />
          <GeneticsPanel data={data.genetics} />
          <p className="speech">
            «
            {data.line ??
              (data.kit.age < 3
                ? 'Мама, побудь со мной!'
                : 'Я уже вырос, но мне всё ещё хорошо рядом с тобой.')}
            »
          </p>
          <p className="dialog-meta">
            {data.kit.age < 3 ? 'Твой крольчонок' : 'Твой взрослый ребёнок · живёт самостоятельно'}{' '}
            · сытость {fmt(data.kit.hunger)}% · здоровье {fmt(data.kit.health)}%
          </p>
          <div className="dialog-choices">
            {choice(
              'child-groom',
              `Почистить шерсть · чистота ${Math.round(100 - (data.kit.dirtiness ?? 0))}%`,
            )}
            {data.kit.age < 3 ? (
              <>
                {choice('child-follow', 'Иди за мной')}
                {choice('child-stay', 'Жди здесь')}
                {choice('child-rest', 'Отдыхай в гнезде')}
              </>
            ) : (
              <>
                {choice('child-news', 'Как твоя самостоятельная жизнь?')}
                {choice('child-family', 'Вспомнить наше гнездо')}
              </>
            )}
          </div>
        </>
      );
    case 'animal':
      return (
        <>
          <Heading eyebrow="ВСТРЕЧА В ЛЕСУ" title={animalNames[data.kind]} onAction={onAction} />
          <p className="speech">
            «
            {data.line ??
              {
                deer: 'Я прислушиваюсь к лесу. Если хрустнет ветка — лучше отойти.',
                squirrel: 'Сегодня ищу орехи и молодые побеги.',
                hedgehog: 'Иду не спеша. Лес большой, торопиться некуда.',
                beaver: 'Вода рядом — значит, дом недалеко.',
                moose: 'Я спокойно пасусь. Не пугай малышей в лесу.',
                boar: 'Под листвой столько вкусного. Я тебя не трону, если ты не нападаешь.',
              }[data.kind]}
            »
          </p>
          <p className="dialog-meta">
            {data.mood} · здоровье {fmt(data.health)}/{fmt(data.maxHealth)} · доверие{' '}
            {fmt(data.trust)}/100
          </p>
          {data.conversation && (
            <>
              <p className="friendship-label">♡ {data.conversation.relationship}</p>
              <p className="dialog-meta">{data.conversation.benefit}</p>
              {data.conversation.question && <p className="speech">{data.conversation.question}</p>}
            </>
          )}
          <div className="dialog-choices">
            {data.conversation?.question ? (
              data.conversation.choices.map(({ action, label }) => choice(action, label))
            ) : (
              <>
                {choice('animal-observe', 'Как проходит твой день?')}
                {choice('animal-question', 'Хочешь о чём-нибудь спросить?')}
                {choice('animal-danger', 'Что тебя тревожит в лесу?')}
                {choice('animal-path', 'Покажи место с едой на карте')}
                {choice(
                  'animal-food',
                  data.kind === 'beaver' ? 'Подарить веточку' : 'Угостить едой',
                )}
                {choice('animal-help', 'Попросить припас у друга')}
              </>
            )}
          </div>
          <small className="dialog-meta">
            Лес живёт, но во время разговора животные не нападают. Esc — закончить беседу.
          </small>
        </>
      );
    case 'bag':
      return (
        <>
          <Heading eyebrow="МОИ ЗАПАСЫ" title="Еда и багаж" onAction={onAction} />
          <p className="dialog-meta">
            Выбирай пищу внимательно. Лишнее можно выбросить и подобрать снова.
          </p>
          <div className="dialog-choices">
            {(Object.keys(FOOD) as FoodKind[])
              .filter((kind) => data.inventory[kind] > 0)
              .flatMap((kind) => [
                choice(
                  `consume:${kind}`,
                  `${FOOD[kind].emoji} Съесть ${FOOD[kind].label.toLowerCase()} · ${data.inventory[kind]}`,
                ),
                choice(`drop:${kind}`, `↘ Выбросить ${FOOD[kind].label.toLowerCase()} · 1 шт.`),
              ])}
            {(['grass', 'twigs', 'fur'] as const)
              .filter((kind) => data.materials[kind] > 0)
              .map((kind) =>
                choice(
                  `drop-material:${kind}`,
                  `↘ Выбросить ${kind === 'twigs' ? 'ветку' : kind === 'fur' ? 'пух' : 'траву'} · ${data.materials[kind]}`,
                ),
              )}
            {(Object.keys(FOOD) as FoodKind[])
              .filter((kind) => (data.stored[kind] ?? 0) > 0)
              .map((kind) =>
                choice(
                  `consume-stash:${kind}`,
                  `${FOOD[kind].emoji} ${FOOD[kind].label} · из тайника ${data.stored[kind]}`,
                ),
              )}
          </div>
        </>
      );
  }
}
