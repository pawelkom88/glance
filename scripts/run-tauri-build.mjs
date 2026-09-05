import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadLocalBuildEnv } from './env-loader.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadLocalBuildEnv(repoRoot);

if (process.env.TAURI_PRIVATE_KEY && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = process.env.TAURI_PRIVATE_KEY;
}
if (process.env.TAURI_KEY_PASSWORD && !process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = process.env.TAURI_KEY_PASSWORD;
}

const hasPrivateKey = Boolean(
  process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.TAURI_PRIVATE_KEY
);

const args = process.argv.slice(2);
const extraArgs = [];

if (!hasPrivateKey) {
  const specifiesUpdaterArtifacts = args.some((arg) =>
    arg.includes('createUpdaterArtifacts')
  );

  if (!specifiesUpdaterArtifacts) {
    console.log(
      '[build] No TAURI_SIGNING_PRIVATE_KEY found; disabling updater artifact generation for local build.'
    );
    extraArgs.push('--config', '{"bundle":{"createUpdaterArtifacts":false}}');
  }
}

const result = spawnSync('pnpm', ['exec', 'tauri', 'build', ...extraArgs, ...args], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);

