import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalBuildEnv } from './env-loader.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadLocalBuildEnv(repoRoot);

const rawArgs = process.argv.slice(2);
const channel = resolveChannel(rawArgs);
const env = {
  ...process.env,
  VITE_GLANCE_BUILD_CHANNEL: channel
};

run(['pnpm', 'exec', 'tsc'], env);
run(['pnpm', 'exec', 'vite', 'build'], env);

function resolveChannel(args) {
  const index = args.indexOf('--channel');
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }

  return 'paid';
}

function run(command, env) {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
