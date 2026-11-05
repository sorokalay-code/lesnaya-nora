import { Button, FieldGroup, FieldLabel, Input, ScrollContainer, Select, Tabs } from '../kit';
import { useStore } from 'zustand';
import {
  BIOME_OPTIONS,
  CREATURE_OPTIONS,
  defaultWorldConfig,
  SEASONS,
  WORLD_LIMITS,
  type WorldConfig,
} from '../../game/WorldConfig';
import type { UIStore, WorldSettingsTab } from '../store';
import { defaultMapGeneration } from '../../game/MapGeneration';
import { WorldMapSettings } from './WorldMapSettings';

export const WORLD_SETTINGS_TABS: readonly { value: WorldSettingsTab; label: string }[] = [
  { value: 'map', label: 'Карта' },
  { value: 'nature', label: 'Природа' },
  { value: 'population', label: 'Животные' },
  { value: 'calendar', label: 'Календарь' },
];

/** Редактирует черновик конфигурации в UI, используя те же пределы, что и загрузка сохранений. */
export function WorldSettings({ store }: { store: UIStore }) {
  const config = useStore(store, (state) => state.worldConfig);
  const tab = useStore(store, (state) => state.worldSettingsTab);
  const update = (patch: Partial<WorldConfig>) =>
    store.setState((state) => ({ worldConfig: { ...state.worldConfig, ...patch } }));

  return (
    <div className="world-settings">
      <Tabs
        id="world-settings"
        label="Разделы настроек мира"
        options={WORLD_SETTINGS_TABS}
        value={tab}
        onChange={(worldSettingsTab) => store.setState({ worldSettingsTab })}
      />
      <ScrollContainer className="world-settings-content" key={tab} label="Настройки мира">
        {WORLD_SETTINGS_TABS.map(({ value }) => (
          <div
            key={value}
            className="world-settings-panel"
            id={`world-settings-panel-${value}`}
            role="tabpanel"
            aria-labelledby={`world-settings-tab-${value}`}
            data-settings-tab={value}
            hidden={value !== tab}
          >
            {value === 'map' && <WorldMapSettings config={config} update={update} />}
            {value === 'nature' && <NatureSettings config={config} update={update} />}
            {value === 'population' && <PopulationSettings config={config} update={update} />}
            {value === 'calendar' && (
              <CalendarSettings config={config} update={update} store={store} />
            )}
          </div>
        ))}
        <Button
          type="button"
          onClick={() =>
            store.setState({
              worldConfig: { ...defaultWorldConfig(), map: defaultMapGeneration() },
              startSeason: 0,
            })
          }
        >
          Вернуть исходные настройки
        </Button>
      </ScrollContainer>
    </div>
  );
}

export type SettingsSectionProps = {
  config: WorldConfig;
  update: (patch: Partial<WorldConfig>) => void;
};

