/** Workers build stub — node:fs/promises is not available on Cloudflare Workers. */

function reject(op: string): never {
  throw new Error(`node:fs/promises.${op} is not available on Cloudflare Workers`);
}

async function refuse(op: string): Promise<never> {
  return reject(op);
}

export const access = (..._a: unknown[]) => refuse('access');
export const appendFile = (..._a: unknown[]) => refuse('appendFile');
export const chmod = (..._a: unknown[]) => refuse('chmod');
export const copyFile = (..._a: unknown[]) => refuse('copyFile');
export const mkdir = (..._a: unknown[]) => refuse('mkdir');
export const readFile = (..._a: unknown[]) => refuse('readFile');
export const readdir = (..._a: unknown[]) => refuse('readdir');
export const rename = (..._a: unknown[]) => refuse('rename');
export const rm = (..._a: unknown[]) => refuse('rm');
export const rmdir = (..._a: unknown[]) => refuse('rmdir');
export const stat = (..._a: unknown[]) => refuse('stat');
export const unlink = (..._a: unknown[]) => refuse('unlink');
export const writeFile = (..._a: unknown[]) => refuse('writeFile');

const promisesStub = {
  access,
  appendFile,
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
};

export default promisesStub;
