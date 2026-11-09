import { Button } from '../kit';
import { useStore } from 'zustand';
import type { UIStore } from '../store';
import './FullscreenButton.css';

/** Кнопка полного экрана в потоке раскладки отражает состояние браузерного Fullscreen API. */
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
  const unavailableTitle = /iPad|iPhone|iPod/.test(navigator.userAgent)
    ? 'Safari: добавьте игру на экран «Домой», чтобы скрыть панели браузера'
    : 'Полноэкранный режим недоступен в этом браузере';
  return (
    <Button
      type="button"
      className={`fullscreen-button ${compact ? 'fullscreen-quick' : ''}`}
      title={available ? label : unavailableTitle}
      aria-label={label}
      aria-pressed={fullscreen}
      onClick={() => dispatch('fullscreen')}
    >
      {fullscreen ? '⤢' : '⛶'}
      {!compact && <span>{label}</span>}
    </Button>
  );
}
