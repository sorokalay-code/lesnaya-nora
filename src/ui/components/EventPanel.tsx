import { Button, Dialog } from '../kit';
import { useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import { JournalLog } from './JournalLog';

/** Компактная история вместо всплывающей стопки сообщений; записи хранятся независимо от уведомлений. */
export function EventPanel({ store }: { store: UIStore }) {
  const open = useStore(store, (s) => s.eventsOpen);
  const events = useStore(store, (s) => s.events);
  const dispatch = useStore(store, (s) => s.dispatch);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (open) panel.current?.querySelector('button')?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="menu-backdrop event-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) dispatch('close');
      }}
    >
      <Dialog
        ref={panel}

        aria-labelledby="events-title"
        className="event-panel"
      >
        <header>
          <h2 id="events-title">События</h2>
          <Button aria-label="Закрыть события" onClick={() => dispatch('close')}>
            ×
          </Button>
        </header>
        <small>Игра на паузе · последние 100 записей</small>
        <JournalLog entries={events} />
      </Dialog>
    </div>
  );
}
