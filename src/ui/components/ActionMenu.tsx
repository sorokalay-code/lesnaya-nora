import { Button, Dialog } from '../kit';
import { useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import { NEST_FUR_COST } from '../../game/NestBedding';

const groups: { title: string; actions: [string, string, string?][] }[] = [
  {
    title: 'Обзор',
    actions: [
      ['status-panel', 'Состояние', 'I'],
      ['family-panel', 'Семья'],
      ['mate-panel', 'Партнёр', 'Tab'],
      ['map', 'Карта', 'M'],
      ['burrow-plan', 'План норы'],
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
];

/** Отдельная панель действий персонажа: забота, семья, припасы и ближайшее убежище. */
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
      <Dialog
        ref={panel}
        className="touch-menu action-menu"

        aria-labelledby="actions-title"
      >
        <header>
          <div>
            <h2 id="actions-title">Действия в мире</h2>
            <small>
              {touch
                ? 'Игра на паузе, пока выбираешь действие'
                : 'Ё / Esc — закрыть · Tab — перейти к следующей кнопке'}
            </small>
          </div>
          <Button onClick={() => dispatch('close')}>Закрыть действия ×</Button>
        </header>
        {groups.map((group) => (
          <section className="action-group" key={group.title}>
            <h3>{group.title}</h3>
            <div>
              {group.actions.map(([action, label, key]) => (
                <Button key={action} onClick={() => dispatch(action)}>
                  {action === 'feed' && shelter?.nest?.inside ? 'Кормить молоком из гнезда' : label}
                  {key && !touch && <kbd>{key}</kbd>}
                </Button>
              ))}
            </div>
          </section>
        ))}
        <section className="action-group shelter-actions">
          <h3>Убежище рядом</h3>
          <p>Подойди к складу или гнезду, чтобы разобрать его.</p>
          <div>
            {shelter?.nest?.inside && (
              <Button disabled={shelter.nest.insulated} onClick={() => dispatch('insulate-nest')}>
                {shelter.nest.insulated ? 'Тёплая спальня' : 'Утеплить гнездо'}
                {!shelter.nest.insulated && <small>Пух × {NEST_FUR_COST}</small>}
              </Button>
            )}
            <Button disabled={!shelter?.stash} onClick={() => dispatch('remove-stash')}>
              Разобрать склад
              {shelter?.stash && <small>Внутри {shelter.stash.items} предметов</small>}
            </Button>
            <Button
              disabled={!shelter?.nest || shelter.nest.occupied}
              onClick={() => dispatch('remove-nest')}
            >
              Разобрать гнездо{shelter?.nest?.occupied && <small>Сначала уведи малышей</small>}
            </Button>
          </div>
        </section>
      </Dialog>
    </div>
  );
}
