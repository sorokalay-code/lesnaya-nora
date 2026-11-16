import { Button, FieldLabel, Input, Select } from '../../shared/ui';
import { flushSync } from 'react-dom';
import { useStore } from 'zustand';
import { validWorldConfig } from '../../../game/WorldConfig';
import type { UIStore } from '../../store';
import { WORLD_SETTINGS_TABS, WorldSettings } from './WorldSettings';

/** Закрепляет запуск истории над вкладками; проверку и создание мира выполняет движок. */
export function NewGameForm({ store, replacesStory }: { store: UIStore; replacesStory: boolean }) {
  const config = useStore(store, (state) => state.worldConfig);
  const dispatch = useStore(store, (state) => state.dispatch);
  const adventureName = useStore(store, (state) => state.adventureName);
  const startSex = useStore(store, (state) => state.startSex);

  return (
    <form
      className="new-game-options world-config"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.checkValidity() || !validWorldConfig(config)) {
          const invalid = form.querySelector(':invalid');
          const panel = invalid?.closest('[data-settings-tab]')?.getAttribute('data-settings-tab');
          const tab = WORLD_SETTINGS_TABS.find((option) => option.value === panel);
          if (tab) flushSync(() => store.setState({ worldSettingsTab: tab.value }));
          form.reportValidity();
          return;
        }
        dispatch('new');
      }}
    >
      <header className="world-config-header">
        <div className="world-config-heading">
          <FieldLabel className="adventure-name-field">
            Название приключения
            <Input
              required
              maxLength={40}
              value={adventureName}
              onChange={(event) => store.setState({ adventureName: event.target.value })}
            />
          </FieldLabel>
          <FieldLabel separateControl>
            Играть за
            <Select
              value={startSex}
              onChange={({ target }) => {
                if (target.value === 'female' || target.value === 'male')
                  store.setState({ startSex: target.value });
              }}
            >
              <option value="female">Крольчиху</option>
              <option value="male">Крола</option>
            </Select>
          </FieldLabel>
          <div className="config-actions">
            <Button type="submit" variant={replacesStory ? 'danger' : 'primary'}>
              Начать новую игру
            </Button>
          </div>
        </div>
        <p>Внешность и гены персонажа случайны; возможны врождённые особенности.</p>
        {replacesStory && (
          <p className="new-game-warning">
            Новое приключение создаст отдельное сохранение; другие миры останутся доступны.
          </p>
        )}
      </header>
      <WorldSettings store={store} />
    </form>
  );
}
