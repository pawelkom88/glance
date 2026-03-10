import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalBuildEnv } from './env-loader.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadLocalBuildEnv(repoRoot);

const rawArgs = process.argv.slice(2);
const { args, channel } = parseArgs(rawArgs);
const env = {
  ...process.env,
  GLANCE_BUILD_CHANNEL: channel,
  VITE_GLANCE_BUILD_CHANNEL: channel
};

const result = spawnSync('pnpm', ['exec', 'tauri', 'build', ...args], {
  cwd: repoRoot,
  stdio: 'inherit',
  env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);

function parseArgs(rawArgs) {
  const args = [];
  let channel = 'paid';

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    const next = rawArgs[index + 1];

    if (arg === '--channel' && next) {
      channel = next;
      index += 1;
      continue;
    }

    args.push(arg);
  }

  if (channel === 'product_hunt' && !args.includes('--config')) {
    args.unshift('src-tauri/tauri.product-hunt.conf.json');
    args.unshift('--config');
  }

  return { args, channel };
}
