import { FullscreenButton } from './FullscreenButton';
import { Button } from '../kit';
import { useStore } from 'zustand';
import type { UIStore } from '../store';

/** Мобильные быстрые кнопки остаются на HUD без открытия панели действий. */
export function MobileUtilities({ store }: { store: UIStore }) {
  const touch = useStore(store, (s) => s.touch);
  const playing = useStore(store, (s) => !!s.hud && !s.overlay);
  const portrait = useStore(store, (s) => s.portrait);
  const unread = useStore(store, (s) => s.unreadEvents);
  const dispatch = useStore(store, (s) => s.dispatch);
  if (!touch || portrait) return null;
  return (
    <div className="mobile-utilities" aria-label="Быстрые кнопки игры">
      {playing && (
        <Button onClick={() => dispatch('events-panel')}>
          События{unread > 0 && <b>{unread}</b>}
        </Button>
      )}
      {playing && (
        <Button aria-label="Меню игры" onClick={() => dispatch('menu')}>
          ☰
        </Button>
      )}
      {playing && <FullscreenButton store={store} compact />}
    </div>
  );
}
