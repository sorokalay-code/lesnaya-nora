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
  fullscreen: boolean;
  fullscreenAvailable: boolean;
  familyOpen: boolean;
  touch: boolean;
  portrait: boolean;
  background: boolean;
  actionMenuOpen: boolean;
  statusOpen: boolean;
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
    fullscreen: false,
    fullscreenAvailable: false,
    familyOpen: false,
    touch: false,
    portrait: false,
    background: false,
    actionMenuOpen: false,
    statusOpen: false,
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

/** Приостанавливает мир для обзора состояния и меню; на сенсорном устройстве — для всех окон. */
export function simulationPaused(state: UIState): boolean {
  return (
    state.statusOpen ||
    state.familyOpen ||
    state.dialog?.type === 'remove' ||
    state.dialog?.type === 'help' ||
    state.actionMenuOpen ||
    state.background ||
    state.portrait ||
    (state.touch &&
      !!(
        state.dialog ||
        state.journal ||
        state.settings ||
        state.actionMenuOpen ||
        state.familyOpen ||
        state.statusOpen
      ))
  );
}
