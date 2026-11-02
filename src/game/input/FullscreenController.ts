import type { GameUI } from '../../ui/GameUI';

/** Управляет полноэкранным режимом контейнера и синхронизирует выход через Esc с интерфейсом. */
export class FullscreenController {
  private readonly events = new AbortController();

  constructor(
    private readonly host: HTMLElement,
    private readonly ui: Pick<GameUI, 'store' | 'state' | 'toast'>,
  ) {
    document.addEventListener('fullscreenchange', this.sync, { signal: this.events.signal });
    this.sync();
  }

  private sync = (): void => {
    this.ui.store.setState({
      fullscreen: document.fullscreenElement === this.host,
      fullscreenAvailable: !!this.host.requestFullscreen && document.fullscreenEnabled !== false,
    });
  };

  async toggle(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (this.ui.state.fullscreenAvailable) await this.host.requestFullscreen();
      else this.ui.toast('Полноэкранный режим недоступен в этом браузере.');
    } catch {
      this.ui.toast('Браузер не разрешил открыть полный экран. Попробуй нажать кнопку ещё раз.');
    }
  }

  dispose(): void {
    this.events.abort();
  }
}
