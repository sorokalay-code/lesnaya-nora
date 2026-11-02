import { useStore } from 'zustand';
import type { UIStore } from '../store';

const actions = [
  ['drink', 'Пить'],
  ['eat', 'Еда и багаж'],
  ['mate-panel', 'Партнёр'],
  ['feed', 'Кормить молоком'],
  ['feed-vegetables', 'Кормить овощами'],
  ['nest', 'Устроить гнездо'],
  ['fur', 'Собрать пух'],
  ['sleep', 'Спать'],
  ['store', 'Сложить в тайник'],
  ['retrieve', 'Взять из тайника'],
  ['poop', 'Оставить помёт'],
  ['pee', 'Помочиться'],
  ['groom', 'Вылизаться'],
  ['roots', 'Грызть корни'],
  ['steal', 'Утащить корнеплод'],
  ['bark', 'Грызть кору'],
  ['map', 'Карта'],
  ['journal', 'Дневник'],
  ['save', 'Сохранить'],
  ['settings', 'Настройки'],
  ['sound', 'Звук'],
  ['fullscreen', 'Полный экран'],
];

/** Общее компактное меню действий для мыши и сенсорного управления. */
export function ActionMenu({ store }: { store: UIStore }) {
  const open = useStore(store, (s) => s.actionMenuOpen);
  const overlay = useStore(store, (s) => s.overlay);
  const dispatch = useStore(store, (s) => s.dispatch);
  if (!open || overlay) return null;
  return (
    <section className="touch-menu" role="dialog" aria-label="Действия крольчихи">
      <header>
        <h2>Действия · пауза</h2>
        <button onClick={() => store.setState({ actionMenuOpen: false })}>Вернуться ×</button>
      </header>
      <div>
        {actions.map(([action, label]) => (
          <button
            key={action}
            onClick={() => {
              store.setState({ actionMenuOpen: false });
              dispatch(action);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
