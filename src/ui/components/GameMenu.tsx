import { FullscreenButton } from './FullscreenButton';
import { Button, Dialog, ScrollContainer } from '../kit';
import { useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import { ControlGuide } from './ControlGuide';
import { NewGameForm } from './NewGameForm';
import { SaveLibrary } from './SaveLibrary';
import { BurrowPanel } from './BurrowPanel';

/** Общее окно управления сессией и создания новой истории со стартового экрана или паузы. */
export function GameMenu({ store }: { store: UIStore }) {
  const page = useStore(store, (s) => s.gameMenu);
  const dispatch = useStore(store, (s) => s.dispatch);
  const controls = useStore(store, (s) => s.showControls);
  const muted = useStore(store, (s) => s.soundMuted);
  const notice = useStore(store, (s) => s.saveNotice);
  const overlay = useStore(store, (s) => s.overlay);
  const touch = useStore(store, (s) => s.touch);
  const performanceEnabled = useStore(store, (s) => s.performanceEnabled);
  const burrow = useStore(store, (s) => s.burrow);
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
    else if (page === 'burrow')
      panel.current?.querySelector<HTMLElement>('[data-menu-back]')?.focus();
    else panel.current?.querySelector('button')?.focus();
  }, [page]);
  if (!page) return null;
  const titles = {
    main: 'Меню игры',
    settings: 'Настройки',
    'new-game': 'Новая история',
    controls: 'Управление',
    saves: 'Приключения и сохранения',
    burrow: 'План норы',
  };
  return (
    <div className="menu-backdrop">
      <Dialog
        ref={panel}

        aria-labelledby="game-menu-title"
        className={`touch-menu game-menu ${page === 'new-game' ? 'world-config-menu' : ''} ${page === 'burrow' ? 'burrow-menu' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && overlay && overlay.type !== 'loading') {
            event.preventDefault();
            dispatch('menu-back');
          }
        }}
      >
        {page !== 'new-game' && (
          <header>
            <div>
              <small>ЛЕСНАЯ НОРА · {overlay?.type === 'start' ? 'СОЗДАНИЕ МИРА' : 'ПАУЗА'}</small>
              <h2 id="game-menu-title">{titles[page]}</h2>
            </div>
            <div className="game-menu-header-actions">
              <FullscreenButton store={store} compact />
              <Button
                data-menu-back
                onClick={() => dispatch(page === 'main' ? 'resume' : 'menu-back')}
              >
                {page === 'main' ? 'Продолжить игру' : '← Назад'}
              </Button>
            </div>
          </header>
        )}
        {page === 'main' && (
          <div className="game-menu-options">
            <Button variant="primary" onClick={() => dispatch('save')}>
              Создать сохранение <kbd>F5</kbd>
            </Button>
            <Button onClick={() => dispatch('saved-games')}>Приключения и сохранения</Button>
            <Button onClick={() => dispatch('burrow-plan')}>План норы</Button>
            <Button onClick={() => dispatch('new-game-menu')}>Новая игра</Button>
            <Button onClick={() => dispatch('settings')}>Настройки</Button>
            <Button onClick={() => dispatch('controls-help')}>
              Управление <kbd>F1</kbd>
            </Button>
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
            <Button aria-pressed={!muted} onClick={() => dispatch('sound')}>
              {muted ? '☐' : '☑'} Звуки мира
            </Button>
            <Button aria-pressed={controls} onClick={() => dispatch('toggle-controls')}>
              {controls ? '☑' : '☐'} Подсказка управления
            </Button>
            {touch && (
              <Button
                aria-pressed={performanceEnabled}
                onClick={() => dispatch('performance-toggle')}
              >
                {performanceEnabled ? '☑' : '☐'} Показатели производительности
              </Button>
            )}
          </div>
        )}
        {page === 'controls' && <ControlGuide touch={touch} />}
        {page === 'burrow' && burrow && (
          <ScrollContainer className="burrow-content" label="План и обустройство норы">
            <BurrowPanel data={burrow} />
          </ScrollContainer>
        )}
        {page === 'saves' && <SaveLibrary store={store} />}
        {page === 'new-game' && (
          <NewGameForm store={store} replacesStory={overlay?.type !== 'start' || overlay.hasSave} />
        )}
      </Dialog>
    </div>
  );
}
