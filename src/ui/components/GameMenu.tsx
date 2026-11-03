import { useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import { ControlGuide } from './ControlGuide';
import { FullscreenButton } from './FullscreenButton';
import { trapDialogFocus } from './DialogKeyboard';
import { NewGameForm } from './NewGameForm';

/** Общее окно управления сессией и создания новой истории со стартового экрана или паузы. */
export function GameMenu({ store }: { store: UIStore }) {
  const page = useStore(store, (s) => s.gameMenu);
  const dispatch = useStore(store, (s) => s.dispatch);
  const controls = useStore(store, (s) => s.showControls);
  const muted = useStore(store, (s) => s.soundMuted);
  const notice = useStore(store, (s) => s.saveNotice);
  const overlay = useStore(store, (s) => s.overlay);
  const touch = useStore(store, (s) => s.touch);
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (page && !returnFocus.current && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement;
    if (!page) {
      returnFocus.current?.focus();
      returnFocus.current = null;
    }
    if (page === 'new-game')
      panel.current?.querySelector<HTMLElement>('[data-cancel-new]')?.focus();
    else panel.current?.querySelector('button')?.focus();
  }, [page]);
  if (!page) return null;
  const titles = {
    main: 'Меню игры',
    settings: 'Настройки',
    'new-game': 'Новая история',
    controls: 'Управление',
  };
  return (
    <div className="menu-backdrop">
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-menu-title"
        className={`touch-menu game-menu ${page === 'new-game' ? 'world-config-menu' : ''}`}
        onKeyDown={(event) => {
          trapDialogFocus(event);
          if (event.key === 'Escape' && overlay && overlay.type !== 'loading') {
            event.preventDefault();
            dispatch('menu-back');
          }
        }}
      >
        <header>
          <div>
            <small>ЛЕСНАЯ НОРА · {overlay?.type === 'start' ? 'СОЗДАНИЕ МИРА' : 'ПАУЗА'}</small>
            <h2 id="game-menu-title">{titles[page]}</h2>
          </div>
          <button
            data-cancel-new={page === 'new-game' ? true : undefined}
            onClick={() => dispatch(page === 'main' ? 'resume' : 'menu-back')}
          >
            {page === 'main' ? 'Продолжить игру' : '← Назад'}
          </button>
        </header>
        {page === 'main' && (
          <div className="game-menu-options">
            <button className="primary" onClick={() => dispatch('save')}>
              Сохранить игру <kbd>F5</kbd>
            </button>
            <button onClick={() => dispatch('new-game-menu')}>Новая игра</button>
            <button onClick={() => dispatch('settings')}>Настройки</button>
            <button onClick={() => dispatch('controls-help')}>
              Управление <kbd>F1</kbd>
            </button>
            {notice && (
              <p role="status" className="save-notice">
                {notice}
              </p>
            )}
            <p className="menu-footnote">
              {touch
                ? 'Действия персонажа — кнопка ✦ внизу экрана.'
                : 'Действия персонажа — отдельная панель ✦. Нажми Ё / `.'}
            </p>
          </div>
        )}
        {page === 'settings' && (
          <div className="game-menu-options">
            <button aria-pressed={!muted} onClick={() => dispatch('sound')}>
              {muted ? '☐' : '☑'} Звуки мира
            </button>
            <button aria-pressed={controls} onClick={() => dispatch('toggle-controls')}>
              {controls ? '☑' : '☐'} Подсказка управления
            </button>
            <FullscreenButton store={store} />
          </div>
        )}
        {page === 'controls' && <ControlGuide touch={touch} />}
        {page === 'new-game' && (
          <NewGameForm store={store} replacesStory={overlay?.type !== 'start' || overlay.hasSave} />
        )}
      </section>
    </div>
  );
}
