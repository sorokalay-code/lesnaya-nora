import type { InputController } from './InputController';
import type { GameUI } from '../../ui/GameUI';
import { InteractionInput } from '../InteractionInput';
import type { ViewCamera } from '../ViewCamera';

export interface InputContext {
  canvas: HTMLCanvasElement;
  view: ViewCamera;
  ui: GameUI;
  keys: Set<string>;
  action: (action: string) => void;
  resize: () => void;
  running: () => boolean;
  closePanels: () => void;
  setDigHeld: (held: boolean) => void;
}

/** Контроллер клавиатуры и мыши: отделяет ввод текста от игровых команд. */
export class DesktopInput implements InputController {
  private wasLocked = false;
  private menuOpenedAt = -Infinity;
  private readonly shortcuts = new InteractionInput();
  private readonly listeners = new AbortController();

  constructor(private readonly context: InputContext) {
    const options = { signal: this.listeners.signal };
    window.addEventListener('resize', context.resize, options);
    document.addEventListener(
      'pointerlockchange',
      () => {
        const lost = this.wasLocked && !context.view.isLocked;
        this.wasLocked = context.view.isLocked;
        if (lost && this.playing && !context.ui.panelsOpen && !context.ui.state.touch) {
          this.menuOpenedAt = performance.now();
          this.reset();
          context.action('menu');
        }
      },
      options,
    );
    window.addEventListener('keydown', this.keyDown, options);
    window.addEventListener('keyup', (event) => context.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.reset(), options);
    context.canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'touch' || !this.playing) return;
        if (context.ui.state.dialog?.type === 'remove') return;

        if (context.ui.panelsOpen) {
          context.closePanels();
          return;
        }

        context.view.lock();
        if (event.button !== 0) return;

        context.setDigHeld(context.view.isFirstPerson);
        context.action('dig');
      },
      options,
    );
    window.addEventListener(
      'pointerup',
      (event) => {
        if (event.button === 0) context.setDigHeld(false);
      },
      options,
    );
    context.canvas.addEventListener('pointercancel', () => context.setDigHeld(false), options);
  }

  private get playing(): boolean {
    return this.context.running() && !this.context.ui.state.overlay;
  }

  reset(): void {
    this.context.keys.clear();
    this.context.setDigHeld(false);
  }

  private keyDown = (event: KeyboardEvent): void => {
    const { ui, view, action, keys } = this.context;
    if (event.code === 'F5') {
      event.preventDefault();
      if (!event.repeat) action('save');
      return;
    }

    if (event.code === 'Escape' && performance.now() - this.menuOpenedAt < 180) {
      event.preventDefault();
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : undefined;
    const editable = !!target?.closest('input,textarea,select,[contenteditable="true"]');
    const shortcut = this.shortcuts.action(
      event.code,
      {
        playing: this.playing,
        dialogOpen: !!ui.state.dialog,
        confirmationOpen: ui.state.dialog?.type === 'remove',
        panelsOpen: ui.panelsOpen,
        editable,
        mateMenuOpen: ui.state.dialog?.type === 'mate',
        buttonFocused: !!target?.closest('button'),
      },
      event.isComposing,
    );
    if (shortcut) {
      event.preventDefault();
      if (event.repeat) return;
      this.reset();
      if (shortcut === 'close-panels') this.context.closePanels();
      else if (shortcut === 'release-cursor') view.unlock();
      else if (shortcut === 'mate-focus') ui.focusMessage();
      else action(shortcut);

      return;
    }

    if (editable || ui.panelsOpen || !this.playing || ui.simulationPaused) return;

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code))
      event.preventDefault();

    keys.add(event.code);
    if (event.repeat) return;

    const actions: Record<string, string> = {
      KeyM: 'map',
      KeyJ: 'journal',
      KeyB: 'camera',
      KeyE: 'interact',
      KeyG: 'eat',
      KeyV: 'drink',
      KeyQ: 'roots',
      KeyT: 'steal',
      KeyC: 'groom',
      KeyK: 'store',
      KeyO: 'retrieve',
      KeyY: 'feed-vegetables',
      KeyN: 'nest',
      KeyU: 'fur',
      KeyR: 'sleep',
      KeyP: 'poop',
      KeyL: 'pee',
      KeyF: 'feed',
      KeyZ: 'dig-down',
      KeyH: 'bark',
      Space: 'hop',
    };
    if (actions[event.code]) action(actions[event.code]);
  };

  dispose(): void {
    this.listeners.abort();
    this.reset();
  }
}
