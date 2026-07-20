import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.types.ts'],
    },
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@/config': resolve(__dirname, 'src/config'),
      '@/modules': resolve(__dirname, 'src/modules'),
      '@/engine': resolve(__dirname, 'src/engine'),
      '@/infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@/gateway': resolve(__dirname, 'src/gateway'),
      '@/middleware': resolve(__dirname, 'src/middleware'),
      '@/lib': resolve(__dirname, 'src/lib'),
      '@/utils': resolve(__dirname, 'src/utils'),
    },
  },
});
