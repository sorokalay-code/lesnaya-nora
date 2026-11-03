import { useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import { ControlGuide } from './ControlGuide';
import { FullscreenButton } from './FullscreenButton';
import { trapDialogFocus } from './DialogKeyboard';

/** Меню паузы содержит только управление сессией, настройки и подтверждение новой истории. */
export function GameMenu({ store }: { store: UIStore }) {
  const page = useStore(store, (s) => s.gameMenu);
  const dispatch = useStore(store, (s) => s.dispatch);
  const controls = useStore(store, (s) => s.showControls);
  const muted = useStore(store, (s) => s.soundMuted);
  const notice = useStore(store, (s) => s.saveNotice);
  const season = useStore(store, (s) => s.startSeason);
  const touch = useStore(store, (s) => s.touch);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
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
        className="touch-menu game-menu"
        onKeyDown={trapDialogFocus}
      >
        <header>
          <div>
            <small>ЛЕСНАЯ НОРА · ПАУЗА</small>
            <h2 id="game-menu-title">{titles[page]}</h2>
          </div>
          <button onClick={() => dispatch(page === 'main' ? 'resume' : 'menu-back')}>
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
          <div className="new-game-options">
            <p>
              Начнётся новая случайная история. Крольчиха и её гены тоже случайны; возможны
              врождённые особенности и дефекты.
            </p>
            <label>
              Начальный сезон
              <select
                aria-label="Начальный сезон"
                value={season}
                onChange={(e) => store.setState({ startSeason: Number(e.target.value) })}
              >
                <option value={0}>Весна</option>
                <option value={1}>Лето</option>
                <option value={2}>Осень</option>
                <option value={3}>Зима</option>
              </select>
            </label>
            <p className="new-game-warning">
              Текущая история и её единственное сохранение будут заменены новой игрой.
            </p>
            <div className="game-menu-options">
              <button data-cancel-new onClick={() => dispatch('menu-back')}>
                Отмена
              </button>
              <button className="danger-button" onClick={() => dispatch('new')}>
                Начать новую игру
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
