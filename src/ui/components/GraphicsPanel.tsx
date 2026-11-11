import { useStore } from 'zustand';
import { graphicsPreset, type GraphicsSettings } from '../../game/GraphicsSettings';
import type { UIStore } from '../store';
import { Button, FieldLabel, ScrollContainer, Select } from '../kit';
import './GraphicsPanel.css';

const fields = {
  shadows: {
    label: 'Тени',
    options: { off: 'Выключены', low: 'Низкие', medium: 'Средние', high: 'Высокие' },
  },
  textures: {
    label: 'Качество текстур',
    options: { low: 'Базовое', medium: 'Среднее (4×)', high: 'Высокое (8×)' },
  },
  distance: {
    label: 'Дальность прорисовки',
    options: { near: 'Ближняя', normal: 'Средняя', far: 'Дальняя' },
  },
  details: {
    label: 'Трава и мелкий декор',
    options: { off: 'Выключены', reduced: 'Меньше', full: 'Полностью' },
  },
  resolution: { label: 'Масштаб рендера', options: { low: '60%', medium: '85%', full: '100%' } },
} satisfies {
  [K in keyof GraphicsSettings]: { label: string; options: Record<GraphicsSettings[K], string> };
};

/** Показывает текущий пресет и независимые настройки графики. */
export function GraphicsPanel({ store }: { store: UIStore }) {
  const graphics = useStore(store, (state) => state.graphics);
  const dispatch = useStore(store, (state) => state.dispatch);
  return (
    <ScrollContainer className="graphics-content" label="Настройки графики">
      <FieldLabel separateControl>
        Пресет
        <Select
          value={graphicsPreset(graphics) ?? 'custom'}
          onChange={(event) => dispatch('graphics:preset', event.target.value)}
        >
          <option value="custom" disabled>
            Пользовательский
          </option>
          <option value="performance">Быстродействие</option>
          <option value="balanced">Баланс</option>
          <option value="quality">Качество</option>
        </Select>
      </FieldLabel>
      {(['shadows', 'textures', 'distance', 'details', 'resolution'] as const).map((field) => (
        <FieldLabel key={field} separateControl>
          {fields[field].label}
          <Select
            value={graphics[field]}
            onChange={(event) => dispatch(`graphics:${field}`, event.target.value)}
          >
            {Object.entries(fields[field].options).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FieldLabel>
      ))}
      <p>Изменения применяются сразу и сохраняются в браузере.</p>
      <Button onClick={() => dispatch('graphics:reset')}>Сбросить настройки графики</Button>
    </ScrollContainer>
  );
}
