import type { GameUI } from '../../ui/GameUI';

interface SafariDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
}

interface FullscreenHost {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface EscapeKeyboard {
  lock: (codes: string[]) => Promise<void>;
  unlock: () => void;
}

/** Управляет полноэкранным режимом контейнера и синхронизирует выход через Esc с интерфейсом. */
export class FullscreenController {
  private readonly events = new AbortController();
  private readonly fullscreenDocument = document as SafariDocument;
  private readonly keyboard = (navigator as Navigator & { keyboard?: EscapeKeyboard }).keyboard;
  private fullscreen = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly ui: Pick<GameUI, 'store' | 'state' | 'toast'>,
  ) {
    document.addEventListener('fullscreenchange', this.sync, { signal: this.events.signal });
    document.addEventListener('webkitfullscreenchange', this.sync, {
      signal: this.events.signal,
    });
    document.addEventListener('keydown', this.onKeyDown, { signal: this.events.signal });
    this.sync();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'F11' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!this.ui.state.fullscreenAvailable && !this.ui.state.fullscreen) return;

    event.preventDefault();
    if (!event.repeat) void this.toggle();
  };

  private get fullscreenElement(): Element | null {
    return document.fullscreenElement ?? this.fullscreenDocument.webkitFullscreenElement ?? null;
  }

  private get requestFullscreen(): (() => Promise<void> | void) | undefined {
    const element = this.host as FullscreenHost;
    const request = element.requestFullscreen;
    if (request) return () => request.call(this.host);
    const safariRequest = element.webkitRequestFullscreen;
    if (safariRequest) return () => safariRequest.call(element);
    return undefined;
  }

  private sync = (): void => {
    const request = this.requestFullscreen;
    const fullscreen = this.fullscreenElement === this.host;
    if (fullscreen !== this.fullscreen) {
      this.fullscreen = fullscreen;
      if (fullscreen) {
        // Перехватываем только Esc. Долгое нажатие остаётся аварийным выходом браузера.
        void this.keyboard?.lock?.(['Escape']).catch(() => {});
      } else {
        this.keyboard?.unlock?.();
      }
    }
    this.ui.store.setState({
      fullscreen,
      fullscreenAvailable:
        !!request &&
        ((this.host as FullscreenHost).requestFullscreen
          ? document.fullscreenEnabled !== false
          : this.fullscreenDocument.webkitFullscreenEnabled !== false),
    });
  };

  async toggle(): Promise<void> {
    try {
      if (this.fullscreenElement) {
        const exit = document.exitFullscreen ?? this.fullscreenDocument.webkitExitFullscreen;
        if (exit) await exit.call(document);
        return;
      }

      const request = this.requestFullscreen;
      if (request && this.ui.state.fullscreenAvailable) {
        await request();
        return;
      }

      if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        this.ui.toast(
          'Safari не разрешает скрыть панели страницы. На iPhone откройте «Поделиться» → «На экран Домой».',
        );
      } else {
        this.ui.toast('Полноэкранный режим недоступен в этом браузере.');
      }
    } catch {
      this.ui.toast('Браузер не разрешил открыть полный экран. Попробуй нажать кнопку ещё раз.');
    }
  }

  dispose(): void {
    this.events.abort();
    if (this.fullscreen) this.keyboard?.unlock?.();
  }
}
