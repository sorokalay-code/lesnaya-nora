import { Button, FieldGroup, FieldLabel, Input, Select } from '../kit';
import { defaultMapGeneration, MAP_LIMITS, type MapGeneration } from '../../game/MapGeneration';
import { WORLD_LIMITS } from '../../game/WorldConfig';
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
  { label: 'Лесной край', description: 'Чащи, поляны и извилистая река', settings: {} },
  {
    label: 'Озёрный край',
    description: 'Шесть прудов среди лесов и топей',
    settings: { ponds: 6, swamps: 3, river: false, forestCover: 0.55 },
  },
  {
    label: 'Луговой край',
    description: 'Открытые луга и пологие холмы',
    settings: { forestCover: 0.2, relief: 0.4, gardens: 1, swamps: 0, ponds: 2, river: false },
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
  const change = (patch: Partial<MapGeneration>) => update({ map: { ...map, ...patch } });
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
        <FieldLabel>
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
        <FieldLabel>
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
        <FieldLabel>
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
            ['relief', 'Высота холмов'],
            ['biomeScale', 'Размер областей биомов'],
            ['forestCover', 'Лесистость'],
          ] as const
        ).map(([key, label]) => (
          <FieldLabel className="config-range" key={key}>
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
          0% высоты — равнина до вырезания водоёмов. Лесистость действует в смешанном биоме;
          преобладающий биом выбирается в «Природе».
        </p>
        <div className="creature-grid">
          {(
            [
              ['gardens', 'Огороды'],
              ['swamps', 'Болотные области'],
              ['ponds', 'Пруды'],
            ] as const
          ).map(([key, label]) => (
            <FieldLabel className="creature-input" key={key}>
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
        <FieldLabel className="remains-option">
          <Input
            type="checkbox"
            checked={map.river}
            onChange={(event) => change({ river: event.target.checked })}
          />
          Река
        </FieldLabel>
        <p className="config-hint">
          Размер водоёмов регулируется количеством воды в «Природе». Без реки щуки не появляются;
          без водоёмов отсутствуют также утки и рыбы. Родная поляна остаётся свободной.
        </p>
      </FieldGroup>
    </>
  );
}
