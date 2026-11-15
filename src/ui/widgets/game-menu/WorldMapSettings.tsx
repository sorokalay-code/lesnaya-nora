import { Button, FieldGroup, FieldLabel, Input, Select } from '../../shared/ui';
import {
  defaultMapGeneration,
  LAKE_AREA_BUDGET,
  lakeAreas,
  MAP_LIMITS,
  riverCount,
  type MapGeneration,
} from '../../../game/MapGeneration';
import { WORLD_LIMITS } from '../../../game/WorldConfig';
import type { SettingsSectionProps } from './WorldSettings';
import { WorldPreview } from './WorldPreview';

const SIZE_PRESETS = [
  { side: 140, label: 'Маленький' },
  { side: 220, label: 'Обычный' },
  { side: 300, label: 'Большой' },
  { side: 600, label: 'Огромный' },
] as const;

const MAP_PRESETS: readonly {
  label: string;
  description: string;
  settings: Partial<MapGeneration>;
}[] = [
  { label: 'Лесной край', description: 'Холмы, долины и река с притоком', settings: {} },
  {
    label: 'Горный край',
    description: 'Высокие хребты, озеро и три русла',
    settings: { relief: 1.65, gardens: 1, swamps: 1, rivers: 3, ponds: 1 },
  },
  {
    label: 'Озёрный край',
    description: 'Три озера и топи в широких низинах',
    settings: { ponds: 3, lakes: 3, swamps: 3, rivers: 1, relief: 0.55, forestCover: 0.55 },
  },
  {
    label: 'Луговой край',
    description: 'Открытые луга и пологие холмы',
    settings: {
      forestCover: 0.2,
      relief: 0.4,
      gardens: 1,
      swamps: 0,
      ponds: 2,
      lakes: 0,
      rivers: 0,
    },
  },
  {
    label: 'Знакомый лес',
    description: 'Прежнее расположение ориентиров',
    settings: { layout: 'classic' },
  },
];

