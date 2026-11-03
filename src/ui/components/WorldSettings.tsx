import { useStore } from 'zustand';
import {
  BIOME_OPTIONS,
  CREATURE_OPTIONS,
  defaultWorldConfig,
  SEASONS,
  WORLD_LIMITS,
} from '../../game/WorldConfig';
import type { UIStore } from '../store';

const SIZE_PRESETS = [
  { side: 140, label: 'Маленький' },
  { side: 220, label: 'Обычный' },
  { side: 300, label: 'Большой' },
  { side: 600, label: 'Огромный' },
] as const;

/** Редактирует черновик конфигурации в UI, используя те же пределы, что и загрузка сохранений. */
export function WorldSettings({ store }: { store: UIStore }) {
  const config = useStore(store, (state) => state.worldConfig);
  const season = useStore(store, (state) => state.startSeason);
  const update = (patch: Partial<typeof config>) =>
    store.setState((state) => ({ worldConfig: { ...state.worldConfig, ...patch } }));

  return (
    <div>
      <fieldset>
        <legend>Мир и природа</legend>
        <label>
          Сторона мира, м
          <input
            className="world-size-input"
            type="number"
            min={WORLD_LIMITS.size.min * 2}
            max={WORLD_LIMITS.size.max * 2}
            step={2}
            required
            value={config.size * 2}
            onChange={(event) => update({ size: Number(event.target.value) / 2 })}
            aria-describedby="world-size-hint"
          />
        </label>
        <p className="config-hint" id="world-size-hint">
          Свой размер от {WORLD_LIMITS.size.min * 2} до {WORLD_LIMITS.size.max * 2} м, шаг 2 м.
          Карта квадратная; по умолчанию — 220 × 220 м.
        </p>
        <div className="world-size-presets" role="group" aria-label="Готовые размеры мира">
          {SIZE_PRESETS.map(({ side, label }) => (
            <button
              type="button"
              key={side}
              aria-pressed={config.size * 2 === side}
              onClick={() => update({ size: side / 2 })}
            >
              {label}
              <small>
                {side} × {side} м
              </small>
            </button>
          ))}
        </div>
        <label>
          Преобладающий биом
          <select
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
          </select>
        </label>
        <p className="config-hint">
          Родная поляна и два огорода сохраняются. Плотность растений считается на единицу площади;
          число существ задаётся для всего мира.
        </p>
        {(
          [
            ['water', 'Количество воды'],
            ['vegetation', 'Плотность растительности'],
            ['food', 'Количество съедобных растений'],
          ] as const
        ).map(([key, label]) => (
          <label className="config-range" key={key}>
            <span>
              {label} <output>{Math.round(config[key] * 100)}%</output>
            </span>
            <input
              type="range"
              aria-label={label}
              min={WORLD_LIMITS.density.min}
              max={WORLD_LIMITS.density.max}
              step={0.1}
              value={config[key]}
              onChange={(event) => update({ [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <p className="config-hint">
          100% — нынешний мир. 0% воды убирает водоёмы и щук. 0% пищи убирает также грядки;
          растительность настраивается отдельно. Верхний предел — {WORLD_LIMITS.density.max * 100}%.
        </p>
        <p className="config-hint">
          Большой мир, высокая плотность и большие популяции увеличивают нагрузку.
        </p>
      </fieldset>
      <fieldset>
        <legend>Животные и другие существа</legend>
        <p className="config-hint">
          0 полностью отключает вид. Числа задают стартовую популяцию; мирные животные со временем
          пополняются до этих значений. Игрок остаётся в мире всегда.
        </p>
        <div className="creature-grid">
          {CREATURE_OPTIONS.map(({ kind, label, max }) => (
            <label className="creature-input" key={kind}>
              <span>
                {label}
                <small>0–{max}</small>
              </span>
              <input
                type="number"
                min={0}
                max={max}
                step={1}
                required
                aria-label={label}
                value={config.creatures[kind]}
                disabled={kind === 'pike' && config.water === 0}
                onChange={(event) =>
                  update({ creatures: { ...config.creatures, [kind]: Number(event.target.value) } })
                }
              />
            </label>
          ))}
        </div>
        <label>
          Размер семей соседей, максимум
          <input
            type="number"
            min={WORLD_LIMITS.family.min}
            max={WORLD_LIMITS.family.max}
            step={1}
            required
            value={config.neighborFamilySize}
            onChange={(event) => update({ neighborFamilySize: Number(event.target.value) })}
          />
        </label>
        <p className="config-hint">
          У каждого кролика-соседа может быть своя семья до {WORLD_LIMITS.family.max} кроликов.
          Поставь 0, чтобы создавать только указанное число взрослых соседей.
        </p>
      </fieldset>
      <fieldset>
        <legend>Календарь</legend>
        <label>
          Начальный сезон
          <select
            value={season}
            onChange={(event) => store.setState({ startSeason: Number(event.target.value) })}
          >
            {SEASONS.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="creature-grid">
          {SEASONS.map((name) => (
            <label className="creature-input" key={name}>
              {name}, игровых дней
              <input
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
            </label>
          ))}
        </div>
        <p className="config-hint">
          Сезон длится от {WORLD_LIMITS.season.min} до {WORLD_LIMITS.season.max} игровых дней. Один
          игровой день — около 4 минут реального времени. Длительности повторяются каждый год.
        </p>
      </fieldset>
      <button
        type="button"
        onClick={() => store.setState({ worldConfig: defaultWorldConfig(), startSeason: 0 })}
      >
        Вернуть исходные настройки
      </button>
    </div>
  );
}
