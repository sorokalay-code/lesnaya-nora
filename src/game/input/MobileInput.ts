import type { InputController } from './InputController';
import type { GameUI } from '../../ui/GameUI';
import type { ViewCamera } from '../ViewCamera';
import { blockingPanelOpen } from '../../ui/store';

export interface TouchBindings {
  move: (x: number, y: number) => void;
  sprint: (held: boolean) => void;
  dig: (held: boolean) => void;
  reset: () => void;
}

export function needsLandscape(touch: boolean, width: number, height: number): boolean {
  return touch && height > width;
}

/** Адаптер сенсорного ввода: джойстик, независимый палец камеры и сброс при паузе. */
export class MobileInput implements TouchBindings, InputController {
  private readonly events = new AbortController();
  private readonly media = matchMedia('(pointer: coarse)');
  private readonly ownedKeys = new Set<string>();
  private pointer?: { id: number; x: number; y: number };
  private readonly unsubscribe: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly view: ViewCamera,
    private readonly ui: Pick<GameUI, 'store' | 'state' | 'simulationPaused'>,
    private readonly keys: Set<string>,
    private readonly setDigHeld: (held: boolean) => void,
  ) {
    const options = { signal: this.events.signal };
    ui.store.setState({ touchBindings: this });
    this.media.addEventListener('change', this.resize, options);
    window.addEventListener('resize', this.resize, options);
    window.addEventListener('blur', this.reset, options);
    document.addEventListener('visibilitychange', this.resize, options);
    canvas.addEventListener('pointerdown', this.startLook, options);
    canvas.addEventListener('pointermove', this.moveLook, options);
    canvas.addEventListener('pointerup', this.endLook, options);
    canvas.addEventListener('pointercancel', this.endLook, options);
    canvas.addEventListener('lostpointercapture', this.endLook, options);
    this.unsubscribe = ui.store.subscribe(() => {
      if (!this.active) this.reset();
    });
    this.resize();
  }

  private get active(): boolean {
    return (
      this.ui.state.touch &&
      !!this.ui.state.hud &&
      !this.ui.state.hud.airlift &&
      !this.ui.state.overlay &&
      !blockingPanelOpen(this.ui.state) &&
      !this.ui.simulationPaused
    );
  }

  private resize = (): void => {
    const touch =
      this.media.matches || new URLSearchParams(location.search).get('controls') === 'touch';
    this.view.setTouchMode(touch);
    this.ui.store.setState({
      touch,
      portrait: needsLandscape(touch, innerWidth, innerHeight),
      background: document.hidden,
    });
  };

  private key(code: string, held: boolean): void {
    if (held) {
      this.ownedKeys.add(code);
      this.keys.add(code);
    } else if (this.ownedKeys.delete(code)) this.keys.delete(code);
  }

  move = (x: number, y: number): void => {
    if (!this.active) return;
    this.key('KeyA', x < -0.22);
    this.key('KeyD', x > 0.22);
    this.key('KeyW', y < -0.22);
    this.key('KeyS', y > 0.22);
  };

  sprint = (held: boolean): void => {
    this.key('ShiftLeft', held && this.active);
  };

  dig = (held: boolean): void => {
    this.setDigHeld(held && this.active && this.view.isFirstPerson);
  };

  reset = (): void => {
    for (const code of this.ownedKeys) this.keys.delete(code);
    this.ownedKeys.clear();
    this.setDigHeld(false);
    this.pointer = undefined;
  };

  private startLook = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || !this.active || this.pointer) return;
    event.preventDefault();
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture(event.pointerId);
  };

  private moveLook = (event: PointerEvent): void => {
    if (!this.active || this.pointer?.id !== event.pointerId) return;
    event.preventDefault();
    this.view.lookBy(event.clientX - this.pointer.x, event.clientY - this.pointer.y);
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
  };

  private endLook = (event: PointerEvent): void => {
    if (this.pointer?.id === event.pointerId) this.pointer = undefined;
  };

  dispose(): void {
    this.unsubscribe();
    this.events.abort();
    this.reset();
    this.ui.store.setState({ touchBindings: undefined });
  }
}