/** Настраивает географию карты; параметры передаются общему генератору движка. */
export function WorldMapSettings({ config, update }: SettingsSectionProps) {
  const map = config.map ?? { ...defaultMapGeneration(), layout: 'classic' as const };
  const areas = lakeAreas(map);
  const totalArea = areas.reduce((sum, area) => sum + area, 0);
  const available = LAKE_AREA_BUDGET - totalArea;
  const change = (patch: Partial<MapGeneration>) =>
    update({ map: { ...map, ...patch, revision: 5 } });
  const resizeLakeList = (count: number) => {
    if (!Number.isInteger(count) || count < 0 || count > MAP_LIMITS.lakes.max) return;
    const next = lakeAreas({ ...map, lakes: count });
    let remaining = available;
    for (let i = areas.length; i < count; i++) {
      next[i] = Math.max(1, Math.min(next[i], remaining - (count - i - 1)));
      remaining -= next[i];
    }
    if (remaining >= 0) change({ lakes: count, lakeAreas: next });
  };
  return (
    <>
      <FieldGroup legend="Твоя карта">
        <p className="config-hint">
          Выбери основу, затем настрой её под свою историю. Одинаковое зерно и настройки создают
          одинаковую карту.
        </p>
        <div className="map-presets" role="group" aria-label="Варианты ландшафта">
          {MAP_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              onClick={() =>
                update({
                  biome: 'mixed',
                  map: { ...defaultMapGeneration(), ...preset.settings, seed: map.seed },
                })
              }
            >
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
            </Button>
          ))}
        </div>
        <FieldLabel separateControl>
          Расположение областей
          <Select
            value={map.layout}
            onChange={(event) => {
              if (event.target.value === 'classic' || event.target.value === 'generated')
                change({ layout: event.target.value });
            }}
          >
            <option value="generated">Новое по зерну карты</option>
            <option value="classic">Классическое</option>
          </Select>
        </FieldLabel>
        <FieldLabel separateControl>
          Зерно карты
          <Input
            className="map-seed-input"
            type="number"
            min={MAP_LIMITS.seed.min}
            max={MAP_LIMITS.seed.max}
            step={1}
            placeholder="Случайное"
            value={map.seed ?? ''}
            onChange={(event) =>
              change({ seed: event.target.value === '' ? null : Number(event.target.value) })
            }
          />
        </FieldLabel>
        <Button
          onClick={() => change({ seed: Math.floor(Math.random() * (MAP_LIMITS.seed.max + 1)) })}
        >
          Другое зерно
        </Button>
        <WorldPreview config={config} />
        <FieldLabel separateControl>
          Сторона мира, м
          <Input
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
        </FieldLabel>
        <p className="config-hint" id="world-size-hint">
          Квадратная карта от 100 до 600 м, шаг 2 м. Большие карты увеличивают нагрузку.
        </p>
        <div className="world-size-presets" role="group" aria-label="Готовые размеры мира">
          {SIZE_PRESETS.map(({ side, label }) => (
            <Button
              key={side}
              aria-pressed={config.size * 2 === side}
              onClick={() => update({ size: side / 2 })}
            >
              {label}
              <small>
                {side} × {side} м
              </small>
            </Button>
          ))}
        </div>
      </FieldGroup>
      <FieldGroup legend="Ландшафт и водоёмы">
        {(
          [
            ['relief', 'Выраженность рельефа'],
            ['biomeScale', 'Размер областей биомов'],
            ['forestCover', 'Лесистость'],
          ] as const
        ).map(([key, label]) => (
          <FieldLabel separateControl className="config-range" key={key}>
            <span>
              {label}
              <output>{Math.round(map[key] * 100)}%</output>
            </span>
            <Input
              type="range"
              aria-label={label}
              min={MAP_LIMITS[key].min}
              max={MAP_LIMITS[key].max}
              step={key === 'forestCover' ? 0.01 : 0.05}
              value={map[key]}
              onChange={(event) => change({ [key]: Number(event.target.value) })}
            />
          </FieldLabel>
        ))}
        <p className="config-hint">
          0% рельефа — равнина до вырезания водоёмов. Лесистость действует в смешанном биоме;
          преобладающий биом выбирается в «Природе».
        </p>
        <div className="creature-grid">
          {(
            [
              ['gardens', 'Огороды'],
              ['swamps', 'Болотные области'],
              ['ponds', 'Пруды (небольшие)'],
            ] as const
          ).map(([key, label]) => (
            <FieldLabel separateControl className="creature-input" key={key}>
              {label}
              <Input
                type="number"
                required
                min={0}
                max={MAP_LIMITS[key].max}
                step={1}
                value={map[key]}
                onChange={(event) => change({ [key]: Number(event.target.value) })}
              />
            </FieldLabel>
          ))}
        </div>
        {map.layout === 'generated' && map.revision !== undefined ? (
          <div className="creature-grid">
            <FieldLabel separateControl className="creature-input">
              Реки и притоки
              <Input
                type="number"
                min={0}
                max={MAP_LIMITS.rivers.max}
                step={1}
                value={riverCount(map)}
                onChange={(event) => change({ river: true, rivers: Number(event.target.value) })}
              />
            </FieldLabel>
            <FieldLabel separateControl className="creature-input">
              Озёра (крупные)
              <Input
                type="number"
                min={0}
                max={Math.min(MAP_LIMITS.lakes.max, areas.length + available)}
                step={1}
                value={map.lakes ?? 1}
                onChange={(event) => resizeLakeList(Number(event.target.value))}
              />
            </FieldLabel>
          </div>
        ) : (
          <FieldLabel className="remains-option">
            <Input
              type="checkbox"
              checked={map.river}
              onChange={(event) => change({ river: event.target.checked })}
            />
            Река
          </FieldLabel>
        )}
        <FieldLabel separateControl className="config-range">
          <span>
            Количество воды <output>{Math.round(config.water * 100)}%</output>
          </span>
          <Input
            type="range"
            aria-label="Количество воды"
            min={WORLD_LIMITS.density.min}
            max={WORLD_LIMITS.density.max}
            step={0.1}
            value={config.water}
            onChange={(event) => update({ water: Number(event.target.value) })}
          />
        </FieldLabel>
        <p className="config-hint">
          {map.layout === 'generated'
            ? 'Меняет ширину рек и размер прудов и болотных луж. Площадь озёр задаётся отдельно.'
            : 'Меняет ширину реки и размер водоёмов на классической карте.'}{' '}
          0% убирает все водоёмы, уток и рыб.
        </p>
      </FieldGroup>
      {map.layout === 'generated' && areas.length > 0 && (
        <FieldGroup legend="Площадь озёр">
          {areas.map((area, index) => {
            const label = `Озеро ${index + 1}, доля карты`;
            return (
              <FieldLabel separateControl className="config-range" key={index}>
                <span>
                  Озеро {index + 1} <output>{area}% карты</output>
                </span>
                <Input
                  type="range"
                  aria-label={label}
                  min={MAP_LIMITS.lakeArea.min}
                  max={Math.min(MAP_LIMITS.lakeArea.max, area + available)}
                  step={1}
                  value={area}
                  onChange={(event) =>
                    change({
                      lakeAreas: areas.map((value, i) =>
                        i === index ? Number(event.target.value) : value,
                      ),
                    })
                  }
                />
              </FieldLabel>
            );
          })}
          <p className="config-hint">
            Всего озёра занимают около {totalArea}% карты. Максимум 50% на одно озеро и{' '}
            {LAKE_AREA_BUDGET}% на все. Озёра разделяет суша, стартовая поляна остаётся сухой. Если
            места мало, часть огородов, болот и прудов не появится.
          </p>
        </FieldGroup>
      )}
    </>
  );
}
