import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

import { loadEnvFiles } from './src/lib/env';

loadEnvFiles();

const isCloudflareBuild = (process.env.NITRO_PRESET || '').includes('cloudflare');

const nodeFsStub = new URL('./src/lib/cf/node-fs-stub.ts', import.meta.url).pathname;
const nodeFsPromisesStub = new URL(
  './src/lib/cf/node-fs-promises-stub.ts',
  import.meta.url
).pathname;
const childProcessStub = new URL('./src/lib/cf/child-process-stub.ts', import.meta.url).pathname;

const cfNodeAliases = [
  { find: /^node:fs$/, replacement: nodeFsStub },
  { find: /^node:fs\/promises$/, replacement: nodeFsPromisesStub },
  { find: /^fs$/, replacement: nodeFsStub },
  { find: /^fs\/promises$/, replacement: nodeFsPromisesStub },
  { find: /^node:child_process$/, replacement: childProcessStub },
  { find: /^child_process$/, replacement: childProcessStub },
];

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
    alias: isCloudflareBuild ? cfNodeAliases : [],
  },
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      cookieName: 'PARAGLIDE_LOCALE',
      strategy: ['url', 'cookie', 'baseLocale'],
      urlPatterns: [
        {
          pattern: '/api/:path(.*)?',
          localized: [
            ['en', '/api/:path(.*)?'],
            ['zh', '/api/:path(.*)?'],
          ],
        },
        {
          pattern: '/',
          localized: [
            ['zh', '/zh'],
            ['en', '/'],
          ],
        },
        {
          pattern: '/:path(.*)?',
          localized: [
            ['zh', '/zh/:path(.*)?'],
            ['en', '/:path(.*)?'],
          ],
        },
      ],
    }),
    tanstackStart({ srcDirectory: 'src' }),
    viteReact(),
    nitro(
      isCloudflareBuild
        ? {
            alias: {
              'node:fs': nodeFsStub,
              'node:fs/promises': nodeFsPromisesStub,
              fs: nodeFsStub,
              'fs/promises': nodeFsPromisesStub,
              'node:child_process': childProcessStub,
              child_process: childProcessStub,
            },
            externals: {
              inline: [
                'node:fs',
                'node:fs/promises',
                'fs',
                'fs/promises',
                'node:child_process',
                'child_process',
              ],
            },
          }
        : {}
    ),
  ],
});
