import { FOOD, type FoodKind } from '../../game/types';
import { ControlGuide } from './ControlGuide';
import { GeneticsPanel } from './GeneticsPanel';
import type { DialogViewModel, UIAction } from '../types';

import type { ReactNode } from 'react';
import { ConversationView } from './conversation/ConversationView';
import type { ConversationPage } from '../ConversationNavigation';
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
  page = 'overview',
}: {
  data: DialogViewModel;
  page?: ConversationPage;
  onAction: UIAction;
  message: string;
  onMessage: (value: string) => void;
}) {
  if (
    data.type === 'mate' ||
    data.type === 'partner' ||
    data.type === 'kit' ||
    data.type === 'animal'
  )
    return <ConversationView {...{ data, page, onAction, message, onMessage }} />;
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
