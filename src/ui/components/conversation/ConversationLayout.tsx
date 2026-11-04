import { Button } from '../../kit';
import type { ReactNode } from 'react';
import type { UIAction } from '../../types';
import type { ConversationPage } from '../../ConversationNavigation';

export function SectionLink({
  page,
  icon,
  title,
  description,
  onAction,
}: {
  page: ConversationPage;
  icon: string;
  title: string;
  description: string;
  onAction: UIAction;
}) {
  return (
    <Button
      className={'conversation-link tone-' + page}
      onClick={() => onAction('dialog-page:' + page)}
    >
      <span className="conversation-link-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <b>{title}</b>
        <small>{description}</small>
      </span>
      <span aria-hidden="true">›</span>
    </Button>
  );
}

/** Общая оболочка компактной беседы: заголовок и возврат остаются доступны при прокрутке. */
export function ConversationLayout({
  title,
  subtitle,
  page,
  onAction,
  children,
}: {
  title: string;
  subtitle: string;
  page: ConversationPage;
  onAction: UIAction;
  children: ReactNode;
}) {
  const labels: Record<ConversationPage, string> = {
    overview: 'Знакомство',
    talk: 'Беседа',
    profile: 'Профиль и родословная',
    care: 'Уход',
    commands: 'Приказы',
    chat: 'Сообщения',
    relationship: 'Отношения',
    succession: 'Продолжение линии',
  };
  return (
    <article className="conversation">
      <div className="conversation-top">
        <header className="conversation-header">
          <div className="conversation-title">
            <span className="conversation-avatar" aria-hidden="true">
              ❧
            </span>
            <div>
              <small>{subtitle}</small>
              <h2>{title}</h2>
            </div>
          </div>
          <Button
            className="conversation-close"
            aria-label="Закончить разговор"
            onClick={() => onAction('close')}
          >
            ×
          </Button>
        </header>
        <nav className="conversation-breadcrumb" aria-label="Раздел общения">
          {page !== 'overview' ? (
            <Button onClick={() => onAction('dialog-back')}>← Назад</Button>
          ) : (
            <span>Выбери тему</span>
          )}
          <span>{labels[page]}</span>
        </nav>
      </div>
      <div className="conversation-content" key={page}>
        {children}
      </div>
      <footer className="conversation-footer">
        <span className="conversation-keyboard-hint">
          {page === 'overview' ? 'Esc — закончить разговор' : 'Esc — назад к темам'} ·{' '}
        </span>
        Лес живёт, нападения приостановлены
      </footer>
    </article>
  );
}
