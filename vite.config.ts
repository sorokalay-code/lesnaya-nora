import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { assetManifest } from './tools/assets';
import { pwaOptions } from './tools/pwa';

export default defineConfig(() => {
  const manifest = assetManifest();
  const base = process.env.VITE_BASE_PATH ?? '/lesnaya-nora/';
  return {
    base,
    define: { __ASSET_VERSION__: JSON.stringify(manifest.version) },
    plugins: [
      react(),
      {
        name: 'asset-manifest',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'asset-manifest.json',
            source: JSON.stringify(manifest, null, 2),
          });
          this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
        },
      },
      VitePWA(pwaOptions(base)),
    ],
  };
});
