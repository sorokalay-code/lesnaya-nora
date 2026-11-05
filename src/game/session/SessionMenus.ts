import type { GameUI } from '../../ui/GameUI';
import type { UIState } from '../../ui/store';
import type { ViewCamera } from '../ViewCamera';
import type { InteractionController } from './InteractionController';

interface Context {
  ui: Pick<GameUI, 'state' | 'store' | 'closePanels'>;
  view: Pick<ViewCamera, 'unlock'>;
  interactions: Pick<InteractionController, 'clearSelection' | 'close'>;
  resetInput: () => void;
  refreshHud: () => void;
}

/** Разделяет меню сессии, действия персонажа и историю событий; управляет паузой и возвратом ввода. */
export class SessionMenus {
  constructor(private readonly context: Context) {}

  showGame(page: NonNullable<UIState['gameMenu']> = 'main'): void {
    this.prepare();
    this.context.ui.store.setState({ gameMenu: page });
  }

  execute(action: string): boolean {
    if (action === 'menu') {
      if (this.context.ui.state.gameMenu === 'main') this.context.interactions.close();
      else this.showGame();
      return true;
    }
    const pages = {
      settings: 'settings',
      'controls-help': 'controls',
      'new-game-menu': 'new-game',
      'saved-games': 'saves',
      'menu-back': 'main',
    } as const;
    if (Object.hasOwn(pages, action)) {
      this.showGame(pages[action as keyof typeof pages]);
      return true;
    }
    if (action === 'resume') {
      this.context.interactions.close();
      return true;
    }
    if (action === 'world-actions' || action === 'events-panel') {
      const field = action === 'world-actions' ? 'actionMenuOpen' : 'eventsOpen';
      const wasOpen = this.context.ui.state[field];
      if (wasOpen) this.context.interactions.close();
      else {
        this.prepare();
        this.context.ui.store.setState({
          [field]: true,
          unreadEvents: action === 'events-panel' ? 0 : this.context.ui.state.unreadEvents,
        });
      }
      return true;
    }
    return false;
  }

  private prepare(): void {
    this.context.resetInput();
    this.context.refreshHud();
    this.context.view.unlock();
    this.context.interactions.clearSelection();
    this.context.ui.closePanels();
  }
}
