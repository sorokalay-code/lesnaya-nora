import type { VitePWAOptions } from 'vite-plugin-pwa';

/** Общая конфигурация установки и полного офлайн-кэша игры. */
export function pwaOptions(base: string): Partial<VitePWAOptions> {
  return {
    base,
    scope: base,
    // Не активируем новую сборку посреди игры: она ждёт закрытия всех её окон.
    registerType: 'prompt',
    injectRegister: 'script',
    manifest: {
      id: base,
      name: 'Лесная нора',
      short_name: 'Лесная нора',
      description: 'Одиночная 3D игра о жизни диких кроликов.',
      lang: 'ru',
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color: '#172b20',
      theme_color: '#1d3024',
      icons: [
        { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
        {
          src: `${base}icons/icon-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // Включаем оба LOD и текстуры до первого офлайн-запуска, а не по мере посещения мира.
      globPatterns: ['**/*.{html,js,css,json,png,svg,ico,glb,ogg,mp3,wav,woff2,webmanifest}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      // AssetPaths добавляет общий хеш public. Ревизии Workbox уже проверяют содержимое файлов.
      ignoreURLParametersMatching: [/^v$/, /^utm_/, /^fbclid$/],
      navigateFallback: `${base}index.html`,
      navigateFallbackAllowlist: [new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)],
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: false,
    },
    devOptions: { enabled: false },
  };
}
