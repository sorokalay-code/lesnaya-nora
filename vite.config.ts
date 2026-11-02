import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { assetManifest } from './tools/assets';

export default defineConfig(() => {
  const manifest = assetManifest();
  return {
    base: process.env.VITE_BASE_PATH ?? '/lesnaya-nora/',
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
    ],
  };
});
