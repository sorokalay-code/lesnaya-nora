import { createRoot, type Root } from 'react-dom/client';
import { GameApp } from './components/GameApp';
import { blockingPanelOpen, createUIStore, simulationPaused, socialDialogOpen } from './store';
import type {
  DialogViewModel,
  HudView,
  JournalViewModel,
  OverlayViewModel,
  UIAction,
} from './types';

/** Фасад между игровым циклом и React: публикует снимки данных и управляет окнами. */
export class GameUI {
  readonly store;
  private readonly root: Root;
  private toastId = 0;

  constructor(host: HTMLElement, onAction: UIAction) {
    this.store = createUIStore(onAction);
    const mount = document.createElement('div');
    host.append(mount);
    this.root = createRoot(mount);
    this.root.render(<GameApp store={this.store} />);
  }

  get state() {
    return this.store.getState();
  }

  get panelsOpen() {
    return blockingPanelOpen(this.state);
  }

  get simulationPaused(): boolean {
    return simulationPaused(this.state);
  }

  get conversationOpen(): boolean {
    return socialDialogOpen(this.state);
  }

  setHud(hud: HudView) {
    this.store.setState({ hud });
  }

  setCamera(firstPerson: boolean) {
    this.store.setState({ firstPerson });
  }

  setControls(showControls: boolean) {
    this.store.setState({ showControls });
  }

  showOverlay(overlay?: OverlayViewModel) {
    this.closePanels();
    this.store.setState({ overlay, statusOpen: false });
  }

  showDialog(dialog: DialogViewModel, focus: 'dialog' | 'message' = 'dialog') {
    this.store.setState({
      dialog: structuredClone(dialog),
      journal: undefined,
      gameMenu: undefined,
      eventsOpen: false,
      statusOpen: false,
      familyOpen: false,
      actionMenuOpen: false,
      focus: { target: focus, revision: this.state.focus.revision + 1 },
    });
  }

  closeDialog() {
    this.store.setState({ dialog: undefined });
  }

  showJournal(journal: JournalViewModel) {
    this.store.setState({
      journal: structuredClone(journal),
      dialog: undefined,
      gameMenu: undefined,
      eventsOpen: false,
      familyOpen: false,
      actionMenuOpen: false,
    });
  }

  closeJournal() {
    this.store.setState({ journal: undefined });
  }

  setEvents(events: readonly string[], notify = false) {
    this.store.setState({
      events: events.slice(-100),
      unreadEvents:
        notify && !this.state.eventsOpen ? Math.min(99, this.state.unreadEvents + 1) : 0,
    });
  }

  closePanels() {
    this.store.setState({
      dialog: undefined,
      journal: undefined,
      gameMenu: undefined,
      eventsOpen: false,
      actionMenuOpen: false,
      familyOpen: false,
    });
  }

  focusMessage() {
    this.store.setState({ focus: { target: 'message', revision: this.state.focus.revision + 1 } });
  }

  clearMessage() {
    this.store.setState({ message: '' });
  }

  toast(text: string) {
    this.store.setState({ toasts: [...this.state.toasts, { id: ++this.toastId, text }].slice(-5) });
  }

  dismissToast(id: number) {
    this.store.setState({ toasts: this.state.toasts.filter((toast) => toast.id !== id) });
  }

  publishPerformance = (performance?: string) => {
    this.store.setState({ performance });
  };

  dispose() {
    this.root.unmount();
  }
}
