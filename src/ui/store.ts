import type { TouchBindings } from '../game/input/MobileInput';
import type { ConversationPage } from './ConversationNavigation';
import { defaultWorldConfig, type WorldConfig } from '../game/WorldConfig';
import { defaultMapGeneration } from '../game/MapGeneration';

import { createStore } from 'zustand/vanilla';
import type {
  DialogViewModel,
  HudView,
  JournalViewModel,
  OverlayViewModel,
  UIAction,
  GameMenuPage,
  SaveSlotSummary,
} from './types';

export type WorldSettingsTab = 'map' | 'nature' | 'population' | 'calendar';

export interface UIState {
  conversationPage: ConversationPage;
  gameMenu?: GameMenuPage;
  soundMuted: boolean;
  saveNotice?: string;
  saveSlots: SaveSlotSummary[];
  saveLibraryError?: string;
  legacySaveFound: boolean;
  adventureName: string;
  eventsOpen: boolean;
  events: string[];
  unreadEvents: number;
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
  showControls: boolean;
  firstPerson: boolean;
  startSeason: number;
  worldConfig: WorldConfig;
  worldSettingsTab: WorldSettingsTab;
  message: string;
  focus: { target: 'dialog' | 'message'; revision: number };
  toasts: { id: number; text: string }[];
  performance?: string;
  performanceEnabled: boolean;
  dispatch: UIAction;
}

/** Создаёт изолированное хранилище интерфейса без ссылок на сцену и игровые сущности. */
export function createUIStore(dispatch: UIAction) {
  return createStore<UIState>()(() => ({
    conversationPage: 'overview',
    fullscreen: false,
    fullscreenAvailable: false,
    familyOpen: false,
    touch: false,
    portrait: false,
    background: false,
    actionMenuOpen: false,
    statusOpen: false,
    soundMuted: false,
    saveSlots: [],
    legacySaveFound: false,
    adventureName: '',
    eventsOpen: false,
    events: [],
    unreadEvents: 0,
    performanceEnabled: false,
    showControls: true,
    firstPerson: false,
    startSeason: 0,
    worldConfig: { ...defaultWorldConfig(), map: defaultMapGeneration() },
    worldSettingsTab: 'map',
    message: '',
    focus: { target: 'dialog', revision: 0 },
    toasts: [],
    dispatch,
  }));
}

export type UIStore = ReturnType<typeof createUIStore>;

export function blockingPanelOpen(state: UIState): boolean {
  return !!(
    state.dialog ||
    state.journal ||
    state.gameMenu ||
    state.eventsOpen ||
    state.actionMenuOpen ||
    state.familyOpen
  );
}

export function socialDialogOpen(state: UIState): boolean {
  return !!state.dialog && ['animal', 'partner', 'mate', 'kit'].includes(state.dialog.type);
}

/** Состояние остаётся HUD; разговоры останавливают только бой, меню — всю симуляцию. */
export function simulationPaused(state: UIState): boolean {
  return (
    state.familyOpen ||
    !!state.gameMenu ||
    state.eventsOpen ||
    state.dialog?.type === 'remove' ||
    state.dialog?.type === 'help' ||
    state.actionMenuOpen ||
    state.background ||
    state.portrait ||
    (state.touch &&
      !!(
        (state.dialog && !socialDialogOpen(state)) ||
        state.journal ||
        state.actionMenuOpen ||
        state.familyOpen
      ))
  );
}
