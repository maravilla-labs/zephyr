import { defineConfig } from 'vite';
import { resolve } from 'path';
import { testServerPlugin } from './e2e/test-server-plugin.ts';

export default defineConfig({
  plugins: [testServerPlugin()],
  build: {
    lib: {
      entry: {
        zephyrWorker: resolve(__dirname, 'lib/zephyrWorker.js'),
        zephrInstall: resolve(__dirname, 'lib/zephrInstall.js'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        preserveModules: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.js'],
    },
  },
  server: {
    open: true,
  },
});
