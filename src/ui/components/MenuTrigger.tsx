import { useStore } from 'zustand';
import { Button } from '../kit';
import type { UIStore } from '../store';

/** Открывает меню паузы с HUD и связывает кнопку с модальным окном. */
export function MenuTrigger({ store, compact = false }: { store: UIStore; compact?: boolean }) {
  const playing = useStore(store, (state) => !!state.hud && !state.overlay);
  const open = useStore(store, (state) => !!state.gameMenu);
  const dispatch = useStore(store, (state) => state.dispatch);
  if (!playing) return null;
  return (
    <Button
      aria-label="Меню игры"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? 'game-menu' : undefined}
      onClick={() => dispatch('menu')}
    >
      {compact ? '☰' : '☰ Меню · Esc'}
    </Button>
  );
}
