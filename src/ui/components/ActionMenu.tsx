import { useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import { trapDialogFocus } from './DialogKeyboard';

const groups: { title: string; actions: [string, string, string?][] }[] = [
  {
    title: 'Обзор',
    actions: [
      ['status-panel', 'Состояние', 'I'],
      ['family-panel', 'Семья'],
      ['mate-panel', 'Партнёр', 'Tab'],
      ['map', 'Карта', 'M'],
      ['journal', 'Дневник', 'J'],
      ['eat', 'Еда и багаж', 'G'],
    ],
  },
  {
    title: 'Забота',
    actions: [
      ['drink', 'Пить', 'V'],
      ['feed', 'Кормить молоком', 'F'],
      ['feed-vegetables', 'Кормить овощами', 'Y'],
      ['sleep', 'Спать', 'R'],
      ['groom', 'Вылизаться', 'C'],
      ['clean', 'Убрать нечистоты', 'X'],
      ['poop', 'Оставить помёт', 'P'],
      ['pee', 'Помочиться', 'L'],
    ],
  },
  {
    title: 'Дом и припасы',
    actions: [
      ['nest', 'Устроить гнездо', 'N'],
      ['fur', 'Собрать пух', 'U'],
      ['store', 'Сложить в тайник', 'K'],
      ['retrieve', 'Взять из тайника', 'O'],
      ['roots', 'Грызть корни', 'Q'],
      ['steal', 'Утащить корнеплод', 'T'],
      ['bark', 'Грызть кору', 'H'],
    ],
  },
  {
    title: 'Игра',
    actions: [
      ['save', 'Сохранить', 'F5'],
      ['settings', 'Настройки'],
      ['controls-help', 'Управление'],
      ['sound', 'Звук'],
      ['fullscreen', 'Полный экран'],
    ],
  },
];

/** Единая точка доступа к действиям с клавиатурными подсказками и контекстом ближайшего убежища. */
export function ActionMenu({ store }: { store: UIStore }) {
  const open = useStore(store, (s) => s.actionMenuOpen),
    overlay = useStore(store, (s) => s.overlay);
  const dispatch = useStore(store, (s) => s.dispatch),
    shelter = useStore(store, (s) => s.hud?.nearbyShelter);
  const touch = useStore(store, (s) => s.touch);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (open) panel.current?.querySelector('button')?.focus();
  }, [open]);
  if (!open || overlay) return null;
  return (
    <div
      className="menu-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) dispatch('close');
      }}
    >
      <section
        ref={panel}
        className="touch-menu action-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="actions-title"
        onKeyDown={trapDialogFocus}
      >
        <header>
          <div>
            <h2 id="actions-title">Меню · пауза</h2>
            {!touch && <small>Esc / Ё — вернуться · Tab — перейти к следующей кнопке</small>}
          </div>
          <button onClick={() => dispatch('close')}>Продолжить игру ×</button>
        </header>
        {groups.map((group) => (
          <section className="action-group" key={group.title}>
            <h3>{group.title}</h3>
            <div>
              {group.actions.map(([action, label, key]) => (
                <button key={action} onClick={() => dispatch(action)}>
                  {label}
                  {key && !touch && <kbd>{key}</kbd>}
                </button>
              ))}
            </div>
          </section>
        ))}
        <section className="action-group shelter-actions">
          <h3>Убежище рядом</h3>
          <p>Подойди к складу или гнезду, чтобы разобрать его.</p>
          <div>
            <button disabled={!shelter?.stash} onClick={() => dispatch('remove-stash')}>
              Разобрать склад
              {shelter?.stash && <small>Внутри {shelter.stash.items} предметов</small>}
            </button>
            <button
              disabled={!shelter?.nest || shelter.nest.occupied}
              onClick={() => dispatch('remove-nest')}
            >
              Разобрать гнездо{shelter?.nest?.occupied && <small>Сначала уведи малышей</small>}
            </button>
          </div>
        </section>
      </section>
    </div>
  );
}
