import type { GameUI } from '../../ui/GameUI';
import { InteractionInput } from '../InteractionInput';
import type { ViewCamera } from '../ViewCamera';

interface InputContext {
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

/** Единственная точка регистрации ввода: отделяет команды интерфейса от управления персонажем. */
export class GameInputController {
  private readonly shortcuts = new InteractionInput();
  private readonly listeners = new AbortController();

  constructor(private readonly context: InputContext) {
    const options = { signal: this.listeners.signal };
    window.addEventListener('resize', context.resize, options);
    window.addEventListener('keydown', this.keyDown, options);
    window.addEventListener('keyup', (event) => context.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.clear(), options);
    context.canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.playing) return;

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

  clear(): void {
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

    const target = event.target instanceof HTMLElement ? event.target : undefined;
    const editable = !!target?.closest('input,textarea,select,[contenteditable="true"]');
    const shortcut = this.shortcuts.action(
      event.code,
      {
        playing: this.playing,
        dialogOpen: !!ui.state.dialog,
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
      this.clear();
      if (shortcut === 'close-panels') this.context.closePanels();
      else if (shortcut === 'release-cursor') view.unlock();
      else if (shortcut === 'mate-focus') ui.focusMessage();
      else action(shortcut);

      return;
    }

    if (editable || ui.panelsOpen || !this.playing) return;

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
    this.clear();
  }
}
