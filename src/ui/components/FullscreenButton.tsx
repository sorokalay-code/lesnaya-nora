import { useStore } from 'zustand';
import type { UIStore } from '../store';

/** Одна кнопка отражает фактический Fullscreen API в меню и на мобильном HUD. */
export function FullscreenButton({
  store,
  compact = false,
}: {
  store: UIStore;
  compact?: boolean;
}) {
  const fullscreen = useStore(store, (s) => s.fullscreen);
  const available = useStore(store, (s) => s.fullscreenAvailable);
  const dispatch = useStore(store, (s) => s.dispatch);
  const label = fullscreen ? 'Свернуть полный экран' : 'Развернуть на весь экран';
  return (
    <button
      type="button"
      className={compact ? 'fullscreen-quick' : ''}
      title={available ? label : 'Полный экран недоступен в этом браузере'}
      aria-label={label}
      aria-pressed={fullscreen}
      disabled={!available}
      onClick={() => dispatch('fullscreen')}
    >
      {fullscreen ? '⤢' : '⛶'}
      {!compact && <span>{label}</span>}
    </button>
  );
}
