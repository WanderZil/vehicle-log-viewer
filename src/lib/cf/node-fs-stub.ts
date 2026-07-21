/** Workers build stub — node:fs is not available on Cloudflare Workers. */

function reject(op: string): never {
  throw new Error(`node:fs.${op} is not available on Cloudflare Workers`);
}

const noop = ((..._args: unknown[]) => reject('call')) as (...args: unknown[]) => never;

const fsStub: Record<string, unknown> = new Proxy(noop, {
  get(_target, prop) {
    if (prop === 'then') return undefined;
    if (prop === 'promises') {
      return new Proxy(
        {},
        {
          get(_t, p) {
            return () => reject(`promises.${String(p)}`);
          },
        }
      );
    }
    if (prop === 'constants') return {};
    return () => reject(String(prop));
  },
});

export default fsStub;
export const access = noop;
export const appendFile = noop;
export const chmod = noop;
export const copyFile = noop;
export const createReadStream = noop;
export const createWriteStream = noop;
export const existsSync = () => false;
export const mkdir = noop;
export const mkdirSync = noop;
export const readFile = noop;
export const readFileSync = noop;
export const readdir = noop;
export const readdirSync = () => [];
export const rename = noop;
export const rm = noop;
export const rmdir = noop;
export const stat = noop;
export const statSync = noop;
export const unlink = noop;
export const writeFile = noop;
export const writeFileSync = noop;
export const promises = (fsStub as { promises: unknown }).promises;
