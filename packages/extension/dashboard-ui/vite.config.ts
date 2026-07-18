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
        entryFileNames: 'index.js',
        assetFileNames: 'index.[ext]',
      },
    },
  },
});
