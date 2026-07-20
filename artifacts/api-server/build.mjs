import * as esbuild from 'esbuild';
import { createRequire } from 'module';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);

let pinoPlugin;
try {
  const { pino } = await import('esbuild-plugin-pino');
  pinoPlugin = pino({ transports: ['pino-pretty'] });
} catch {
  pinoPlugin = null;
}

const plugins = pinoPlugin ? [pinoPlugin] : [];

await esbuild
  .build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: 'dist/index.mjs',
    sourcemap: true,
    minify: false,
    treeShaking: true,
    external: [
      '@prisma/client',
      '@whiskeysockets/baileys',
      // Native addons
      'sharp',
      'canvas',
      'bufferutil',
      'utf-8-validate',
      // Optional peer deps
      'pino-pretty',
    ],
    plugins,
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'info',
  })
  .then(() => {
    console.log('✅ Build complete → dist/index.mjs');
  })
  .catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
  });
