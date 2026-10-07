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
        '../src/webview/dashboard-message-types.ts',
      ),
      // Fleet picker copy shared with webview-ui — see fleet-copy.ts.
      '@ava-extension/fleet-copy': path.resolve(
        __dirname,
        '../src/webview/fleet-copy.ts',
      ),
    },
  },
  build: {
    outDir: '../dist/dashboard',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/index.tsx',
      output: {
        // CONTENT-HASHED, and it has to be, now that the dashboard splits.
        //
        // These were 'index.js' / 'index.[ext]', and the host cache-busted them
        // with a `?v=<mtime>` query because a fixed name can be served stale
        // from Electron's webview cache after a rebuild. That query is fatal to
        // code splitting: the document loads `index.js?v=123`, while a chunk
        // imports `../index.js` with no query, and a module's identity is its
        // FULL url. The browser therefore treats them as two different modules
        // and runs the whole bundle a second time — which surfaced as
        // "An instance of the VS Code API has already been acquired", because
        // vscode.ts calls acquireVsCodeApi() at module scope and it is only
        // allowed once per document.
        //
        // A content hash is a better cache-buster than a query anyway: it
        // changes only when the bytes change, and it is part of the path, so
        // every importer agrees on it.
        entryFileNames: 'index-[hash].js',
        assetFileNames: 'index-[hash].[ext]',
        // Lazily-loaded pages land here. `dist/dashboard` is already a
        // localResourceRoot, so a subfolder under it needs no host change.
        // It needs its own pattern because assetFileNames is 'index.[ext]'
        // and every chunk would otherwise collide on one filename.
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
