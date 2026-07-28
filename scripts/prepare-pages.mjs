import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SPA shell lands as `_shell.html`. GitHub Pages needs `index.html` at the
 * site root, and uses `404.html` as the soft-404 fallback for client routes.
 */
const publicDir = join(process.cwd(), '.output', 'public');
const shellPath = join(publicDir, '_shell.html');
const indexPath = join(publicDir, 'index.html');
const notFoundPath = join(publicDir, '404.html');

if (!existsSync(indexPath) && !existsSync(shellPath)) {
  console.error('prepare-pages: no index.html or _shell.html in .output/public');
  process.exit(1);
}

if (!existsSync(indexPath)) {
  copyFileSync(shellPath, indexPath);
  console.log(`prepare-pages: wrote ${indexPath}`);
}

copyFileSync(indexPath, notFoundPath);
console.log(`prepare-pages: wrote ${notFoundPath}`);
