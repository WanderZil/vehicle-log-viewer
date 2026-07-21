/** Workers build stub — child_process is not available on Cloudflare Workers. */

function reject(op: string): never {
  throw new Error(`child_process.${op} is not available on Cloudflare Workers`);
}

export function spawn(..._args: unknown[]): never {
  reject('spawn');
}

export function exec(..._args: unknown[]): never {
  reject('exec');
}

export function execFile(..._args: unknown[]): never {
  reject('execFile');
}

export function fork(..._args: unknown[]): never {
  reject('fork');
}

export function execSync(..._args: unknown[]): never {
  reject('execSync');
}

export function spawnSync(..._args: unknown[]): never {
  reject('spawnSync');
}

const stub = { spawn, exec, execFile, fork, execSync, spawnSync };
export default stub;
