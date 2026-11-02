import type { TouchBindings } from '../game/input/MobileInput';
import { createStore } from 'zustand/vanilla';
import type {
  DialogViewModel,
  HudView,
  JournalViewModel,
  OverlayViewModel,
  UIAction,
} from './types';

export interface UIState {
  touch: boolean;
  portrait: boolean;
  background: boolean;
  touchMenuOpen: boolean;
  touchStatusOpen: boolean;
  touchBindings?: TouchBindings;
  hud?: HudView;
  dialog?: DialogViewModel;
  journal?: JournalViewModel;
  overlay?: OverlayViewModel;
  settings: boolean;
  showControls: boolean;
  firstPerson: boolean;
  startSeason: number;
  message: string;
  focus: { target: 'dialog' | 'message'; revision: number };
  toasts: { id: number; text: string }[];
  performance?: string;
  dispatch: UIAction;
}

/** Создаёт изолированное хранилище интерфейса без ссылок на сцену и игровые сущности. */
export function createUIStore(dispatch: UIAction) {
  return createStore<UIState>()(() => ({
    touch: false,
    portrait: false,
    background: false,
    touchMenuOpen: false,
    touchStatusOpen: false,
    settings: false,
    showControls: true,
    firstPerson: false,
    startSeason: 0,
    message: '',
    focus: { target: 'dialog', revision: 0 },
    toasts: [],
    dispatch,
  }));
}

export type UIStore = ReturnType<typeof createUIStore>;

/** На сенсорном устройстве выбор команд безопасен; на ПК окна сохраняют прежнее поведение. */
export function simulationPaused(state: UIState): boolean {
  return (
    state.background ||
    state.portrait ||
    (state.touch &&
      !!(
        state.dialog ||
        state.journal ||
        state.settings ||
        state.touchMenuOpen ||
        state.touchStatusOpen
      ))
  );
}
