import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@ava-extension/messages': path.resolve(
        __dirname,
        '../src/webview/message-types.ts',
      ),
      // Fleet picker copy shared with dashboard-ui — the two ModelSelectors
      // are near-duplicates and used to drift apart.
      '@ava-extension/fleet-copy': path.resolve(
        __dirname,
        '../src/webview/fleet-copy.ts',
      ),
      // UI strings, shared with the HOST. They moved out of webview-ui/src on
      // 2026-10-05 because the host has to be able to read them: a webview
      // cannot load a locale on demand (a nonce CSP blocks the dynamic import
      // and the relative specifier resolves against the wrong base), so the
      // host sends the active language's strings over postMessage instead.
      // The webview bundles English alone, as the fallback.
      '@ava-extension/locales': path.resolve(
        __dirname,
        '../src/webview/locales',
      ),
      // The <changes-summary> stripper, aliased to core's SOURCE rather
      // than copied here. That module has no imports of its own, so this
      // pulls in one function and nothing else — the sidebar bundle does
      // not gain a dependency on core, and there is still only one
      // definition of what the block looks like.
      '@ava-core/changes-summary': path.resolve(
        __dirname,
        '../../core/src/auto/changes-summary.ts',
      ),
    },
  },
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/index.tsx',
      output: {
        entryFileNames: 'index.js',
        assetFileNames: 'index.[ext]',
      },
    },
  },
});
