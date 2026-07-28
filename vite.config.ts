import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

import { loadEnvFiles } from './src/lib/env';

loadEnvFiles();

/** Project Pages need a subpath, e.g. `/vehicle_log_viewer_oss/`. Root site / custom domain use `/`. */
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
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
    tanstackStart({
      srcDirectory: 'src',
      spa: {
        enabled: true,
      },
    }),
    viteReact(),
    nitro(),
  ],
});
