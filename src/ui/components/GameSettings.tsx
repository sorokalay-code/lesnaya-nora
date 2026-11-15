import { useStore } from 'zustand';
import { Button, FieldGroup, ScrollContainer, Tabs } from '../kit';
import type { UIStore } from '../store';
import type { SettingsTab } from '../types';
import { ControlGuide } from './ControlGuide';
import { GraphicsPanel } from './GraphicsPanel';

const sections: readonly { value: SettingsTab; label: string }[] = [
  { value: 'graphics', label: 'Графика' },
  { value: 'controls', label: 'Управление' },
  { value: 'audio', label: 'Звук' },
  { value: 'interface', label: 'Интерфейс' },
];

/** Показывает разделы настроек и передаёт изменения существующим командам игры. */
export function GameSettings({ store }: { store: UIStore }) {
  const section = useStore(store, (state) => state.settingsTab);
  const touch = useStore(store, (state) => state.touch);
  const muted = useStore(store, (state) => state.soundMuted);
  const showControls = useStore(store, (state) => state.showControls);
  const performanceEnabled = useStore(store, (state) => state.performanceEnabled);
  const dispatch = useStore(store, (state) => state.dispatch);
  const label = sections.find((item) => item.value === section)?.label ?? 'Настройки';
  return (
    <div className="pause-settings">
      <Tabs
        id="pause-settings"
        label="Разделы настроек"
        options={sections}
        value={section}
        onChange={(settingsTab) => store.setState({ settingsTab })}
      />
      <div
        id={`pause-settings-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`pause-settings-tab-${section}`}
      >
        <ScrollContainer key={section} className="pause-scroll" label={label}>
          {section === 'graphics' && <GraphicsPanel store={store} />}
          {section === 'controls' && <ControlGuide touch={touch} />}
          {section === 'audio' && (
            <FieldGroup legend="Звуки мира">
              <Button aria-pressed={!muted} onClick={() => dispatch('sound')}>
                Звук мира <span>{muted ? 'Выкл.' : 'Вкл.'}</span>
              </Button>
            </FieldGroup>
          )}
          {section === 'interface' && (
            <FieldGroup legend="Показ на экране">
              {!touch && (
                <Button aria-pressed={showControls} onClick={() => dispatch('toggle-controls')}>
                  Подсказка управления <span>{showControls ? 'Вкл.' : 'Выкл.'}</span>
                </Button>
              )}
              <Button
                aria-pressed={performanceEnabled}
                onClick={() => dispatch('performance-toggle')}
              >
                Показатели производительности <span>{performanceEnabled ? 'Вкл.' : 'Выкл.'}</span>
              </Button>
            </FieldGroup>
          )}
        </ScrollContainer>
      </div>
    </div>
  );
}