function NatureSettings({ config, update }: SettingsSectionProps) {
  return (
    <FieldGroup legend="Мир и природа">
      <FieldLabel>
        Преобладающий биом
        <Select
          value={config.biome}
          onChange={(event) => {
            const biome = BIOME_OPTIONS.find(
              (option) => option.value === event.target.value,
            )?.value;
            if (biome) update({ biome });
          }}
        >
          {BIOME_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FieldLabel>
      <p className="config-hint">
        Родная поляна сохраняется, огороды задаются на вкладке «Карта». Плотность растений считается
        на единицу площади; число существ задаётся для всего мира.
      </p>
      {(
        [
          ['water', 'Количество воды'],
          ['vegetation', 'Плотность растительности'],
          ['food', 'Количество съедобных растений'],
        ] as const
      ).map(([key, label]) => (
        <FieldLabel className="config-range" key={key}>
          <span>
            {label} <output>{Math.round(config[key] * 100)}%</output>
          </span>
          <Input
            type="range"
            aria-label={label}
            min={WORLD_LIMITS.density.min}
            max={WORLD_LIMITS.density.max}
            step={0.1}
            value={config[key]}
            onChange={(event) => update({ [key]: Number(event.target.value) })}
          />
        </FieldLabel>
      ))}
      <p className="config-hint">
        100% — нынешний мир. 0% воды убирает водоёмы, уток и рыб. 0% пищи убирает также грядки;
        растительность настраивается отдельно. Верхний предел — {WORLD_LIMITS.density.max * 100}%.
      </p>
      <p className="config-hint">
        Большой мир, высокая плотность и большие популяции увеличивают нагрузку.
      </p>
    </FieldGroup>
  );
}

function PopulationSettings({ config, update }: SettingsSectionProps) {
  return (
    <FieldGroup legend="Животные и другие существа">
      <FieldLabel className="remains-option">
        <Input
          type="checkbox"
          checked={config.leaveRemains !== false}
          onChange={(event) => update({ leaveRemains: event.target.checked })}
        />
        Оставлять останки животных
      </FieldLabel>
      <p className="config-hint">
        Тело остаётся на 0,5 игрового дня, затем скелет ещё на 0,5 дня. У пауков вместо костей —
        сухой хитиновый панцирь.
      </p>
      <p className="config-hint">
        0 полностью отключает вид. Числа задают стартовую популяцию; мирные животные со временем
        пополняются до этих значений. Игрок остаётся в мире всегда.
      </p>
      <div className="creature-grid">
        {CREATURE_OPTIONS.map(({ kind, label, max }) => (
          <FieldLabel className="creature-input" key={kind}>
            <span>
              {label}
              <small>0–{max}</small>
            </span>
            <Input
              type="number"
              min={0}
              max={max}
              step={1}
              required
              aria-label={label}
              value={config.creatures[kind]}
              disabled={
                (kind === 'pike' || kind === 'fish' || kind === 'duck') && config.water === 0
              }
              onChange={(event) =>
                update({ creatures: { ...config.creatures, [kind]: Number(event.target.value) } })
              }
            />
          </FieldLabel>
        ))}
      </div>
      <FieldLabel>
        Размер семей соседей, максимум
        <Input
          type="number"
          min={WORLD_LIMITS.family.min}
          max={WORLD_LIMITS.family.max}
          step={1}
          required
          value={config.neighborFamilySize}
          onChange={(event) => update({ neighborFamilySize: Number(event.target.value) })}
        />
      </FieldLabel>
      <p className="config-hint">
        У каждого кролика-соседа может быть своя семья до {WORLD_LIMITS.family.max} кроликов.
        Поставь 0, чтобы создавать только указанное число взрослых соседей.
      </p>
    </FieldGroup>
  );
}

function CalendarSettings({ config, update, store }: SettingsSectionProps & { store: UIStore }) {
  const season = useStore(store, (state) => state.startSeason);

  return (
    <FieldGroup legend="Календарь">
      <FieldLabel>
        Начальный сезон
        <Select
          value={season}
          onChange={(event) => store.setState({ startSeason: Number(event.target.value) })}
        >
          {SEASONS.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </Select>
      </FieldLabel>
      <div className="creature-grid">
        {SEASONS.map((name) => (
          <FieldLabel className="creature-input" key={name}>
            {name}, игровых дней
            <Input
              type="number"
              min={WORLD_LIMITS.season.min}
              max={WORLD_LIMITS.season.max}
              step={1}
              required
              value={config.seasonLengths[name]}
              onChange={(event) =>
                update({
                  seasonLengths: { ...config.seasonLengths, [name]: Number(event.target.value) },
                })
              }
            />
          </FieldLabel>
        ))}
      </div>
      <p className="config-hint">
        Сезон длится от {WORLD_LIMITS.season.min} до {WORLD_LIMITS.season.max} игровых дней. Один
        игровой день — около 4 минут реального времени. Длительности повторяются каждый год.
      </p>
    </FieldGroup>
  );
}
