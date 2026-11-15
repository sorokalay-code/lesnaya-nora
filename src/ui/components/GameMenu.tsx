import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { Button, Dialog, ScrollContainer, Tabs } from '../kit';
import type { UIStore } from '../store';
import type { GameMenuPage } from '../types';
import { BurrowPanel } from './BurrowPanel';
import { FullscreenButton } from './FullscreenButton';
import { GameSettings } from './GameSettings';
import { NewGameForm } from './NewGameForm';
import { SaveLibrary } from './SaveLibrary';
import './GameMenu.css';

type PauseTab = Exclude<GameMenuPage, 'burrow'>;
const compactQuery = '(max-width: 740px), (max-height: 520px)';

function subscribeLayout(onChange: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function isCompact() {
  return window.matchMedia(compactQuery).matches;
}

const tabs = [
  { value: 'main', label: 'Продолжить игру', action: 'continue-menu' },
  { value: 'saves', label: 'Загрузить игру', action: 'saved-games' },
  { value: 'new-game', label: 'Новая игра', action: 'new-game-menu' },
  { value: 'settings', label: 'Настройки', action: 'settings' },
] as const;

/** Показывает вкладки паузы и возвращает фокус кнопке, открывшей меню. */
export function GameMenu({ store }: { store: UIStore }) {
  const page = useStore(store, (state) => state.gameMenu);
  const dispatch = useStore(store, (state) => state.dispatch);
  const overlay = useStore(store, (state) => state.overlay);
  const touch = useStore(store, (state) => state.touch);
  const burrow = useStore(store, (state) => state.burrow);
  const compact = useSyncExternalStore(subscribeLayout, isCompact, () => false);
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = !!page;

  useLayoutEffect(() => {
    if (open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [open]);

  useLayoutEffect(() => {
    const active = document.activeElement;
    const inactiveTab = active?.matches('.pause-tabs [aria-selected="false"]');
    if (page && (inactiveTab || !panel.current?.contains(active)))
      panel.current
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"], [data-burrow-back]')
        ?.focus();
  }, [page]);

  if (!page) return null;
  const inWorld = !overlay;
  const visibleTabs = inWorld ? tabs : tabs.slice(1);
  const chapter = visibleTabs.find((tab) => tab.value === page);
  const close = page === 'burrow' ? 'menu-back' : 'resume';

  return (
    <div className="menu-backdrop pause-backdrop">
      <Dialog
        id="game-menu"
        ref={panel}
        aria-labelledby="game-menu-title"
        className={`touch-menu game-menu pause-menu ${page === 'burrow' ? 'pause-menu-burrow' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && overlay) {
            event.preventDefault();
            dispatch('resume');
          }
        }}
      >
        <header className="pause-header">
          <h2 id="game-menu-title">{page === 'burrow' ? 'План норы' : 'Меню игры'}</h2>
          <div className="game-menu-header-actions">
            <FullscreenButton store={store} compact />
            <Button
              data-burrow-back={page === 'burrow' ? '' : undefined}
              aria-label={page === 'burrow' ? 'Назад к меню' : 'Закрыть меню'}
              onClick={() => dispatch(close)}
            >
              {page === 'burrow' ? '← Назад' : '✕'}
              {page !== 'burrow' && inWorld && !touch && <kbd>Esc</kbd>}
            </Button>
          </div>
        </header>
        {chapter && (
          <>
            <Tabs<PauseTab>
              id="pause"
              label="Меню игры"
              className="pause-tabs"
              orientation={compact ? 'horizontal' : 'vertical'}
              options={visibleTabs}
              value={chapter.value}
              onChange={(value) => {
                const tab = tabs.find((item) => item.value === value);
                if (tab && value !== page) dispatch(tab.action);
              }}
            />
            {visibleTabs.map(({ value }) => (
              <div
                key={value}
                id={`pause-panel-${value}`}
                role="tabpanel"
                aria-labelledby={`pause-tab-${value}`}
                className="pause-panel"
                hidden={value !== page}
              >
                {page === value && value === 'main' && <ResumePanel store={store} />}
                {page === value && value === 'saves' && (
                  <ScrollContainer className="pause-scroll" label="Загрузить игру">
                    <SaveLibrary store={store} />
                  </ScrollContainer>
                )}
                {page === value && value === 'settings' && <GameSettings store={store} />}
                {page === value && value === 'new-game' && (
                  <NewGameForm
                    store={store}
                    replacesStory={overlay?.type !== 'start' || overlay.hasSave}
                  />
                )}
              </div>
            ))}
          </>
        )}
        {page === 'burrow' && burrow && (
          <ScrollContainer className="pause-scroll" label="План и обустройство норы">
            <BurrowPanel data={burrow} relocate={(id) => dispatch(`relocate-family:${id}`)} />
          </ScrollContainer>
        )}
      </Dialog>
    </div>
  );
}

function ResumePanel({ store }: { store: UIStore }) {
  const dispatch = useStore(store, (state) => state.dispatch);
  const notice = useStore(store, (state) => state.saveNotice);
  const touch = useStore(store, (state) => state.touch);
  return (
    <ScrollContainer className="pause-scroll" label="Текущая игра">
      <div className="pause-session">
        <h3>Игра на паузе</h3>
        <Button variant="primary" onClick={() => dispatch('resume')}>
          Вернуться в игру
        </Button>
        <div className="pause-session-options">
          <Button onClick={() => dispatch('save')}>
            Создать сохранение {!touch && <kbd>F5</kbd>}
          </Button>
          <Button onClick={() => dispatch('burrow-plan')}>План норы</Button>
        </div>
        {notice && (
          <p role="status" className="save-notice">
            {notice}
          </p>
        )}
      </div>
    </ScrollContainer>
  );
}
