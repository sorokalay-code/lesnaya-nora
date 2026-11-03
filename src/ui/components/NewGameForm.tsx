import { useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { useStore } from 'zustand';
import { validWorldConfig } from '../../game/WorldConfig';
import type { UIStore } from '../store';
import { WorldSettings } from './WorldSettings';

/** Предлагает запуск истории и раскрываемый редактор; создание сохранения выполняет движок. */
export function NewGameForm({ store, replacesStory }: { store: UIStore; replacesStory: boolean }) {
  const config = useStore(store, (state) => state.worldConfig);
  const expanded = useStore(store, (state) => state.worldSettingsExpanded);
  const dispatch = useStore(store, (state) => state.dispatch);

  useLayoutEffect(() => {
    store.setState({ worldSettingsExpanded: false });
  }, [store]);

  return (
    <form
      className="new-game-options world-config"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!validWorldConfig(config)) {
          // Сначала монтируем скрытые поля, затем браузер может показать ошибку и дать им фокус.
          flushSync(() => store.setState({ worldSettingsExpanded: true }));
          event.currentTarget.reportValidity();
          return;
        }

        dispatch('new');
      }}
    >
      <p>Создай свой лес. Крольчиха и её гены будут случайными; возможны врождённые особенности.</p>
      {replacesStory && (
        <p className="new-game-warning">
          Текущая история и её единственное сохранение будут заменены новой игрой.
        </p>
      )}
      <div className="game-menu-options config-actions">
        <button type="button" data-cancel-new onClick={() => dispatch('menu-back')}>
          Отмена
        </button>
        <button type="submit" className={replacesStory ? 'danger-button' : 'primary'}>
          Начать новую игру
        </button>
      </div>
      <details
        className="world-settings"
        open={expanded}
        onToggle={(event) => store.setState({ worldSettingsExpanded: event.currentTarget.open })}
      >
        <summary>
          Настройки мира <small>Размер, существа, природа и сезоны</small>
        </summary>
        {expanded && <WorldSettings store={store} />}
      </details>
    </form>
  );
}
