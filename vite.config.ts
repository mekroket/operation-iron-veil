/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the static build works on GitHub Pages, Cloudflare Pages and StackBlitz alike.
  base: './',
  server: { host: true },
  // Havok locates its .wasm relative to the module; pre-bundling would break that.
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: { babylon: ['@babylonjs/core/Engines/engine'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
