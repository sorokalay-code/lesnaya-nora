import { createRoot, type Root } from 'react-dom/client';
import { GameApp } from './components/GameApp';
import { createUIStore } from './store';
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
    return !!(this.state.dialog || this.state.journal || this.state.settings);
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
    this.store.setState({ overlay });
  }

  showDialog(dialog: DialogViewModel, focus: 'dialog' | 'message' = 'dialog') {
    this.store.setState({
      dialog: structuredClone(dialog),
      journal: undefined,
      settings: false,
      focus: { target: focus, revision: this.state.focus.revision + 1 },
    });
  }

  closeDialog() {
    this.store.setState({ dialog: undefined });
  }

  showJournal(journal: JournalViewModel) {
    this.store.setState({ journal: structuredClone(journal), dialog: undefined, settings: false });
  }

  closeJournal() {
    this.store.setState({ journal: undefined });
  }

  toggleSettings() {
    this.store.setState({ settings: !this.state.settings, dialog: undefined, journal: undefined });
  }

  closePanels() {
    this.store.setState({ dialog: undefined, journal: undefined, settings: false });
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
