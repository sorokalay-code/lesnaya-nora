import { useStore } from 'zustand';
import {
  BIOME_OPTIONS,
  CREATURE_OPTIONS,
  defaultWorldConfig,
  SEASONS,
  validWorldConfig,
  WORLD_LIMITS,
} from '../../game/WorldConfig';
import type { UIStore } from '../store';

/** Черновик нового мира хранится в UI; создание сохранения выполняет команда движка. */
export function NewGameForm({ store, replacesStory }: { store: UIStore; replacesStory: boolean }) {
  const config = useStore(store, (state) => state.worldConfig);
  const season = useStore(store, (state) => state.startSeason);
  const dispatch = useStore(store, (state) => state.dispatch);
  const update = (patch: Partial<typeof config>) =>
    store.setState((state) => ({ worldConfig: { ...state.worldConfig, ...patch } }));

  return (
    <form
      className="new-game-options world-config"
      onSubmit={(event) => {
        event.preventDefault();
        if (validWorldConfig(config)) dispatch('new');
      }}
    >
      <p>Создай свой лес. Крольчиха и её гены будут случайными; возможны врождённые особенности.</p>
      <fieldset>
        <legend>Мир и природа</legend>
        <label>
          Размер мира
          <select
            value={config.size}
            onChange={(event) => update({ size: Number(event.target.value) })}
          >
            <option value={70}>Маленький · 140 × 140 м</option>
            <option value={110}>Обычный · 220 × 220 м</option>
            <option value={150}>Большой · 300 × 300 м</option>
          </select>
        </label>
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
          растительность настраивается отдельно.
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
              {label}
              <input
                type="number"
                min={0}
                max={max}
                step={1}
                required
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
          У каждого кролика-соседа может быть своя семья. Поставь 0, чтобы создавать только
          указанное число взрослых соседей.
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
          Один игровой день — около 4 минут реального времени. Длительности повторяются каждый год.
        </p>
      </fieldset>
      <button
        type="button"
        onClick={() => store.setState({ worldConfig: defaultWorldConfig(), startSeason: 0 })}
      >
        Вернуть исходные настройки
      </button>
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
    </form>
  );
}
