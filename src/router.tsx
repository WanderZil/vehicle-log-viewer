import { createRouter } from '@tanstack/react-router';

import { deLocalizeUrl, localizeUrl } from '@/paraglide/runtime.js';

import { routeTree } from './routeTree.gen';

function viteBasepath(): string {
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return '/';
  return base.replace(/\/$/, '') || '/';
}

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: viteBasepath(),
    defaultPreload: 'intent',
    scrollRestoration: true,
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
