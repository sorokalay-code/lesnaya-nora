import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { StartupLoader } from './ui/components/StartupLoader';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Не найден игровой контейнер');
const host = app;

const root = createRoot(host);
const renderLoader = (loaded: number, total: number, error = false) => {
  root.render(
    createElement(StartupLoader, {
      loaded,
      total,
      error,
      onRetry: () => location.reload(),
    }),
  );
};
renderLoader(0, 0);

async function startGame(): Promise<void> {
  try {
    const { ModelAssets } = await import('./game/ModelAssets');
    const preload = ModelAssets.shared.preload(renderLoader);
    const [gameModule] = await Promise.all([
      import('./game/Game'),
      import('./ui/kit/tokens.css'),
      import('./ui/kit/spacing.css'),
      import('./ui/kit/focus.css'),
      import('./ui/kit/scrollbars.css'),
      import('./improvements.css'),
      import('./style.css'),
      import('./responsive.css'),
      import('./compact.css'),
      import('./menu.css'),
      import('./conversation.css'),
      preload,
    ]);

    await preload;
    root.unmount();
    new gameModule.Game(host);
  } catch (error) {
    console.error('Не удалось запустить игру', error);
    renderLoader(0, 0, true);
  }
}

void startGame();
